// PROJECTS, BY VOICE (1 Nov 2026). Four verbs in the action registry
// (lib/verbs.js), named by Nova's model on an ACT line and run by code:
//   project.start     open the intake (lib/voiceIntake.js) with his words;
//                     the conversation then continues as the intake
//   project.cancel    he called a project being set up off: withdraw its
//                     pending card, nothing is created
//   project.research  research for the project attached to the conversation
//   project.watch     a video for that project (its folder only, never the library)
// `ctx` (runVerb → execute) carries the conversation's attached project
// (`projectId`) and any intake under way (`intakeSessionId`). None of them
// changes anything he owns by itself (`receipt: false`): the intake files its
// own card, research and watches their own records, each with its own undo.

function plain(message) { const e = new Error(message); e.code = 'project'; return e; }

const NO_PROJECT = 'no project is attached to this conversation; open one in Projects and tap Talk about this';

/** The attached project, writable, or a plain refusal. */
async function attachedProject(vaultPath, ctx) {
  const id = ctx?.projectId;
  if (!id) throw plain(NO_PROJECT);
  const { LINKED_IDS } = await import('./projectLinks.js');
  if (LINKED_IDS.includes(id)) throw plain('that is a linked project: Nova only reads about it and never starts work in it');
  const { novaKernel } = await import('./novaProjects.js');
  const p = novaKernel(vaultPath).getProject(id);
  if (!p || p.status === 'undone') throw plain('the project attached to this conversation no longer exists');
  if (p.linked) throw plain('that is a linked project: Nova only reads about it and never starts work in it');
  const { isProtectedPath } = await import('./protectedRoots.js');
  if (isProtectedPath(p.folder)) throw plain('Nova never writes to Science Atlas, its Mission Control or Wren');
  if (!p.allowances?.research) throw plain(`${p.name} is not allowed to research on its own; turn Research on in its Controls first`);
  return p;
}

export const PROJECT_VERBS = [
  {
    id: 'project.start', tier: 'act', receipt: false,
    describe: 'he wants to START, begin, plan or set up a project (something to work on over days or weeks: a build, research, a room, a trip). Not for a passing mention. Code opens the project intake and the conversation carries on there',
    args: { text: 'what he said about the project, in his words' },
    async run(vaultPath, args, ctx = {}) {
      const text = String(args.text || '').trim().slice(0, 4000);
      if (ctx.intakeSessionId) return { destination: 'Project intake (already under way)', said: 'We are already setting one up. Tell me more about it.', receipt: false };
      // a project is already being talked about: ask, never start a second one silently
      if (ctx.projectId) {
        let name = 'this project';
        try { name = (await import('./novaProjects.js')).novaKernel(vaultPath).getProject(ctx.projectId)?.name || name; } catch { /* the question still stands */ }
        return { destination: 'Project intake (asked first)', said: `We are on ${name}. Start a separate new project?`, receipt: false, extra: { offer: { kind: 'project-start-another', text } } };
      }
      const { startVoiceIntake } = await import('./voiceIntake.js');
      const { jobId, sessionId } = await startVoiceIntake(vaultPath, { text });
      return { destination: 'Project intake', said: '', receipt: false, extra: { intake: { sessionId, jobId, stage: 'asking' } } };
    },
    async undo() { return null; },
  },
  {
    id: 'project.cancel', tier: 'act', receipt: false,
    describe: 'he calls off a project being set up in this conversation (never mind, cancel that project). Nothing is created',
    args: {},
    async run(vaultPath, args, ctx = {}) {
      if (!ctx.intakeSessionId) return { destination: 'Project intake (none)', said: 'No project is being set up right now.', receipt: false };
      const { cancelVoiceIntake } = await import('./voiceIntake.js');
      const withdrawn = await cancelVoiceIntake(ctx.intakeSessionId);
      return { destination: 'Project intake called off', said: 'Dropped. Nothing was made.', receipt: false, extra: { intake: { sessionId: ctx.intakeSessionId, stage: 'cancelled', withdrawn } } };
    },
    async undo() { return null; },
  },
  {
    id: 'project.research', tier: 'act', receipt: false,
    describe: 'research a question FOR the project attached to this conversation (web, cited; filed into that project only). Only when a project is attached',
    args: { question: 'the research question, in his words' },
    async run(vaultPath, args, ctx = {}) {
      const p = await attachedProject(vaultPath, ctx);
      const { startProjectResearch } = await import('./projectResearch.js');
      const record = await startProjectResearch(vaultPath, p.id, String(args.question || ''));
      return { destination: `${p.name} — research`, said: `Researching that for ${p.name}. It lands on the project page.`, receipt: false, extra: { projectResearch: { recordId: record.id, projectId: p.id } } };
    },
    async undo() { return null; },
  },
  {
    id: 'project.watch', tier: 'act', receipt: false,
    describe: 'watch a video FOR the project attached to this conversation; it is filed into that project only, never his library. Only when a project is attached',
    args: { url: 'the video link', lens: 'optional: reference, claims or design' },
    async run(vaultPath, args, ctx = {}) {
      const p = await attachedProject(vaultPath, ctx);
      const { extractVideoUrl, startVideoWatch } = await import('./watcher.js');
      const link = extractVideoUrl(String(args.url || ''));
      if (!link) throw plain('that is not a video link');
      const lens = typeof args.lens === 'string' && args.lens.trim() ? args.lens.trim() : undefined;
      const record = await startVideoWatch(vaultPath, link.url, '', { project: { id: p.id }, lens });
      return { destination: `${p.name} — video`, said: `Watching it for ${p.name}. It goes only into the project.`, receipt: false, extra: { projectWatch: { recordId: record.id, projectId: p.id } } };
    },
    async undo() { return null; },
  },
];
