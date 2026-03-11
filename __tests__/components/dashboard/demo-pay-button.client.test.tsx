import { DemoPayButton } from '@/components/dashboard/demo-pay-button';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const demoPayRegistrationMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();
const routerRefreshMock = jest.fn();

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: () => routerRefreshMock(),
  }),
}));

jest.mock('@/lib/events/payments/actions', () => ({
  demoPayRegistration: (...args: unknown[]) => demoPayRegistrationMock(...args),
}));

jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

describe('DemoPayButton', () => {
  beforeEach(() => {
    demoPayRegistrationMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('reloads the page after a successful demo payment', async () => {
    demoPayRegistrationMock.mockResolvedValue({
      ok: true,
      data: { registrationId: 'reg-1', status: 'confirmed' },
    });

    render(<DemoPayButton registrationId="reg-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.payNowDemo' }));

    await waitFor(() => {
      expect(demoPayRegistrationMock).toHaveBeenCalledWith({ registrationId: 'reg-1' });
    });

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('detail.demoPaySuccess');
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('passes the confirmed status to the success callback before reloading', async () => {
    const onSuccess = jest.fn();
    demoPayRegistrationMock.mockResolvedValue({
      ok: true,
      data: { registrationId: 'reg-3', status: 'confirmed' },
    });

    render(<DemoPayButton registrationId="reg-3" onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.payNowDemo' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('confirmed');
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error toast without reloading when the action fails', async () => {
    demoPayRegistrationMock.mockResolvedValue({
      ok: false,
      error: 'REGISTRATION_NOT_FOUND',
    });

    render(<DemoPayButton registrationId="reg-2" />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.payNowDemo' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('detail.demoPayError', {
        description: 'REGISTRATION_NOT_FOUND',
      });
    });

    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
