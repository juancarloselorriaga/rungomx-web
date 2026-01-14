'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { createWaiver, updateWaiver, reorderWaivers } from '@/lib/events/actions';
import { cn } from '@/lib/utils';
import { GripVertical, Loader2, Pencil, Plus, Save, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type WaiverItem = {
  id: string;
  title: string;
  body: string;
  signatureType: SignatureType;
  displayOrder: number;
};

type WaiverManagerProps = {
  eventId: string;
  initialWaivers: WaiverItem[];
};

const SIGNATURE_TYPES = ['checkbox', 'initials', 'signature'] as const;
type SignatureType = (typeof SIGNATURE_TYPES)[number];

export function WaiverManager({ eventId, initialWaivers }: WaiverManagerProps) {
  const t = useTranslations('pages.dashboard.events.waivers');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [waivers, setWaivers] = useState(initialWaivers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formSignatureType, setFormSignatureType] = useState<SignatureType>('checkbox');
  const signatureTypeLabels: Record<SignatureType, string> = {
    checkbox: t('signatureTypes.checkbox'),
    initials: t('signatureTypes.initials'),
    signature: t('signatureTypes.signature'),
  };

  async function handleAdd() {
    if (!formTitle.trim() || !formBody.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await createWaiver({
        editionId: eventId,
        title: formTitle.trim(),
        body: formBody.trim(),
        signatureType: formSignatureType,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setWaivers((prev) => [
        ...prev,
        {
          id: result.data.id,
          title: result.data.title,
          body: result.data.body,
          signatureType: result.data.signatureType as SignatureType,
          displayOrder: result.data.displayOrder,
        },
      ]);

      setFormTitle('');
      setFormBody('');
      setFormSignatureType('checkbox');
      setIsAdding(false);
      router.refresh();
    });
  }

  function startEditing(item: WaiverItem) {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormBody(item.body);
    setFormSignatureType(item.signatureType);
    setIsAdding(false);
  }

  async function handleSaveEdit() {
    if (!editingId || !formTitle.trim() || !formBody.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await updateWaiver({
        waiverId: editingId,
        title: formTitle.trim(),
        body: formBody.trim(),
        signatureType: formSignatureType,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setWaivers((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                title: result.data.title,
                body: result.data.body,
                signatureType: result.data.signatureType as SignatureType,
              }
            : item,
        ),
      );

      setFormTitle('');
      setFormBody('');
      setFormSignatureType('checkbox');
      setEditingId(null);
      router.refresh();
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setFormTitle('');
    setFormBody('');
    setFormSignatureType('checkbox');
  }

  async function handleMoveUp(index: number) {
    if (index <= 0) return;
    const newItems = [...waivers];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];

    startTransition(async () => {
      const result = await reorderWaivers({
        editionId: eventId,
        waiverIds: newItems.map((item) => item.id),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setWaivers(newItems.map((item, i) => ({ ...item, displayOrder: i })));
      router.refresh();
    });
  }

  async function handleMoveDown(index: number) {
    if (index >= waivers.length - 1) return;
    const newItems = [...waivers];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];

    startTransition(async () => {
      const result = await reorderWaivers({
        editionId: eventId,
        waiverIds: newItems.map((item) => item.id),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setWaivers(newItems.map((item, i) => ({ ...item, displayOrder: i })));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {waivers.length === 0 && !isAdding && (
          <div className="rounded-lg border bg-card p-8 text-center">
            <p className="text-muted-foreground mb-4">{t('emptyState')}</p>
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('addFirst')}
            </Button>
          </div>
        )}

        {waivers.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'rounded-lg border bg-card shadow-sm transition-all',
              editingId === item.id && 'ring-2 ring-primary',
            )}
          >
            {editingId === item.id ? (
              <div className="p-4 space-y-4">
                <FormField label={t('titleLabel')} required>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                    disabled={isPending}
                  />
                </FormField>
                <FormField label={t('bodyLabel')} required>
                  <textarea
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 resize-none"
                    disabled={isPending}
                  />
                </FormField>
                <FormField label={t('signatureTypeLabel')} required>
                  <select
                    value={formSignatureType}
                    onChange={(e) => setFormSignatureType(e.target.value as SignatureType)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                    disabled={isPending}
                  >
                    {SIGNATURE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {signatureTypeLabels[type]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isPending}>
                    <X className="h-4 w-4 mr-1" />
                    {t('cancel')}
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    {t('save')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0 || isPending}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <GripVertical className="h-4 w-4 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === waivers.length - 1 || isPending}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <GripVertical className="h-4 w-4 -rotate-90" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <h3 className="font-medium">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {signatureTypeLabels[item.signatureType]}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {item.body}
                    </p>
                  </div>
                  <div className="flex items-start gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEditing(item)}
                      disabled={isPending}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdding && (
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
          <FormField label={t('titleLabel')} required>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isPending}
            />
          </FormField>
          <FormField label={t('bodyLabel')} required>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder={t('bodyPlaceholder')}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 resize-none"
              disabled={isPending}
            />
          </FormField>
          <FormField label={t('signatureTypeLabel')} required>
            <select
              value={formSignatureType}
              onChange={(e) => setFormSignatureType(e.target.value as SignatureType)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isPending}
            >
              {SIGNATURE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {signatureTypeLabels[type]}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setFormTitle('');
                setFormBody('');
                setFormSignatureType('checkbox');
              }}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1" />
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              {t('add')}
            </Button>
          </div>
        </div>
      )}

      {!isAdding && waivers.length > 0 && (
        <Button
          variant="outline"
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
          }}
          disabled={isPending}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('addAnother')}
        </Button>
      )}
    </div>
  );
}
