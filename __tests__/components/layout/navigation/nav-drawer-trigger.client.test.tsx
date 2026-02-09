import { NavDrawerProvider } from '@/components/layout/navigation/nav-drawer-context';
import { NavDrawerTrigger } from '@/components/layout/navigation/nav-drawer-trigger';
import { render, screen } from '@testing-library/react';

jest.mock('next/dynamic', () => () => () => null);

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('NavDrawerTrigger', () => {
  it('exposes an accessible name for the icon-only trigger', () => {
    render(
      <NavDrawerProvider>
        <NavDrawerTrigger items={[]} />
      </NavDrawerProvider>,
    );

    expect(screen.getByRole('button', { name: 'expandMenu' })).toBeInTheDocument();
  });
});

