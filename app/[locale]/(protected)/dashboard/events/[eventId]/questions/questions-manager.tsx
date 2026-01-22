'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Edit2, Loader2, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { FormField } from '@/components/ui/form-field';
import { Form, FormError, useForm } from '@/lib/forms';
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
  editionId,
  questionId,
  distances,
  initialData,
  onCancel,
  onSaved,
  nextSortOrder,
}: {
  editionId: string;
  questionId?: string;
  distances: Array<{ id: string; label: string }>;
  initialData: QuestionFormData;
  onCancel: () => void;
  onSaved: (question: RegistrationQuestionData) => void;
  nextSortOrder?: number;
}) {
  const t = useTranslations('pages.dashboardEvents.questions.form');
  const tQuestions = useTranslations('pages.dashboardEvents.questions');

  const form = useForm<QuestionFormData, RegistrationQuestionData>({
    defaultValues: initialData,
    onSubmit: async (values) => {
      const options = parseOptions(values.type, values.optionsText);

      if (values.type === 'single_select' && (!options || options.length < 2)) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          message: t('optionsHint'),
          fieldErrors: { optionsText: [t('optionsHint')] },
        };
      }

      if (questionId) {
        const result = await updateQuestion({
          questionId,
          prompt: values.prompt.trim(),
          helpText: values.helpText.trim() || null,
          isRequired: values.isRequired,
          isActive: values.isActive,
          distanceId: values.distanceId || null,
          options,
        });

        if (!result.ok) {
          if (result.code === 'VALIDATION_ERROR') {
            return { ok: false, error: 'INVALID_INPUT', message: result.error };
          }
          return { ok: false, error: 'SERVER_ERROR', message: result.error };
        }

        return { ok: true, data: result.data };
      }

      const result = await createQuestion({
        editionId,
        distanceId: values.distanceId || null,
        type: values.type,
        prompt: values.prompt.trim(),
        helpText: values.helpText.trim() || null,
        isRequired: values.isRequired,
        isActive: values.isActive,
        options,
        sortOrder: nextSortOrder ?? 0,
      });

      if (!result.ok) {
        if (result.code === 'VALIDATION_ERROR') {
          return { ok: false, error: 'INVALID_INPUT', message: result.error };
        }
        return { ok: false, error: 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: result.data };
    },
    onSuccess: (question) => {
      toast.success(questionId ? tQuestions('toast.updated') : tQuestions('toast.created'));
      onSaved(question);
    },
    onError: (message) => {
      toast.error(tQuestions('toast.error'), { description: message });
    },
  });

  const showOptions = form.values.type === 'single_select';

  return (
    <Form form={form} className="space-y-4">
      <FormError />

      <FormField label={t('prompt')} required error={form.errors.prompt}>
        <input
          type="text"
          value={form.values.prompt}
          onChange={(e) => form.setFieldValue('prompt', e.target.value)}
          placeholder={t('promptPlaceholder')}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          maxLength={500}
          required
          disabled={form.isSubmitting}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('type')} required error={form.errors.type}>
          <select
            value={form.values.type}
            onChange={(e) => {
              const nextType = e.target.value as RegistrationQuestionType;
              form.setFieldValue('type', nextType);
              if (nextType !== 'single_select') {
                form.setFieldValue('optionsText', '');
              }
            }}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={form.isSubmitting}
          >
            <option value="text">{t('typeOptions.text')}</option>
            <option value="single_select">{t('typeOptions.single_select')}</option>
            <option value="checkbox">{t('typeOptions.checkbox')}</option>
          </select>
        </FormField>

        <FormField label={t('distance')} error={form.errors.distanceId}>
          <select
            value={form.values.distanceId}
            onChange={(e) => form.setFieldValue('distanceId', e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={form.isSubmitting}
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

      <FormField label={t('helpText')} error={form.errors.helpText}>
        <input
          type="text"
          value={form.values.helpText}
          onChange={(e) => form.setFieldValue('helpText', e.target.value)}
          placeholder={t('helpTextPlaceholder')}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          maxLength={500}
          disabled={form.isSubmitting}
        />
      </FormField>

      {showOptions && (
        <FormField label={t('options')} required error={form.errors.optionsText}>
          <textarea
            value={form.values.optionsText}
            onChange={(e) => form.setFieldValue('optionsText', e.target.value)}
            placeholder={t('optionsPlaceholder')}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-28"
            disabled={form.isSubmitting}
          />
          <p className="text-xs text-muted-foreground">{t('optionsHint')}</p>
        </FormField>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('required')} error={form.errors.isRequired}>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.values.isRequired}
              onChange={(e) => form.setFieldValue('isRequired', e.target.checked)}
              disabled={form.isSubmitting}
            />
            {t('requiredLabel')}
          </label>
        </FormField>

        <FormField label={t('active')} error={form.errors.isActive}>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.values.isActive}
              onChange={(e) => form.setFieldValue('isActive', e.target.checked)}
              disabled={form.isSubmitting}
            />
            {t('activeLabel')}
          </label>
        </FormField>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={form.isSubmitting}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={form.isSubmitting}>
          {form.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {questionId ? t('save') : t('create')}
        </Button>
      </div>
    </Form>
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
            editionId={editionId}
            distances={distances}
            initialData={DEFAULT_FORM_DATA}
            nextSortOrder={questions.length}
            onCancel={() => setShowAddForm(false)}
            onSaved={(question) => {
              setQuestions((prev) => normalizeQuestions([...prev, question]));
              setShowAddForm(false);
            }}
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
                      editionId={editionId}
                      questionId={question.id}
                      distances={distances}
                      initialData={getFormDataFromQuestion(editingQuestion)}
                      onCancel={() => setEditingId(null)}
                      onSaved={(nextQuestion) => {
                        setQuestions((prev) =>
                          normalizeQuestions(
                            prev.map((q) => (q.id === question.id ? nextQuestion : q)),
                          ),
                        );
                        setEditingId(null);
                      }}
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
