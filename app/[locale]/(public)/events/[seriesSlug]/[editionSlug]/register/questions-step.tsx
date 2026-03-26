'use client';

import { Button } from '@/components/ui/button';
import {
  publicCheckboxClassName,
  publicFieldClassName,
  publicMutedPanelClassName,
  publicPanelClassName,
  publicSelectClassName,
} from '@/components/common/public-form-styles';
import { Form, FormError } from '@/lib/forms';
import { cn } from '@/lib/utils';
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
  const tCommon = useTranslations('common');

  return (
    <Form form={questionsForm} className="space-y-7">
      <div>
        <h2 className="font-display text-[clamp(1.5rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
          {t('questions.title')}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{t('questions.description')}</p>
      </div>

      <FormError />

      {activeQuestions.length === 0 ? (
        <div className={cn(publicMutedPanelClassName, 'text-sm text-muted-foreground')}>
          {t('questions.skipIfNone')}
        </div>
      ) : (
        <div className="space-y-5">
          {activeQuestions.map((question) => (
            <div key={question.id} className={cn(publicPanelClassName, 'space-y-3')}>
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
                  className={publicFieldClassName}
                  disabled={isPending || questionsForm.isSubmitting}
                />
              )}
              {question.type === 'single_select' && (
                <select
                  value={questionsForm.values[question.id] ?? ''}
                  onChange={(e) => questionsForm.setFieldValue(question.id, e.target.value)}
                  className={publicSelectClassName}
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
                    className={publicCheckboxClassName}
                    disabled={isPending || questionsForm.isSubmitting}
                  />
                  <span className="text-sm text-muted-foreground">{t('questions.checkboxAffirmative')}</span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          publicPanelClassName,
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isPending || questionsForm.isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {tCommon('previous')}
        </Button>
        <Button
          type="submit"
          disabled={isPending || questionsForm.isSubmitting}
          className="sm:min-w-[10rem]"
        >
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
