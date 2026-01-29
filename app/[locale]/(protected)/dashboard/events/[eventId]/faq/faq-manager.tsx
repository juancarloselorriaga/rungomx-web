'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { MarkdownField } from '@/components/ui/markdown-field';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { createFaqItem, updateFaqItem, deleteFaqItem, reorderFaqItems } from '@/lib/events/actions';
import { cn } from '@/lib/utils';
import { GripVertical, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
};

type FaqManagerProps = {
  eventId: string;
  initialFaqItems: FaqItem[];
};

export function FaqManager({ eventId, initialFaqItems }: FaqManagerProps) {
  const t = useTranslations('pages.dashboardEvents.faq');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [faqItems, setFaqItems] = useState(initialFaqItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for adding/editing
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');

  // Handle add new FAQ
  async function handleAdd() {
    if (!formQuestion.trim() || !formAnswer.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await createFaqItem({
        editionId: eventId,
        question: formQuestion.trim(),
        answer: formAnswer.trim(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Add to local state
      setFaqItems((prev) => [
        ...prev,
        {
          id: result.data.id,
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          sortOrder: prev.length,
        },
      ]);

      // Reset form
      setFormQuestion('');
      setFormAnswer('');
      setIsAdding(false);
      router.refresh();
    });
  }

  // Handle edit FAQ
  function startEditing(item: FaqItem) {
    setEditingId(item.id);
    setFormQuestion(item.question);
    setFormAnswer(item.answer);
    setIsAdding(false);
  }

  async function handleSaveEdit() {
    if (!editingId || !formQuestion.trim() || !formAnswer.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await updateFaqItem({
        faqItemId: editingId,
        question: formQuestion.trim(),
        answer: formAnswer.trim(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Update local state
      setFaqItems((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, question: formQuestion.trim(), answer: formAnswer.trim() }
            : item,
        ),
      );

      // Reset form
      setFormQuestion('');
      setFormAnswer('');
      setEditingId(null);
      router.refresh();
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setFormQuestion('');
    setFormAnswer('');
  }

  // Handle delete FAQ
  async function handleDelete(id: string) {
    setError(null);

    startTransition(async () => {
      const result = await deleteFaqItem({ faqItemId: id });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Remove from local state
      setFaqItems((prev) => prev.filter((item) => item.id !== id));
      router.refresh();
    });
  }

  // Handle reorder (move up/down)
  async function handleMoveUp(index: number) {
    if (index <= 0) return;
    const newItems = [...faqItems];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];

    startTransition(async () => {
      const result = await reorderFaqItems({
        editionId: eventId,
        itemIds: newItems.map((item) => item.id),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setFaqItems(newItems.map((item, i) => ({ ...item, sortOrder: i })));
      router.refresh();
    });
  }

  async function handleMoveDown(index: number) {
    if (index >= faqItems.length - 1) return;
    const newItems = [...faqItems];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];

    startTransition(async () => {
      const result = await reorderFaqItems({
        editionId: eventId,
        itemIds: newItems.map((item) => item.id),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setFaqItems(newItems.map((item, i) => ({ ...item, sortOrder: i })));
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

      {/* FAQ list */}
      <div className="space-y-3">
        {faqItems.length === 0 && !isAdding && (
          <div className="rounded-lg border bg-card p-8 text-center">
            <p className="text-muted-foreground mb-4">{t('emptyState')}</p>
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('addFirst')}
            </Button>
          </div>
        )}

        {faqItems.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'rounded-lg border bg-card shadow-sm transition-all',
              editingId === item.id && 'ring-2 ring-primary',
            )}
          >
            {editingId === item.id ? (
              // Editing mode
              <div className="p-4 space-y-4">
                <FormField label={t('questionLabel')} required>
                  <input
                    type="text"
                    value={formQuestion}
                    onChange={(e) => setFormQuestion(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                    disabled={isPending}
                  />
                </FormField>
                <MarkdownField
                  label={t('answerLabel')}
                  required
                  value={formAnswer}
                  onChange={setFormAnswer}
                  disabled={isPending}
                  textareaClassName="resize-none"
                  textareaProps={{ rows: 3 }}
                />
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
              // View mode
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
                      disabled={index === faqItems.length - 1 || isPending}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <GripVertical className="h-4 w-4 -rotate-90" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{item.question}</h3>
                    <div className="mt-1">
                      <MarkdownContent
                        content={item.answer}
                        className="text-sm text-muted-foreground [&_p]:m-0"
                      />
                    </div>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new FAQ form */}
      {isAdding && (
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
          <FormField label={t('questionLabel')} required>
            <input
              type="text"
              value={formQuestion}
              onChange={(e) => setFormQuestion(e.target.value)}
              placeholder={t('questionPlaceholder')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isPending}
            />
          </FormField>
          <MarkdownField
            label={t('answerLabel')}
            required
            value={formAnswer}
            onChange={setFormAnswer}
            disabled={isPending}
            textareaClassName="resize-none"
            textareaProps={{
              placeholder: t('answerPlaceholder'),
              rows: 3,
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setFormQuestion('');
                setFormAnswer('');
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

      {/* Add button */}
      {!isAdding && faqItems.length > 0 && (
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
