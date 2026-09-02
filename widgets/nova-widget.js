// Nova — iPhone home-screen + lock-screen widget, via the Scriptable app
// (free, App Store).
//
// Setup (2 minutes):
//   1. Install "Scriptable" from the App Store.
//   2. In Scriptable: + → paste this whole file → name it "Nova".
//   3. Fill in TOKEN below — the same value as the app's Settings.
//      NEVER paste your real token into this file in the repo: nova-os is a
//      PUBLIC repo, and a committed token is a token anyone can use. It
//      lives only in Scriptable on your phone.
//   4. Home screen: long-press → + → Scriptable → small or medium → choose
//      the "Nova" script.
//      Lock screen: long-press the lock screen → Customise → add a widget →
//      Scriptable → pick the rectangular or inline shape → choose "Nova".
//
// The widget refreshes on iOS's own schedule (roughly every 15-30 min) and
// shows the day at a glance. When the Mac is unreachable it says so —
// honest degradation, never stale numbers dressed as fresh.
//
// SIZES render different truths, because a small widget that tries to say
// everything says nothing:
//   small     — the numbers (steps, protein, kcal, next, gate)
//   medium    — the numbers PLUS today's leadership idea
//   large     — the numbers, the idea, AND today's top 3 (the plan's payload,
//               which /widget already shipped and no size drew)
//   lock rect — today's leadership idea alone
//   lock line — the idea's title alone

const BASE_URL = 'https://haydens-macbook-pro.taild050ac.ts.net'; // your Tailscale URL
const TOKEN = 'PASTE_YOUR_API_TOKEN_HERE';

const MONO = new Font('Menlo', 10);
const MONO_BIG = new Font('Menlo-Bold', 20);
const INK = new Color('#e8ecf6');
const DIM = new Color('#e8ecf6', 0.45);
const CY = new Color('#59e6ff');
const GOLD = new Color('#e0b26a');
const BG = new Color('#070a12');

const family = config.widgetFamily || 'small';
const isAccessory = String(family).startsWith('accessory'); // lock screen

async function fetchWidget() {
  const r = new Request(`${BASE_URL}/api/widget`);
  r.headers = { Authorization: `Bearer ${TOKEN}` };
  r.timeoutInterval = 12;
  return await r.loadJSON();
}

function line(stack, label, value, color) {
  const row = stack.addStack();
  row.centerAlignContent();
  const l = row.addText(label);
  l.font = MONO; l.textColor = DIM;
  row.addSpacer();
  const v = row.addText(value);
  v.font = MONO; v.textColor = color || INK;
}

const widget = new ListWidget();
// A lock-screen widget is tinted and translucent by the system — painting a
// background makes it a dark smudge. Leave those alone.
if (!isAccessory) {
  widget.backgroundColor = BG;
  widget.setPadding(14, 16, 14, 16);
}

try {
  const d = await fetchWidget();
  const lead = d.lead || null; // {title, line} — absent until today's idea lands

  if (family === 'accessoryInline') {
    // one cramped line: the headline only, never the body
    widget.addText(lead ? lead.title : 'Nova — no idea yet');
  } else if (isAccessory) {
    // rectangular/circular lock-screen: the idea, nothing else
    const h = widget.addText('LEAD');
    h.font = new Font('Menlo-Bold', 9);
    if (lead) {
      const t = widget.addText(lead.title);
      t.font = Font.boldSystemFont(13);
      t.lineLimit = 2;
      const b = widget.addText(lead.line);
      b.font = Font.systemFont(11);
      b.lineLimit = 2;
    } else {
      const none = widget.addText('No idea yet today.');
      none.font = Font.systemFont(12);
    }
  } else {
    const title = widget.addText('NOVA');
    title.font = new Font('Menlo-Bold', 9);
    title.textColor = CY;
    widget.addSpacer(6);

    const steps = widget.addText(d.steps != null ? `${d.steps.toLocaleString()} steps` : '— steps');
    steps.font = MONO_BIG;
    steps.textColor = INK;
    if (d.stepsDate && d.steps != null && !d.at.startsWith(d.stepsDate)) {
      const stale = widget.addText(`as of ${d.stepsDate}`);
      stale.font = new Font('Menlo', 8); stale.textColor = DIM;
    }
    widget.addSpacer(8);

    line(widget, 'PROTEIN', d.protein != null ? `${d.protein}g` : '—');
    line(widget, 'KCAL', d.kcal != null ? String(d.kcal) : '—');
    if (d.next) line(widget, 'NEXT', `${d.next.time} ${d.next.label}`.slice(0, 24));
    line(widget, 'GATE', d.pending != null ? String(d.pending) : '—', d.pending > 0 ? GOLD : DIM);

    // The leadership idea only on the sizes with room for it. On a small
    // widget it would either truncate to nonsense or crowd out the numbers.
    // TODAY'S TOP 3 — large only; on smaller sizes it would crowd the numbers
    if (family === 'large' && Array.isArray(d.top3) && d.top3.length) {
      widget.addSpacer(8);
      const ph = widget.addText(d.planStatus === 'pending' ? 'TOP 3 · DRAFT — NEEDS YOUR YES' : 'TOP 3');
      ph.font = new Font('Menlo-Bold', 8);
      ph.textColor = d.planStatus === 'pending' ? GOLD : CY;
      widget.addSpacer(3);
      d.top3.slice(0, 3).forEach((t, i) => {
        const row = widget.addText(`${i + 1}  ${t}`);
        row.font = Font.systemFont(11);
        row.textColor = INK;
        row.lineLimit = 1;
      });
    }

    if (lead && (family === 'medium' || family === 'large')) {
      widget.addSpacer(8);
      const lh = widget.addText('TRY TODAY');
      lh.font = new Font('Menlo-Bold', 8);
      lh.textColor = GOLD;
      widget.addSpacer(3);
      const lt = widget.addText(lead.title);
      lt.font = Font.boldSystemFont(13);
      lt.textColor = INK;
      lt.lineLimit = 2;
      const ll = widget.addText(lead.line);
      ll.font = Font.systemFont(11);
      ll.textColor = DIM;
      ll.lineLimit = family === 'large' ? 4 : 2;
    }

    widget.addSpacer(6);
    const at = widget.addText(`synced ${new Date(d.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    at.font = new Font('Menlo', 8);
    at.textColor = DIM;
  }
} catch (e) {
  // The failure must name itself. A blank widget and an unreachable Mac
  // look identical otherwise.
  if (isAccessory) {
    widget.addText(family === 'accessoryInline' ? 'Nova — unreachable' : 'Nova');
    if (family !== 'accessoryInline') {
      const err = widget.addText('Mac unreachable');
      err.font = Font.systemFont(11);
    }
  } else {
    const t = widget.addText('NOVA');
    t.font = new Font('Menlo-Bold', 9); t.textColor = CY;
    widget.addSpacer(6);
    const err = widget.addText('Mac unreachable — last sync unknown');
    err.font = MONO; err.textColor = DIM;
  }
}

// tap opens the app — the idea-only sizes open the Leader, where the idea lives
widget.url = isAccessory ? 'https://hcooper12.github.io/nova-os/#/leader' : 'https://hcooper12.github.io/nova-os/';
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium(); // in-app preview shows the size with the idea
Script.complete();
