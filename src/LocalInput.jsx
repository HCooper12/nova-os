import { useState, useRef, useEffect } from 'react';

// LOCAL ECHO — the text lives HERE while you type, so a keystroke re-renders
// one input instead of the whole app. Measured before writing this (23 Aug,
// real-size data): a keystroke in the Inbox capture box cost 37ms median /
// 98ms p90 / 311ms worst, because App's render reconciles ~300 inbox rows on
// every character. Voice and Train were 21-25ms. Multiply by 3-4x for the
// phone. That is the lag.
//
// THE RACE THIS DESIGN KILLS. The obvious version — push to App state on
// Enter, then call submit — loses characters: setState is async, so a submit
// handler that reads app.state gets the value from BEFORE the last keystroke.
// A lost capture is a lost thought, so this component never relies on
// winning that race:
//
//   onSubmit ALWAYS receives the current value as its argument.
//
// The handler uses what it is given and never reads state for the text. The
// debounced push to App exists only for things that watch the value live (an
// enable/disable check, a draft autosave) — it is never the submit path.
//
// External resets: when the `value` prop changes to something this component
// did not itself push (cleared after send, filled by dictation, pre-filled by
// a scan), local state adopts it. Without that rule, "clear on send" would
// leave stale text sitting in the box.
export function LocalInput({
  value = '',
  onChange,          // optional: debounced push of the live value to App state
  onSubmit,          // called with (currentValue) when submitWhen matches
  // Which keypress submits. Default is plain Enter (Shift+Enter still makes a
  // newline in a multiline box). The capture composer uses Cmd/Ctrl+Enter, so
  // this is a predicate rather than a boolean — the trigger differs per
  // surface and hardcoding one of them would silently break the other.
  submitWhen,
  submitOnEnter = true,
  multiline = false,
  debounceMs = 150,
  as,                // override the element (defaults to input / textarea)
  ...rest
}) {
  const [local, setLocal] = useState(value);
  const lastPushed = useRef(value);
  const timer = useRef(null);

  // adopt an external change (see above) — never fights the user's typing,
  // because anything WE pushed is recorded in lastPushed and skipped here
  useEffect(() => {
    if (value !== lastPushed.current) {
      lastPushed.current = value;
      setLocal(value ?? '');
    }
  }, [value]);

  // flush any pending debounce on unmount, so navigating away mid-type
  // doesn't drop what was typed
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const push = (v) => {
    lastPushed.current = v;
    onChange?.(v);
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    if (!onChange) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push(v), debounceMs);
  };

  const defaultSubmitWhen = (e) =>
    submitOnEnter && e.key === 'Enter' && !(multiline && e.shiftKey);

  const handleKeyDown = (e) => {
    rest.onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const matches = submitWhen ? submitWhen(e) : defaultSubmitWhen(e);
    if (!matches) return;
    e.preventDefault();
    clearTimeout(timer.current);
    push(local);          // keep App state consistent for anything watching
    onSubmit?.(local);    // ...but the handler is HANDED the value regardless
  };

  const handleBlur = (e) => {
    rest.onBlur?.(e);
    clearTimeout(timer.current);
    if (local !== lastPushed.current) push(local);
  };

  const Tag = as || (multiline ? 'textarea' : 'input');
  const { onKeyDown: _k, onBlur: _b, ...pass } = rest;
  return <Tag {...pass} value={local} onChange={handleChange} onKeyDown={handleKeyDown} onBlur={handleBlur} />;
}
