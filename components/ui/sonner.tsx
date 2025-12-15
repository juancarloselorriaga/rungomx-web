'use client';

import { useAppTheme } from '@/components/providers/app-theme';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useAppTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        className: 'border shadow-sm',
        classNames: {
          toast: 'rounded-lg',
          success:
            'border-l-4 border-emerald-500/80 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-50 dark:border-emerald-500/70',
          info: 'border-l-4 border-sky-500/80 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-50 dark:border-sky-500/70',
          warning:
            'border-l-4 border-amber-500/80 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-50 dark:border-amber-500/70',
          error:
            'border-l-4 border-rose-500/80 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-50 dark:border-rose-500/70',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};
