import { Shield } from 'lucide-react';
import { ReactNode } from 'react';

type UsersEmptyStateProps = {
  cta: ReactNode;
};

export function UsersEmptyState({ cta }: UsersEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Shield className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">No internal users yet</h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Create the first admin or staff account to manage internal access and permissions.
        </p>
      </div>
      {cta}
    </div>
  );
}
