import { Link } from '@/i18n/navigation';
import { ArrowLeft } from 'lucide-react';

type ResultsSecondaryBackLinkProps = {
  eventId: string;
  label: string;
};

export function ResultsSecondaryBackLink({ eventId, label }: ResultsSecondaryBackLinkProps) {
  return (
    <Link
      href={{
        pathname: '/dashboard/events/[eventId]/results',
        params: { eventId },
      }}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
