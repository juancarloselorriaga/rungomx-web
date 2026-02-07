import { ResultsDensitySwitch } from '@/components/results/primitives/results-density-switch';
import { fireEvent, render, screen } from '@testing-library/react';

describe('ResultsDensitySwitch', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists selected density mode in localStorage', () => {
    render(
      <ResultsDensitySwitch
        storageKey="results.density.test"
        labels={{
          label: 'Density',
          compact: 'Compact',
          full: 'Full',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /full/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /compact/i }));

    expect(window.localStorage.getItem('results.density.test')).toBe('compact');
    expect(screen.getByRole('button', { name: /compact/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores the stored density mode on subsequent renders', () => {
    window.localStorage.setItem('results.density.test', 'compact');

    render(
      <ResultsDensitySwitch
        storageKey="results.density.test"
        labels={{
          label: 'Density',
          compact: 'Compact',
          full: 'Full',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /compact/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /full/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
