'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { LabeledTextarea } from '@/components/ui/labeled-textarea';
import { NavActionContent, navActionContainer } from './nav-action';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { submitContactSubmission } from '@/app/actions/contact-submission';
import { useTransition } from 'react';

interface FeedbackDialogProps {
  collapsed: boolean;
  label: string;
  icon: LucideIcon;
  iconSize?: number;
}

export function FeedbackDialog({
  collapsed,
  label,
  icon: Icon,
  iconSize = 20,
}: FeedbackDialogProps) {
  const t = useTranslations('components.feedback');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetForm = () => {
    setMessage('');
    setHoneypot('');
  };

  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value);
    if (!value) {
      resetForm();
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    const metadata =
      typeof window !== 'undefined'
        ? {
          location: window.location.href,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
        : undefined;

    startTransition(() => {
      void (async () => {
        try {
          const result = await submitContactSubmission({
            message: trimmedMessage,
            origin: 'feedback-dialog',
            honeypot,
            metadata,
          });

          if (!result.ok) {
            // Handle specific error types
            if (result.error === 'RATE_LIMIT_EXCEEDED') {
              toast.error(t('rateLimitError'));
              return;
            }
            if (result.error === 'EMAIL_FAILED') {
              toast.error(t('emailError'));
              return;
            }
            throw new Error(result.error || 'Unknown error');
          }

          toast.success(t('success'));
          handleOpenChange(false);
        } catch (error) {
          console.error('[FeedbackDialog] Failed to submit feedback', error);
          toast.error(t('error'));
        }
      })();
    });
  }, [handleOpenChange, message, honeypot, t]);

  useEffect(() => {
    if (!open) return;
    const handle = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(handle);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            navActionContainer(),
            'w-full flex justify-start text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
          title={collapsed ? label : undefined}
          aria-label={label}
          data-collapsed={collapsed}
        >
          <NavActionContent
            icon={Icon}
            label={label}
            collapsed={collapsed}
            iconSize={iconSize}
          />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit();
          }}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          data-protonpass-ignore="true"
        >
          <LabeledTextarea
            ref={textareaRef}
            id="feedback-message"
            name="feedback"
            label={t('prompt')}
            hint={t('hint')}
            placeholder={t('placeholder')}
            value={message}
            disabled={isPending}
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-protonpass-ignore="true"
            onChange={(event) => setMessage(event.target.value)}
          />
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
            <label htmlFor="feedback-website">Website</label>
            <input
              type="text"
              id="feedback-website"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!message.trim() || isPending}>
              {isPending ? `${t('send')}...` : t('send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
