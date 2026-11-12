import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installClearOnFocus } from './clearOnFocus';

let uninstall: () => void;
beforeEach(() => {
  uninstall = installClearOnFocus();
});
afterEach(() => uninstall());

const field = (name: string) =>
  screen.getByLabelText<HTMLInputElement>(name);

function RhfForm({ onValues }: { onValues: (v: { qty?: number }) => void }) {
  const { register, getValues } = useForm<{ qty?: number }>({
    defaultValues: { qty: 0 },
    mode: 'onBlur',
  });
  return (
    <>
      <input
        aria-label="qty"
        type="number"
        {...register('qty', {
          setValueAs: (v) => (v === '' ? undefined : Number(v)),
        })}
      />
      <button type="button" onClick={() => onValues(getValues())}>
        read
      </button>
    </>
  );
}

function Controlled({ initial = '0' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <input
        aria-label="ctl"
        type="number"
        placeholder="hint"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <output aria-label="state">{text}</output>
    </>
  );
}

describe('clearOnFocus', () => {
  it('empties a field holding 0 and shows the 0 as the hint', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    expect(field('ctl').value).toBe('');
    expect(field('ctl').placeholder).toBe('0');
    expect(screen.getByLabelText('state').textContent).toBe('0');
  });

  it('keeps any other value as it is', async () => {
    render(<Controlled initial="12" />);
    await userEvent.click(field('ctl'));
    expect(field('ctl').value).toBe('12');
    expect(field('ctl').placeholder).toBe('hint');
    await userEvent.keyboard('5');
    await userEvent.tab();
    expect(screen.getByLabelText('state').textContent).toBe('125');
  });

  it('takes 0.0 / 0,0 for a 0 too', async () => {
    render(
      <>
        <input aria-label="dot" type="number" defaultValue="0.0" />
        <input aria-label="comma" defaultValue="0,0" />
        <input aria-label="tenth" type="number" defaultValue="0.5" />
      </>,
    );
    await userEvent.click(field('dot'));
    expect(field('dot').value).toBe('');
    await userEvent.click(field('comma'));
    expect(field('comma').value).toBe('');
    await userEvent.click(field('tenth'));
    expect(field('tenth').value).toBe('0.5');
  });

  it('gives the 0 and the hint back when nothing was typed', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.tab();
    expect(field('ctl').value).toBe('0');
    expect(field('ctl').placeholder).toBe('hint');
  });

  it('replaces the 0 with what is typed', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.keyboard('7');
    await userEvent.tab();
    expect(field('ctl').value).toBe('7');
    expect(screen.getByLabelText('state').textContent).toBe('7');
  });

  it('stays empty when something was typed and deleted', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.keyboard('7{Backspace}');
    await userEvent.tab();
    expect(field('ctl').value).toBe('');
    expect(field('ctl').placeholder).toBe('hint');
    expect(screen.getByLabelText('state').textContent).toBe('');
  });

  it('gives the 0 back on Enter and on the arrow keys', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.keyboard('{Enter}');
    expect(field('ctl').value).toBe('0');
    await userEvent.tab();
    await userEvent.click(field('ctl'));
    fireEvent.keyDown(field('ctl'), { key: 'ArrowUp' });
    expect(field('ctl').value).toBe('0');
  });

  it('leaves a form value alone until something is typed', async () => {
    let values: { qty?: number } = {};
    render(<RhfForm onValues={(v) => (values = v)} />);
    await userEvent.click(field('qty'));
    expect(field('qty').value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'read' }));
    expect(values.qty).toBe(0);

    // RHF reads the input on blur: it must find the value already back.
    await userEvent.tab();
    expect(field('qty').value).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'read' }));
    expect(values.qty).toBe(0);
  });

  it('puts what is typed in the form', async () => {
    let values: { qty?: number } = {};
    render(<RhfForm onValues={(v) => (values = v)} />);
    await userEvent.click(field('qty'));
    await userEvent.keyboard('5');
    await userEvent.tab();
    fireEvent.click(screen.getByRole('button', { name: 'read' }));
    expect(values.qty).toBe(5);
  });

  it('skips what must not be emptied', async () => {
    render(
      <>
        <input aria-label="ro" defaultValue="0" readOnly />
        <input aria-label="keep" defaultValue="0" data-keep-value />
        <input aria-label="pw" type="password" defaultValue="0" />
        <div className="react-datepicker-wrapper">
          <input aria-label="pick" defaultValue="0" />
        </div>
      </>,
    );
    for (const name of ['ro', 'keep', 'pw', 'pick']) {
      await userEvent.click(field(name));
      expect(field(name).value).toBe('0');
    }
  });

  it('shows the name of a field named by its hint, not the 0', async () => {
    render(
      <input
        aria-label="len"
        type="number"
        placeholder="Lunghezza (mm)"
        defaultValue="0"
        data-name-hint
      />,
    );
    await userEvent.click(field('len'));
    expect(field('len').value).toBe('');
    expect(field('len').placeholder).toBe('Lunghezza (mm)');
    await userEvent.tab();
    expect(field('len').value).toBe('0');
    expect(field('len').placeholder).toBe('Lunghezza (mm)');
  });

  it('shows a wrong 0 as the hint, even of a field named by its hint', async () => {
    render(
      <input
        aria-label="speed"
        type="number"
        placeholder="Velocità"
        defaultValue="0"
        data-name-hint
        aria-invalid
      />,
    );
    await userEvent.click(field('speed'));
    expect(field('speed').value).toBe('');
    expect(field('speed').placeholder).toBe('0');
    await userEvent.tab();
    expect(field('speed').value).toBe('0');
    expect(field('speed').placeholder).toBe('Velocità');
  });

  it('keeps the hint of an empty field', async () => {
    render(<input aria-label="empty" placeholder="eredita: 1,8" />);
    await userEvent.click(field('empty'));
    expect(field('empty').placeholder).toBe('eredita: 1,8');
  });

  it('stops with the uninstall, giving back what is cleared', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    act(() => uninstall());
    expect(field('ctl').value).toBe('0');
    await userEvent.tab();
    await userEvent.click(field('ctl'));
    expect(field('ctl').value).toBe('0');
    uninstall = installClearOnFocus();
  });
});
