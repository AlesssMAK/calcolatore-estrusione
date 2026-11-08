// Tapping a field empties it, so a new value is typed straight away instead of
// deleting the old one first. The old value stays as the grey hint: left
// untouched, the field gets it back; typed over, the new value replaces it.
// To really empty a field: type something and delete it.
//
// A field whose grey hint is its name (`data-name-hint`: no label above it)
// keeps that hint instead — what to type there shows until typing starts —
// unless its value is wrong (aria-invalid): then the hint is that value.
//
// One listener for the whole app, so a new field gets this by itself. Opt out
// with `data-keep-value` (a field with its own handling, a password).
//
// The clearing is only on screen: the form keeps the old value until something
// is typed. It all runs in the capture phase, ahead of React's handlers — a
// blur handler (RHF's reads the input) already sees the value back.

const CLEARABLE_TYPES = new Set(['text', 'number']);
const OPT_OUT = '[data-keep-value], .react-datepicker-wrapper';

const nativeValue = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value',
)!;
// Past React's own value setter: to React the value hasn't changed, so a
// controlled input isn't told about the clearing.
const setShownValue = (el: HTMLInputElement, value: string) =>
  nativeValue.set!.call(el, value);

interface Cleared {
  el: HTMLInputElement;
  value: string;
  placeholder: string;
}

export function installClearOnFocus(): () => void {
  let cleared: Cleared | null = null;

  const end = (giveBack: boolean) => {
    if (!cleared) return;
    const { el, value, placeholder } = cleared;
    cleared = null;
    // (React may have set a new hint meanwhile: that one stays.)
    if (el.placeholder === value) el.placeholder = placeholder;
    if (giveBack && el.value === '') setShownValue(el, value);
  };

  const onFocusIn = (e: FocusEvent) => {
    end(true);
    const el = e.target;
    if (
      !(el instanceof HTMLInputElement) ||
      !CLEARABLE_TYPES.has(el.type) ||
      el.readOnly ||
      el.value === '' ||
      el.closest(OPT_OUT)
    ) {
      return;
    }
    cleared = { el, value: el.value, placeholder: el.placeholder };
    if (
      !el.hasAttribute('data-name-hint') ||
      el.getAttribute('aria-invalid') === 'true'
    ) {
      el.placeholder = el.value;
    }
    setShownValue(el, '');
  };

  const onFocusOut = () => end(true);

  // Typing takes over: from here on the field is what the user made of it.
  const onInput = (e: Event) => {
    if (e.target === cleared?.el) end(false);
  };

  // Enter confirms what's there, and the arrows step from it — not from empty.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== cleared?.el) return;
    const steps =
      cleared.el.type === 'number' &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown');
    if (e.key === 'Enter' || steps) end(true);
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    end(true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}
