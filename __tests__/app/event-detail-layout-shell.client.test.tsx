import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';

import { EventDetailLayoutShell } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/event-detail-layout-shell';

let mockSearchParams = new URLSearchParams('');

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/layout/navigation/sliding-nav-context', () => ({
  useSlidingNavOptional: () => ({ setSidebarHidden: jest.fn() }),
}));

jest.mock('@/components/layout/navigation/submenu-context-provider', () => ({
  SubmenuContextProvider: ({
    children,
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="submenu-context-provider">{children}</div>
  ),
}));

function renderShell(overrides?: Partial<ComponentProps<typeof EventDetailLayoutShell>>) {
  return render(
    <EventDetailLayoutShell
      title="TrailMX 2026"
      subtitle="TrailMX"
      metaBadge={{ label: 'Draft', tone: 'draft' }}
      params={{ eventId: 'evt-1' }}
      basePath="/dashboard/events/evt-1"
      footerLink={null}
      {...overrides}
    >
      <div>event-children</div>
    </EventDetailLayoutShell>,
  );
}

describe('EventDetailLayoutShell', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams('');
  });

  it('renders the submenu provider and mobile event header outside wizard mode', () => {
    renderShell();

    expect(screen.getByTestId('submenu-context-provider')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TrailMX 2026' })).toBeInTheDocument();
    expect(screen.getByText('TrailMX')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('event-children')).toBeInTheDocument();
  });

  it('suppresses the submenu provider and duplicate mobile header in wizard mode', () => {
    mockSearchParams = new URLSearchParams('wizard=1&step=basics');

    renderShell();

    expect(screen.queryByTestId('submenu-context-provider')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'TrailMX 2026' })).not.toBeInTheDocument();
    expect(screen.getByText('event-children')).toBeInTheDocument();
  });
});
