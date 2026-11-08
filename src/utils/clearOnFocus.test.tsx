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

function Controlled() {
  const [text, setText] = useState('12');
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
  it('empties the field and shows the old value as the hint', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    expect(field('ctl').value).toBe('');
    expect(field('ctl').placeholder).toBe('12');
    expect(screen.getByLabelText('state').textContent).toBe('12');
  });

  it('gives the value and the hint back when nothing was typed', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.tab();
    expect(field('ctl').value).toBe('12');
    expect(field('ctl').placeholder).toBe('hint');
  });

  it('replaces the value with what is typed', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.keyboard('7');
    await userEvent.tab();
    expect(field('ctl').value).toBe('7');
    expect(screen.getByLabelText('state').textContent).toBe('7');
  });

  it('keeps a value retyped identical to the old one', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.keyboard('12');
    await userEvent.tab();
    expect(field('ctl').value).toBe('12');
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

  it('gives the value back on Enter and on the arrow keys', async () => {
    render(<Controlled />);
    await userEvent.click(field('ctl'));
    await userEvent.keyboard('{Enter}');
    expect(field('ctl').value).toBe('12');
    await userEvent.tab();
    await userEvent.click(field('ctl'));
    fireEvent.keyDown(field('ctl'), { key: 'ArrowUp' });
    expect(field('ctl').value).toBe('12');
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
        <input aria-label="ro" defaultValue="a" readOnly />
        <input aria-label="keep" defaultValue="b" data-keep-value />
        <input aria-label="pw" type="password" defaultValue="c" />
        <input aria-label="mail" type="email" defaultValue="d@e.it" />
        <input aria-label="day" type="date" defaultValue="2026-11-07" />
        <div className="react-datepicker-wrapper">
          <input aria-label="pick" defaultValue="07/11/2026" />
        </div>
      </>,
    );
    for (const [name, value] of [
      ['ro', 'a'],
      ['keep', 'b'],
      ['pw', 'c'],
      ['mail', 'd@e.it'],
      ['day', '2026-11-07'],
      ['pick', '07/11/2026'],
    ]) {
      await userEvent.click(field(name));
      expect(field(name).value).toBe(value);
    }
  });

  it('shows the name of a field named by its hint, not the old value', async () => {
    render(
      <input
        aria-label="len"
        type="number"
        placeholder="Lunghezza (mm)"
        defaultValue="6000"
        data-name-hint
      />,
    );
    await userEvent.click(field('len'));
    expect(field('len').value).toBe('');
    expect(field('len').placeholder).toBe('Lunghezza (mm)');
    await userEvent.tab();
    expect(field('len').value).toBe('6000');
    expect(field('len').placeholder).toBe('Lunghezza (mm)');
  });

  it('shows a wrong value as the hint, even of a field named by its hint', async () => {
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
    expect(field('ctl').value).toBe('12');
    await userEvent.tab();
    await userEvent.click(field('ctl'));
    expect(field('ctl').value).toBe('12');
    uninstall = installClearOnFocus();
  });
});
