import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorAttrs, installErrorBubble } from './errorBubble';

let uninstall: () => void;
beforeEach(() => {
  // jsdom lays nothing out: a field measures 0×0, as a hidden one would.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(20, 200, 120, 32)
  );
  uninstall = installErrorBubble();
});
afterEach(() => {
  uninstall();
  vi.restoreAllMocks();
});

const bubble = () => document.getElementById('field-error-bubble')!;
const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
// The field's verdict reaches the bubble through a MutationObserver.
const settle = () => act(() => new Promise(r => setTimeout(r, 0)));

/** A field whose error follows what's typed (as RHF re-validating). */
function Checked() {
  const [value, setValue] = useState('');
  const error =
    value === ''
      ? 'Inserisci la velocità'
      : Number(value) > 0
        ? undefined
        : 'Deve essere maggiore di 0';
  return (
    <input
      aria-label="speed"
      value={value}
      onChange={e => setValue(e.target.value)}
      {...errorAttrs(error)}
    />
  );
}

describe('errorBubble', () => {
  it('has no attributes without an error', () => {
    expect(errorAttrs(undefined)).toEqual({});
    expect(errorAttrs('x')).toEqual({
      'aria-invalid': true,
      'data-error': 'x',
    });
  });

  it("shows a field's error while it has the focus", async () => {
    render(
      <>
        <input aria-label="bad" {...errorAttrs('Campo obbligatorio')} />
        <input aria-label="ok" />
      </>
    );
    expect(bubble().hidden).toBe(true);
    await userEvent.click(field('bad'));
    expect(bubble().hidden).toBe(false);
    expect(bubble().textContent).toBe('Campo obbligatorio');
    expect(field('bad').getAttribute('aria-describedby')).toBe(
      'field-error-bubble'
    );
    await userEvent.click(field('ok'));
    expect(bubble().hidden).toBe(true);
    expect(field('bad').hasAttribute('aria-describedby')).toBe(false);
  });

  it('hides on typing, and follows a new verdict', async () => {
    render(<Checked />);
    await userEvent.click(field('speed'));
    expect(bubble().textContent).toBe('Inserisci la velocità');
    await userEvent.keyboard('0');
    await settle();
    expect(bubble().hidden).toBe(false);
    expect(bubble().textContent).toBe('Deve essere maggiore di 0');
    await userEvent.keyboard('5');
    await settle();
    // "05" is right: the error is gone, and its bubble with it.
    expect(bubble().hidden).toBe(true);
  });

  it('shows an error that comes while the field has the focus', async () => {
    function Later() {
      const [error, setError] = useState<string>();
      return (
        <>
          <input aria-label="f" {...errorAttrs(error)} />
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => setError('Campo obbligatorio')}
          >
            check
          </button>
        </>
      );
    }
    render(<Later />);
    await userEvent.click(field('f'));
    expect(bubble().hidden).toBe(true);
    await userEvent.click(screen.getByText('check'));
    await settle();
    expect(bubble().hidden).toBe(false);
    expect(bubble().textContent).toBe('Campo obbligatorio');
  });

  it("reads the message from a wrapper (a library's input)", async () => {
    render(
      <div data-error="Imposta data e ora di inizio">
        <input aria-label="date" aria-invalid="true" />
      </div>
    );
    await userEvent.click(field('date'));
    expect(bubble().textContent).toBe('Imposta data e ora di inizio');
  });

  it('goes with the uninstall', () => {
    uninstall();
    expect(document.getElementById('field-error-bubble')).toBeNull();
    uninstall = installErrorBubble();
  });
});
