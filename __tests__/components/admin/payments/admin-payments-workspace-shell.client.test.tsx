/** @jest-environment jsdom */

import {
  AdminPaymentsWorkspaceShell,
  type AdminPaymentsWorkspaceId,
} from '@/components/admin/payments/admin-payments-workspace-shell';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/payments',
  useSearchParams: () => new URLSearchParams('range=30d'),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: {
    children: ReactNode;
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));

describe('AdminPaymentsWorkspaceShell', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('keeps one active workspace summary and routes through compact navigation buttons', () => {
    render(
      <AdminPaymentsWorkspaceShell
        title="Payments"
        description="Use workspaces to move between volume, economics, risk, operations, and investigation."
        workspaceLabel="Workspaces"
        activeItemId={'economics' satisfies AdminPaymentsWorkspaceId}
        toolbar={<div data-testid="range-toolbar">range toolbar</div>}
        items={[
          {
            id: 'volume',
            label: 'Volume',
            description: 'Captured payment throughput',
          },
          {
            id: 'economics',
            label: 'Economics',
            description: 'Platform fee recognition and MXN conversion',
          },
          {
            id: 'risk',
            label: 'Risk',
            description: 'Exposure, debt, and disputes',
          },
        ]}
      />,
    );

    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    expect(screen.getByTestId('range-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('admin-payments-workspace-tablist')).toHaveAttribute('role', 'tablist');
    expect(screen.getByTestId('admin-payments-workspace-active-summary')).toBeInTheDocument();
    expect(screen.getByText('Platform fee recognition and MXN conversion')).toBeInTheDocument();
    expect(screen.queryByText('Captured payment throughput')).not.toBeInTheDocument();
    expect(screen.queryByText('Exposure, debt, and disputes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Risk' }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('/admin/payments?');
    expect(replace.mock.calls[0][0]).toContain('range=30d');
    expect(replace.mock.calls[0][0]).toContain('workspace=risk');
  });
});
