// A REOPEN WITH A LIVE WORKOUT LANDS ON IT (4 Nov 2026, his words: "I should
// be able to open the app at any time and have the work out already there mid
// progress ready to go"). The installed app reopens at its start URL, which
// has no hash and so means Home: that is the start URL's answer, not his
// choice, and a workout he is in the middle of opens instead. A link that
// names another screen (a Shortcut, the capture icon, a notification) is a
// choice and is kept.
export function opensSessionFrom(hash) {
  const key = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return !key || key === 'mission' || key === 'workouts';
}
