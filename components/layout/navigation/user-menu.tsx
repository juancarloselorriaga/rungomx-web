'use client';

import UserAvatar from '@/components/auth/user-avatar';
import { useAppTheme } from '@/components/providers/app-theme';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocaleChange } from '@/hooks/use-locale-change';
import { Link, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { signOut } from '@/lib/auth/client';
import type { User } from '@/lib/auth/types';
import { Check, Languages, LogOut, Moon, Sun, User as UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

type ThemeOption = 'light' | 'dark';

export function UserMenu({ user }: { user: User | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { theme, setTheme } = useAppTheme();
  const { changeLocale, currentLocale } = useLocaleChange();

  const tAuth = useTranslations('auth');
  const tTheme = useTranslations('components.themeSwitcher');
  const tLocale = useTranslations('components.localeSwitcher');

  const displayName = user?.name || user?.email || 'Guest';
  const displayEmail = user?.email;

  const handleSignOut = () => {
    startTransition(async () => {
      try {
        await signOut();
      } finally {
        router.refresh();
      }
    });
  };

  const triggerAvatar = (
    <Button
      variant="ghost"
      className="h-10 w-10 rounded-full border border-border/70 bg-background"
      size="icon"
      aria-label={displayName}
    >
      <UserAvatar user={user} size="sm" linkDisabled className="h-8 w-8" />
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{triggerAvatar}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end">
        <DropdownMenuLabel className="flex items-center gap-3">
          <UserAvatar user={user} linkDisabled className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {displayEmail ? (
              <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
            ) : null}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          {tLocale('label')}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {routing.locales.map((availableLocale) => (
            <DropdownMenuItem
              key={availableLocale}
              onClick={() => changeLocale(availableLocale)}
              className="flex items-center gap-2"
            >
              <Languages className="h-4 w-4" />
              <span className="flex-1">{tLocale('locale', { locale: availableLocale })}</span>
              {availableLocale === currentLocale && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          {tTheme('toggleLabel')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeOption)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" />
            {tTheme('light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" />
            {tTheme('dark')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {user ? (
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={isPending}
            className="text-destructive"
          >
            <LogOut className="h-4 w-4" />
            {tAuth('signOut')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/sign-up">
                <UserIcon className="h-4 w-4" />
                {tAuth('signUp')}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
