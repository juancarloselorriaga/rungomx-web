import { render, screen } from '@testing-library/react';

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { HowItWorksBox } from '@/components/results/primitives/how-it-works-box';

describe('HowItWorksBox', () => {
  it('renders inline trust summary bullets and explainer CTA', () => {
    render(
      <HowItWorksBox
        title="Cómo funciona / How it works"
        description="Quick trust summary."
        bulletOne="Official means organizer-finalized publication."
        bulletTwo="Corrections publish as new versions."
        bulletThree="Rankings use official results only."
        ctaLabel="Read the full explainer"
      />,
    );

    expect(screen.getByText('Cómo funciona / How it works')).toBeInTheDocument();
    expect(screen.getByText(/Official means organizer-finalized publication\./)).toBeInTheDocument();
    expect(screen.getByText(/Corrections publish as new versions\./)).toBeInTheDocument();
    expect(screen.getByText(/Rankings use official results only\./)).toBeInTheDocument();
    expect(screen.getByText('Read the full explainer')).toBeInTheDocument();
  });
});
