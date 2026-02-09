import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { IconButton } from './icon-button';

describe('IconButton', () => {
  it('renders a button with an accessible name via aria-label', () => {
    render(<IconButton label="Close">X</IconButton>);

    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('defaults type to button', () => {
    render(<IconButton label="Remove">X</IconButton>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

