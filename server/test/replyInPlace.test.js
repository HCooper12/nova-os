// REPLY IN PLACE — the two things code promises about it (his ask, 21 Sep).
//
// One: "not now" is never silence. The sheet files a reminder for nine the
// next morning through the verbs' deterministic path, so the sentence the
// client sends has to be one `parseCommand` claims AND one `parseWhen` reads
// as tomorrow 09:00 — a wording drift on either side would turn "not now"
// back into a dropped banner, which is the exact failure he named.
//
// Two: the banner's context block is the shape Ask Nova already treats as
// ground truth and never reads back — so it must be bracketed, carry the
// full text, and not itself be the question.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../lib/verbs.js';
import { parseWhen } from '../lib/whenParser.js';

// exactly what App.replyNotNow sends, built the same way
const notNowSentence = (what) => `remind me about ${what} tomorrow at 9`;

test('"not now" becomes a reminder for nine tomorrow, deterministically', () => {
  const now = new Date('2026-09-23T14:30:00+10:00');
  for (const what of ['Outbox needs your call', 'Nova', "The Researcher's briefs hit a snag"]) {
    const cmd = parseCommand(notNowSentence(what));
    assert.ok(cmd, `parseCommand did not claim: ${notNowSentence(what)}`);
    const opt = (cmd.any || [cmd])[0];
    assert.equal(opt.verb, 'reminder.set', `wrong verb for "${what}"`);
    const read = parseWhen(String(opt.args.when), now);
    assert.ok(read, `parseWhen read nothing in "${opt.args.when}"`);
    const when = read.when;
    assert.equal(when.getDate(), 24, 'tomorrow');
    assert.equal(when.getHours(), 9, 'nine in the morning');
    // the verbs normalise his sentence to lower case before matching, so the
    // reminder's text arrives lower-cased too — a wart of that path, not of
    // this one; what matters is that the subject survives
    assert.ok(String(opt.args.text).toLowerCase().includes(what.toLowerCase()), `the reminder lost its subject: ${opt.args.text}`);
  }
});

test('a banner longer than the verbs accept is cut to fit before it is sent', () => {
  // parseCommand refuses anything over 140 characters; App slices the title
  // or text to 90 for exactly this reason. Pin the ceiling so a longer
  // banner cannot silently fall through to a model turn.
  const long = 'x'.repeat(90);
  assert.ok(parseCommand(notNowSentence(long)), 'a 90-char subject still fits');
  assert.equal(parseCommand(notNowSentence('x'.repeat(130))), null, 'past the ceiling it is not a command — App must never send that');
});
