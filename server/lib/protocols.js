// THE PROTOCOLS PAGE (26 Oct 2026, his ask): "adjust things in my daily and
// weekly life ... considering the protocols in Andrew Huberman's protocols book."
//
// A vault page he owns, Wiki/Health/Protocols.md, seeded ONCE when absent and
// never overwritten. The seed is Nova's own summary of Huberman Lab's PUBLIC
// toolkits, not the book; its last heading, "His own additions", is where he
// pastes the book's protocols. The page rides the Coach, Ask Nova and the
// Sunday debrief, and the heading tells every agent how to cite it: a line is
// "the Protocols page: <section>", and only a line under "His own additions"
// may be called the book. Same pattern as coachKnowledge.js: deterministic
// code seeds and reads; the model only matches a line to what the data shows.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const PROTOCOLS_REL = "Wiki/Health/Protocols.md";
const CONTEXT_BUDGET = 4200; // chars of the page in a prompt; enough for the whole seed

export const PROTOCOLS_HEAD = "PROTOCOLS (his page, Wiki/Health/Protocols.md; cite a line as \"the Protocols page: <section>\"; never call it the book unless the line is under \"His own additions\"; match protocols to what WHERE HE STANDS shows, never list them):";

export const PROTOCOLS_SEED = `# Protocols

This page is Nova's reference for the daily and weekly protocols he coaches
toward. Nova seeded it on 26 Oct 2026 from Huberman Lab's PUBLIC toolkits
(the Toolkit for Sleep, the Foundational Fitness Protocol, the light and
caffeine newsletters) in Nova's own summary. It is NOT the Protocols book.
Paste the book's protocols in under the headings below, or add your own.
Nova reads this page in every Coach answer, Ask Nova answer and the Sunday
debrief, and only ever cites a line that is on it.

Rules Nova keeps with this page:
- A protocol is a suggestion for him to accept, never something Nova changes
  on its own.
- Nova says where a line comes from ("the Protocols page: sleep") and never
  calls it "the book" unless the line came from the book.
- Protocols are matched to what his data shows, not listed. Sleep lines come
  up when his sleep is short; a cold-exposure line never comes up for a
  calorie problem.

## Sleep (Toolkit for Sleep)
- Wake at about the same time each day, including weekends.
- Get outside into daylight within an hour of waking, 5 to 10 minutes on a clear day, 15 to 20 when it is overcast. Sunglasses off.
- See late-afternoon sunlight too; it lowers the cost of light later at night.
- Dim the lights from about 10 pm. Bright overhead light between 10 pm and 4 am pushes sleep later.
- Keep the bedroom cool, dark and quiet. Body temperature has to fall by about 1 °C to fall asleep.
- Finish the last big meal 2 to 3 hours before bed.
- Alcohol and most sleep aids break sleep architecture; avoid them close to bed.
- If sleep is short, a 10 to 30 minute NSDR or a short nap before 3 pm helps; after 3 pm it harms the night.
- Lying awake for more than 20 minutes: get up, dim light, come back when sleepy.

## Caffeine
- Delay the first caffeine 90 to 120 minutes after waking unless training first thing.
- No caffeine after about 2 pm if sleep is a problem, and never within 8 to 10 hours of bed.
- Hydrate with water and a pinch of salt on waking before caffeine.

## Movement (Foundational Fitness Protocol)
- Resistance training 3 to 4 sessions a week, 45 to 75 minutes; one session can be two short ones.
- Zone 2 cardio 150 to 200 minutes a week in total (a long walk counts). Brisk walking at a pace where talking is possible but not easy.
- One longer endurance session a week (60 minutes or more), and one short, hard interval session a week.
- Walk 10 minutes after big meals; it blunts the blood-sugar rise.
- A deload or lighter week about every 8 weeks when effort keeps rising and lifts do not.
- Train the same body part no more than every 48 hours at high effort.
- Daily steps are the easiest lever for body composition; a steady 8,000 to 12,000 a day is the floor to protect.

## Fuel
- Protein about 1 gram per pound of lean mass a day on a cut, spread over 3 to 4 meals; the Intake sets his exact number.
- Eat within a steady daily window; the same window most days helps sleep and hunger.
- Carbohydrate near training supports performance; a lighter carbohydrate evening supports sleep for some, heavier for others. Test one way for two weeks.
- Water: about 35 ml per kilogram a day; more on training days and hot days.
- A planned refeed or diet break every 6 to 8 weeks of a cut keeps training quality.

## Recovery and stress
- Deliberate cold exposure 11 minutes a week in total, in 1 to 5 minute bouts, for alertness and resilience. Keep it 6 hours or more away from strength training if muscle growth is the goal.
- Sauna 2 to 3 times a week, 15 to 20 minutes at a time, when available; good for sleep and recovery.
- The physiological sigh (two inhales through the nose, one long exhale) is the fastest way to settle stress in the moment.
- A down-trending HRV with rising resting heart rate for 3 or more days is a signal to drop training intensity, not a reason to push.

## Focus and learning
- One 90-minute deep-work block a day, early, before the phone.
- Short NSDR after learning helps retention.
- Reflection: a few lines in the journal, in his own words, at the end of the day.

## His own additions
(Paste protocols from the book here, one per line, with the page or chapter.)
`;

// Seeds the page when it is absent. Never touches a page that exists, so an
// edit he made in Obsidian always stands. Returns whether it wrote.
export async function ensureProtocolsPage(vaultPath) {
  const full = path.join(vaultPath, PROTOCOLS_REL);
  if (existsSync(full)) return { seeded: false };
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, PROTOCOLS_SEED, "utf8");
  return { seeded: true };
}

const clip = (s, budget) => {
  const t = s.trim();
  return t.length <= budget ? t : t.slice(0, budget) + "\n…(page continues; cite only what you can see)";
};

// The page for a prompt. Seeds lazily on first read, like coachKnowledge.js.
export async function protocolsContext(vaultPath, { budget = CONTEXT_BUDGET } = {}) {
  await ensureProtocolsPage(vaultPath).catch(() => {});
  try {
    return `${PROTOCOLS_HEAD}\n${clip(await readFile(path.join(vaultPath, PROTOCOLS_REL), "utf8"), budget)}`;
  } catch {
    return "PROTOCOLS page (Wiki/Health/Protocols.md) is unreadable right now. Cite no protocol this turn.";
  }
}
