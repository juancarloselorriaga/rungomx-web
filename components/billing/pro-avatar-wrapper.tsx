import { cn } from '@/lib/utils';
import { Crown } from 'lucide-react';
import type { ReactNode } from 'react';

type ProAvatarWrapperSize = 'xs' | 'sm' | 'default' | 'lg' | 'xl';

const crownStylesBySize: Record<
  ProAvatarWrapperSize,
  { container: string; icon: string; position: string }
> = {
  xs: { container: 'size-4', icon: 'size-2.5', position: '-bottom-0.5 -right-0.5' },
  sm: { container: 'size-4', icon: 'size-2.5', position: '-bottom-0.5 -right-0.5' },
  default: { container: 'size-5', icon: 'size-3', position: '-bottom-0.5 -right-0.5' },
  lg: { container: 'size-6', icon: 'size-3.5', position: '-bottom-1 -right-1' },
  xl: { container: 'size-7', icon: 'size-4', position: '-bottom-1 -right-1' },
};

type ProAvatarWrapperProps = {
  children: ReactNode;
  isPro?: boolean;
  size?: ProAvatarWrapperSize;
  className?: string;
};

export function ProAvatarWrapper({
  children,
  isPro,
  size = 'default',
  className,
}: ProAvatarWrapperProps) {
  if (!isPro) return children;

  const crown = crownStylesBySize[size];

  return (
    <div className={cn('relative inline-flex', className)}>
      <div className="rounded-full ring-2 ring-brand-gold/70">{children}</div>
      <span
        className={cn(
          'pointer-events-none absolute flex items-center justify-center rounded-full bg-brand-gold text-white shadow-sm border-2 border-background',
          crown.container,
          crown.position,
        )}
        aria-hidden="true"
      >
        <Crown className={crown.icon} />
      </span>
    </div>
  );
}

