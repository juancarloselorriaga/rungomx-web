'use client';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import {
  publicMutedPanelClassName,
  publicPanelClassName,
  publicSelectClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { Form, FormError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RegistrationFlowState } from './use-registration-flow';

type AddOnsStepProps = {
  activeAddOns: RegistrationFlowState['activeAddOns'];
  addOnsForm: RegistrationFlowState['addOnsForm'];
  addOnOptionDrafts: RegistrationFlowState['addOnOptionDrafts'];
  setAddOnOptionDrafts: RegistrationFlowState['setAddOnOptionDrafts'];
  addOnQuantityDrafts: RegistrationFlowState['addOnQuantityDrafts'];
  setAddOnQuantityDrafts: RegistrationFlowState['setAddOnQuantityDrafts'];
  addOnsSubtotalCents: RegistrationFlowState['addOnsSubtotalCents'];
  isPending: RegistrationFlowState['isPending'];
  currency: string;
  formatPrice: (cents: number, currency: string) => string;
  onBack: () => void;
};

function normalizeAddOnDescription(content: string): string {
  return content.replace(/\\n/g, '\n');
}

export function AddOnsStep({
  activeAddOns,
  addOnsForm,
  addOnOptionDrafts,
  setAddOnOptionDrafts,
  addOnQuantityDrafts,
  setAddOnQuantityDrafts,
  addOnsSubtotalCents,
  isPending,
  currency,
  formatPrice,
  onBack,
}: AddOnsStepProps) {
  const t = useTranslations('pages.events.register');
  const tCommon = useTranslations('common');

  return (
    <Form form={addOnsForm} className="space-y-7">
      <div>
        <h2 className="font-display text-[clamp(1.5rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
          {t('addons.title')}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{t('addons.description')}</p>
      </div>

      <FormError />

      {activeAddOns.length === 0 ? (
        <div className={cn(publicMutedPanelClassName, 'text-sm text-muted-foreground')}>
          {t('addons.noAddons')}
        </div>
      ) : (
        <div className="space-y-5">
          {activeAddOns.map((addOn) => {
            const currentSelection = addOnsForm.values[addOn.id];
            const draftOptionId = addOnOptionDrafts[addOn.id] ?? currentSelection?.optionId ?? '';
            const draftQuantity =
              addOnQuantityDrafts[addOn.id] ?? currentSelection?.quantity ?? 1;
            const selectedOption = addOn.options.find((opt) => opt.id === draftOptionId);
            const isSameSelection =
              currentSelection?.optionId === draftOptionId &&
              currentSelection?.quantity === draftQuantity;

            return (
              <div key={addOn.id} className={cn(publicPanelClassName, 'space-y-4')}>
                <div>
                  <div className="space-y-2">
                    <h3 className="font-medium">{addOn.title}</h3>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {[
                        addOn.type === 'donation'
                          ? t('addons.donation')
                          : t('addons.merchandise'),
                        addOn.deliveryMethod === 'none'
                          ? null
                          : addOn.deliveryMethod === 'shipping'
                            ? t('addons.deliveryMethods.shipping')
                            : t('addons.deliveryMethods.pickup'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {addOn.description && (
                    <div className="mt-1">
                      <MarkdownContent
                        content={normalizeAddOnDescription(addOn.description)}
                        className="text-sm text-muted-foreground [&_p]:m-0"
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-center">
                  <select
                    value={draftOptionId}
                    onChange={(e) =>
                      setAddOnOptionDrafts((prev) => ({
                        ...prev,
                        [addOn.id]: e.target.value,
                      }))
                    }
                    className={publicSelectClassName}
                    disabled={isPending || addOnsForm.isSubmitting}
                  >
                    <option value="">{t('addons.selectOption')}</option>
                    {addOn.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label} ({formatPrice(option.priceCents, currency)})
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('addons.quantity')}</span>
                    <select
                      value={draftQuantity}
                      onChange={(e) =>
                        setAddOnQuantityDrafts((prev) => ({
                          ...prev,
                          [addOn.id]: Number(e.target.value),
                        }))
                      }
                        className={publicSelectClassName}
                      disabled={isPending || addOnsForm.isSubmitting}
                    >
                      {Array.from(
                        { length: selectedOption?.maxQtyPerOrder ?? 5 },
                        (_, idx) => idx + 1,
                      ).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {currentSelection && isSameSelection ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addOnsForm.setFieldValue(addOn.id, null)}
                        disabled={isPending || addOnsForm.isSubmitting}
                      >
                        {t('addons.removeFromOrder')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          addOnsForm.setFieldValue(addOn.id, {
                            optionId: draftOptionId,
                            quantity: draftQuantity,
                          })
                        }
                        disabled={isPending || addOnsForm.isSubmitting || !draftOptionId}
                      >
                        {t('addons.addToOrder')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addOnsSubtotalCents > 0 && (
        <div className={cn(publicMutedPanelClassName, 'flex justify-between text-sm')}>
          <span className="text-muted-foreground">{t('addons.subtotal')}</span>
          <span className="font-medium">{formatPrice(addOnsSubtotalCents, currency)}</span>
        </div>
      )}

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
          disabled={isPending || addOnsForm.isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {tCommon('previous')}
        </Button>
        <Button
          type="submit"
          disabled={isPending || addOnsForm.isSubmitting}
          className="sm:min-w-[10rem]"
        >
          {isPending || addOnsForm.isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {t('addons.continue')}
        </Button>
      </div>
    </Form>
  );
}
