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
            'w-full flex items-center justify-start gap-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300 px-3',
            collapsed ? 'gap-2' : ''
          )}
        >
          <Icon className="h-4 w-4"/>
          <span
            className={cn(
              'min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,transform,max-width] duration-300 ease-in-out',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'
            )}
            style={{ transitionDelay: collapsed ? '0ms' : '120ms' }}
          >
            {label}
          </span>
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
