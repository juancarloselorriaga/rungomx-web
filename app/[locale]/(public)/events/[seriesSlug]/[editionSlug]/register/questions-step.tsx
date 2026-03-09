'use client';

import { Button } from '@/components/ui/button';
import { Form, FormError } from '@/lib/forms';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RegistrationFlowState } from './use-registration-flow';

type QuestionsStepProps = {
  activeQuestions: RegistrationFlowState['activeQuestions'];
  questionsForm: RegistrationFlowState['questionsForm'];
  isPending: RegistrationFlowState['isPending'];
  onBack: () => void;
};

export function QuestionsStep({
  activeQuestions,
  questionsForm,
  isPending,
  onBack,
}: QuestionsStepProps) {
  const t = useTranslations('pages.events.register');

  return (
    <Form form={questionsForm} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('questions.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('questions.description')}</p>
      </div>

      <FormError />

      {activeQuestions.length === 0 ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {t('questions.skipIfNone')}
        </div>
      ) : (
        <div className="space-y-5">
          {activeQuestions.map((question) => (
            <div key={question.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{question.prompt}</p>
                <span className="text-xs text-muted-foreground">
                  {question.isRequired ? t('questions.required') : t('questions.optional')}
                </span>
              </div>
              {question.helpText && (
                <p className="text-sm text-muted-foreground">{question.helpText}</p>
              )}
              {question.type === 'text' && (
                <input
                  type="text"
                  value={questionsForm.values[question.id] ?? ''}
                  onChange={(e) => questionsForm.setFieldValue(question.id, e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending || questionsForm.isSubmitting}
                />
              )}
              {question.type === 'single_select' && (
                <select
                  value={questionsForm.values[question.id] ?? ''}
                  onChange={(e) => questionsForm.setFieldValue(question.id, e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending || questionsForm.isSubmitting}
                >
                  <option value="">{t('addons.selectOption')}</option>
                  {question.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
              {question.type === 'checkbox' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={questionsForm.values[question.id] === 'true'}
                    onChange={(e) =>
                      questionsForm.setFieldValue(question.id, e.target.checked ? 'true' : '')
                    }
                    className="h-4 w-4 rounded border-gray-300"
                    disabled={isPending || questionsForm.isSubmitting}
                  />
                  {question.isRequired ? t('questions.required') : t('questions.optional')}
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isPending || questionsForm.isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button type="submit" disabled={isPending || questionsForm.isSubmitting}>
          {isPending || questionsForm.isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {t('questions.continue')}
        </Button>
      </div>
    </Form>
  );
}
