import { ContactForm } from '@/app/[locale]/(public)/contact/contact-form';
import { render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => {
    const translate = ((key: string) => key) as ((key: string) => string) & {
      raw: (key: string) => unknown;
    };

    translate.raw = (key: string) => {
      if (key === 'fields') {
        return {
          inquiryType: {
            label: 'fields.inquiryType.label',
            options: {
              support: 'fields.inquiryType.options.support',
              partnerships: 'fields.inquiryType.options.partnerships',
              accountOrEvent: 'fields.inquiryType.options.accountOrEvent',
            },
          },
        };
      }

      return key;
    };

    return translate;
  },
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
