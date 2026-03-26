'use client';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import {
  publicCheckboxClassName,
  publicFieldClassName,
  publicPanelClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { Form, FormError } from '@/lib/forms';
import type { PublicEventDetail } from '@/lib/events/queries';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RegistrationFlowState } from './use-registration-flow';

type WaiverStepProps = {
  waivers: PublicEventDetail['waivers'];
  waiverForm: RegistrationFlowState['waiverForm'];
  allWaiversAccepted: RegistrationFlowState['allWaiversAccepted'];
  isPending: RegistrationFlowState['isPending'];
  onBack: () => void;
};

export function WaiverStep({
  waivers,
  waiverForm,
  allWaiversAccepted,
  isPending,
  onBack,
}: WaiverStepProps) {
  const t = useTranslations('pages.events.register');
  const tCommon = useTranslations('common');
  const waiverSignatureLabels = {
    initials: t('waiver.signatureLabels.initials'),
    signature: t('waiver.signatureLabels.signature'),
  } as const;
  const waiverSignaturePlaceholders = {
    initials: t('waiver.signaturePlaceholders.initials'),
    signature: t('waiver.signaturePlaceholders.signature'),
  } as const;

  return (
    <Form form={waiverForm} className="space-y-7">
      <div>
        <h2 className="font-display text-[clamp(1.5rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
          {t('waiver.title')}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{t('waiver.description')}</p>
      </div>

      <FormError />

      {waivers.map((waiver, index) => (
        <div key={waiver.id} className={cn(publicPanelClassName, 'space-y-4')}>
          {waivers.length > 1 && (
            <h3 className="font-medium text-sm text-muted-foreground">
              {t('waiver.waiverNumber', { number: index + 1, total: waivers.length })}
            </h3>
          )}
          <h4 className="font-medium">{waiver.title}</h4>
          <div className="max-h-72 overflow-y-auto rounded-[1.15rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_85%,var(--background-surface)_15%)] p-4">
            <MarkdownContent content={waiver.body} className="text-sm [&_p]:m-0" />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            {waiver.signatureType === 'checkbox' ? (
              <>
                <input
                  type="checkbox"
                  checked={waiverForm.values[waiver.id] === 'true'}
                  onChange={(e) =>
                    waiverForm.setFieldValue(waiver.id, e.target.checked ? 'true' : '')
                  }
                  className={publicCheckboxClassName}
                  disabled={isPending || waiverForm.isSubmitting}
                />
                <span className="text-sm">{t('waiver.acceptThis', { title: waiver.title })}</span>
              </>
            ) : (
              <div className="space-y-2 w-full">
                <span className="text-sm">
                  {
                    waiverSignatureLabels[
                      waiver.signatureType as keyof typeof waiverSignatureLabels
                    ]
                  }
                </span>
                <input
                  type="text"
                  value={waiverForm.values[waiver.id] ?? ''}
                  onChange={(e) => waiverForm.setFieldValue(waiver.id, e.target.value)}
                  placeholder={
                    waiverSignaturePlaceholders[
                      waiver.signatureType as keyof typeof waiverSignaturePlaceholders
                    ]
                  }
                  className={publicFieldClassName}
                  disabled={isPending || waiverForm.isSubmitting}
                />
              </div>
            )}
          </label>
        </div>
      ))}

      <div
        className={cn(
          publicPanelClassName,
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isPending || waiverForm.isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {tCommon('previous')}
        </Button>
        <Button
          type="submit"
          disabled={!allWaiversAccepted || isPending || waiverForm.isSubmitting}
          className="sm:min-w-[10rem]"
        >
          {isPending || waiverForm.isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {t('waiver.continue')}
        </Button>
      </div>
    </Form>
  );
}
