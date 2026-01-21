import { cn } from '@/lib/utils';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownContentProps = {
  content: string;
  className?: string;
};

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content) return null;

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={defaultUrlTransform}
        disallowedElements={['img']}
        components={{
          p: ({ className: paragraphClassName, ...props }) => (
            <p className={cn('whitespace-pre-wrap', paragraphClassName)} {...props} />
          ),
          li: ({ className: listItemClassName, ...props }) => (
            <li className={cn('whitespace-pre-wrap', listItemClassName)} {...props} />
          ),
          a: ({ href, ...props }) => {
            const isExternal = typeof href === 'string' && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              />
            );
          },
          table: ({ className: tableClassName, ...props }) => (
            <div className="overflow-x-auto">
              <table className={cn('w-full', tableClassName)} {...props} />
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

