'use client';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Button } from '@/components/ui/button';
import { Form, FormError } from '@/lib/forms';
import type { PublicEventDetail } from '@/lib/events/queries';
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
  const waiverSignatureLabels = {
    initials: t('waiver.signatureLabels.initials'),
    signature: t('waiver.signatureLabels.signature'),
  } as const;
  const waiverSignaturePlaceholders = {
    initials: t('waiver.signaturePlaceholders.initials'),
    signature: t('waiver.signaturePlaceholders.signature'),
  } as const;

  return (
    <Form form={waiverForm} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('waiver.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('waiver.description')}</p>
      </div>

      <FormError />

      {waivers.map((waiver, index) => (
        <div key={waiver.id} className="space-y-3">
          {waivers.length > 1 && (
            <h3 className="font-medium text-sm text-muted-foreground">
              {t('waiver.waiverNumber', { number: index + 1, total: waivers.length })}
            </h3>
          )}
          <h4 className="font-medium">{waiver.title}</h4>
          <div className="rounded-lg border bg-muted/50 p-4 max-h-64 overflow-y-auto">
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
                  className="mt-1 h-4 w-4 rounded border-gray-300"
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
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending || waiverForm.isSubmitting}
                />
              </div>
            )}
          </label>
        </div>
      ))}

      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isPending || waiverForm.isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button type="submit" disabled={!allWaiversAccepted || isPending || waiverForm.isSubmitting}>
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
