'use client';

import { useEffect, useMemo, useRef, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { upsertProfileAction } from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/auth/client';
import { useRouter } from '@/i18n/navigation';
import type { ProfileMetadata } from '@/lib/profiles/metadata';
import type { ProfileRecord, ProfileStatus, ProfileUpsertInput } from '@/lib/profiles/types';
import { CheckCircle2, LogOut } from 'lucide-react';
import { PhoneField } from '@/components/settings/fields/phone-field';
import { GenderField } from '@/components/settings/fields/gender-field';
import { formatProfileDateInput } from '@/lib/profiles/profile-form-utils';

type ProfileFormValues = {
  phone: string;
  city: string;
  state: string;
  dateOfBirth: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  gender: string;
  genderDescription: string;
  shirtSize: string;
  bloodType: string;
  bio: string;
};

const DEFAULT_FORM_VALUES: ProfileFormValues = {
  phone: '',
  city: '',
  state: '',
  dateOfBirth: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  gender: '',
  genderDescription: '',
  shirtSize: '',
  bloodType: '',
  bio: '',
};

function normalizeShirtSize(value?: string | null) {
  if (!value) return '';
  return value.trim().toLowerCase();
}

function normalizeBloodType(value?: string | null) {
  if (!value) return '';
  return value.trim().toLowerCase();
}

function toFormValues(profile: ProfileRecord | null): ProfileFormValues {
  if (!profile) return DEFAULT_FORM_VALUES;

  return {
    phone: profile.phone ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    dateOfBirth: formatProfileDateInput(profile.dateOfBirth),
    emergencyContactName: profile.emergencyContactName ?? '',
    emergencyContactPhone: profile.emergencyContactPhone ?? '',
    gender: profile.gender ?? '',
    genderDescription: profile.genderDescription ?? '',
    shirtSize: normalizeShirtSize(profile.shirtSize),
    bloodType: normalizeBloodType(profile.bloodType),
    bio: profile.bio ?? '',
  };
}

function buildPayload(form: ProfileFormValues): ProfileUpsertInput {
  const payload: Record<string, string> = {};

  const assign = (key: keyof ProfileUpsertInput, value: string) => {
    const trimmed = value?.trim?.() ?? '';
    if (!trimmed) return;
    payload[key] = trimmed;
  };

  assign('phone', form.phone);
  assign('city', form.city);
  assign('state', form.state);
  assign('dateOfBirth', form.dateOfBirth);
  assign('emergencyContactName', form.emergencyContactName);
  assign('emergencyContactPhone', form.emergencyContactPhone);
  assign('gender', form.gender);
  assign('shirtSize', form.shirtSize);
  assign('bloodType', form.bloodType);
  assign('bio', form.bio);

  if (form.gender === 'self_described' && form.genderDescription.trim()) {
    assign('genderDescription', form.genderDescription);
  }

  return payload;
}

type ProfileCompletionFormProps = {
  profile: ProfileRecord | null;
  profileStatus: ProfileStatus;
  profileMetadata: ProfileMetadata;
  onUpdateAction: (result: {
    profile: ProfileRecord | null;
    profileStatus: ProfileStatus;
    profileMetadata: ProfileMetadata;
  }) => void;
};

type UpsertProfileSuccess = {
  profile: ProfileRecord | null;
  profileStatus: ProfileStatus;
  profileMetadata: ProfileMetadata;
};

export function ProfileCompletionForm({
  profile,
  profileStatus,
  profileMetadata,
  onUpdateAction,
}: ProfileCompletionFormProps) {
  const t = useTranslations('components.profile');
  const locale = useLocale();
  const router = useRouter();
  const [isSigningOut, startSignOut] = useTransition();

  const form = useForm<ProfileFormValues, UpsertProfileSuccess>({
    defaultValues: toFormValues(profile),
    onSubmit: async (values) => {
      const payload = buildPayload(values);
      const result = await upsertProfileAction(payload);

      if (!result.ok) {
        if (result.error === 'INVALID_INPUT') {
          return {
            ok: false,
            error: 'INVALID_INPUT',
            fieldErrors: result.fieldErrors,
            message: t('errors.invalidInput'),
          };
        }
        return { ok: false, error: result.error, message: t('errors.saveProfile') };
      }

      return {
        ok: true,
        data: {
          profile: result.profile,
          profileStatus: result.profileStatus,
          profileMetadata: result.profileMetadata,
        },
      };
    },
    onSuccess: (data) => {
      onUpdateAction(data);
      router.refresh();
    },
  });

  const requiredFieldKeys = useMemo(
    () => new Set(profileMetadata.requiredFieldKeys ?? []),
    [profileMetadata]
  );
  const shirtSizeOptions = profileMetadata.shirtSizes ?? [];
  const bloodTypeOptions = profileMetadata.bloodTypes ?? [];
  const genderOptions = profileMetadata.genderOptions ?? [];

  const phoneField = form.register('phone');
  const emergencyPhoneField = form.register('emergencyContactPhone');
  const dateOfBirthField = form.register('dateOfBirth');
  const genderField = form.register('gender');
  const genderDescriptionField = form.register('genderDescription');
  const { setFieldValue, clearError } = form;

  const lastProfileValuesRef = useRef<string>('');
  useEffect(() => {
    const nextValues = toFormValues(profile);
    const serialized = JSON.stringify(nextValues);
    if (serialized === lastProfileValuesRef.current) return;
    lastProfileValuesRef.current = serialized;

    (Object.keys(nextValues) as (keyof ProfileFormValues)[]).forEach((field) => {
      setFieldValue(field, nextValues[field]);
      clearError(field);
    });
  }, [profile, clearError, setFieldValue]);

  const isBusy = form.isSubmitting || isSigningOut;
  const isRequiredField = (field: keyof ProfileRecord) => requiredFieldKeys.has(field);

  const handleSignOut = () => {
    startSignOut(async () => {
      await signOut();
      router.refresh();
    });
  };

  return (
    <Form form={form} className="space-y-3">
      <FormError />

      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          {t('status.label')}{' '}
          {profileStatus.isComplete ? t('status.complete') : t('status.incomplete')}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PhoneField
          label={t('fields.phone')}
          name={phoneField.name as string}
          value={phoneField.value}
          onChangeAction={phoneField.onChange}
          required={isRequiredField('phone')}
          error={form.errors.phone}
          disabled={isBusy}
        />

        <FormField
          label={t('fields.dateOfBirth')}
          required={isRequiredField('dateOfBirth')}
          error={form.errors.dateOfBirth}
        >
          <DatePicker
            locale={locale}
            value={dateOfBirthField.value}
            onChangeAction={(value) => dateOfBirthField.onChange(value)}
            clearLabel={t('actions.clear')}
            name={dateOfBirthField.name as string}
          />
        </FormField>

        <FormField
          label={t('fields.city')}
          required={isRequiredField('city')}
          error={form.errors.city}
        >
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.city && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('city')}
            disabled={isBusy}
          />
        </FormField>

        <FormField
          label={t('fields.state')}
          required={isRequiredField('state')}
          error={form.errors.state}
        >
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.state && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('state')}
            disabled={isBusy}
          />
        </FormField>

        <FormField
          label={t('fields.emergencyContactName')}
          required={isRequiredField('emergencyContactName')}
          error={form.errors.emergencyContactName}
        >
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.emergencyContactName && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('emergencyContactName')}
            disabled={isBusy}
          />
        </FormField>

        <PhoneField
          label={t('fields.emergencyContactPhone')}
          name={emergencyPhoneField.name as string}
          value={emergencyPhoneField.value}
          onChangeAction={emergencyPhoneField.onChange}
          required={isRequiredField('emergencyContactPhone')}
          error={form.errors.emergencyContactPhone}
          disabled={isBusy}
        />

        <GenderField
          label={t('fields.gender')}
          value={genderField.value}
          description={genderDescriptionField.value}
          onChangeAction={(value) => genderField.onChange(value)}
          onDescriptionChangeAction={(value) => genderDescriptionField.onChange(value)}
          options={genderOptions}
          required={isRequiredField('gender')}
          error={form.errors.gender}
          descriptionError={form.errors.genderDescription}
          disabled={isBusy}
        />

        <FormField
          label={t('fields.shirtSize')}
          required={isRequiredField('shirtSize')}
          error={form.errors.shirtSize}
        >
          <select
            className={cn(
              'w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.shirtSize && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('shirtSize')}
            disabled={isBusy}
          >
            <option value="">{t('selectOption')}</option>
            {shirtSizeOptions.map((size) => (
              <option key={size} value={size}>
                {t(`shirtSizes.${size}` as const, { defaultValue: size.toUpperCase() })}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label={t('fields.bloodType')}
          required={isRequiredField('bloodType')}
          error={form.errors.bloodType}
        >
          <select
            className={cn(
              'w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.bloodType && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('bloodType')}
            disabled={isBusy}
          >
            <option value="">{t('selectOption')}</option>
            {bloodTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField
        label={t('fields.bio')}
        required={isRequiredField('bio')}
        error={form.errors.bio}
      >
        <textarea
          className={cn(
            'min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
            'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
            form.errors.bio && 'border-destructive focus-visible:border-destructive'
          )}
          {...form.register('bio')}
          disabled={isBusy}
        />
      </FormField>

      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="justify-start gap-2 text-sm text-muted-foreground"
          onClick={handleSignOut}
          disabled={isBusy}
        >
          <LogOut className="h-4 w-4" />
          {t('actions.signOut')}
        </Button>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isBusy}>
            {form.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {t('actions.submit')}
          </Button>
        </div>
      </div>
    </Form>
  );
}
