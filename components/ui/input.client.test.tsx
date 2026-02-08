import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Input } from './input';

describe('Input Component', () => {
  it('renders an input', () => {
    render(<Input aria-label="Email" />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('enforces >=44px tap targets on mobile via size tokens', () => {
    render(<Input aria-label="Tap target" />);
    const input = screen.getByLabelText(/tap target/i);
    expect(input).toHaveClass('min-h-11');
    expect(input).toHaveClass('sm:min-h-10');
  });
});

