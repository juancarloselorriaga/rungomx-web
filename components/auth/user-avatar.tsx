import { ProAvatarWrapper } from '@/components/billing/pro-avatar-wrapper';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from '@/i18n/navigation';
import { User } from '@/lib/auth/types';
import { cn } from '@/lib/utils';
import { capitalize } from '@/utils/capitalize';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, FC } from 'react';

const avatarVariants = cva('cursor-pointer bg-primary/10', {
  variants: {
    size: {
      default: 'h-10 w-10',
      sm: 'h-8 w-8 text-sm',
      xs: 'h-6 w-6 text-sm',
      lg: 'h-16 w-16 text-lg',
      xl: 'h-24 w-24 text-2xl',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

interface UserAvatarProps
  extends Omit<ComponentProps<typeof Link>, 'href'>,
    VariantProps<typeof avatarVariants> {
  user: User | null;
  isPro?: boolean;
  className?: string;
  avatarClassName?: string;
  linkDisabled?: boolean;
}

const UserAvatar: FC<UserAvatarProps> = ({
  user,
  isPro,
  size,
  className,
  avatarClassName,
  linkDisabled = false,
  ...props
}) => {
  const fallbackContent = capitalize(user?.email?.[0] || '?');
  const imageUrl = user?.image;

  const avatarElement = (
    <Avatar className={cn(avatarVariants({ size }), className)}>
      {imageUrl && (
        <AvatarImage src={imageUrl} alt={user?.name || 'User avatar'} className="object-cover" />
      )}
      <AvatarFallback className={cn('cursor-pointer', avatarClassName)}>
        {fallbackContent}
      </AvatarFallback>
    </Avatar>
  );

  const maybeProAvatarElement = (
    <ProAvatarWrapper isPro={isPro} size={size ?? undefined}>
      {avatarElement}
    </ProAvatarWrapper>
  );

  if (linkDisabled) {
    return maybeProAvatarElement;
  }

  return (
    <Link href="/settings" className="flex" {...props}>
      {maybeProAvatarElement}
    </Link>
  );
};

export default UserAvatar;
