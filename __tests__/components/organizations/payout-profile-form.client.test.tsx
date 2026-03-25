import { PayoutProfileForm } from '@/app/[locale]/(protected)/dashboard/organizations/[orgId]/payout-profile-form';
import { updatePayoutProfile } from '@/lib/organizations/payout/actions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/organizations/payout/actions', () => ({
  updatePayoutProfile: jest.fn(),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'errors.invalidRfc': 'RFC localized error',
      'errors.invalidClabe': 'CLABE localized error',
      'errors.generic': 'Generic localized error',
    };
    return map[key] ?? key;
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
  },
}));

describe('PayoutProfileForm', () => {
  const mockUpdatePayoutProfile = updatePayoutProfile as jest.MockedFunction<
    typeof updatePayoutProfile
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps server validation keys to localized field errors without English parsing', async () => {
    mockUpdatePayoutProfile.mockResolvedValueOnce({
      ok: false,
      error: 'INVALID_INPUT',
      message: 'PAYOUT_PROFILE_INVALID_RFC',
      fieldErrors: {
        rfc: ['PAYOUT_PROFILE_INVALID_RFC'],
        clabe: ['PAYOUT_PROFILE_INVALID_CLABE'],
      },
    } as never);

    render(
      <PayoutProfileForm
        organizationId="org-1"
        canEdit
        initialProfile={null}
        initialError={null}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('fields.rfc.placeholder'), {
      target: { value: 'INVALID' },
    });
    fireEvent.change(screen.getByPlaceholderText('fields.clabe.placeholder'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    await waitFor(() => {
      expect(screen.getAllByText('RFC localized error').length).toBeGreaterThan(0);
      expect(screen.getByText('CLABE localized error')).toBeInTheDocument();
    });
    expect(screen.queryByText('PAYOUT_PROFILE_INVALID_RFC')).not.toBeInTheDocument();
  });
});
