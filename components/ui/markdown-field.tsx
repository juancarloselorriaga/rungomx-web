'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { MarkdownHint } from '@/components/ui/markdown-hint';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';

type MarkdownFieldProps = {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  className?: string;
  textareaClassName?: string;
  preview?: boolean;
  onTogglePreview?: (nextPreview: boolean) => void;
  showPreviewToggle?: boolean;
  showHint?: boolean;
  helperText?: React.ReactNode;
  textareaProps?: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'disabled'>;
};

const baseTextareaClassName =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 resize-y';

export function MarkdownField({
  label,
  value,
  onChange,
  required,
  error,
  disabled,
  className,
  textareaClassName,
  preview,
  onTogglePreview,
  showPreviewToggle = true,
  showHint = true,
  helperText,
  textareaProps,
}: MarkdownFieldProps) {
  const t = useTranslations('common');
  const [localPreview, setLocalPreview] = useState(false);
  const isControlled = typeof preview === 'boolean';
  const isPreviewing = isControlled ? preview : localPreview;
  const canToggle = showPreviewToggle && (!isControlled || Boolean(onTogglePreview));

  const handleTogglePreview = () => {
    if (isControlled) {
      onTogglePreview?.(!preview);
      return;
    }
    setLocalPreview((prev) => !prev);
  };

  return (
    <FormField
      label={label}
      required={required}
      error={error}
      className={className}
      labelActions={
        canToggle ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-0 h-7 px-2 text-xs"
            onClick={handleTogglePreview}
            disabled={disabled}
          >
            {isPreviewing ? t('markdown.hidePreview') : t('markdown.preview')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        <div className={cn('grid gap-3', isPreviewing && 'lg:grid-cols-2 lg:items-start')}>
          <textarea
            {...textareaProps}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cn(baseTextareaClassName, textareaClassName, textareaProps?.className)}
            disabled={disabled}
          />
          {isPreviewing ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <MarkdownContent content={value} className="text-sm" />
            </div>
          ) : null}
        </div>
        {showHint ? <MarkdownHint /> : null}
        {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      </div>
    </FormField>
  );
}
