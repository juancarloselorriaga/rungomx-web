'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  Gift,
  Heart,
  Info,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { FormField } from '@/components/ui/form-field';
import { IconTooltipButton } from '@/components/ui/icon-tooltip-button';
import { cn } from '@/lib/utils';

import {
  createAddOn,
  updateAddOn,
  deleteAddOn,
  createAddOnOption,
  updateAddOnOption,
  deleteAddOnOption,
  type AddOnData,
  type AddOnOptionData,
} from '@/lib/events/add-ons/actions';

type Distance = {
  id: string;
  label: string;
};

type AddOnsManagerProps = {
  editionId: string;
  distances: Distance[];
  initialAddOns: AddOnData[];
};

type AddOnFormData = {
  title: string;
  description: string;
  type: 'merch' | 'donation';
  deliveryMethod: 'pickup' | 'shipping' | 'none';
  distanceId: string | null;
  isActive: boolean;
};

type OptionFormData = {
  label: string;
  priceCents: number;
  maxQtyPerOrder: number;
  isActive: boolean;
};

const EMPTY_ADD_ON: AddOnFormData = {
  title: '',
  description: '',
  type: 'merch',
  deliveryMethod: 'pickup',
  distanceId: null,
  isActive: true,
};

const EMPTY_OPTION: OptionFormData = {
  label: '',
  priceCents: 0,
  maxQtyPerOrder: 5,
  isActive: true,
};

function formatPrice(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, {
    style: 'currency',
    currency: 'MXN',
  });
}

export function AddOnsManager({
  editionId,
  distances,
  initialAddOns,
}: AddOnsManagerProps) {
  const t = useTranslations('pages.dashboardEvents.addOns');
  const [isPending, startTransition] = useTransition();
  const [addOns, setAddOns] = useState(initialAddOns);
  const [expandedAddOns, setExpandedAddOns] = useState<Set<string>>(new Set());
  const [editingAddOn, setEditingAddOn] = useState<string | null>(null);
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [addOnFormData, setAddOnFormData] = useState<AddOnFormData>(EMPTY_ADD_ON);
  const [optionFormData, setOptionFormData] = useState<OptionFormData>(EMPTY_OPTION);
  const [isAddingAddOn, setIsAddingAddOn] = useState(false);
  const [addingOptionToAddOn, setAddingOptionToAddOn] = useState<string | null>(null);
  const [deletingAddOnId, setDeletingAddOnId] = useState<string | null>(null);
  const [deletingOptionInfo, setDeletingOptionInfo] = useState<{
    addOnId: string;
    optionId: string;
  } | null>(null);

  const toggleAddOnExpanded = (addOnId: string) => {
    setExpandedAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(addOnId)) {
        next.delete(addOnId);
      } else {
        next.add(addOnId);
      }
      return next;
    });
  };

  const startEditAddOn = (addOn: AddOnData) => {
    setEditingAddOn(addOn.id);
    setAddOnFormData({
      title: addOn.title,
      description: addOn.description ?? '',
      type: addOn.type,
      deliveryMethod: addOn.deliveryMethod,
      distanceId: addOn.distanceId,
      isActive: addOn.isActive,
    });
    setExpandedAddOns((prev) => new Set(prev).add(addOn.id));
    setIsAddingAddOn(false);
  };

  const startAddAddOn = () => {
    setIsAddingAddOn(true);
    setEditingAddOn(null);
    setAddOnFormData(EMPTY_ADD_ON);
  };

  const cancelEditAddOn = () => {
    setEditingAddOn(null);
    setIsAddingAddOn(false);
    setAddOnFormData(EMPTY_ADD_ON);
  };

  const startEditOption = (option: AddOnOptionData) => {
    setEditingOption(option.id);
    setOptionFormData({
      label: option.label,
      priceCents: option.priceCents,
      maxQtyPerOrder: option.maxQtyPerOrder,
      isActive: option.isActive,
    });
    setAddingOptionToAddOn(null);
  };

  const startAddOption = (addOnId: string) => {
    setAddingOptionToAddOn(addOnId);
    setEditingOption(null);
    setOptionFormData(EMPTY_OPTION);
    setExpandedAddOns((prev) => new Set(prev).add(addOnId));
  };

  const cancelEditOption = () => {
    setEditingOption(null);
    setAddingOptionToAddOn(null);
    setOptionFormData(EMPTY_OPTION);
  };

  const handleSaveAddOn = () => {
    startTransition(async () => {
      try {
        if (isAddingAddOn) {
          const result = await createAddOn({
            editionId,
            title: addOnFormData.title,
            description: addOnFormData.description || null,
            type: addOnFormData.type,
            deliveryMethod: addOnFormData.deliveryMethod,
            distanceId: addOnFormData.distanceId,
            isActive: addOnFormData.isActive,
            sortOrder: addOns.length, // Append to end
          });

          if (result.ok) {
            setAddOns((prev) => [...prev, result.data]);
            toast.success(t('addOn.saved'));
            setIsAddingAddOn(false);
            setAddOnFormData(EMPTY_ADD_ON);
          } else {
            toast.error(t('addOn.errorSaving'));
          }
        } else if (editingAddOn) {
          const result = await updateAddOn({
            addOnId: editingAddOn,
            title: addOnFormData.title,
            description: addOnFormData.description || null,
            type: addOnFormData.type,
            deliveryMethod: addOnFormData.deliveryMethod,
            distanceId: addOnFormData.distanceId,
            isActive: addOnFormData.isActive,
          });

          if (result.ok) {
            setAddOns((prev) =>
              prev.map((a) => (a.id === editingAddOn ? result.data : a)),
            );
            toast.success(t('addOn.saved'));
            setEditingAddOn(null);
            setAddOnFormData(EMPTY_ADD_ON);
          } else {
            toast.error(t('addOn.errorSaving'));
          }
        }
      } catch {
        toast.error(t('addOn.errorSaving'));
      }
    });
  };

  const handleDeleteAddOn = (addOnId: string) => {
    startTransition(async () => {
      try {
        const result = await deleteAddOn({ addOnId });

        if (result.ok) {
          setAddOns((prev) => prev.filter((a) => a.id !== addOnId));
          setDeletingAddOnId(null);
          toast.success(t('addOn.deleted'));
        } else {
          setDeletingAddOnId(null);
          toast.error(t('addOn.errorDeleting'));
        }
      } catch {
        setDeletingAddOnId(null);
        toast.error(t('addOn.errorDeleting'));
      }
    });
  };

  const handleSaveOption = (addOnId: string) => {
    startTransition(async () => {
      try {
        if (addingOptionToAddOn) {
          // Find the add-on to get current options count
          const currentAddOn = addOns.find((a) => a.id === addOnId);
          const result = await createAddOnOption({
            addOnId,
            label: optionFormData.label,
            priceCents: optionFormData.priceCents,
            maxQtyPerOrder: optionFormData.maxQtyPerOrder,
            isActive: optionFormData.isActive,
            sortOrder: currentAddOn?.options.length ?? 0,
          });

          if (result.ok) {
            setAddOns((prev) =>
              prev.map((a) =>
                a.id === addOnId ? { ...a, options: [...a.options, result.data] } : a,
              ),
            );
            toast.success(t('option.saved'));
            setAddingOptionToAddOn(null);
            setOptionFormData(EMPTY_OPTION);
          } else {
            toast.error(t('option.errorSaving'));
          }
        } else if (editingOption) {
          const result = await updateAddOnOption({
            optionId: editingOption,
            label: optionFormData.label,
            priceCents: optionFormData.priceCents,
            maxQtyPerOrder: optionFormData.maxQtyPerOrder,
            isActive: optionFormData.isActive,
          });

          if (result.ok) {
            setAddOns((prev) =>
              prev.map((a) =>
                a.id === addOnId
                  ? {
                      ...a,
                      options: a.options.map((o) =>
                        o.id === editingOption ? result.data : o,
                      ),
                    }
                  : a,
              ),
            );
            toast.success(t('option.saved'));
            setEditingOption(null);
            setOptionFormData(EMPTY_OPTION);
          } else {
            toast.error(t('option.errorSaving'));
          }
        }
      } catch {
        toast.error(t('option.errorSaving'));
      }
    });
  };

  const handleDeleteOption = (addOnId: string, optionId: string) => {
    startTransition(async () => {
      try {
        const result = await deleteAddOnOption({ optionId });

        if (result.ok) {
          setAddOns((prev) =>
            prev.map((a) =>
              a.id === addOnId
                ? { ...a, options: a.options.filter((o) => o.id !== optionId) }
                : a,
            ),
          );
          setDeletingOptionInfo(null);
          toast.success(t('option.deleted'));
        } else {
          setDeletingOptionInfo(null);
          toast.error(t('option.errorSaving'));
        }
      } catch {
        setDeletingOptionInfo(null);
        toast.error(t('option.errorSaving'));
      }
    });
  };

  const typeIcon = (type: string) =>
    type === 'donation' ? (
      <Heart className="h-5 w-5 text-pink-500" />
    ) : (
      <Gift className="h-5 w-5 text-blue-500" />
    );

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

      {/* Add-ons list */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={startAddAddOn}
            disabled={isAddingAddOn || isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('addOn.add')}
          </Button>
        </div>

        <div className="divide-y">
          {/* Add new add-on form */}
          {isAddingAddOn && (
            <div className="p-6 bg-muted/30">
              <h3 className="font-medium mb-4">{t('addOn.add')}</h3>
              <AddOnForm
                formData={addOnFormData}
                setFormData={setAddOnFormData}
                distances={distances}
                onSave={handleSaveAddOn}
                onCancel={cancelEditAddOn}
                isPending={isPending}
                t={t}
              />
            </div>
          )}

          {/* Empty state */}
          {addOns.length === 0 && !isAddingAddOn && (
            <div className="p-8 text-center text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('emptyState')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={startAddAddOn}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('addOn.add')}
              </Button>
            </div>
          )}

          {/* Existing add-ons */}
          {addOns.map((addOn) => {
            const isExpanded = expandedAddOns.has(addOn.id);
            const isEditing = editingAddOn === addOn.id;

            return (
              <div key={addOn.id} className="group">
                <button
                  type="button"
                  onClick={() => !isEditing && toggleAddOnExpanded(addOn.id)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {typeIcon(addOn.type)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{addOn.title}</span>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            addOn.isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
                          )}
                        >
                          {addOn.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t(`types.${addOn.type}`)} • {t(`delivery.${addOn.deliveryMethod}`)}
                        {addOn.distanceId && (
                          <span>
                            {' '}
                            •{' '}
                            {distances.find((d) => d.id === addOn.distanceId)?.label ||
                              'Specific distance'}
                          </span>
                        )}
                        <span className="mx-2">•</span>
                        {addOn.options.length} option{addOn.options.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t bg-muted/20">
                    {isEditing ? (
                      <AddOnForm
                        formData={addOnFormData}
                        setFormData={setAddOnFormData}
                        distances={distances}
                        onSave={handleSaveAddOn}
                        onCancel={cancelEditAddOn}
                        isPending={isPending}
                        t={t}
                      />
                    ) : (
                        <div className="space-y-4">
                          <div className="flex items-center justify-end gap-2">
                            <IconTooltipButton
                              variant="ghost"
                              size="icon"
                              label={t('addOn.edit')}
                              onClick={() => startEditAddOn(addOn)}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconTooltipButton>
                            <IconTooltipButton
                              variant="ghost"
                              size="icon"
                              label={t('addOn.delete')}
                              onClick={() => setDeletingAddOnId(addOn.id)}
                              disabled={isPending}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconTooltipButton>
                          </div>

                        {/* Options section */}
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-sm">{t('option.title')}</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startAddOption(addOn.id)}
                              disabled={addingOptionToAddOn === addOn.id || isPending}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              {t('option.add')}
                            </Button>
                          </div>

                          {/* Add new option form */}
                          {addingOptionToAddOn === addOn.id && (
                            <div className="mb-4 p-4 rounded-lg border bg-background">
                              <OptionForm
                                formData={optionFormData}
                                setFormData={setOptionFormData}
                                onSave={() => handleSaveOption(addOn.id)}
                                onCancel={cancelEditOption}
                                isPending={isPending}
                                t={t}
                              />
                            </div>
                          )}

                          {/* Options list */}
                          {addOn.options.length === 0 && addingOptionToAddOn !== addOn.id && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No options yet. Add options with different sizes or variations.
                            </p>
                          )}

                          <div className="space-y-2">
                            {addOn.options.map((option) => (
                              <div
                                key={option.id}
                                className="flex items-center justify-between p-3 rounded-lg border bg-background"
                              >
                                {editingOption === option.id ? (
                                  <div className="w-full">
                                    <OptionForm
                                      formData={optionFormData}
                                      setFormData={setOptionFormData}
                                      onSave={() => handleSaveOption(addOn.id)}
                                      onCancel={cancelEditOption}
                                      isPending={isPending}
                                      t={t}
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <div>
                                      <span className="font-medium">{option.label}</span>
                                      <span className="text-muted-foreground ml-2">
                                        {formatPrice(option.priceCents, 'es-MX')}
                                      </span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        (max {option.maxQtyPerOrder} per order)
                                      </span>
                                      {!option.isActive && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          (inactive)
                                        </span>
                                      )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <IconTooltipButton
                                          variant="ghost"
                                          size="icon"
                                          label={t('option.edit')}
                                          onClick={() => startEditOption(option)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </IconTooltipButton>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                          setDeletingOptionInfo({
                                            addOnId: addOn.id,
                                            optionId: option.id,
                                          })
                                        }
                                        disabled={isPending}
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <DeleteConfirmationDialog
        open={!!deletingAddOnId}
        onOpenChange={(open) => !open && setDeletingAddOnId(null)}
        title={t('addOn.deleteTitle')}
        description={t('addOn.confirmDelete')}
        itemName={addOns.find((a) => a.id === deletingAddOnId)?.title}
        onConfirm={() => {
          if (deletingAddOnId) handleDeleteAddOn(deletingAddOnId);
        }}
        isPending={isPending}
      />

      <DeleteConfirmationDialog
        open={!!deletingOptionInfo}
        onOpenChange={(open) => !open && setDeletingOptionInfo(null)}
        title={t('option.deleteTitle')}
        description={t('option.confirmDelete')}
        itemName={
          deletingOptionInfo
            ? addOns
                .find((a) => a.id === deletingOptionInfo.addOnId)
                ?.options.find((o) => o.id === deletingOptionInfo.optionId)?.label
            : undefined
        }
        itemDetail={
          deletingOptionInfo
            ? formatPrice(
                addOns
                  .find((a) => a.id === deletingOptionInfo.addOnId)
                  ?.options.find((o) => o.id === deletingOptionInfo.optionId)?.priceCents ?? 0,
                'es-MX',
              )
            : undefined
        }
        onConfirm={() => {
          if (deletingOptionInfo) {
            handleDeleteOption(deletingOptionInfo.addOnId, deletingOptionInfo.optionId);
          }
        }}
        isPending={isPending}
      />
    </div>
  );
}

type AddOnFormProps = {
  formData: AddOnFormData;
  setFormData: React.Dispatch<React.SetStateAction<AddOnFormData>>;
  distances: Distance[];
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  t: ReturnType<typeof useTranslations<'pages.dashboardEvents.addOns'>>;
};

function AddOnForm({
  formData,
  setFormData,
  distances,
  onSave,
  onCancel,
  isPending,
  t,
}: AddOnFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('addOn.titleField')}>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={t('addOn.titlePlaceholder')}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </FormField>

        <FormField label={t('addOn.typeField')}>
          <select
            value={formData.type}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, type: e.target.value as 'merch' | 'donation' }))
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="merch">{t('types.merch')}</option>
            <option value="donation">{t('types.donation')}</option>
          </select>
        </FormField>
      </div>

      <FormField label={t('addOn.descriptionField')}>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder={t('addOn.descriptionPlaceholder')}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('addOn.deliveryField')}>
          <select
            value={formData.deliveryMethod}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                deliveryMethod: e.target.value as 'pickup' | 'shipping' | 'none',
              }))
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="pickup">{t('delivery.pickup')}</option>
            <option value="shipping">{t('delivery.shipping')}</option>
            <option value="none">{t('delivery.none')}</option>
          </select>
        </FormField>

        <FormField label={t('addOn.distanceField')}>
          <select
            value={formData.distanceId ?? ''}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                distanceId: e.target.value || null,
              }))
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{t('addOn.distanceAll')}</option>
            {distances.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="flex items-center gap-2">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
        </label>
        <span className="text-sm">{t('addOn.activeField')}</span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={isPending || !formData.title}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('addOn.saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {t('addOn.save')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

type OptionFormProps = {
  formData: OptionFormData;
  setFormData: React.Dispatch<React.SetStateAction<OptionFormData>>;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  t: ReturnType<typeof useTranslations<'pages.dashboardEvents.addOns'>>;
};

function OptionForm({
  formData,
  setFormData,
  onSave,
  onCancel,
  isPending,
  t,
}: OptionFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label={t('option.labelField')}>
          <input
            type="text"
            value={formData.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
            placeholder={t('option.labelPlaceholder')}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </FormField>

        <FormField label={t('option.priceField')}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
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
              placeholder={t('option.pricePlaceholder')}
              className="flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </FormField>

        <FormField label={t('option.maxQtyField')}>
          <input
            type="number"
            min="1"
            max="10"
            value={formData.maxQtyPerOrder}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                maxQtyPerOrder: parseInt(e.target.value) || 1,
              }))
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </FormField>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
          </label>
          <span className="text-sm">{t('option.activeField')}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={isPending || !formData.label}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t('option.save')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
