'use client';

import { submitContactSubmission } from '@/app/actions/contact-submission';
import {
  publicFieldClassName,
  publicMutedPanelClassName,
  publicSelectClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type ContactFormProps = {
  defaultName?: string;
  defaultEmail?: string;
  defaultInquiryType?: string;
  isSignedIn: boolean;
};

type ContactFormValues = {
  name: string;
  email: string;
  message: string;
  honeypot: string;
  inquiryType: string;
};

export function ContactForm({
  defaultName = '',
  defaultEmail = '',
  defaultInquiryType = '',
  isSignedIn,
}: ContactFormProps) {
  const t = useTranslations('pages.contact.form');
  const [showSuccessNotice, setShowSuccessNotice] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inquiryTypeCopy = (t as unknown as { raw: (key: string) => unknown }).raw('fields') as {
    inquiryType?: {
      label?: string;
      options?: {
        support?: string;
        partnerships?: string;
        accountOrEvent?: string;
      };
    };
  };

  const form = useForm<ContactFormValues>({
    defaultValues: {
      name: defaultName,
      email: defaultEmail,
      message: '',
      honeypot: '',
      inquiryType: defaultInquiryType,
    },
    onSubmit: async (values) => {
      setShowSuccessNotice(false);

      const normalizedValues = {
        name: values.name.trim() || undefined,
        email: values.email.trim() || undefined,
        message: values.message.trim(),
        honeypot: values.honeypot,
        inquiryType: (values.inquiryType || undefined) as
          | 'support'
          | 'partnerships'
          | 'account_or_event'
          | undefined,
      };

      const metadata =
        typeof window !== 'undefined'
          ? {
              location: window.location.href,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : undefined;

      const result = await submitContactSubmission({
        ...normalizedValues,
        origin: 'contact-page',
        metadata,
      });

      if (!result.ok) {
        if (result.error === 'RATE_LIMIT_EXCEEDED') {
          toast.error(t('errors.rateLimit'));
          return {
            ok: false as const,
            error: 'RATE_LIMIT_EXCEEDED' as const,
            message: t('errors.rateLimit'),
          };
        }

        if (result.error === 'EMAIL_FAILED') {
          toast.error(t('errors.emailFailed'));
          return {
            ok: false as const,
            error: 'EMAIL_FAILED' as const,
            message: t('errors.emailFailed'),
          };
        }

        if (result.error === 'PROFILE_INCOMPLETE') {
          return {
            ok: false as const,
            error: 'PROFILE_INCOMPLETE' as const,
            message: t('errors.profileIncomplete'),
          };
        }

        if (result.error === 'INVALID_INPUT') {
          return {
            ok: false as const,
            error: 'INVALID_INPUT' as const,
            message: t('errors.invalidInput'),
            fieldErrors: 'fieldErrors' in result ? (result.fieldErrors ?? {}) : {},
          };
        }

        return {
          ok: false as const,
          error: 'SERVER_ERROR' as const,
          message: t('errors.generic'),
        };
      }

      toast.success(t('success'));
      return { ok: true as const, data: null };
    },
    onSuccess: () => {
      setShowSuccessNotice(true);
      form.reset();
    },
  });

  // Sync external defaultInquiryType prop changes into the form
  // (e.g. when the parent pre-selects an inquiry type via URL params)
  // Uses destructured stable callbacks to satisfy react-hooks/exhaustive-deps
  const previousDefaultInquiryTypeRef = useRef(defaultInquiryType);
  const { setFieldValue, clearError } = form;

  useEffect(() => {
    if (defaultInquiryType === previousDefaultInquiryTypeRef.current) {
      return;
    }
    previousDefaultInquiryTypeRef.current = defaultInquiryType;
    setFieldValue('inquiryType', defaultInquiryType);
    clearError('inquiryType');
  }, [defaultInquiryType, clearError, setFieldValue]);

  useEffect(() => {
    if (!showSuccessNotice) {
      return;
    }

    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }

    successTimeoutRef.current = setTimeout(() => {
      setShowSuccessNotice(false);
    }, 4000);

    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, [showSuccessNotice]);

  return (
    <div
      id="contact-form"
      className="rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_72%,var(--background-surface)_28%)] p-6 md:p-8"
    >
      <div className="mb-6 space-y-2">
        <h2 className="font-display text-[clamp(1.6rem,2.6vw,2.1rem)] font-medium tracking-[-0.03em] text-foreground">
          {t('cardTitle')}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {isSignedIn ? t('signedInHelper') : t('signedOutHelper')}
        </p>
      </div>

      <Form form={form} className="space-y-5">
        <FormError />

        {showSuccessNotice ? (
          <div
            role="status"
            aria-live="polite"
            className="motion-status rounded-[1.1rem] border border-[color-mix(in_oklch,var(--brand-green)_24%,var(--border)_76%)] bg-[color-mix(in_oklch,var(--brand-green)_10%,var(--background)_90%)] px-4 py-3 text-sm text-[var(--brand-green-dark)]"
          >
            {t('success')}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label={t('fields.name.label')} error={form.errors.name}>
            <Input
              id="contact-name"
              type="text"
              autoComplete="name"
              aria-invalid={form.errors.name ? true : undefined}
              placeholder={t('fields.name.placeholder')}
              {...form.register('name')}
              disabled={form.isSubmitting}
            />
          </FormField>

          <FormField label={t('fields.email.label')} error={form.errors.email}>
            <Input
              id="contact-email"
              type="email"
              autoComplete="email"
              aria-invalid={form.errors.email ? true : undefined}
              placeholder={t('fields.email.placeholder')}
              {...form.register('email')}
              disabled={form.isSubmitting}
            />
          </FormField>
        </div>

        <FormField
          label={inquiryTypeCopy.inquiryType?.label ?? 'Inquiry type'}
          error={form.errors.inquiryType}
        >
          <select
            id="contact-inquiry-type"
            className={publicSelectClassName}
            aria-invalid={form.errors.inquiryType ? true : undefined}
            {...form.register('inquiryType')}
            disabled={form.isSubmitting}
          >
            <option value=""></option>
            <option value="support">
              {inquiryTypeCopy.inquiryType?.options?.support ?? 'Support'}
            </option>
            <option value="partnerships">
              {inquiryTypeCopy.inquiryType?.options?.partnerships ??
                'Partnerships or general inquiry'}
            </option>
            <option value="account_or_event">
              {inquiryTypeCopy.inquiryType?.options?.accountOrEvent ?? 'Account or event issue'}
            </option>
          </select>
        </FormField>

        <FormField
          label={t('fields.message.label')}
          required
          error={form.errors.message}
          className="space-y-2"
        >
          <textarea
            id="contact-message"
            className={cn(
              publicFieldClassName,
              'min-h-[180px] h-auto resize-y py-3 leading-7 ring-offset-background',
              form.errors.message &&
                'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
            )}
            aria-invalid={form.errors.message ? true : undefined}
            placeholder={t('fields.message.placeholder')}
            {...form.register('message')}
            disabled={form.isSubmitting}
          />
          <p className="text-xs text-muted-foreground">{t('fields.message.hint')}</p>
        </FormField>

        <div
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
          aria-hidden="true"
        >
          <label htmlFor="contact-website">{t('fields.honeypot.label')}</label>
          <input
            type="text"
            id="contact-website"
            name="website"
            value={form.values.honeypot}
            onChange={(event) => form.register('honeypot').onChange(event)}
            tabIndex={-1}
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
          />
        </div>

        <div
          className={cn(
            publicMutedPanelClassName,
            'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
          )}
        >
          <p className="text-xs leading-5 text-muted-foreground">{t('submitNote')}</p>
          <Button
            type="submit"
            disabled={form.isSubmitting}
            className="motion-pressable w-full justify-center whitespace-nowrap sm:w-auto sm:shrink-0"
          >
            {form.isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span>{form.isSubmitting ? t('submitting') : t('submit')}</span>
          </Button>
        </div>
      </Form>
    </div>
  );
}
