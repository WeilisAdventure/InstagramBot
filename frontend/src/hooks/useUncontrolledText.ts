import { useEffect, useRef } from 'react';

/**
 * Binds a React string state to a textarea / input as an **uncontrolled**
 * element — sidestepping the React 19 + Chinese IME bug where controlled
 * `value=` re-assertion mid-composition makes the IME commit raw pinyin
 * letters (e.g. typing "weishenme" producing "ww'sw's'm为什么").
 *
 * How it works:
 *   • The DOM element is given `defaultValue` only — React never touches
 *     `input.value` during reconciliation, so the IME's in-flight state
 *     is never disturbed.
 *   • User typing fires `onInput`, which pushes the latest DOM value back
 *     into React state. State stays in sync for buttons, length checks,
 *     send actions, etc.
 *   • When React state changes **programmatically** (AI generates a draft,
 *     switching conversations restores a saved draft, a "clear" button
 *     wipes the field) the effect below writes the new value into the DOM.
 *     The `value !== ref.current.value` guard means the effect is a no-op
 *     for the typical typing path (state was just updated FROM the DOM, so
 *     they're already equal).
 *
 * Caveat: while the user is mid-IME-composition, the DOM value contains
 * the in-flight pinyin string. If an external state update (AI reply,
 * etc.) hits at that exact moment we'd overwrite the user's typing. To
 * avoid that we suppress sync while composition is active. That's the
 * one place we need to listen to composition events — for safety, not
 * correctness of normal typing.
 */
export function useUncontrolledText<T extends HTMLTextAreaElement | HTMLInputElement>(
  value: string,
  onChange: (next: string) => void,
) {
  const ref = useRef<T | null>(null);
  const composingRef = useRef(false);

  // Sync React state -> DOM, but only when they actually differ. Typing
  // updates state to whatever the DOM already has, so this is usually a
  // no-op. It fires for genuine programmatic writes (AI draft drop,
  // sessionStorage restore on conv switch, clear button).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (composingRef.current) return; // don't clobber an in-flight IME
    if (el.value !== value) el.value = value;
  }, [value]);

  return {
    ref,
    defaultValue: value,
    onInput: (e: React.FormEvent<T>) => {
      onChange((e.currentTarget as T).value);
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (e: React.CompositionEvent<T>) => {
      composingRef.current = false;
      // Composition end may not have fired an onInput yet in all browsers
      // — push the final value explicitly so state lands on the committed
      // CJK character, not the last pinyin draft.
      onChange((e.currentTarget as T).value);
    },
  };
}
