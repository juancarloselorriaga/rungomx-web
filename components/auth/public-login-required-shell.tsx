import { PublicStatusShell } from '@/components/common';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus } from 'lucide-react';

type PublicLoginRequiredShellProps = {
  title: string;
  description: string;
  contextLabel?: string;
  eventName?: string;
  supportText?: string;
  signInLabel: string;
  signUpLabel: string;
  signInUrl: string;
  signUpUrl: string;
};

export function PublicLoginRequiredShell({
  title,
  description,
  contextLabel,
  eventName,
  supportText,
  signInLabel,
  signUpLabel,
  signInUrl,
  signUpUrl,
}: PublicLoginRequiredShellProps) {
  return (
    <PublicStatusShell
      badge="RunGoMX"
      icon={<LogIn className="size-5" />}
      title={title}
      description={description}
      context={
        eventName ? (
          <>
            {contextLabel ? (
              <span className="mr-2 text-muted-foreground">{contextLabel}</span>
            ) : null}
            <span>{eventName}</span>
          </>
        ) : undefined
      }
      support={
        supportText ? (
          <p className="text-sm leading-7 text-muted-foreground">{supportText}</p>
        ) : undefined
      }
      actions={
        <>
          <Button asChild size="lg" className="min-w-0 sm:min-w-[12rem]">
            <a href={signInUrl}>
              <LogIn className="mr-2 h-4 w-4" />
              {signInLabel}
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-w-0 sm:min-w-[12rem]">
            <a href={signUpUrl}>
              <UserPlus className="mr-2 h-4 w-4" />
              {signUpLabel}
            </a>
          </Button>
        </>
      }
    />
  );
}
