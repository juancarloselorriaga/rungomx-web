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
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface FeedbackDialogProps {
  collapsed: boolean;
  label: string;
  icon: LucideIcon;
}

export function FeedbackDialog({
  collapsed,
  label,
  icon: Icon
}: FeedbackDialogProps) {
  const t = useTranslations('components.feedback');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetForm = () => {
    setMessage('');
  };

  const handleSubmit = () => {
    // TODO: Connect feedback submission to mailing service
    handleOpenChange(false);
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      resetForm();
    }
  };

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
          variant="ghost"
          className={cn(
            navActionContainer(collapsed),
            'w-full text-muted-foreground hover:text-foreground'
          )}
          title={collapsed ? label : undefined}
          aria-label={label}
          data-collapsed={collapsed}
        >
          <NavActionContent
            icon={Icon}
            label={label}
            collapsedLabel={label}
            collapsed={collapsed}
            iconSize={20}
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
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
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
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-protonpass-ignore="true"
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!message.trim()}>
              {t('send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
