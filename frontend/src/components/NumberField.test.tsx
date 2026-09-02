import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NumberField } from './NumberField';

/** Minimal parent that stores the value the way the model form does. */
function Harness({ initial, allowEmpty = true, integer = false, min, max }: { initial?: number; allowEmpty?: boolean; integer?: boolean; min?: number; max?: number }) {
  const [value, setValue] = React.useState<number | undefined>(initial);
  return (
    <div>
      <NumberField aria-label="num" value={value} onChange={setValue} allowEmpty={allowEmpty} integer={integer} min={min} max={max} placeholder="default 0.8" />
      <output data-testid="value">{value === undefined ? 'undefined' : String(value)}</output>
    </div>
  );
}

const input = () => screen.getByLabelText('num') as HTMLInputElement;
const committed = () => screen.getByTestId('value').textContent;

describe('NumberField', () => {
  it('can be cleared completely without snapping back to a default', () => {
    render(<Harness initial={0.8} />);
    expect(input().value).toBe('0.8');
    fireEvent.change(input(), { target: { value: '' } });
    expect(input().value).toBe('');
    expect(committed()).toBe('undefined');
    fireEvent.blur(input());
    expect(input().value).toBe('');
    expect(committed()).toBe('undefined');
  });

  it('accepts 0 as a real value', () => {
    render(<Harness initial={0.8} />);
    fireEvent.change(input(), { target: { value: '0' } });
    expect(committed()).toBe('0');
    fireEvent.blur(input());
    expect(input().value).toBe('0');
    expect(committed()).toBe('0');
  });

  it('lets the user type a negative decimal step by step', () => {
    render(<Harness initial={0.5} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: '-' } });
    expect(input().value).toBe('-');
    fireEvent.change(input(), { target: { value: '-0' } });
    fireEvent.change(input(), { target: { value: '-0.' } });
    expect(input().value).toBe('-0.');
    fireEvent.change(input(), { target: { value: '-0.2' } });
    expect(committed()).toBe('-0.2');
    fireEvent.blur(input());
    expect(input().value).toBe('-0.2');
  });

  it('allows deleting back past the first character and retyping', () => {
    render(<Harness initial={16384} integer />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: '1638' } });
    fireEvent.change(input(), { target: { value: '16' } });
    fireEvent.change(input(), { target: { value: '1' } });
    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.change(input(), { target: { value: '4' } });
    fireEvent.change(input(), { target: { value: '40' } });
    fireEvent.change(input(), { target: { value: '4096' } });
    expect(committed()).toBe('4096');
  });

  it('ignores letters', () => {
    render(<Harness initial={2} />);
    fireEvent.change(input(), { target: { value: '2a' } });
    expect(input().value).toBe('2');
    expect(committed()).toBe('2');
  });

  it('restores the previous value on blur when empty is not allowed', () => {
    render(<Harness initial={3} allowEmpty={false} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: '' } });
    expect(committed()).toBe('3');
    fireEvent.blur(input());
    expect(input().value).toBe('3');
  });

  it('clamps to min/max on blur', () => {
    render(<Harness initial={1} min={1} max={32} integer />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: '99' } });
    fireEvent.blur(input());
    expect(input().value).toBe('32');
    expect(committed()).toBe('32');
  });

  it('reflects external value changes while not focused', () => {
    function Outer() {
      const [v, setV] = React.useState<number | undefined>(1);
      return (
        <div>
          <NumberField aria-label="num" value={v} onChange={setV} />
          <button onClick={() => setV(42)}>set</button>
        </div>
      );
    }
    render(<Outer />);
    fireEvent.click(screen.getByText('set'));
    expect(input().value).toBe('42');
  });
});
