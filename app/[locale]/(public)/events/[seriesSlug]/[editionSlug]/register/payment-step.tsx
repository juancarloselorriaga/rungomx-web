'use client';

import { Button } from '@/components/ui/button';
import { Form, FormError } from '@/lib/forms';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RegistrationFlowState } from './use-registration-flow';

type PaymentStepProps = {
  paymentForm: RegistrationFlowState['paymentForm'];
  isPending: RegistrationFlowState['isPending'];
  selectedDistance: RegistrationFlowState['selectedDistance'];
  basePriceCents: RegistrationFlowState['basePriceCents'];
  selectedAddOnItems: RegistrationFlowState['selectedAddOnItems'];
  addOnsSubtotalCents: RegistrationFlowState['addOnsSubtotalCents'];
  subtotalCents: RegistrationFlowState['subtotalCents'];
  groupDiscountPercentOff: RegistrationFlowState['groupDiscountPercentOff'];
  groupDiscountAmountCents: RegistrationFlowState['groupDiscountAmountCents'];
  discountAmountCents: RegistrationFlowState['discountAmountCents'];
  feesCents: RegistrationFlowState['feesCents'];
  taxCents: RegistrationFlowState['taxCents'];
  totalCents: RegistrationFlowState['totalCents'];
  appliedDiscountCode: RegistrationFlowState['appliedDiscountCode'];
  isGroupDiscountApplied: RegistrationFlowState['isGroupDiscountApplied'];
  discountError: RegistrationFlowState['discountError'];
  handleApplyDiscountCode: RegistrationFlowState['handleApplyDiscountCode'];
  handleRemoveDiscountCode: RegistrationFlowState['handleRemoveDiscountCode'];
  formatPrice: (cents: number, currency: string) => string;
  seriesSlug: string;
  editionSlug: string;
  onBack: () => void;
};

export function PaymentStep({
  paymentForm,
  isPending,
  selectedDistance,
  basePriceCents,
  selectedAddOnItems,
  addOnsSubtotalCents,
  subtotalCents,
  groupDiscountPercentOff,
  groupDiscountAmountCents,
  discountAmountCents,
  feesCents,
  taxCents,
  totalCents,
  appliedDiscountCode,
  isGroupDiscountApplied,
  discountError,
  handleApplyDiscountCode,
  handleRemoveDiscountCode,
  formatPrice,
  seriesSlug,
  editionSlug,
  onBack,
}: PaymentStepProps) {
  const t = useTranslations('pages.events.register');

  return (
    <Form form={paymentForm} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('payment.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('payment.description')}</p>
      </div>

      <FormError />

      <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
        <h3 className="font-medium">{t('payment.summary')}</h3>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('payment.distance')}</span>
          <span>{selectedDistance?.label}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('payment.price')}</span>
          <span>{formatPrice(basePriceCents, selectedDistance?.currency ?? 'MXN')}</span>
        </div>
        {selectedAddOnItems.length > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('payment.addons')}</span>
              <span>{formatPrice(addOnsSubtotalCents, selectedDistance?.currency ?? 'MXN')}</span>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {selectedAddOnItems.map((item) => (
                <div key={item.optionId} className="flex justify-between">
                  <span>
                    {item.addOnTitle} · {item.optionLabel} × {item.quantity}
                  </span>
                  <span>{formatPrice(item.lineTotalCents, selectedDistance?.currency ?? 'MXN')}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('payment.subtotal')}</span>
          <span>{formatPrice(subtotalCents, selectedDistance?.currency ?? 'MXN')}</span>
        </div>
        {groupDiscountPercentOff !== null && (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>{t('payment.groupDiscount', { percent: groupDiscountPercentOff })}</span>
            <span>-{formatPrice(groupDiscountAmountCents, selectedDistance?.currency ?? 'MXN')}</span>
          </div>
        )}
        {discountAmountCents > 0 && (
          <div className="flex justify-between text-sm text-green-700">
            <span>{t('payment.discount')}</span>
            <span>-{formatPrice(discountAmountCents, selectedDistance?.currency ?? 'MXN')}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('payment.fees')}</span>
          <span>{formatPrice(feesCents, selectedDistance?.currency ?? 'MXN')}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('payment.tax')}</span>
          <span>{formatPrice(taxCents, selectedDistance?.currency ?? 'MXN')}</span>
        </div>
        <div className="border-t pt-3 flex justify-between font-semibold">
          <span>{t('payment.total')}</span>
          <span>{formatPrice(totalCents, selectedDistance?.currency ?? 'MXN')}</span>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t('payment.discountCode')}</h3>
          {appliedDiscountCode && (
            <span className="text-sm text-green-700">
              {t('payment.codeApplied', { code: appliedDiscountCode })}
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={paymentForm.values.discountCode}
            onChange={(e) => paymentForm.setFieldValue('discountCode', e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder={t('payment.discountCode')}
            disabled={isPending || paymentForm.isSubmitting || !!appliedDiscountCode}
          />
          {appliedDiscountCode ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemoveDiscountCode}
              disabled={isPending || paymentForm.isSubmitting}
            >
              {t('payment.removeCode')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleApplyDiscountCode}
              disabled={
                isPending || paymentForm.isSubmitting || !paymentForm.values.discountCode.trim()
              }
            >
              {t('payment.applyCode')}
            </Button>
          )}
        </div>
        {isGroupDiscountApplied && (
          <p className="text-sm text-muted-foreground">{t('payment.groupDiscountNotice')}</p>
        )}
        {discountError && <p className="text-sm text-destructive">{discountError}</p>}
      </div>

      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground mb-4">{t('payment.comingSoon')}</p>
        <Button variant="outline" asChild>
          <Link
            href={{
              pathname: '/events/[seriesSlug]/[editionSlug]',
              params: { seriesSlug, editionSlug },
            }}
          >
            {t('payment.contactOrganizer')}
          </Link>
        </Button>
      </div>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isPending || paymentForm.isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button type="submit" disabled={isPending || paymentForm.isSubmitting}>
          {isPending || paymentForm.isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          {t('payment.complete')}
        </Button>
      </div>
    </Form>
  );
}
