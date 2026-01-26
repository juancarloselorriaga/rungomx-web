'use client';

import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from '@/lib/utils';

interface MarkdownHintProps {
  className?: string;
}

const MARKDOWN_GUIDE_URL = 'https://www.markdownguide.org/basic-syntax/';

export function MarkdownHint({ className }: MarkdownHintProps) {
  const t = useTranslations('common.markdownHint');

  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={(e) => e.preventDefault()}
          >
            <Info className="h-3.5 w-3.5" />
            <span>{t('label')}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{t('tooltip')}</p>
        </TooltipContent>
      </Tooltip>
      <span className="text-muted-foreground/60">·</span>
      <a
        href={MARKDOWN_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground transition-colors"
      >
        {t('learnMore')}
      </a>
    </div>
  );
}
