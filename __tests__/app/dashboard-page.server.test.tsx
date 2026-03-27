import DashboardPage from '@/app/[locale]/(protected)/dashboard/page';
import { getAuthContext, getSession } from '@/lib/auth/server';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => {
    const messages: Record<string, string> = {
      title: 'Dashboard',
      description: 'Track your athlete activity and registrations.',
      'session.title': 'Session',
      'session.signedOut': 'Signed out',
      'myRegistrations.emptyState.action': 'Browse events',
      'myRegistrations.title': 'My registrations',
      'myRegistrations.description': 'Review your upcoming races and registration details.',
      'myRegistrations.actions.viewDetails': 'View registration details',
      'admin.staffDescription': 'Staff workspace for internal operations.',
      'admin.description': 'Admin workspace overview.',
      'admin.staffTitle': 'Staff workspace',
      'admin.title': 'Admin workspace',
    };

    return (key: string, values?: Record<string, unknown>) => {
      if (key === 'session.signedInAs') {
        return `Signed in as ${String(values?.email ?? '')}`;
      }

      return messages[key] ?? key;
    };
  }),
}));

jest.mock('@/lib/auth/server', () => ({
  getSession: jest.fn(),
  getAuthContext: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children: ReactNode }) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/surface', () => ({
  Surface: ({ children }: { children: ReactNode }) => <div data-testid="surface">{children}</div>,
  InsetSurface: ({ children }: { children: ReactNode }) => (
    <div data-testid="inset-surface">{children}</div>
  ),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;

describe('dashboard landing page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders athlete content and CTAs for external users who can access the user area', async () => {
    mockGetSession.mockResolvedValue({
      user: { email: 'athlete@rungomx.test' },
    } as Awaited<ReturnType<typeof getSession>>);
    mockGetAuthContext.mockResolvedValue({
      isInternal: false,
      permissions: {
        canAccessAdminArea: false,
        canAccessUserArea: true,
        canManageUsers: false,
        canManageEvents: false,
        canViewStaffTools: false,
        canViewOrganizersDashboard: false,
        canViewAthleteDashboard: true,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    const page = await DashboardPage({
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('Track your athlete activity and registrations.');
    expect(html).toContain('Browse events');
    expect(html).toContain('href="/events"');
    expect(html).toContain('My registrations');
    expect(html).toContain('href="/dashboard/my-registrations"');
    expect(html).toContain('Review your upcoming races and registration details.');
    expect(html).toContain('Signed in as athlete@rungomx.test');
    expect(html).not.toContain('Staff workspace');
  });

  it('renders staff-safe content and hides athlete-only CTAs for internal users without user-area access', async () => {
    mockGetSession.mockResolvedValue({
      user: { email: 'staff@rungomx.test' },
    } as Awaited<ReturnType<typeof getSession>>);
    mockGetAuthContext.mockResolvedValue({
      isInternal: true,
      permissions: {
        canAccessAdminArea: true,
        canAccessUserArea: false,
        canManageUsers: false,
        canManageEvents: true,
        canViewStaffTools: true,
        canViewOrganizersDashboard: false,
        canViewAthleteDashboard: false,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    const page = await DashboardPage({
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('Staff workspace');
    expect(html).toContain('Staff workspace for internal operations.');
    expect(html).toContain('Signed in as staff@rungomx.test');
    expect(html).not.toContain('Browse events');
    expect(html).not.toContain('View registration details');
    expect(html).not.toContain('href="/events"');
    expect(html).not.toContain('href="/dashboard/my-registrations"');
    expect(html).not.toContain('Review your upcoming races and registration details.');
  });
});
