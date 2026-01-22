'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, Edit2, Loader2, Percent, Plus, Tag, Trash2, Users } from 'lucide-react';

import {
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  type DiscountCodeData,
} from '@/lib/events/discounts/actions';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { FormField } from '@/components/ui/form-field';
import { Form, FormError, useForm } from '@/lib/forms';

type CouponsManagerProps = {
  editionId: string;
  initialCoupons: DiscountCodeData[];
};

type CouponFormData = {
  code: string;
  name: string;
  percentOff: number;
  maxRedemptions: number | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const defaultCouponFormData: CouponFormData = {
  code: '',
  name: '',
  percentOff: 10,
  maxRedemptions: null,
  startsAt: '',
  endsAt: '',
  isActive: true,
};

function CouponStatusBadge({ coupon }: { coupon: DiscountCodeData }) {
  const t = useTranslations('pages.dashboardEvents.coupons');
  const now = new Date();

  if (!coupon.isActive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {t('status.inactive')}
      </span>
    );
  }

  if (coupon.startsAt && now < coupon.startsAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        {t('status.scheduled')}
      </span>
    );
  }

  if (coupon.endsAt && now > coupon.endsAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {t('status.expired')}
      </span>
    );
  }

  if (coupon.maxRedemptions !== null && coupon.currentRedemptions >= coupon.maxRedemptions) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        {t('status.limitReached')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <Check className="h-3 w-3" />
      {t('status.active')}
    </span>
  );
}

function CouponForm({
  editionId,
  discountCodeId,
  initialData,
  onCancel,
  onSaved,
}: {
  editionId: string;
  discountCodeId?: string;
  initialData: CouponFormData;
  onCancel: () => void;
  onSaved: (coupon: DiscountCodeData) => void;
}) {
  const t = useTranslations('pages.dashboardEvents.coupons.coupon');
  const tCommon = useTranslations('common');
  const tToast = useTranslations('pages.dashboardEvents.coupons.toast');
  const locale = useLocale();

  // Extract date portion from datetime string (YYYY-MM-DDTHH:mm -> YYYY-MM-DD)
  const getDatePart = (datetime: string) => (datetime ? datetime.split('T')[0] : '');
  // Extract time portion from datetime string (YYYY-MM-DDTHH:mm -> HH:mm)
  const getTimePart = (datetime: string, defaultTime: string) => {
    if (!datetime) return defaultTime;
    const parts = datetime.split('T');
    return parts[1] || defaultTime;
  };

  const form = useForm<CouponFormData, DiscountCodeData>({
    defaultValues: initialData,
    onSubmit: async (values) => {
      if (discountCodeId) {
        const result = await updateDiscountCode({
          discountCodeId,
          name: values.name || null,
          percentOff: values.percentOff,
          maxRedemptions: values.maxRedemptions,
          startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : null,
          endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
          isActive: values.isActive,
        });

        if (!result.ok) {
          if (result.code === 'VALIDATION_ERROR') {
            return { ok: false, error: 'INVALID_INPUT', message: result.error };
          }
          return { ok: false, error: 'SERVER_ERROR', message: result.error };
        }

        return { ok: true, data: result.data };
      }

      const result = await createDiscountCode({
        editionId,
        code: values.code,
        name: values.name || null,
        percentOff: values.percentOff,
        maxRedemptions: values.maxRedemptions,
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : null,
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
        isActive: values.isActive,
      });

      if (!result.ok) {
        if (result.code === 'CODE_EXISTS') {
          return {
            ok: false,
            error: 'INVALID_INPUT',
            message: result.error,
            fieldErrors: { code: [result.error] },
          };
        }

        if (result.code === 'VALIDATION_ERROR') {
          return { ok: false, error: 'INVALID_INPUT', message: result.error };
        }

        return { ok: false, error: 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: result.data };
    },
    onSuccess: (coupon) => {
      toast.success(discountCodeId ? tToast('updated') : tToast('created'));
      onSaved(coupon);
    },
  });

  return (
    <Form form={form} className="space-y-4">
      <FormError />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('code')} required error={form.errors.code}>
          <input
            type="text"
            value={form.values.code}
            onChange={(e) => form.setFieldValue('code', e.target.value.toUpperCase())}
            placeholder="EARLYBIRD20"
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            pattern="[-A-Z0-9_]+"
            maxLength={50}
            disabled={Boolean(discountCodeId) || form.isSubmitting}
            required
          />
          {discountCodeId && <p className="mt-1 text-xs text-muted-foreground">{t('codeCannotChange')}</p>}
        </FormField>

        <FormField label={t('name')} error={form.errors.name}>
          <input
            type="text"
            value={form.values.name}
            onChange={(e) => form.setFieldValue('name', e.target.value)}
            placeholder={t('namePlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            maxLength={255}
            disabled={form.isSubmitting}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('percentOff')} required error={form.errors.percentOff}>
          <div className="relative">
            <input
              type="number"
              value={form.values.percentOff}
              onChange={(e) => form.setFieldValue('percentOff', parseInt(e.target.value, 10) || 0)}
              min={1}
              max={100}
              className="w-full px-3 py-2 pr-8 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
              disabled={form.isSubmitting}
            />
            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </FormField>

        <FormField label={t('maxRedemptions')} error={form.errors.maxRedemptions}>
          <input
            type="number"
            value={form.values.maxRedemptions || ''}
            onChange={(e) =>
              form.setFieldValue('maxRedemptions', e.target.value ? parseInt(e.target.value, 10) : null)
            }
            min={1}
            placeholder={t('unlimited')}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={form.isSubmitting}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('maxRedemptionsHint')}</p>
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('startsAt')} error={form.errors.startsAt}>
          <div className="flex gap-2">
            <div className="flex-1">
              <DatePicker
                locale={locale}
                value={getDatePart(form.values.startsAt)}
                onChangeAction={(value) => {
                  const timePart = getTimePart(form.values.startsAt, '00:00');
                  form.setFieldValue('startsAt', value ? `${value}T${timePart}` : '');
                }}
                clearLabel={tCommon('clear')}
              />
            </div>
            {form.values.startsAt && (
              <input
                type="time"
                value={getTimePart(form.values.startsAt, '00:00')}
                onChange={(e) => {
                  const datePart = getDatePart(form.values.startsAt);
                  form.setFieldValue('startsAt', datePart ? `${datePart}T${e.target.value}` : '');
                }}
                className="w-24 px-2 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={form.isSubmitting}
              />
            )}
          </div>
        </FormField>

        <FormField label={t('endsAt')} error={form.errors.endsAt}>
          <div className="flex gap-2">
            <div className="flex-1">
              <DatePicker
                locale={locale}
                value={getDatePart(form.values.endsAt)}
                onChangeAction={(value) => {
                  const timePart = getTimePart(form.values.endsAt, '23:59');
                  form.setFieldValue('endsAt', value ? `${value}T${timePart}` : '');
                }}
                clearLabel={tCommon('clear')}
              />
            </div>
            {form.values.endsAt && (
              <input
                type="time"
                value={getTimePart(form.values.endsAt, '23:59')}
                onChange={(e) => {
                  const datePart = getDatePart(form.values.endsAt);
                  form.setFieldValue('endsAt', datePart ? `${datePart}T${e.target.value}` : '');
                }}
                className="w-24 px-2 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={form.isSubmitting}
              />
            )}
          </div>
        </FormField>
      </div>

      <FormField label={t('isActive')} error={form.errors.isActive}>
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={form.values.isActive}
              onChange={(e) => form.setFieldValue('isActive', e.target.checked)}
              className="sr-only peer"
              disabled={form.isSubmitting}
            />
            <div className="w-10 h-6 bg-muted rounded-full peer-checked:bg-primary transition-colors" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
          </div>
          <span className="text-sm">{t('isActiveLabel')}</span>
        </label>
      </FormField>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={form.isSubmitting}>
          {form.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {discountCodeId ? t('save') : t('create')}
        </Button>
      </div>
    </Form>
  );
}

export function CouponsManager({ editionId, initialCoupons }: CouponsManagerProps) {
  const t = useTranslations('pages.dashboardEvents.coupons');
  const tToast = useTranslations('pages.dashboardEvents.coupons.toast');

  const [coupons, setCoupons] = useState<DiscountCodeData[]>(initialCoupons);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDeleteCoupon = (couponId: string) => {
    startTransition(async () => {
      const result = await deleteDiscountCode({ discountCodeId: couponId });

      if (!result.ok) {
        toast.error(tToast('error'), { description: result.error });
        setDeletingCouponId(null);
        return;
      }

      toast.success(tToast('deleted'));
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));
      setDeletingCouponId(null);
    });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateForInput = (date: Date | null) => {
    if (!date) return '';
    const d = new Date(date);
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="space-y-6">
      {/* Add coupon button / form */}
      {!showAddForm ? (
        <Button type="button" onClick={() => setShowAddForm(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          {t('coupon.add')}
        </Button>
      ) : (
        <div className="border border-border rounded-lg p-6 bg-card">
          <h3 className="text-lg font-semibold mb-4">{t('coupon.add')}</h3>
          <CouponForm
            editionId={editionId}
            initialData={defaultCouponFormData}
            onSaved={(coupon) => {
              setCoupons((prev) => [coupon, ...prev]);
              setShowAddForm(false);
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Coupons list */}
      {coupons.length === 0 ? (
        <div className="text-center py-12 bg-muted/50 rounded-lg">
          <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('emptyState')}</h3>
          <p className="text-muted-foreground max-w-md mx-auto">{t('emptyStateDescription')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {coupons.map((coupon) => (
            <div key={coupon.id} className="border border-border rounded-lg bg-card overflow-hidden">
              {editingCouponId === coupon.id ? (
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4">{t('coupon.edit')}</h3>
                  <CouponForm
                    editionId={editionId}
                    discountCodeId={coupon.id}
                    initialData={{
                      code: coupon.code,
                      name: coupon.name || '',
                      percentOff: coupon.percentOff,
                      maxRedemptions: coupon.maxRedemptions,
                      startsAt: formatDateForInput(coupon.startsAt),
                      endsAt: formatDateForInput(coupon.endsAt),
                      isActive: coupon.isActive,
                    }}
                    onSaved={(nextCoupon) => {
                      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? nextCoupon : c)));
                      setEditingCouponId(null);
                    }}
                    onCancel={() => setEditingCouponId(null)}
                  />
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-lg font-bold bg-muted px-2 py-1 rounded">{coupon.code}</span>
                        <CouponStatusBadge coupon={coupon} />
                      </div>

                      {coupon.name && <p className="text-sm text-muted-foreground mb-2">{coupon.name}</p>}

                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Percent className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">{coupon.percentOff}%</span>
                          <span className="text-muted-foreground">{t('coupon.discount')}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {coupon.currentRedemptions}
                            {coupon.maxRedemptions !== null && (
                              <span className="text-muted-foreground"> / {coupon.maxRedemptions}</span>
                            )}
                          </span>
                          <span className="text-muted-foreground">{t('coupon.redemptions')}</span>
                        </div>
                      </div>

                      {(coupon.startsAt || coupon.endsAt) && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {coupon.startsAt && (
                            <span>
                              {t('coupon.validFrom')}: {formatDate(coupon.startsAt)}
                            </span>
                          )}
                          {coupon.startsAt && coupon.endsAt && <span className="mx-2">|</span>}
                          {coupon.endsAt && (
                            <span>
                              {t('coupon.validUntil')}: {formatDate(coupon.endsAt)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingCouponId(coupon.id)}
                        disabled={isPending}
                      >
                        <Edit2 className="h-4 w-4" />
                        <span className="sr-only">{t('coupon.edit')}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingCouponId(coupon.id)}
                        disabled={isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{t('coupon.delete')}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Help section */}
      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <h3 className="font-medium mb-2">{t('help.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('help.description')}</p>
      </div>

      <DeleteConfirmationDialog
        open={!!deletingCouponId}
        onOpenChange={(open) => !open && setDeletingCouponId(null)}
        title={t('coupon.deleteTitle')}
        description={t('coupon.confirmDelete')}
        itemName={coupons.find((c) => c.id === deletingCouponId)?.code}
        itemDetail={
          coupons.find((c) => c.id === deletingCouponId)?.name ||
          `${coupons.find((c) => c.id === deletingCouponId)?.percentOff}% ${t('coupon.discount')}`
        }
        onConfirm={() => {
          if (deletingCouponId) handleDeleteCoupon(deletingCouponId);
        }}
        isPending={isPending}
      />
    </div>
  );
}

