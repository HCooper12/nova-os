import { getConnection } from '../api.js';
import { orbReply } from '../mockAssistants.js';
import { NOTE_TYPE_COLOR, mono } from './shared.js';

// The smaller screens: Voice (concept preview), Memory Galaxy, Shopping List,
// Claude Code, and transcript ingest. Adds to ctx: shoppingItems (nav count).
export function valsMisc(app, ctx) {
  const st = app.state;
  const { wakeWord } = ctx;

  // shopping list — grouped by category (matching a typical supermarket layout)
  const shoppingItems = st.liveShoppingList?.items || [];
  const shoppingCategoryOrder = st.liveShoppingList?.categories || [];
  const shoppingCategories = shoppingCategoryOrder
    .map((cat) => ({
      name: cat,
      items: shoppingItems.filter((i) => i.category === cat).map((i) => ({
        id: i.id, name: i.name, source: i.source, checked: i.checked,
        onToggle: () => app.toggleShoppingItem(i.id, !i.checked),
        checkboxStyle: {
          width: '21px', height: '21px', borderRadius: '6px', flex: 'none',
          border: i.checked ? '1px solid var(--nv-cy)' : '1px solid color-mix(in srgb, var(--nv-ink) 25%, transparent)',
          background: i.checked ? 'var(--nv-cy)' : 'transparent',
          color: '#0a2830', fontSize: '13px', fontWeight: 700, lineHeight: '19px', textAlign: 'center',
        },
        nameStyle: {
          fontSize: '13.5px',
          color: i.checked ? 'color-mix(in srgb, var(--nv-ink) 35%, transparent)' : 'var(--nv-ink)',
          textDecoration: i.checked ? 'line-through' : 'none',
        },
      })),
    }))
    .filter((c) => c.items.length > 0);
  const shoppingCheckedCount = shoppingItems.filter((i) => i.checked).length;

  // galaxy — real vault graph when available
  const liveGraphOn = !!(st.liveGraph && st.liveGraph.nodes.length);
  const galaxyStatsLabel = liveGraphOn
    ? `${st.liveGraph.nodes.length} STARS · ${st.liveGraph.links.length} LINKS`
    : '385 STARS · 1,227 LINKS · DEMO';
  const galaxyLegend = liveGraphOn
    ? Object.entries(NOTE_TYPE_COLOR).filter(([t]) => t !== 'raw').map(([t, color]) => ({ label: t + 's', color }))
    : [
        { label: 'notes', color: 'var(--nv-ink)' }, { label: 'podcasts', color: 'var(--nv-vi)' }, { label: 'recipes', color: 'var(--nv-gold)' },
        { label: 'training', color: '#5aa87c' }, { label: 'agents', color: 'var(--nv-cy)' },
      ];

  // shared with valsChrome (nav count)
  Object.assign(ctx, { shoppingItems });

  return {
    // shopping list
    shoppingHeaderLabel: st.liveShoppingList ? `${shoppingItems.length} ITEM${shoppingItems.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN` : 'CONNECT A BACKEND IN SETTINGS',
    shoppingCategories,
    shoppingCheckedCount,
    shoppingAddInput: st.shoppingAddInput,
    setShoppingAddInput: (e) => app.setShoppingAddInput(e),
    submitShoppingAdd: () => app.submitShoppingAdd(),
    shoppingAddBusy: st.shoppingAddBusy,
    shoppingAddError: st.shoppingAddError,
    confirmShoppingCompletion: () => app.confirmShoppingCompletion(),

    // voice (concept preview — no real speech engine)
    micOn: st.micOn,
    micStatus: st.micOn ? 'LISTENING' : 'MUTED',
    micBar: { width: st.micOn ? '92%' : '8%', height: '100%', background: 'var(--nv-cy)', transition: 'width .4s' },
    micBtnStyle: { cursor: 'pointer', font: "500 10.5px " + mono, padding: '9px 16px', borderRadius: '8px', border: '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)', color: st.micOn ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', background: st.micOn ? 'color-mix(in srgb, var(--nv-cy) 08%, transparent)' : 'rgba(0,0,0,.25)' },
    micBtnLabel: st.micOn ? '● MIC LIVE' : '○ MIC OFF',
    orbCaption: st.micOn ? (wakeWord ? 'LISTENING · SAY “NOVA”' : 'LISTENING') : 'STANDING BY',
    toggleMic: () => app.setState(s => ({ micOn: !s.micOn })),
    orbMsgs: st.orbChat.map(m => ({ text: m.text, typing: m.typing, tag: m.who === 'nova' ? '» NOVA' : '» YOU', tagStyle: { color: m.who === 'nova' ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', fontWeight: 500 } })),
    orbInput: st.orbInput,
    setOrbInput: (e) => app.setState({ orbInput: e.target.value }),
    orbKey: (e) => { if (e.key === 'Enter') app.doOrb(); },
    sendOrb: () => app.doOrb(),
    briefMe: () => { app.setState(s => ({ orbChat: [...s.orbChat, { who: 'you', text: 'Brief me.' }] })); setTimeout(() => app.typeIn('orbChat', 'nova', orbReply('brief')), 450); },

    // galaxy
    galaxyStatsLabel,
    galaxyLegend,
    galaxyRef: app.galaxyRef,
    galaxyClick: (e) => {
      if (!app.gPos) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let hit = null;
      app.gPos.forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) < 16) hit = app.gNodes[i]; });
      app.setState({ galaxySel: hit ? { label: hit.label, type: hit.type.toUpperCase(), desc: hit.desc, color: hit.color, target: hit.target } : null });
    },
    galaxySelOn: !!st.galaxySel,
    galaxySelLabel: st.galaxySel ? st.galaxySel.label : '',
    galaxySelType: st.galaxySel ? st.galaxySel.type : '',
    galaxySelDesc: st.galaxySel ? st.galaxySel.desc : '',
    galaxySelColor: st.galaxySel ? st.galaxySel.color : 'var(--nv-gold)',
    galaxyClear: () => app.setState({ galaxySel: null }),
    galaxyOpen: () => {
      const t = st.galaxySel && st.galaxySel.target;
      if (!t) return;
      if (t.startsWith('note:')) { app.selectNote(t.slice(5)); app.navigate('notes', { galaxySel: null }); }
      else if (t.startsWith('n')) app.navigate('notes', { openNoteId: t, galaxySel: null });
      else if (t.startsWith('r')) app.navigate('recipes', { openRecipeId: t, servings: 1, recipeChat: [], galaxySel: null });
      else app.navigate(t, { galaxySel: null });
    },

    // code
    codeConnected: !!getConnection(),
    codeMsgs: st.codeChat.map(m => ({ text: m.text, tag: m.who === 'claude' ? '» CLAUDE' : m.who === 'system' ? '» SYSTEM' : '» YOU', tagStyle: { color: m.who === 'claude' ? 'var(--nv-gold)' : m.who === 'system' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', fontWeight: 500 } })),
    codeBusy: st.codeBusy,
    codeInput: st.codeInput,
    setCodeInput: (e) => app.setState({ codeInput: e.target.value }),
    codeKey: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); app.doCode(); } },
    sendCode: () => app.doCode(),
    codeWorkspace: st.codeWorkspace,
    setCodeWorkspace: (w) => app.setCodeWorkspace(w),
    codeModel: st.codeModel,
    setCodeModel: (e) => app.setState({ codeModel: e.target.value }),
    codeModelOptions: [
      { value: 'sonnet', label: 'Sonnet 5' },
      { value: 'opus', label: 'Opus 4.8' },
      { value: 'fable', label: 'Fable 5' },
      { value: 'haiku', label: 'Haiku 4.5' },
    ],
    codeSessionActive: !!st.codeSessionId,
    newCodeSession: () => app.newClaudeCodeSession(),

    // ingest
    ingestModalOpen: st.ingestModalOpen,
    openIngestModal: () => app.openIngestModal(),
    closeIngestModal: () => app.closeIngestModal(),
    ingestText: st.ingestText,
    setIngestText: (e) => app.setState({ ingestText: e.target.value }),
    ingestSourceUrl: st.ingestSourceUrl,
    setIngestSourceUrl: (e) => app.setState({ ingestSourceUrl: e.target.value }),
    onIngestFile: (e) => app.onIngestFile(e),
    submitIngest: () => app.submitIngest(),
    ingestStatus: st.ingestStatus,
    ingestPreview: st.ingestPreview,
    ingestError: st.ingestError,
    closeIngestReview: () => app.closeIngestReview(),
    approveIngest: () => app.approveIngest(),
    discardIngest: () => app.discardIngest(),
  };
}
