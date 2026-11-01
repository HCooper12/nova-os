// A PROJECT IN THE VOICE CONVERSATION (1 Nov 2026, his words: "I should be
// able to simply speak to Nova through the voice conversation feature and
// have the project be built and begun but then stored and accessed through
// the projects section"). Pure, so `npm test` pins it; App.jsx calls it.
//
//   voiceAskExtras    what a Voice ask carries: the intake's session while a
//                     project is being set up, or the attached project's id
//                     (and, the first turn after he attaches it, projectFresh)
//   intakeAfter       the intake state after a reply
//   afterApproval     Nova's one code-written line once his yes made it, and
//                     the "Shall I start with that?" offer when the first move
//                     is research, a draft or code the project may do; never
//                     a claim it ran

/** The extra fields one Voice ask sends. Nothing at all when neither is set. */
// A document Tell me attached (T8) rides the FIRST turn as docRef and every
// turn after as heldDocRef (the server re-sends its body only when it builds a
// fresh context: server/lib/projectContext.js docPlacement).
export function voiceAskExtras({ voiceProject = null, voiceIntake = null, sentProjectId = null, sentDocId = null } = {}) {
  if (voiceIntake?.sessionId) return { intakeSessionId: voiceIntake.sessionId };
  if (!voiceProject?.id) return {};
  const doc = voiceProject.doc?.id || null;
  return {
    projectId: voiceProject.id,
    ...(sentProjectId !== voiceProject.id ? { projectFresh: true } : {}),
    ...(doc ? (sentDocId === doc ? { heldDocRef: doc } : { docRef: doc }) : {}),
  };
}

/** His Tell me tap, as his line in the thread (it is his action, never a spoken one). */
export const tellMeLine = (title) => `Tell me about “${String(title || 'this document').trim()}”`;

/** The intake after a reply: continued, or over (called off, or failed). */
export function intakeAfter(result, current = null) {
  const i = result?.intake;
  if (!i) return current;
  if (i.stage === 'cancelled' || i.stage === 'error') return null;
  return i.sessionId ? { sessionId: i.sessionId } : current;
}

// a first move Nova may run as research: it asks to find something out
const RESEARCH_MOVE = /^(?:research|find|look (?:up|into|for)|compare|search|gather|read up|survey|check what|work out which|shortlist|watch)\b/i;
export const isResearchMove = (text) => RESEARCH_MOVE.test(String(text || '').trim());

/**
 * What Nova says once the project exists, from the real record only.
 * Returns { say, offer|null }.
 */
// PHASE 3 (his call, 1 Nov 2026): a first move that writes something (a
// draft) or builds something (code) is offered too, inside the project's
// allowances, by the same spoken yes.
const CODE_MOVE = /^(?:build|code|implement|prototype|scaffold|set up the (?:app|site|repo|code)|make (?:the|a|an) (?:app|site|website|tool|script|prototype))\b/i;
const DRAFT_MOVE = /^(?:draft|write|outline|sketch out|plan out|list|summari[sz]e|make (?:a|the) (?:list|plan|brief|outline|shortlist|budget)|put together)\b/i;
export function moveKind(text) {
  const t = String(text || '').trim();
  if (isResearchMove(t)) return 'research';
  if (CODE_MOVE.test(t)) return 'code';
  if (DRAFT_MOVE.test(t)) return 'draft';
  return null;
}
const SWITCH = { research: 'Research', draft: 'Draft', code: 'Write code' };

export function afterApproval(project) {
  const name = String(project?.name || 'the project');
  const move = String(project?.firstMoves?.[0] || '').trim().replace(/[.\s]+$/, '');
  const where = `It's in Projects, as ${name}.`;
  if (!move) return { say: where, offer: null };
  const kind = moveKind(move);
  if (kind && project?.allowances?.[kind]) {
    return { say: `${where} First move: ${move}. Shall I start with that?`, offer: { kind: 'project-first-move', projectId: project.id, question: move, jobKind: kind } };
  }
  if (kind) return { say: `${where} First move: ${move}. It may not do that on its own yet; turn ${SWITCH[kind]} on in its Controls.`, offer: null };
  return { say: `${where} First move: ${move}. That one is on its page for you to start.`, offer: null };
}

/** The chip at the top of the Voice conversation, or null. */
export function voiceAttachOf(st, app) {
  if (st?.voiceIntake) return { intake: true, name: 'New project', detach: () => app.cancelVoiceIntake() };
  if (st?.voiceProject?.id) {
    const id = st.voiceProject.id;
    return { intake: false, name: st.voiceProject.name || 'this project', doc: st.voiceProject.doc?.title || null, detach: () => app.attachVoiceProject(null), open: () => app.openProject(id) };
  }
  return null;
}
