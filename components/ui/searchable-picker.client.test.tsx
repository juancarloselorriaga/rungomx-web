import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SearchablePicker } from './searchable-picker';

describe('SearchablePicker Component', () => {
  it('uses the mobile control height token for its input', () => {
    render(
      <SearchablePicker
        value=""
        placeholder="Search"
        onChangeAction={() => {}}
        loadOptionsAction={async () => []}
      />,
    );

    const input = screen.getByPlaceholderText('Search');
    expect(input).toHaveClass('min-h-11');
    expect(input).toHaveClass('sm:min-h-10');
  });
});
