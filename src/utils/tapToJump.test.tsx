import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isJumpTap, notePress, revealJump } from './tapToJump';

function Card({ onJump }: { onJump: () => void }) {
  return (
    <div
      onPointerDownCapture={notePress}
      onClick={(e) => {
        if (isJumpTap(e)) onJump();
      }}
    >
      <p>Fine ordine</p>
      <input aria-label="speed" />
      <button type="button">Σ</button>
      <div role="listbox">
        <span role="option" aria-selected="false">
          H16
        </span>
      </div>
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('tapToJump', () => {
  it('jumps on a tap on the card itself', async () => {
    const onJump = vi.fn();
    render(<Card onJump={onJump} />);
    await userEvent.click(screen.getByText('Fine ordine'));
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('not on a field, a button or a list in it', async () => {
    const onJump = vi.fn();
    render(<Card onJump={onJump} />);
    await userEvent.click(screen.getByLabelText('speed'));
    await userEvent.click(screen.getByText('Σ'));
    await userEvent.click(screen.getByText('H16'));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('not on the tap that ends an edit — the next one', async () => {
    const onJump = vi.fn();
    render(<Card onJump={onJump} />);
    await userEvent.click(screen.getByLabelText('speed'));
    await userEvent.click(screen.getByText('Fine ordine'));
    expect(onJump).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Fine ordine'));
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('lands on the shown element and flashes it', () => {
    render(
      <>
        <div data-order-card="a">a</div>
        <div data-order-card="b">b</div>
      </>,
    );
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 10, 10),
    ] as unknown as DOMRectList);
    expect(revealJump('[data-order-card="b"]')).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(screen.getByText('b').classList.contains('jump-flash')).toBe(true);
    expect(revealJump('[data-order-card="x"]')).toBe(false);
  });
});
