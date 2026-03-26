'use client';

import { GenderField } from '@/components/settings/fields/gender-field';
import { PhoneField } from '@/components/settings/fields/phone-field';
import {
  publicFieldClassName,
  publicPanelClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { Form, FormError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RegistrationFlowState } from './use-registration-flow';

type InfoStepProps = {
  locale: string;
  infoForm: RegistrationFlowState['infoForm'];
  isPending: RegistrationFlowState['isPending'];
  onBack?: () => void;
};

export function InfoStep({ locale, infoForm, isPending, onBack }: InfoStepProps) {
  const t = useTranslations('pages.events.register');
  const tCommon = useTranslations('common');

  return (
    <Form form={infoForm} className="space-y-7">
      <div>
        <h2 className="font-display text-[clamp(1.5rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
          {t('info.title')}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{t('info.description')}</p>
      </div>

      <FormError />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('info.firstName')} required error={infoForm.errors.firstName}>
          <input
            type="text"
            value={infoForm.values.firstName}
            onChange={(e) => infoForm.setFieldValue('firstName', e.target.value)}
            className={publicFieldClassName}
            disabled={isPending || infoForm.isSubmitting}
          />
        </FormField>

        <FormField label={t('info.lastName')} required error={infoForm.errors.lastName}>
          <input
            type="text"
            value={infoForm.values.lastName}
            onChange={(e) => infoForm.setFieldValue('lastName', e.target.value)}
            className={publicFieldClassName}
            disabled={isPending || infoForm.isSubmitting}
          />
        </FormField>

        <FormField label={t('info.email')} required error={infoForm.errors.email}>
          <input
            type="email"
            value={infoForm.values.email}
            onChange={(e) => infoForm.setFieldValue('email', e.target.value)}
            className={publicFieldClassName}
            disabled={isPending || infoForm.isSubmitting}
          />
        </FormField>

        <PhoneField
          label={t('info.phone')}
          name="phone"
          value={infoForm.values.phone}
          onChangeAction={(value) => infoForm.setFieldValue('phone', value)}
          disabled={isPending || infoForm.isSubmitting}
        />

        <FormField label={t('info.dateOfBirth')}>
          <DatePicker
            locale={locale}
            value={infoForm.values.dateOfBirth}
            onChangeAction={(value) => infoForm.setFieldValue('dateOfBirth', value)}
            clearLabel={tCommon('clear')}
            name="dateOfBirth"
          />
        </FormField>

        <GenderField
          label={t('info.gender')}
          value={infoForm.values.gender}
          description={infoForm.values.genderDescription}
          onChangeAction={(value) => infoForm.setFieldValue('gender', value)}
          onDescriptionChangeAction={(value) => infoForm.setFieldValue('genderDescription', value)}
          options={['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described']}
          disabled={isPending || infoForm.isSubmitting}
        />

        <FormField label={t('info.emergencyContact')}>
          <input
            type="text"
            value={infoForm.values.emergencyContact}
            onChange={(e) => infoForm.setFieldValue('emergencyContact', e.target.value)}
            className={publicFieldClassName}
            disabled={isPending || infoForm.isSubmitting}
          />
        </FormField>

        <PhoneField
          label={t('info.emergencyPhone')}
          name="emergencyPhone"
          value={infoForm.values.emergencyPhone}
          onChangeAction={(value) => infoForm.setFieldValue('emergencyPhone', value)}
          disabled={isPending || infoForm.isSubmitting}
        />
      </div>

      <FormField label={t('info.teamName')}>
        <input
          type="text"
          value={infoForm.values.teamName}
          onChange={(e) => infoForm.setFieldValue('teamName', e.target.value)}
          className={publicFieldClassName}
          disabled={isPending || infoForm.isSubmitting}
        />
      </FormField>

      <div
        className={cn(
          publicPanelClassName,
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        {onBack ? (
          <Button variant="outline" type="button" onClick={onBack} disabled={isPending}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {tCommon('previous')}
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={
            !infoForm.values.firstName.trim() ||
            !infoForm.values.lastName.trim() ||
            !infoForm.values.email.trim() ||
            isPending ||
            infoForm.isSubmitting
          }
          className={cn('sm:min-w-[10rem]', !onBack && 'sm:ml-auto')}
        >
          {isPending || infoForm.isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {t('info.continue')}
        </Button>
      </div>
    </Form>
  );
}
