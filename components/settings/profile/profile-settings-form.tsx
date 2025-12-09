'use client';

import { upsertProfileAction } from '@/app/actions/profile';
import {
  ProfileBasicContactSection
} from '@/components/settings/profile/profile-basic-contact-section';
import {
  ProfileDemographicsSection
} from '@/components/settings/profile/profile-demographics-section';
import {
  ProfileEmergencyContactSection
} from '@/components/settings/profile/profile-emergency-contact-section';
import { ProfileMedicalSection } from '@/components/settings/profile/profile-medical-section';
import { ProfilePhysicalSection } from '@/components/settings/profile/profile-physical-section';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { Form, FormError, useForm } from '@/lib/forms';
import type { ProfileMetadata } from '@/lib/profiles/metadata';
import {
  buildProfileUpsertPayloadFromForm,
  type ProfileFormValuesBase,
  toProfileFormValuesFromRecord,
} from '@/lib/profiles/profile-form-utils';
import type { ProfileRecord, ProfileStatus, ProfileUpsertInput } from '@/lib/profiles/types';
import { CheckCircle2, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';

export type ProfileFormValues = Required<ProfileFormValuesBase>;

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

function toFormValues(profile: ProfileRecord | null): ProfileFormValues {
  return toProfileFormValuesFromRecord(profile, DEFAULT_VALUES);
}

function buildPayload(values: ProfileFormValues): ProfileUpsertInput {
  return buildProfileUpsertPayloadFromForm(values, DEFAULT_VALUES.country);
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

  const initialValues = useMemo(() => toFormValues(profile), [profile]);
  const lastSavedValuesRef = useRef<ProfileFormValues>(initialValues);
  const previousProfileSerializedRef = useRef(JSON.stringify(initialValues));

  const requiredFields = useMemo(
    () => new Set(requiredFieldKeys ?? profileMetadata.requiredFieldKeys ?? []),
    [profileMetadata.requiredFieldKeys, requiredFieldKeys]
  );

  const form = useForm<ProfileFormValues, UpsertProfileSuccess>({
    defaultValues: initialValues,
    onSubmit: async (values) => {
      const payload = buildPayload(values);
      const result = await upsertProfileAction(payload);

      if (!result.ok) {
        const fieldErrors =
          'fieldErrors' in result
            ? translateFieldErrors(result.fieldErrors)
            : undefined;
        if (result.error === 'INVALID_INPUT') {
          return {
            ok: false,
            error: 'INVALID_INPUT',
            fieldErrors,
            message: t('errors.invalidInput'),
          };
        }

        return {
          ok: false,
          error: result.error,
          fieldErrors,
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
      toast.success(t('success.updated'));
      onUpdateAction?.(data);
      router.refresh();
    },
  });

  const countryOptions = profileMetadata.countries ?? [];
  const submitLabel = mode === 'completion' ? t('actions.submit') : t('actions.save');

  const translateFieldErrors = (fieldErrors?: Record<string, string[]>) => {
    if (!fieldErrors) return fieldErrors;

    const translated: Record<string, string[]> = {};

    Object.entries(fieldErrors).forEach(([field, messages]) => {
      translated[field] = messages.map((message) => {
        const normalized = message.toLowerCase();
        const numbers = message.match(/\d+/g) ?? [];

        if (normalized.includes('must be at least') && numbers[0]) {
          return t('errors.minAge', { age: numbers[0] });
        }

        return message;
      });
    });

    return translated;
  };

  useEffect(() => {
    const nextValues = toFormValues(profile);
    const serialized = JSON.stringify(nextValues);

    if (serialized === previousProfileSerializedRef.current) {
      return;
    }

    previousProfileSerializedRef.current = serialized;
    lastSavedValuesRef.current = nextValues;
    (Object.keys(nextValues) as (keyof ProfileFormValues)[]).forEach((field) => {
      form.setFieldValue(field, nextValues[field]);
      form.clearError(field);
    });
  }, [profile, form.clearError, form.setFieldValue, form]);

  const handleReset = () => {
    const values = lastSavedValuesRef.current;
    (Object.keys(values) as (keyof ProfileFormValues)[]).forEach((field) => {
      form.setFieldValue(field, values[field]);
      form.clearError(field);
    });
  };

  const isBusy = form.isSubmitting || disableActions;
  const showStatusCard = mode === 'completion';

  const isRequiredField = (field: keyof ProfileRecord) => requiredFields.has(field);

  const tProfileForm = (key: string, values?: Record<string, unknown>) =>
    values ? t(key as never, values as never) : t(key as never);

  return (
    <Form form={form} className="space-y-4">
      <FormError/>

      {showStatusCard ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4"/>
            {t('status.label')}{' '}
            {profileStatus.isComplete ? t('status.complete') : t('status.incomplete')}
          </div>
        </div>
      ) : null}

      <ProfileBasicContactSection
        form={form}
        t={tProfileForm}
        locale={locale}
        isRequiredField={isRequiredField}
        countryOptions={countryOptions}
        isBusy={isBusy}
      />

      <ProfileEmergencyContactSection
        form={form}
        t={tProfileForm}
        isRequiredField={isRequiredField}
        isBusy={isBusy}
      />

      <ProfileDemographicsSection
        form={form}
        t={tProfileForm}
        isRequiredField={isRequiredField}
        metadata={profileMetadata}
        isBusy={isBusy}
      />

      <ProfilePhysicalSection
        form={form}
        t={tProfileForm}
        isRequiredField={isRequiredField}
        metadata={profileMetadata}
        isBusy={isBusy}
      />

      <ProfileMedicalSection
        form={form}
        t={tProfileForm}
        isRequiredField={isRequiredField}
        metadata={profileMetadata}
        isBusy={isBusy}
      />

      <div
        className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        {mode === 'completion' && onSignOutClick ? (
          <Button
            type="button"
            variant="ghost"
            className="justify-start gap-2 text-sm text-muted-foreground"
            onClick={onSignOutClick}
            disabled={isBusy}
          >
            <LogOut className="h-4 w-4"/>
            {t('actions.signOut')}
          </Button>
        ) : (
          <div/>
        )}

        <div className="flex items-center gap-2">
          {mode === 'settings' ? (
            <Button type="button" variant="outline" onClick={handleReset} disabled={isBusy}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={isBusy}
            isLoading={form.isSubmitting}
            loadingPlacement="replace"
            loadingLabel={submitLabel}
            className="justify-center"
          >
            {submitLabel}
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
