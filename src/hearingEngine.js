// WHICH EARS NOVA LISTENS WITH — his choice, with a default the receipts earned.
//
//   'browser' — the phone's own speech engine (Web Speech). Words appear as he
//               speaks. On his Mac it has heard every real turn.
//   'nova'    — Nova's own ears: record, send to the Mac, words come back
//               (src/recorder.js). No live words, but it does not depend on
//               the engine that has heard him on 1 iPhone turn in 21.
//   'auto'    — Nova's ears on an iPhone, the browser's everywhere else.
//
// Stored per device, like the rest of the voice settings, because the right
// answer is a property of the device.

const KEY = 'novaos.hearing';
export const HEARING_CHOICES = [
  { value: 'auto', label: 'Automatic', hint: "Nova's own ears on iPhone, the browser's elsewhere." },
  { value: 'nova', label: "Nova's ears", hint: 'Records you and your Mac writes it down. Words appear when you stop.' },
  { value: 'browser', label: "Phone's dictation", hint: 'The built-in speech engine. Words appear as you talk.' },
];

export function hearingChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return HEARING_CHOICES.some((c) => c.value === v) ? v : 'auto';
  } catch { return 'auto'; }
}

export function setHearingChoice(value) {
  try { localStorage.setItem(KEY, value); } catch { /* private mode: auto it is */ }
}

// Pure: what the choice resolves to on this device. null = no way to hear.
// A choice that cannot work here falls to the one that can, rather than
// leaving him with a mic button that does nothing.
export function resolveHearing({ choice = 'auto', ios = false, speech = false, recorder = false, connected = false } = {}) {
  const nova = recorder && connected;
  if (choice === 'nova') return nova ? 'nova' : speech ? 'browser' : null;
  if (choice === 'browser') return speech ? 'browser' : nova ? 'nova' : null;
  if (ios && nova) return 'nova';
  if (speech) return 'browser';
  return nova ? 'nova' : null;
}
