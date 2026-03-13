'use client';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Button } from '@/components/ui/button';
import { Form, FormError } from '@/lib/forms';
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

  return (
    <Form form={addOnsForm} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('addons.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('addons.description')}</p>
      </div>

      <FormError />

      {activeAddOns.length === 0 ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
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
              <div key={addOn.id} className="rounded-lg border p-4 space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{addOn.title}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {addOn.type === 'donation' ? t('addons.donation') : t('addons.merchandise')}
                    </span>
                    {addOn.deliveryMethod !== 'none' && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {addOn.deliveryMethod === 'shipping'
                          ? t('addons.deliveryMethods.shipping')
                          : t('addons.deliveryMethods.pickup')}
                      </span>
                    )}
                  </div>
                  {addOn.description && (
                    <div className="mt-1">
                      <MarkdownContent
                        content={addOn.description}
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
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
                      className="rounded-md border bg-background px-2 py-2 text-sm"
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
        <div className="rounded-lg border bg-muted/40 p-4 text-sm flex justify-between">
          <span className="text-muted-foreground">{t('addons.subtotal')}</span>
          <span className="font-medium">{formatPrice(addOnsSubtotalCents, currency)}</span>
        </div>
      )}

      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isPending || addOnsForm.isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button type="submit" disabled={isPending || addOnsForm.isSubmitting}>
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
