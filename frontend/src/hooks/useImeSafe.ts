import { useRef } from 'react';
import type { ChangeEvent, CompositionEvent } from 'react';

type AnyTextEl = HTMLInputElement | HTMLTextAreaElement;

/**
 * Returns props that make a controlled `<input>` / `<textarea>` survive
 * Chinese / Japanese / Korean IME composition.
 *
 * React 19's controlled-input model re-asserts `value` from props on every
 * parent re-render. When a re-render happens mid-IME-composition, the IME
 * gets confused and commits the raw pinyin/romaji as literal Latin
 * characters instead of the intended CJK character. Symptom: typing
 * "weishenme" outputs "ww'sw's'm为什么".
 *
 * The fix every CJK React app eventually adopts: suppress `onChange` while
 * `compositionstart` ... `compositionend` is open, then commit the final
 * value once on `compositionend`. While composing, the DOM's own value
 * tracks the IME pop-up — we just stop fighting it.
 *
 * Usage:
 *   const inputIme = useImeSafe(setInput);
 *   <textarea value={input} {...inputIme} />
 *
 * IMPORTANT: do NOT spread these AFTER your own `onChange` / composition
 * handlers — the spread would clobber them. Spread first, override after
 * if you need to.
 */
export function useImeSafe(setValue: (v: string) => void) {
  const composing = useRef(false);

  return {
    onChange: (e: ChangeEvent<AnyTextEl>) => {
      if (composing.current) return;
      setValue(e.target.value);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: CompositionEvent<AnyTextEl>) => {
      composing.current = false;
      // Commit the post-composition value. Some browsers fire `change`
      // before `compositionend` (so the value is already up-to-date),
      // others fire it after — committing here covers both.
      setValue((e.target as AnyTextEl).value);
    },
  };
}
