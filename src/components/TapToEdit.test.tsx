import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import TapToEdit from './TapToEdit';
import { TextModeContext } from '../contexts/textMode';

function Form({ value }: { value?: number }) {
  const methods = useForm<{ speed?: number }>({ defaultValues: { speed: value } });
  return (
    <FormProvider {...methods}>
      <TextModeContext.Provider value>
        <TapToEdit
          names={['speed']}
          title="speed"
          render={([v], fmt) => <span>⚡ {fmt(v)}</span>}
        >
          <input
            aria-label="speed field"
            type="number"
            {...methods.register('speed', {
              setValueAs: (v) => (v === '' ? undefined : Number(v)),
            })}
          />
        </TapToEdit>
        <button type="button">elsewhere</button>
      </TextModeContext.Provider>
    </FormProvider>
  );
}

describe('a tracked calc\'s field shown as a field because it was empty', () => {
  it('stays a field while typed in (the first digit used to turn it back to text)', async () => {
    const user = userEvent.setup();
    render(<Form />);
    const field = screen.getByLabelText<HTMLInputElement>('speed field');
    await user.click(field);
    await user.keyboard('3.5');
    expect(screen.getByLabelText<HTMLInputElement>('speed field')).toHaveFocus();
    expect(screen.getByLabelText<HTMLInputElement>('speed field').value).toBe('3.5');
    // Left: text again.
    await user.click(screen.getByText('elsewhere'));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByLabelText('speed field')).toBeNull();
    expect(screen.getByRole('button', { name: 'speed' })).toHaveTextContent(/⚡ 3[.,]5/);
  });
});
