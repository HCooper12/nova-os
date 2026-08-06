// Nova — iPhone home-screen widget, via the Scriptable app (free, App Store).
//
// Setup (2 minutes):
//   1. Install "Scriptable" from the App Store.
//   2. In Scriptable: + → paste this whole file → name it "Nova".
//   3. Fill in BASE_URL and TOKEN below (same values as the app's Settings).
//   4. Long-press the home screen → + → Scriptable → small or medium widget
//      → choose the "Nova" script.
// The widget refreshes on iOS's own schedule (roughly every 15–30 min) and
// shows the day at a glance: steps, protein, kcal, what's next, and how many
// drafts await your yes. When the Mac is unreachable it says so — honest
// degradation, never stale numbers dressed as fresh.

const BASE_URL = 'https://haydens-macbook-pro.taild050ac.ts.net'; // your Tailscale URL
const TOKEN = 'PASTE_YOUR_API_TOKEN_HERE';

const MONO = new Font('Menlo', 10);
const MONO_BIG = new Font('Menlo-Bold', 20);
const INK = new Color('#e8ecf6');
const DIM = new Color('#e8ecf6', 0.45);
const CY = new Color('#59e6ff');
const GOLD = new Color('#e0b26a');
const BG = new Color('#070a12');

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
widget.backgroundColor = BG;
widget.setPadding(14, 16, 14, 16);

try {
  const d = await fetchWidget();
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

  widget.addSpacer(6);
  const at = widget.addText(`synced ${new Date(d.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
  at.font = new Font('Menlo', 8);
  at.textColor = DIM;
} catch (e) {
  const t = widget.addText('NOVA');
  t.font = new Font('Menlo-Bold', 9); t.textColor = CY;
  widget.addSpacer(6);
  const err = widget.addText('Mac unreachable — last sync unknown');
  err.font = MONO; err.textColor = DIM;
}

widget.url = 'https://hcooper12.github.io/nova-os/'; // tap opens the app
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentSmall();
Script.complete();
