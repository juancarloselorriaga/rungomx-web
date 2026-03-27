import { ContactForm } from '@/app/[locale]/(public)/contact/contact-form';
import { render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/app/actions/contact-submission', () => ({
  submitContactSubmission: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ContactForm inquiry type syncing', () => {
  it('synchronizes the inquiry type when server props change in place', () => {
    const { rerender } = render(
      <ContactForm
        defaultName="Runner"
        defaultEmail="runner@example.com"
        defaultInquiryType="support"
        isSignedIn
      />,
    );

    const select = screen.getByLabelText('fields.inquiryType.label') as HTMLSelectElement;
    expect(select.value).toBe('support');

    rerender(
      <ContactForm
        defaultName="Runner"
        defaultEmail="runner@example.com"
        defaultInquiryType="partnerships"
        isSignedIn
      />,
    );

    expect((screen.getByLabelText('fields.inquiryType.label') as HTMLSelectElement).value).toBe(
      'partnerships',
    );
  });
});
