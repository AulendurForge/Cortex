import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../UI';

describe('Button', () => {
  it('does not submit a form unless type="submit" is given', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Cancel</Button>
        <Button type="submit">Save</Button>
      </form>,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Save'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('is disabled and busy while loading', () => {
    render(<Button loading>Working</Button>);
    const b = screen.getByRole('button');
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });
});
