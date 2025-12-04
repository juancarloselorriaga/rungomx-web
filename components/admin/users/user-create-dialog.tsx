'use client';

import { createAdminUser, createStaffUser } from '@/app/actions/admin-users';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/navigation';
import { Shield, ShieldCheck, UserPlus2 } from 'lucide-react';
import { FormEvent, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string[]>>;

type UserCreateDialogProps = {
  open?: boolean;
  onOpenChangeAction?: (open: boolean) => void;
  onSuccessAction?: () => void;
  initialRole?: 'internal.admin' | 'internal.staff';
};

function extractValidationMessages(details: unknown): string[] {
  const messages: string[] = [];

  const walk = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      messages.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };

  walk(details);
  return Array.from(new Set(messages));
}

function extractFieldErrors(details: unknown): FieldErrors {
  if (!details || typeof details !== 'object') return {};
  const output: FieldErrors = {};
  const targetKeys: Array<keyof FieldErrors> = ['name', 'email', 'password'];

  targetKeys.forEach((key) => {
    const value = (details as Record<string, unknown>)[key as string];
    if (!value) return;
    const collected: string[] = [];

    const walk = (node: unknown) => {
      if (!node) return;
      if (typeof node === 'string') {
        collected.push(node);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === 'object') {
        Object.values(node as Record<string, unknown>).forEach(walk);
      }
    };

    walk(value);
    if (collected.length) {
      output[key] = Array.from(new Set(collected));
    }
  });

  return output;
}

export function UserCreateDialog({ open, onOpenChangeAction, onSuccessAction, initialRole = 'internal.admin' }: UserCreateDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;

  const [role, setRole] = useState<'internal.admin' | 'internal.staff'>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenChange = (value: boolean) => {
    setInternalOpen(value);
    onOpenChangeAction?.(value);
    if (value) {
      setRole(initialRole);
    }
    if (!value) {
      setValidationMessages([]);
      setFieldErrors({});
      setBanner(null);
      setName('');
      setEmail('');
      setPassword('');
    }
  };

  const roleSummary = useMemo(
    () =>
      role === 'internal.admin'
        ? 'Full admin access, including user management.'
        : 'Staff-level access without user management.',
    [role]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    setValidationMessages([]);
    setFieldErrors({});

    startTransition(async () => {
      const action = role === 'internal.admin' ? createAdminUser : createStaffUser;
      const result = await action({ email, name, password });

      if (!result.ok) {
        if (result.error === 'UNAUTHENTICATED') {
          setBanner('Session expired. Refresh and sign in again.');
          return;
        }

        if (result.error === 'FORBIDDEN') {
          setBanner('You are not allowed to create internal users.');
          return;
        }

        if (result.error === 'INVALID_INPUT') {
          const messages = extractValidationMessages(result.details);
          const byField = extractFieldErrors(result.details);
          setValidationMessages(messages);
          setFieldErrors(byField);
          setBanner(messages[0] ?? 'Please fix the highlighted fields.');
          return;
        }

        setBanner('Something went wrong while creating the user.');
        return;
      }

      toast.success(`${result.email} created`, {
        description: `Role: ${result.canonicalRoles.join(', ')}`,
      });

      handleOpenChange(false);
      onSuccessAction?.();
      router.refresh();
    });
  };

  return (
    <Dialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create internal user</DialogTitle>
          <DialogDescription>
            Invite an internal admin or staff member with a temporary password. They can reset it after signing in.
          </DialogDescription>
        </DialogHeader>

        {banner ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {banner}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <Shield className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Create internal account</p>
              <p className="text-xs text-muted-foreground">Admins manage users; staff have limited admin access.</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={role === 'internal.admin' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setRole('internal.admin')}
            >
              <ShieldCheck className="size-4" />
              Admin
            </Button>
            <Button
              type="button"
              variant={role === 'internal.staff' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setRole('internal.staff')}
            >
              <Shield className="size-4" />
              Staff
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                role === 'internal.admin' ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/20'
              )}
            >
              <p className="font-semibold text-foreground">Admin</p>
              <p className="text-muted-foreground">Full admin access, including user management.</p>
            </div>
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                role === 'internal.staff' ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/20'
              )}
            >
              <p className="font-semibold text-foreground">Staff</p>
              <p className="text-muted-foreground">Staff tools and event management. No user management.</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{roleSummary}</p>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              name="name"
              required
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="Jane Admin"
            />
            {fieldErrors.name?.length ? (
              <p className="text-xs text-destructive">{fieldErrors.name[0]}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              name="email"
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="user@example.com"
            />
            {fieldErrors.email?.length ? (
              <p className="text-xs text-destructive">{fieldErrors.email[0]}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="password">
              Temporary password
            </label>
            <input
              id="password"
              name="password"
              required
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="••••••••"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters. Ask the user to reset after first sign-in.
            </p>
            {fieldErrors.password?.length ? (
              <p className="text-xs text-destructive">{fieldErrors.password[0]}</p>
            ) : null}
          </div>

          {validationMessages.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {validationMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          <DialogFooter className="flex justify-end gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button className="justify-center gap-2" disabled={isPending} type="submit">
              {isPending ? <span className="animate-pulse">Creating...</span> : <UserPlus2 className="size-4" />}
              <span>{role === 'internal.admin' ? 'Create admin' : 'Create staff'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
