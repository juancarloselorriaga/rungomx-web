'use client';

import { upsertProfileAction } from '@/app/actions/profile';
import { CountrySelectField } from '@/components/settings/fields/country-select-field';
import { GenderField } from '@/components/settings/fields/gender-field';
import { MeasurementField } from '@/components/settings/fields/measurement-field';
import { PhoneField } from '@/components/settings/fields/phone-field';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/i18n/navigation';
import { Form, FormError, useForm } from '@/lib/forms';
import type { ProfileMetadata } from '@/lib/profiles/metadata';
import type { ProfileRecord, ProfileStatus, ProfileUpsertInput } from '@/lib/profiles/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

type ProfileFormValues = {
  phone: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  locationDisplay: string;
  dateOfBirth: string;
  gender: string;
  genderDescription: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  shirtSize: string;
  bloodType: string;
  bio: string;
  medicalConditions: string;
  weightKg: string;
  heightCm: string;
};

const DEFAULT_VALUES: ProfileFormValues = {
  phone: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'MX',
  locationDisplay: '',
  dateOfBirth: '',
  gender: '',
  genderDescription: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  shirtSize: '',
  bloodType: '',
  bio: '',
  medicalConditions: '',
  weightKg: '',
  heightCm: '',
};

type UpsertProfileSuccess = {
  profile: ProfileRecord | null;
  profileStatus: ProfileStatus;
  profileMetadata: ProfileMetadata;
};

function formatDateInput(value?: string | Date | null) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function formatNumericInput(value?: number | string | null) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return value.trim();
}

function toFormValues(profile: ProfileRecord | null): ProfileFormValues {
  if (!profile) return { ...DEFAULT_VALUES };

  return {
    phone: profile.phone ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    postalCode: profile.postalCode ?? '',
    country: (profile.country ?? DEFAULT_VALUES.country).toUpperCase(),
    locationDisplay: profile.locationDisplay ?? '',
    dateOfBirth: formatDateInput(profile.dateOfBirth),
    gender: profile.gender ?? '',
    genderDescription: profile.genderDescription ?? '',
    emergencyContactName: profile.emergencyContactName ?? '',
    emergencyContactPhone: profile.emergencyContactPhone ?? '',
    shirtSize: profile.shirtSize ?? '',
    bloodType: profile.bloodType ?? '',
    bio: profile.bio ?? '',
    medicalConditions: profile.medicalConditions ?? '',
    weightKg: formatNumericInput(profile.weightKg),
    heightCm: formatNumericInput(profile.heightCm),
  };
}

function buildPayload(values: ProfileFormValues): ProfileUpsertInput {
  const payload: Record<string, unknown> = {};

  const assign = (key: keyof ProfileUpsertInput, raw: string) => {
    const trimmed = raw?.trim?.() ?? '';
    if (!trimmed) return;
    payload[key] = trimmed;
  };

  assign('phone', values.phone);
  assign('city', values.city);
  assign('state', values.state);
  assign('postalCode', values.postalCode);

  const country = values.country?.trim() || DEFAULT_VALUES.country;
  if (country) {
    assign('country', country.toUpperCase());
  }

  assign('locationDisplay', values.locationDisplay);
  assign('dateOfBirth', values.dateOfBirth);
  assign('gender', values.gender);

  if (values.gender === 'self_described' && values.genderDescription.trim()) {
    assign('genderDescription', values.genderDescription);
  } else if (values.gender !== 'self_described') {
    // Drop description when not self-described to avoid stale values
    payload.genderDescription = null;
  }

  assign('emergencyContactName', values.emergencyContactName);
  assign('emergencyContactPhone', values.emergencyContactPhone);
  assign('shirtSize', values.shirtSize);
  assign('bloodType', values.bloodType);
  assign('bio', values.bio);
  assign('medicalConditions', values.medicalConditions);
  assign('weightKg', values.weightKg);
  assign('heightCm', values.heightCm);

  return payload as ProfileUpsertInput;
}

type ProfileFormMode = 'settings' | 'completion';

type ProfileFormProps = {
  profile: ProfileRecord | null;
  profileStatus: ProfileStatus;
  profileMetadata: ProfileMetadata;
  requiredFieldKeys?: (keyof ProfileRecord)[];
  mode?: ProfileFormMode;
  onUpdateAction?: (result: UpsertProfileSuccess) => void;
  onSignOutClick?: () => void;
  disableActions?: boolean;
};

function ProfileForm({
  profile,
  profileStatus,
  profileMetadata,
  requiredFieldKeys,
  mode = 'settings',
  onUpdateAction,
  onSignOutClick,
  disableActions = false,
}: ProfileFormProps) {
  const t = useTranslations('components.settings.profileForm');
  const locale = useLocale();
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const initialValues = useMemo(() => toFormValues(profile), [profile]);
  const lastSavedValuesRef = useRef<ProfileFormValues>(initialValues);

  const requiredFields = useMemo(
    () => new Set(requiredFieldKeys ?? profileMetadata.requiredFieldKeys ?? []),
    [profileMetadata.requiredFieldKeys, requiredFieldKeys]
  );

  const form = useForm<ProfileFormValues, UpsertProfileSuccess>({
    defaultValues: initialValues,
    onSubmit: async (values) => {
      setSuccessMessage(null);
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

        return {
          ok: false,
          error: result.error,
          message: t('errors.saveProfile'),
        };
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
      const nextValues = toFormValues(data.profile);
      lastSavedValuesRef.current = nextValues;
      Object.entries(nextValues).forEach(([key, value]) => {
        form.setFieldValue(key as keyof ProfileFormValues, value as string);
        form.clearError(key as keyof ProfileFormValues);
      });
      setSuccessMessage(t('success.updated'));
      onUpdateAction?.(data);
      router.refresh();
    },
  });

  const shirtSizeOptions = profileMetadata.shirtSizes ?? [];
  const bloodTypeOptions = profileMetadata.bloodTypes ?? [];
  const genderOptions = profileMetadata.genderOptions ?? [];
  const countryOptions = profileMetadata.countries ?? [];

  const phoneField = form.register('phone');
  const emergencyPhoneField = form.register('emergencyContactPhone');
  const dateOfBirthField = form.register('dateOfBirth');
  const genderField = form.register('gender');
  const genderDescriptionField = form.register('genderDescription');

  useEffect(() => {
    const nextValues = toFormValues(profile);
    const serialized = JSON.stringify(nextValues);
    const current = JSON.stringify(lastSavedValuesRef.current);

    if (serialized !== current) {
      lastSavedValuesRef.current = nextValues;
      (Object.keys(nextValues) as (keyof ProfileFormValues)[]).forEach((field) => {
        form.setFieldValue(field, nextValues[field]);
        form.clearError(field);
      });
    }
  }, [profile, form]);

  const handleReset = () => {
    const values = lastSavedValuesRef.current;
    (Object.keys(values) as (keyof ProfileFormValues)[]).forEach((field) => {
      form.setFieldValue(field, values[field]);
      form.clearError(field);
    });
    setSuccessMessage(null);
  };

  const isBusy = form.isSubmitting || disableActions;
  const showStatusCard = mode === 'completion';

  const isRequiredField = (field: keyof ProfileRecord) => requiredFields.has(field);

  return (
    <Form form={form} className="space-y-4">
      <FormError />
      {successMessage ? (
        <div className="rounded-md border border-green-400/40 bg-green-500/5 px-3 py-2 text-sm text-green-900 shadow-sm dark:border-green-400/50 dark:bg-green-500/10 dark:text-green-50">
          {successMessage}
        </div>
      ) : null}

      {showStatusCard ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            {t('status.label')}{' '}
            {profileStatus.isComplete ? t('status.complete') : t('status.incomplete')}
          </div>
        </div>
      ) : null}

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('sections.basicContact.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('sections.basicContact.description')}</p>
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

          <FormField label={t('fields.postalCode')} error={form.errors.postalCode}>
            <input
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                form.errors.postalCode && 'border-destructive focus-visible:border-destructive'
              )}
              {...form.register('postalCode')}
              inputMode="numeric"
              maxLength={10}
              disabled={isBusy}
            />
          </FormField>

          <CountrySelectField
            label={t('fields.country')}
            value={form.values.country}
            onChangeAction={(value) => form.setFieldValue('country', value)}
            options={countryOptions}
            required={isRequiredField('country')}
            error={form.errors.country}
            disabled={isBusy}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('sections.emergencyContact.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('sections.emergencyContact.description')}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            label={t('fields.emergencyContactName')}
            required={isRequiredField('emergencyContactName')}
            error={form.errors.emergencyContactName}
          >
            <input
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                form.errors.emergencyContactName &&
                  'border-destructive focus-visible:border-destructive'
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
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('sections.demographics.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('sections.demographics.description')}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
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
            label={t('fields.locationDisplay')}
            required={isRequiredField('locationDisplay')}
            error={form.errors.locationDisplay}
          >
            <input
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                form.errors.locationDisplay && 'border-destructive focus-visible:border-destructive'
              )}
              {...form.register('locationDisplay')}
              maxLength={255}
              disabled={isBusy}
            />
            <p className="text-xs text-muted-foreground">{t('hints.locationDisplay')}</p>
          </FormField>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('sections.physical.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('sections.physical.description')}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
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
                  {t(`shirtSizes.${size}`)}
                </option>
              ))}
            </select>
          </FormField>

          <MeasurementField
            label={t('fields.weightKg')}
            name="weightKg"
            value={form.values.weightKg}
            onChange={(value) => form.setFieldValue('weightKg', value)}
            min={30}
            max={250}
            step={0.5}
            unit={t('units.kg')}
            hint={t('hints.weightKg')}
            error={form.errors.weightKg}
            disabled={isBusy}
          />

          <MeasurementField
            label={t('fields.heightCm')}
            name="heightCm"
            value={form.values.heightCm}
            onChange={(value) => form.setFieldValue('heightCm', value)}
            min={120}
            max={230}
            step={1}
            unit={t('units.cm')}
            hint={t('hints.heightCm')}
            error={form.errors.heightCm}
            disabled={isBusy}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('sections.medical.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('sections.medical.description')}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
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

          <FormField
            label={t('fields.medicalConditions')}
            required={isRequiredField('medicalConditions')}
            error={form.errors.medicalConditions}
          >
            <textarea
              className={cn(
                'min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                form.errors.medicalConditions && 'border-destructive focus-visible:border-destructive'
              )}
              {...form.register('medicalConditions')}
              disabled={isBusy}
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground">{t('hints.medicalConditions')}</p>
          </FormField>
        </div>

        <FormField label={t('fields.bio')} error={form.errors.bio}>
          <textarea
            className={cn(
              'min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.bio && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('bio')}
            disabled={isBusy}
            maxLength={500}
          />
        </FormField>
      </section>

      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        {mode === 'completion' && onSignOutClick ? (
          <Button
            type="button"
            variant="ghost"
            className="justify-start gap-2 text-sm text-muted-foreground"
            onClick={onSignOutClick}
            disabled={isBusy}
          >
            <LogOut className="h-4 w-4" />
            {t('actions.signOut')}
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          {mode === 'settings' ? (
            <Button type="button" variant="outline" onClick={handleReset} disabled={isBusy}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button type="submit" disabled={isBusy}>
            {form.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {mode === 'completion' ? t('actions.submit') : t('actions.save')}
          </Button>
        </div>
      </div>
    </Form>
  );
}

type ProfileSettingsFormProps = {
  profile: ProfileRecord | null;
  profileStatus: ProfileStatus;
  profileMetadata: ProfileMetadata;
  requiredFieldKeys?: (keyof ProfileRecord)[];
};

export function ProfileSettingsForm({
  profile,
  profileStatus,
  profileMetadata,
  requiredFieldKeys,
}: ProfileSettingsFormProps) {
  return (
    <ProfileForm
      profile={profile}
      profileStatus={profileStatus}
      profileMetadata={profileMetadata}
      requiredFieldKeys={requiredFieldKeys}
      mode="settings"
    />
  );
}

export type { UpsertProfileSuccess, ProfileFormProps };
