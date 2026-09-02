import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from '../Modal';

function Harness() {
  const [tick, setTick] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setTick((t) => t + 1)}>tick {tick}</button>
      <Modal open onClose={() => { /* inline lambda: new identity on every render */ }} title="Edit">
        <input aria-label="first" />
        <input aria-label="second" />
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  it('keeps focus in the field being edited when the parent re-renders', async () => {
    render(<Harness />);
    const second = screen.getByLabelText('second');
    act(() => { second.focus(); });
    expect(document.activeElement).toBe(second);
    act(() => { screen.getByText(/tick/).click(); });
    // a re-render with a new onClose identity must not re-run the focus trap
    expect(document.activeElement).toBe(second);
    expect(document.body.style.overflow).toBe('hidden');
  });
});
