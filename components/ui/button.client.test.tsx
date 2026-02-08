import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button Component', () => {
  it('renders a button with text', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('applies default variant and size classes', () => {
    render(<Button>Default Button</Button>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('inline-flex');
    expect(button).toHaveAttribute('data-slot', 'button');
  });

  it('can be disabled', () => {
    render(<Button disabled>Disabled Button</Button>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('enforces >=44px tap targets on mobile via size tokens', () => {
    render(<Button>Tap target</Button>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('min-h-11');
    expect(button).toHaveClass('sm:min-h-9');
  });

  it('enforces >=44px tap targets for icon buttons on mobile', () => {
    render(<Button size="icon">X</Button>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('min-h-11');
    expect(button).toHaveClass('min-w-11');
  });
});
