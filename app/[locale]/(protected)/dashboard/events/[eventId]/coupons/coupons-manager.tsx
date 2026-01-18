'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Check,
  Edit2,
  Loader2,
  Percent,
  Plus,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';

import {
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  type DiscountCodeData,
} from '@/lib/events/discounts/actions';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';

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

  if (
    coupon.maxRedemptions !== null &&
    coupon.currentRedemptions >= coupon.maxRedemptions
  ) {
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
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  isEdit = false,
}: {
  initialData: CouponFormData;
  onSubmit: (data: CouponFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
  isEdit?: boolean;
}) {
  const t = useTranslations('pages.dashboardEvents.coupons.coupon');
  const [formData, setFormData] = useState<CouponFormData>(initialData);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('code')} required>
          <input
            type="text"
            value={formData.code}
            onChange={(e) =>
              setFormData({ ...formData, code: e.target.value.toUpperCase() })
            }
            placeholder="EARLYBIRD20"
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            pattern="[-A-Z0-9_]+"
            maxLength={50}
            disabled={isEdit}
            required
          />
          {isEdit && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('codeCannotChange')}
            </p>
          )}
        </FormField>

        <FormField label={t('name')}>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('namePlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            maxLength={255}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('percentOff')} required>
          <div className="relative">
            <input
              type="number"
              value={formData.percentOff}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  percentOff: parseInt(e.target.value, 10) || 0,
                })
              }
              min={1}
              max={100}
              className="w-full px-3 py-2 pr-8 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </FormField>

        <FormField label={t('maxRedemptions')}>
          <input
            type="number"
            value={formData.maxRedemptions || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                maxRedemptions: e.target.value
                  ? parseInt(e.target.value, 10)
                  : null,
              })
            }
            min={1}
            placeholder={t('unlimited')}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t('maxRedemptionsHint')}
          </p>
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('startsAt')}>
          <input
            type="datetime-local"
            value={formData.startsAt}
            onChange={(e) =>
              setFormData({ ...formData, startsAt: e.target.value })
            }
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </FormField>

        <FormField label={t('endsAt')}>
          <input
            type="datetime-local"
            value={formData.endsAt}
            onChange={(e) =>
              setFormData({ ...formData, endsAt: e.target.value })
            }
            min={formData.startsAt || undefined}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </FormField>
      </div>

      <FormField label={t('isActive')}>
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) =>
                setFormData({ ...formData, isActive: e.target.checked })
              }
              className="sr-only peer"
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function CouponsManager({ editionId, initialCoupons }: CouponsManagerProps) {
  const t = useTranslations('pages.dashboardEvents.coupons');
  const [coupons, setCoupons] = useState<DiscountCodeData[]>(initialCoupons);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAddCoupon = (data: CouponFormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createDiscountCode({
        editionId,
        code: data.code,
        name: data.name || null,
        percentOff: data.percentOff,
        maxRedemptions: data.maxRedemptions,
        startsAt: data.startsAt ? new Date(data.startsAt).toISOString() : null,
        endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
        isActive: data.isActive,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCoupons([result.data, ...coupons]);
      setShowAddForm(false);
    });
  };

  const handleUpdateCoupon = (couponId: string, data: CouponFormData) => {
    setError(null);
    startTransition(async () => {
      const result = await updateDiscountCode({
        discountCodeId: couponId,
        name: data.name || null,
        percentOff: data.percentOff,
        maxRedemptions: data.maxRedemptions,
        startsAt: data.startsAt ? new Date(data.startsAt).toISOString() : null,
        endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
        isActive: data.isActive,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCoupons(coupons.map((c) => (c.id === couponId ? result.data : c)));
      setEditingCouponId(null);
    });
  };

  const handleDeleteCoupon = (couponId: string) => {
    if (!confirm(t('coupon.confirmDelete'))) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deleteDiscountCode({ discountCodeId: couponId });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCoupons(coupons.filter((c) => c.id !== couponId));
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
    return d.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Add coupon button / form */}
      {!showAddForm ? (
        <Button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('coupon.add')}
        </Button>
      ) : (
        <div className="border border-border rounded-lg p-6 bg-card">
          <h3 className="text-lg font-semibold mb-4">{t('coupon.add')}</h3>
          <CouponForm
            initialData={defaultCouponFormData}
            onSubmit={handleAddCoupon}
            onCancel={() => setShowAddForm(false)}
            isSubmitting={isPending}
            submitLabel={t('coupon.create')}
          />
        </div>
      )}

      {/* Coupons list */}
      {coupons.length === 0 ? (
        <div className="text-center py-12 bg-muted/50 rounded-lg">
          <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('emptyState')}</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('emptyStateDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {coupons.map((coupon) => (
            <div
              key={coupon.id}
              className="border border-border rounded-lg bg-card overflow-hidden"
            >
              {editingCouponId === coupon.id ? (
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    {t('coupon.edit')}
                  </h3>
                  <CouponForm
                    initialData={{
                      code: coupon.code,
                      name: coupon.name || '',
                      percentOff: coupon.percentOff,
                      maxRedemptions: coupon.maxRedemptions,
                      startsAt: formatDateForInput(coupon.startsAt),
                      endsAt: formatDateForInput(coupon.endsAt),
                      isActive: coupon.isActive,
                    }}
                    onSubmit={(data) => handleUpdateCoupon(coupon.id, data)}
                    onCancel={() => setEditingCouponId(null)}
                    isSubmitting={isPending}
                    submitLabel={t('coupon.save')}
                    isEdit
                  />
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-lg font-bold bg-muted px-2 py-1 rounded">
                          {coupon.code}
                        </span>
                        <CouponStatusBadge coupon={coupon} />
                      </div>

                      {coupon.name && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {coupon.name}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Percent className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">
                            {coupon.percentOff}%
                          </span>
                          <span className="text-muted-foreground">
                            {t('coupon.discount')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {coupon.currentRedemptions}
                            {coupon.maxRedemptions !== null && (
                              <span className="text-muted-foreground">
                                {' '}
                                / {coupon.maxRedemptions}
                              </span>
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            {t('coupon.redemptions')}
                          </span>
                        </div>
                      </div>

                      {(coupon.startsAt || coupon.endsAt) && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {coupon.startsAt && (
                            <span>
                              {t('coupon.validFrom')}: {formatDate(coupon.startsAt)}
                            </span>
                          )}
                          {coupon.startsAt && coupon.endsAt && (
                            <span className="mx-2">|</span>
                          )}
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
                        onClick={() => handleDeleteCoupon(coupon.id)}
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
    </div>
  );
}
