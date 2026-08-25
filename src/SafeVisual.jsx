import { Component } from 'react';
import { css } from './css.js';

const M = 'var(--nv-font-mono)';

// A VISUAL MUST NEVER TAKE DOWN THE SCREEN.
//
// There was no error boundary anywhere in this app, and every panel renderer
// maps over server-supplied arrays. One missing field — a panel shape that
// changed, a card built from a half-loaded vault — throws during render,
// React unmounts the whole tree, and what is left is the background with
// nothing on it. That is exactly what he saw on his phone: "a blank Nova
// screen that looks like the blurred background", with no error and no way
// back except restarting the app.
//
// The rule this enforces: the words are the answer and the visual is
// support. A visual that cannot draw itself degrades to a small honest note
// and LEAVES THE ANSWER STANDING. It never blanks the screen, and it never
// silently renders nothing — a panel that vanished without explanation is
// how this went unnoticed for so long.
export class SafeVisual extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: null };
  }

  static getDerivedStateFromError(err) {
    return { failed: err?.message || 'it could not be drawn' };
  }

  componentDidCatch(err) {
    // console only — a broken panel is a bug to find later, never an
    // interruption now. Prefixed so it is greppable from the phone console.
    try { console.error('[nova:visual]', this.props.what || 'panel', err); } catch { /* never throws */ }
  }

  componentDidUpdate(prev) {
    // A new payload deserves a fresh attempt — otherwise one bad card
    // poisons every later one in the same slot.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: null });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={css(`margin-top:10px;border:1px solid color-mix(in srgb, var(--nv-warn) 34%, transparent);border-radius:12px;padding:10px 13px;background:color-mix(in srgb, var(--nv-warn) 05%, transparent)`)}>
        <div style={css(`font:600 8.5px ${M};letter-spacing:.2em;color:var(--nv-warn)`)}>VISUAL UNAVAILABLE</div>
        <div style={css('margin-top:5px;font-size:11.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)')}>
          Nova couldn’t draw this one — the answer above still stands.
        </div>
      </div>
    );
  }
}
