'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Info,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';

import {
  createPricingTier,
  updatePricingTier,
  deletePricingTier,
  type PricingTierData,
} from '@/lib/events/pricing/actions';

type Distance = {
  id: string;
  label: string;
  distanceValue: string | null;
  distanceUnit: string;
};

type PricingScheduleItem = {
  distanceId: string;
  distanceLabel: string;
  currentPriceCents: number | null;
  nextPriceIncrease: { date: Date; priceCents: number } | null;
  tiers: PricingTierData[];
};

type PricingTiersManagerProps = {
  distances: Distance[];
  initialPricingData: PricingScheduleItem[];
};

type TierFormData = {
  label: string;
  priceCents: number;
  startsAt: string;
  endsAt: string;
};

const EMPTY_TIER: TierFormData = {
  label: '',
  priceCents: 0,
  startsAt: '',
  endsAt: '',
};

function formatPrice(cents: number, currency: string, locale: string): string {
  return (cents / 100).toLocaleString(locale, {
    style: 'currency',
    currency,
  });
}

function getTierStatus(tier: PricingTierData): 'current' | 'upcoming' | 'expired' {
  const now = new Date();
  const hasStarted = !tier.startsAt || now >= tier.startsAt;
  const hasNotEnded = !tier.endsAt || now < tier.endsAt;

  if (hasStarted && hasNotEnded) return 'current';
  if (!hasStarted) return 'upcoming';
  return 'expired';
}

function formatDatetimeLocal(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function PricingTiersManager({
  distances,
  initialPricingData,
}: PricingTiersManagerProps) {
  const t = useTranslations('pages.dashboard.events.pricing');
  const [isPending, startTransition] = useTransition();
  const [pricingData, setPricingData] = useState(initialPricingData);
  const [selectedDistanceId, setSelectedDistanceId] = useState<string | null>(
    distances[0]?.id ?? null,
  );
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set());
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [tierFormData, setTierFormData] = useState<TierFormData>(EMPTY_TIER);
  const [isAddingNew, setIsAddingNew] = useState(false);

  if (distances.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">{t('noDistances')}</p>
      </div>
    );
  }

  const selectedPricing = pricingData.find((p) => p.distanceId === selectedDistanceId);
  const tiers = selectedPricing?.tiers ?? [];

  const toggleTierExpanded = (tierId: string) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tierId)) {
        next.delete(tierId);
      } else {
        next.add(tierId);
      }
      return next;
    });
  };

  const startEditTier = (tier: PricingTierData) => {
    setEditingTier(tier.id);
    setTierFormData({
      label: tier.label ?? '',
      priceCents: tier.priceCents,
      startsAt: formatDatetimeLocal(tier.startsAt),
      endsAt: formatDatetimeLocal(tier.endsAt),
    });
    setExpandedTiers((prev) => new Set(prev).add(tier.id));
    setIsAddingNew(false);
  };

  const startAddTier = () => {
    setIsAddingNew(true);
    setEditingTier(null);
    setTierFormData(EMPTY_TIER);
  };

  const cancelEdit = () => {
    setEditingTier(null);
    setIsAddingNew(false);
    setTierFormData(EMPTY_TIER);
  };

  const handleSaveTier = () => {
    if (!selectedDistanceId) return;

    startTransition(async () => {
      try {
        if (isAddingNew) {
          // Create new tier
          const result = await createPricingTier({
            distanceId: selectedDistanceId,
            label: tierFormData.label || null,
            startsAt: tierFormData.startsAt || null,
            endsAt: tierFormData.endsAt || null,
            priceCents: tierFormData.priceCents,
            currency: 'MXN', // Default to MXN
          });

          if (result.ok) {
            // Update local state
            setPricingData((prev) =>
              prev.map((p) =>
                p.distanceId === selectedDistanceId
                  ? { ...p, tiers: [...p.tiers, result.data] }
                  : p,
              ),
            );
            toast.success(t('tier.saved'));
            setIsAddingNew(false);
            setTierFormData(EMPTY_TIER);
          } else {
            toast.error(result.code === 'DATE_OVERLAP' ? t('tier.dateOverlap') : t('tier.errorSaving'));
          }
        } else if (editingTier) {
          // Update existing tier
          const result = await updatePricingTier({
            tierId: editingTier,
            label: tierFormData.label || null,
            startsAt: tierFormData.startsAt || null,
            endsAt: tierFormData.endsAt || null,
            priceCents: tierFormData.priceCents,
          });

          if (result.ok) {
            // Update local state
            setPricingData((prev) =>
              prev.map((p) =>
                p.distanceId === selectedDistanceId
                  ? {
                      ...p,
                      tiers: p.tiers.map((tier) =>
                        tier.id === editingTier ? result.data : tier,
                      ),
                    }
                  : p,
              ),
            );
            toast.success(t('tier.saved'));
            setEditingTier(null);
            setTierFormData(EMPTY_TIER);
          } else {
            toast.error(result.code === 'DATE_OVERLAP' ? t('tier.dateOverlap') : t('tier.errorSaving'));
          }
        }
      } catch {
        toast.error(t('tier.errorSaving'));
      }
    });
  };

  const handleDeleteTier = (tierId: string) => {
    if (!confirm(t('tier.confirmDelete'))) return;

    startTransition(async () => {
      try {
        const result = await deletePricingTier({ tierId });

        if (result.ok) {
          // Update local state
          setPricingData((prev) =>
            prev.map((p) =>
              p.distanceId === selectedDistanceId
                ? { ...p, tiers: p.tiers.filter((tier) => tier.id !== tierId) }
                : p,
            ),
          );
          toast.success(t('tier.deleted'));
        } else if (result.code === 'CANNOT_DELETE_LAST_TIER') {
          toast.error(t('tier.cannotDeleteLast'));
        } else {
          toast.error(t('tier.errorDeleting'));
        }
      } catch {
        toast.error(t('tier.errorDeleting'));
      }
    });
  };

  const statusStyles = {
    current: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    upcoming: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    expired: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  };

  return (
    <div className="space-y-6">
      {/* Help section */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-sm">{t('help.title')}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t('help.description')}</p>
          </div>
        </div>
      </div>

      {/* Distance selector */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{t('selectDistance')}</h2>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {distances.map((distance) => (
              <button
                key={distance.id}
                type="button"
                onClick={() => {
                  setSelectedDistanceId(distance.id);
                  cancelEdit();
                }}
                className={cn(
                  'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                  selectedDistanceId === distance.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-input',
                )}
              >
                {distance.label}
                {distance.distanceValue && (
                  <span className="text-xs ml-1 opacity-70">
                    ({distance.distanceValue} {distance.distanceUnit})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing tiers list */}
      {selectedDistanceId && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {distances.find((d) => d.id === selectedDistanceId)?.label} - Pricing Tiers
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={startAddTier}
              disabled={isAddingNew || isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('tier.add')}
            </Button>
          </div>

          <div className="divide-y">
            {/* Add new tier form */}
            {isAddingNew && (
              <div className="p-6 bg-muted/30">
                <h3 className="font-medium mb-4">{t('tier.add')}</h3>
                <TierForm
                  formData={tierFormData}
                  setFormData={setTierFormData}
                  onSave={handleSaveTier}
                  onCancel={cancelEdit}
                  isPending={isPending}
                  t={t}
                />
              </div>
            )}

            {/* Existing tiers */}
            {tiers.length === 0 && !isAddingNew ? (
              <div className="p-8 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pricing tiers configured yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={startAddTier}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('tier.add')}
                </Button>
              </div>
            ) : (
              tiers.map((tier) => {
                const status = getTierStatus(tier);
                const isExpanded = expandedTiers.has(tier.id);
                const isEditing = editingTier === tier.id;

                return (
                  <div key={tier.id} className="group">
                    <button
                      type="button"
                      onClick={() => !isEditing && toggleTierExpanded(tier.id)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {tier.label || 'Unnamed Tier'}
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                statusStyles[status],
                              )}
                            >
                              {t(`tier.${status}Tier`)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatPrice(tier.priceCents, tier.currency, 'es-MX')}
                            {tier.startsAt || tier.endsAt ? (
                              <span className="mx-2">•</span>
                            ) : null}
                            {tier.startsAt && (
                              <span>
                                From{' '}
                                {new Date(tier.startsAt).toLocaleDateString('es-MX', {
                                  dateStyle: 'medium',
                                })}
                              </span>
                            )}
                            {tier.startsAt && tier.endsAt && ' - '}
                            {tier.endsAt && (
                              <span>
                                {tier.startsAt ? '' : 'Until '}
                                {new Date(tier.endsAt).toLocaleDateString('es-MX', {
                                  dateStyle: 'medium',
                                })}
                              </span>
                            )}
                            {!tier.startsAt && !tier.endsAt && (
                              <span className="mx-2">• {t('tier.noDates')}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">
                          {formatPrice(tier.priceCents, tier.currency, 'es-MX')}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-6 pb-6 pt-2 border-t bg-muted/20">
                        {isEditing ? (
                          <TierForm
                            formData={tierFormData}
                            setFormData={setTierFormData}
                            onSave={handleSaveTier}
                            onCancel={cancelEdit}
                            isPending={isPending}
                            t={t}
                          />
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEditTier(tier)}
                            >
                              {t('tier.edit')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteTier(tier.id)}
                              disabled={isPending}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              {t('tier.delete')}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type TierFormProps = {
  formData: TierFormData;
  setFormData: React.Dispatch<React.SetStateAction<TierFormData>>;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  t: ReturnType<typeof useTranslations<'pages.dashboard.events.pricing'>>;
};

function TierForm({ formData, setFormData, onSave, onCancel, isPending, t }: TierFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('tier.labelField')}>
          <input
            type="text"
            value={formData.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
            placeholder={t('tier.labelPlaceholder')}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </FormField>

        <FormField label={t('tier.priceField')}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={(formData.priceCents / 100).toFixed(2)}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  priceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                }))
              }
              placeholder={t('tier.pricePlaceholder')}
              className="flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-16 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              MXN
            </span>
          </div>
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <FormField label={t('tier.startsAtField')}>
            <input
              type="datetime-local"
              value={formData.startsAt}
              onChange={(e) => setFormData((prev) => ({ ...prev, startsAt: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">Leave empty for no start date restriction</p>
        </div>

        <div className="space-y-2">
          <FormField label={t('tier.endsAtField')}>
            <input
              type="datetime-local"
              value={formData.endsAt}
              onChange={(e) => setFormData((prev) => ({ ...prev, endsAt: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">Leave empty for no end date restriction</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('tier.saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {t('tier.save')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
