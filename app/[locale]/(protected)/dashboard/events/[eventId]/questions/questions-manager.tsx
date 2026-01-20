'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Edit2, Loader2, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { FormField } from '@/components/ui/form-field';
import type { RegistrationQuestionType } from '@/lib/events/constants';
import {
  createQuestion,
  deleteQuestion,
  reorderQuestions,
  updateQuestion,
  type RegistrationQuestionData,
} from '@/lib/events/questions/actions';

type QuestionsManagerProps = {
  editionId: string;
  distances: Array<{ id: string; label: string }>;
  initialQuestions: RegistrationQuestionData[];
};

type QuestionFormData = {
  prompt: string;
  helpText: string;
  type: RegistrationQuestionType;
  distanceId: string;
  isRequired: boolean;
  isActive: boolean;
  optionsText: string;
};

const DEFAULT_FORM_DATA: QuestionFormData = {
  prompt: '',
  helpText: '',
  type: 'text',
  distanceId: '',
  isRequired: false,
  isActive: true,
  optionsText: '',
};

function normalizeQuestions(questions: RegistrationQuestionData[]): RegistrationQuestionData[] {
  return questions
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q, idx) => ({ ...q, sortOrder: idx }));
}

function parseOptions(type: RegistrationQuestionType, optionsText: string): string[] | null {
  if (type !== 'single_select') return null;
  const options = optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return options.length > 0 ? options : null;
}

function getFormDataFromQuestion(question: RegistrationQuestionData): QuestionFormData {
  return {
    prompt: question.prompt,
    helpText: question.helpText ?? '',
    type: question.type,
    distanceId: question.distanceId ?? '',
    isRequired: question.isRequired,
    isActive: question.isActive,
    optionsText: (question.options ?? []).join('\n'),
  };
}

function QuestionTypeBadge({ type }: { type: RegistrationQuestionType }) {
  const t = useTranslations('pages.dashboardEvents.questions.types');
  const copy: Record<RegistrationQuestionType, string> = {
    text: t('text'),
    single_select: t('single_select'),
    checkbox: t('checkbox'),
  };

  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {copy[type]}
    </span>
  );
}

function QuestionForm({
  distances,
  initialData,
  submitLabel,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  distances: Array<{ id: string; label: string }>;
  initialData: QuestionFormData;
  submitLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (data: QuestionFormData) => void;
}) {
  const t = useTranslations('pages.dashboardEvents.questions.form');
  const [formData, setFormData] = useState<QuestionFormData>(initialData);

  const showOptions = formData.type === 'single_select';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label={t('prompt')} required>
        <input
          type="text"
          value={formData.prompt}
          onChange={(e) => setFormData((prev) => ({ ...prev, prompt: e.target.value }))}
          placeholder={t('promptPlaceholder')}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          maxLength={500}
          required
          disabled={isSubmitting}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('type')} required>
          <select
            value={formData.type}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                type: e.target.value as RegistrationQuestionType,
                optionsText: e.target.value === 'single_select' ? prev.optionsText : '',
              }))
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={isSubmitting}
          >
            <option value="text">{t('typeOptions.text')}</option>
            <option value="single_select">{t('typeOptions.single_select')}</option>
            <option value="checkbox">{t('typeOptions.checkbox')}</option>
          </select>
        </FormField>

        <FormField label={t('distance')}>
          <select
            value={formData.distanceId}
            onChange={(e) => setFormData((prev) => ({ ...prev, distanceId: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={isSubmitting}
          >
            <option value="">{t('distanceAll')}</option>
            {distances.map((distance) => (
              <option key={distance.id} value={distance.id}>
                {distance.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label={t('helpText')}>
        <input
          type="text"
          value={formData.helpText}
          onChange={(e) => setFormData((prev) => ({ ...prev, helpText: e.target.value }))}
          placeholder={t('helpTextPlaceholder')}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          maxLength={500}
          disabled={isSubmitting}
        />
      </FormField>

      {showOptions && (
        <FormField label={t('options')} required>
          <textarea
            value={formData.optionsText}
            onChange={(e) => setFormData((prev) => ({ ...prev, optionsText: e.target.value }))}
            placeholder={t('optionsPlaceholder')}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-28"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">{t('optionsHint')}</p>
        </FormField>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('required')}>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.isRequired}
              onChange={(e) => setFormData((prev) => ({ ...prev, isRequired: e.target.checked }))}
              disabled={isSubmitting}
            />
            {t('requiredLabel')}
          </label>
        </FormField>

        <FormField label={t('active')}>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              disabled={isSubmitting}
            />
            {t('activeLabel')}
          </label>
        </FormField>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
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

export function QuestionsManager({ editionId, distances, initialQuestions }: QuestionsManagerProps) {
  const t = useTranslations('pages.dashboardEvents.questions');
  const tForm = useTranslations('pages.dashboardEvents.questions.form');
  const [isPending, startTransition] = useTransition();
  const [questions, setQuestions] = useState<RegistrationQuestionData[]>(
    normalizeQuestions(initialQuestions),
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);

  const editingQuestion = useMemo(
    () => (editingId ? questions.find((q) => q.id === editingId) ?? null : null),
    [editingId, questions],
  );

  const createNewQuestion = (data: QuestionFormData) => {
    startTransition(async () => {
      const options = parseOptions(data.type, data.optionsText);

      const result = await createQuestion({
        editionId,
        distanceId: data.distanceId || null,
        type: data.type,
        prompt: data.prompt.trim(),
        helpText: data.helpText.trim() || null,
        isRequired: data.isRequired,
        isActive: data.isActive,
        options,
        sortOrder: questions.length,
      });

      if (!result.ok) {
        toast.error(t('toast.error'), { description: result.error });
        return;
      }

      setQuestions((prev) => normalizeQuestions([...prev, result.data]));
      setShowAddForm(false);
      toast.success(t('toast.created'));
    });
  };

  const saveQuestion = (questionId: string, data: QuestionFormData) => {
    startTransition(async () => {
      const options = parseOptions(data.type, data.optionsText);

      const result = await updateQuestion({
        questionId,
        prompt: data.prompt.trim(),
        helpText: data.helpText.trim() || null,
        isRequired: data.isRequired,
        isActive: data.isActive,
        distanceId: data.distanceId || null,
        options,
      });

      if (!result.ok) {
        toast.error(t('toast.error'), { description: result.error });
        return;
      }

      setQuestions((prev) =>
        normalizeQuestions(prev.map((q) => (q.id === questionId ? result.data : q))),
      );
      setEditingId(null);
      toast.success(t('toast.updated'));
    });
  };

  const removeQuestion = (questionId: string) => {
    startTransition(async () => {
      const result = await deleteQuestion({ questionId });
      if (!result.ok) {
        toast.error(t('toast.error'), { description: result.error });
        setDeletingQuestionId(null);
        return;
      }

      setQuestions((prev) => normalizeQuestions(prev.filter((q) => q.id !== questionId)));
      setDeletingQuestionId(null);
      toast.success(t('toast.deleted'));
    });
  };

  const moveQuestion = (questionId: string, direction: -1 | 1) => {
    const currentIndex = questions.findIndex((q) => q.id === questionId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;

    const reordered = questions.slice();
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);

    const normalized = normalizeQuestions(reordered);
    const previous = questions;

    setQuestions(normalized);

    startTransition(async () => {
      const result = await reorderQuestions({
        editionId,
        questionIds: normalized.map((q) => q.id),
      });

      if (!result.ok) {
        setQuestions(previous);
        toast.error(t('toast.error'), { description: result.error });
        return;
      }

      toast.success(t('toast.reordered'));
    });
  };

  return (
    <div className="space-y-6">
      {/* Header / Add */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('sectionTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('sectionDescription')}</p>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)} disabled={isPending}>
            <Plus className="h-4 w-4 mr-2" />
            {t('addQuestion')}
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">{t('createTitle')}</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowAddForm(false)}
              disabled={isPending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <QuestionForm
            distances={distances}
            initialData={DEFAULT_FORM_DATA}
            submitLabel={tForm('create')}
            isSubmitting={isPending}
            onCancel={() => setShowAddForm(false)}
            onSubmit={createNewQuestion}
          />
        </div>
      )}

      {/* List */}
      {questions.length === 0 && !showAddForm ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <p className="font-medium">{t('emptyState')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('emptyStateDescription')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => {
            const isEditing = editingId === question.id;
            const distanceLabel =
              question.distanceId === null
                ? tForm('distanceAll')
                : distances.find((d) => d.id === question.distanceId)?.label ?? tForm('distanceAll');

            return (
              <div key={question.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">{question.prompt}</p>
                      <QuestionTypeBadge type={question.type} />
                      {question.isRequired && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t('requiredBadge')}
                        </span>
                      )}
                      {!question.isActive && (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {t('inactiveBadge')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{tForm('distance')}: {distanceLabel}</span>
                      {question.type === 'single_select' && (
                        <span>
                          {t('optionsCount', { count: question.options?.length ?? 0 })}
                        </span>
                      )}
                    </div>

                    {question.helpText && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {question.helpText}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending || index === 0}
                      onClick={() => moveQuestion(question.id, -1)}
                      aria-label={t('reorder.moveUp')}
                      title={t('reorder.moveUp')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending || index === questions.length - 1}
                      onClick={() => moveQuestion(question.id, 1)}
                      aria-label={t('reorder.moveDown')}
                      title={t('reorder.moveDown')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => setEditingId(isEditing ? null : question.id)}
                      aria-label={t('editQuestion')}
                      title={t('editQuestion')}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setDeletingQuestionId(question.id)}
                      aria-label={t('deleteQuestion')}
                      title={t('deleteQuestion')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {isEditing && editingQuestion && (
                  <div className="mt-4 border-t pt-4">
                    <QuestionForm
                      distances={distances}
                      initialData={getFormDataFromQuestion(editingQuestion)}
                      submitLabel={tForm('save')}
                      isSubmitting={isPending}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(data) => saveQuestion(question.id, data)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DeleteConfirmationDialog
        open={!!deletingQuestionId}
        onOpenChange={(open) => !open && setDeletingQuestionId(null)}
        title={t('deleteTitle')}
        description={t('confirmDelete')}
        itemName={questions.find((q) => q.id === deletingQuestionId)?.prompt}
        onConfirm={() => {
          if (deletingQuestionId) removeQuestion(deletingQuestionId);
        }}
        isPending={isPending}
      />
    </div>
  );
}
