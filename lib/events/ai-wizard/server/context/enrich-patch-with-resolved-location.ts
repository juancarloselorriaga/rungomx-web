import { buildResolvedLocationEditionData } from '@/lib/events/ai-wizard/server/proposals/finalize/location-choice';
import {
  buildAssistantLocationResolutionOptions,
  buildLocationResolutionQueryFromEditionUpdate,
  resolveAssistantLocationQuery,
} from '@/lib/events/ai-wizard/location-resolution';
import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import type { EventEditionDetail } from '@/lib/events/queries';
import type { EventAiWizardPlanningStepId } from '../planning/types';

export async function enrichPatchWithResolvedLocation(
  event: EventEditionDetail,
  patch: EventAiWizardPatch,
  context: {
    stepId: EventAiWizardPlanningStepId;
    locale?: string;
  },
) {
  if (context.stepId !== 'basics') {
    return patch;
  }

  let patchChanged = false;
  const resolutionOptions = buildAssistantLocationResolutionOptions(event, context.locale);
  const ops = await Promise.all(
    patch.ops.map(async (op) => {
      if (op.type !== 'update_edition' || op.editionId !== event.id) {
        return op;
      }

      const alreadyResolved = op.data.latitude?.trim() && op.data.longitude?.trim();
      if (alreadyResolved) {
        return op;
      }

      const query = buildLocationResolutionQueryFromEditionUpdate({
        locationDisplay: op.data.locationDisplay,
        address: op.data.address,
        city: op.data.city,
        state: op.data.state,
      });

      if (!query) {
        return op;
      }

      const resolution = await resolveAssistantLocationQuery(query, resolutionOptions);
      if (resolution.status !== 'matched') {
        return op;
      }

      patchChanged = true;
      return {
        ...op,
        data: {
          ...op.data,
          ...buildResolvedLocationEditionData(resolution.match),
          city: resolution.match.city ?? op.data.city,
          state: resolution.match.region ?? op.data.state,
          country: resolution.match.countryCode ?? op.data.country,
        },
      };
    }),
  );

  if (!patchChanged) {
    return patch;
  }

  return {
    ...patch,
    ops,
  } satisfies EventAiWizardPatch;
}
