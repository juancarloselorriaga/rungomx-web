import { fireEvent, render, screen } from '@testing-library/react';

import { RegistrationTicketStatus } from '@/components/dashboard/registration-ticket-status';
import type { MyRegistrationStatusKey } from '@/lib/events/my-registrations';

jest.mock('@/components/common/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components/dashboard/print-button', () => ({
  PrintButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('@/components/dashboard/demo-pay-button', () => ({
  DemoPayButton: ({ onSuccess }: { onSuccess?: (status: string) => void }) => (
    <button type="button" onClick={() => onSuccess?.('confirmed')}>
      actions.payNowDemo
    </button>
  ),
}));

const statusLabels: Record<MyRegistrationStatusKey, string> = {
  confirmed: 'Confirmed',
  payment_pending: 'Payment pending',
  cancelled: 'Cancelled',
  started: 'Started',
  submitted: 'Submitted',
  expired: 'Expired',
};

function renderSubject({
  initialStatus = 'payment_pending',
  demoPaymentsEnabled = true,
}: {
  initialStatus?: MyRegistrationStatusKey;
  demoPaymentsEnabled?: boolean;
} = {}) {
  return render(
    <RegistrationTicketStatus
      registrationId="reg-123"
      initialStatus={initialStatus}
      statusLabels={statusLabels}
      ticketTitle="Ticket"
      ticketCodeLabel="Ticket code"
      ticketCode="RGM-123"
      supportIdLabel="Support ID"
      ticketNote="Bring this code on race day."
      paymentPendingNote="Finish your payment to confirm your ticket."
      demoPayNote="Demo payments are enabled in this environment."
      demoPaymentsEnabled={demoPaymentsEnabled}
      printLabel="Print"
      payNowLabel="Pay now"
    />,
  );
}

describe('RegistrationTicketStatus', () => {
  it('renders the payment-pending CTA and notes when demo payments are enabled', () => {
    renderSubject();

    expect(screen.getByText('Payment pending')).toBeInTheDocument();
    expect(screen.getByText('Finish your payment to confirm your ticket.')).toBeInTheDocument();
    expect(screen.getByText('Demo payments are enabled in this environment.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'actions.payNowDemo' })).toBeInTheDocument();
  });

  it('renders a disabled pay button when payment is pending but demo payments are unavailable', () => {
    renderSubject({ demoPaymentsEnabled: false });

    expect(screen.getByText('Payment pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeDisabled();
    expect(
      screen.queryByText('Demo payments are enabled in this environment.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'actions.payNowDemo' })).not.toBeInTheDocument();
  });

  it('updates the local status to confirmed after a successful demo payment', () => {
    renderSubject();

    fireEvent.click(screen.getByRole('button', { name: 'actions.payNowDemo' }));

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByText('Payment pending')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Finish your payment to confirm your ticket.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'actions.payNowDemo' })).not.toBeInTheDocument();
  });
});
