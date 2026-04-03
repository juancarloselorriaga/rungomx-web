import { addOnOptions, addOns } from '@/db/schema';
import { createAuditLog } from '@/lib/audit';

import type { ApplyTx } from '../db-client';

export async function createAddOnBundle(params: {
  tx: ApplyTx;
  editionId: string;
  organizationId: string;
  actorUserId: string;
  requestContext: {
    ipAddress?: string;
    userAgent?: string;
  };
  data: {
    distanceId?: string | null;
    title: string;
    descriptionMarkdown?: string | null;
    type?: 'merch' | 'donation';
    deliveryMethod?: 'pickup' | 'shipping' | 'none';
    isActive?: boolean;
    sortOrder?: number;
    optionLabel?: string;
    optionPriceCents?: number;
    optionMaxQtyPerOrder?: number;
  };
  aiWizardApplyMeta?: {
    proposalId?: string;
    proposalFingerprint: string;
    idempotencyKey?: string;
    replayKey: string;
    replayKeyKind: 'explicit' | 'synthetic';
    syntheticReplayKey: string;
    opIndex: number;
    opType: 'create_add_on';
  };
}): Promise<
  | {
      ok: true;
      data: {
        addOn: typeof addOns.$inferSelect;
        option: typeof addOnOptions.$inferSelect;
      };
    }
  | {
      ok: false;
    }
> {
  const addOnPayload = {
    editionId: params.editionId,
    distanceId: params.data.distanceId ?? null,
    title: params.data.title,
    description: params.data.descriptionMarkdown ?? null,
    type: params.data.type ?? 'merch',
    deliveryMethod: params.data.deliveryMethod ?? 'pickup',
    isActive: params.data.isActive ?? true,
    sortOrder: params.data.sortOrder ?? 0,
  };

  const optionPayload = {
    label: params.data.optionLabel ?? 'Standard',
    priceCents: params.data.optionPriceCents ?? 0,
    maxQtyPerOrder: params.data.optionMaxQtyPerOrder ?? 5,
    isActive: true,
    sortOrder: 0,
  };

  const bundle = await (async () => {
    try {
      const [newAddOn] = await params.tx.insert(addOns).values(addOnPayload).returning();
      const addOnAudit = await createAuditLog(
        {
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          action: 'add_on.create',
          entityType: 'add_on',
          entityId: newAddOn.id,
          after: {
            title: addOnPayload.title,
            type: addOnPayload.type,
            deliveryMethod: addOnPayload.deliveryMethod,
            distanceId: addOnPayload.distanceId,
            ...(params.aiWizardApplyMeta ? { aiWizardApply: params.aiWizardApplyMeta } : {}),
          },
          request: params.requestContext,
        },
        params.tx,
      );
      if (!addOnAudit.ok) {
        throw new Error('ADD_ON_AUDIT_FAILED');
      }

      const [newOption] = await params.tx
        .insert(addOnOptions)
        .values({
          addOnId: newAddOn.id,
          ...optionPayload,
          optionMeta: null,
        })
        .returning();

      const optionAudit = await createAuditLog(
        {
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          action: 'add_on_option.create',
          entityType: 'add_on_option',
          entityId: newOption.id,
          after: {
            label: optionPayload.label,
            priceCents: optionPayload.priceCents,
            addOnId: newAddOn.id,
            ...(params.aiWizardApplyMeta ? { aiWizardApply: params.aiWizardApplyMeta } : {}),
          },
          request: params.requestContext,
        },
        params.tx,
      );
      if (!optionAudit.ok) {
        throw new Error('ADD_ON_OPTION_AUDIT_FAILED');
      }

      return { addOn: newAddOn, option: newOption };
    } catch {
      return null;
    }
  })();

  if (!bundle) {
    return { ok: false };
  }

  return { ok: true, data: bundle };
}
