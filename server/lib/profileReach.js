// WHO READS HIS PROFILE (his ask, 27 Oct 2026): "Ensure Nova is undoubtedly
// referring to and using all of this information and it is not just
// something I'm filling out for no purpose."
//
// The list below is the proof, in two halves:
//   - GET /api/profile/reach shows it to him, in words he recognises.
//   - server/test/profileReach.test.js reads every listed module's source and
//     fails unless it really calls profileContext( (and talkPrefsBlock( for
//     the ones that talk to him), and fails when any module in server/lib
//     that carries NOVA_LENS is neither listed here nor exempted below with
//     a reason. A new agent that forgets him fails the suite.
//
// `module` is the file (relative to server/) that calls profileContext for
// that lane; `also` names a file that carries the rest of the lane's prompt
// (Ask Nova, the Coach and the Leader build their prompts in claudeCode.js,
// where the talk preferences sit right before TURN_TAKING).

export const PROFILE_READERS = [
  { id: 'ask-nova', label: 'Ask Nova', module: 'lib/askContext.js', also: ['lib/claudeCode.js'], talks: true },
  { id: 'ask-nova-local', label: 'Ask Nova on this Mac', module: 'lib/localAsk.js', talks: true },
  { id: 'coach', label: 'Coach', module: 'lib/coachTurn.js', also: ['lib/claudeCode.js'], talks: true },
  { id: 'leader', label: 'Leader', module: 'lib/leader.js', also: ['lib/claudeCode.js'], talks: true },
  { id: 'quick-session', label: 'Quick session', module: 'routes/workouts.js', talks: false },
  { id: 'coach-reflection', label: "Coach's nightly review", module: 'lib/coachReflection.js', talks: false },
  { id: 'leader-daily', label: "Leader's daily idea", module: 'lib/leader.js', talks: false },
  { id: 'plan-today', label: 'Plan today', module: 'lib/planToday.js', talks: false },
  { id: 'daily-review', label: 'Daily review', module: 'lib/dailyReview.js', talks: false },
  { id: 'review-card', label: 'Daily review card', module: 'lib/reviewSummary.js', talks: false },
  { id: 'weekly-debrief', label: 'Sunday debrief', module: 'lib/weeklyDebrief.js', talks: false },
  { id: 'health-insight', label: 'Health insight', module: 'lib/healthInsight.js', talks: false },
  { id: 'practice', label: 'Practice', module: 'lib/practiceLane.js', talks: false },
  { id: 'researcher', label: 'Researcher', module: 'lib/researcher.js', talks: false },
  { id: 'briefing', label: 'Briefings', module: 'lib/briefing.js', talks: false },
  { id: 'planner', label: 'Plans (the report)', module: 'lib/planner.js', talks: false },
  { id: 'studio', label: 'Studio', module: 'lib/studio.js', talks: false },
  { id: 'journal', label: 'Journal prompts', module: 'lib/journalPrompt.js', talks: false },
  { id: 'paper', label: 'Paper check', module: 'lib/paperLane.js', talks: false },
  { id: 'pattern-scout', label: 'Pattern scout', module: 'lib/patternScout.js', talks: false },
  { id: 'repertoire', label: 'Repertoire', module: 'lib/repertoireLane.js', talks: false },
  { id: 'watcher', label: 'Video watch', module: 'lib/watcher.js', talks: false },
];

// Modules that carry NOVA_LENS but deliberately do not read profileContext.
export const PROFILE_EXEMPT = {
  'lib/lens.js': 'defines NOVA_LENS; it is not a lane',
  'lib/profileReach.js': 'this list itself; it names NOVA_LENS in a comment',
  'lib/orgContext.js': 'names NOVA_LENS only in a comment; it is a context block other lanes inherit, not a lane',
  'lib/profileTalk.js': 'the About-you conversation reads the whole page section by section (with state), which is more than profileContext; it carries talkPrefsBlock, checked in its own test',
  'lib/exerciseResearch.js': 'researches facts about exercises (muscles, cues) for the library; the muscle-accuracy rule wants evidence about the exercise, not his preferences',
  'lib/librarianAsk.js': 'answers what his shelf holds for another agent; who he is reaches it through the asking agent\'s question',
};
