// Adapter for Health Auto Export (github.com/Lybron/health-auto-export), a
// real iOS app with its own HealthKit entitlements — unlike a Shortcut, it
// can call Apple's HKStatisticsQuery/HKStatisticsCollectionQuery, which is
// the ONLY way to get the cross-source de-duplicated total the Health app
// itself shows (confirmed on Apple's developer forums: manually merging raw
// per-sample data "is unlikely to match HealthKit's merge algorithm
// correctly"). A prior attempt at this from Shortcuts — dropping the Source
// filter to see both devices — just summed raw overlapping samples and
// over-counted; that is why per-device figures were folded by MAX instead,
// which is honest but not exact (see ACCUMULATOR_METRICS in healthData.js).
// This adapter exists to close that remaining gap.
//
// UNVERIFIED (13 Aug 2026): written from the app's published wiki schema
// (github.com/Lybron/health-auto-export/wiki/API-Export---JSON-Format),
// never run against a real export from the app. The wire format, the exact
// metric name strings, and — most importantly — whether "Summarize Data:
// ON, grouped by Day" genuinely invokes HealthKit's proper aggregation
// (rather than the app doing its own manual sum, which would just move the
// double-counting problem here) are all assumptions until a real payload
// is captured and inspected. Parsing is deliberately defensive: unknown
// metric names and unrecognized units are DROPPED with a warning, never
// guessed at — see CLAUDE.md "Honest degradation, never fiction".

function normalizeKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const METRIC_ALIASES = {
  steps: ['step_count', 'steps'],
  activeEnergyKcal: ['active_energy', 'active_energy_burned'],
  walkingRunningDistanceKm: ['walking_running_distance', 'distance_walking_running'],
  restingHeartRate: ['resting_heart_rate'],
  hrv: ['heart_rate_variability', 'heart_rate_variability_sdnn'],
  vo2Max: ['vo2_max'],
  weightKg: ['weight_body_mass', 'body_mass', 'weight'],
};

const ALIAS_TO_METRIC = {};
for (const [metric, aliases] of Object.entries(METRIC_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_METRIC[normalizeKey(alias)] = metric;
}

// Every unit string the app might plausibly report, mapped to a factor onto
// Nova's canonical unit (km / kg / kcal). An unrecognized unit is refused,
// not assumed — a wrong assumption here is worse than the gap this exists
// to close (silently storing miles as if they were km, say).
const DISTANCE_UNIT_TO_KM = { km: 1, kilometer: 1, kilometers: 1, mi: 1.609344, mile: 1.609344, miles: 1.609344, m: 0.001, meter: 0.001, meters: 0.001 };
const WEIGHT_UNIT_TO_KG = { kg: 1, kilogram: 1, kilograms: 1, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, st: 6.35029, stone: 6.35029 };
const ENERGY_UNIT_TO_KCAL = { kcal: 1, cal: 0.001, kj: 0.239006, j: 0.000239006 };

// null means "refuse this reading" — caller must drop it, not guess.
function convertUnit(metric, value, units) {
  const u = normalizeKey(units);
  if (metric === 'walkingRunningDistanceKm') return DISTANCE_UNIT_TO_KM[u] != null ? value * DISTANCE_UNIT_TO_KM[u] : null;
  if (metric === 'weightKg') return WEIGHT_UNIT_TO_KG[u] != null ? value * WEIGHT_UNIT_TO_KG[u] : null;
  if (metric === 'activeEnergyKcal') return ENERGY_UNIT_TO_KCAL[u] != null ? value * ENERGY_UNIT_TO_KCAL[u] : null;
  return value; // steps / restingHeartRate / hrv / vo2Max: count, bpm, ms, mL·kg⁻¹·min⁻¹ — no conversion
}

// Accumulators (steps, energy, distance) are additive within a day, so
// multiple same-day samples sum honestly. Point-in-time metrics are NOT —
// only the latest is kept. Either way, more than one sample for one metric
// on one day means "Summarize Data: ON, grouped by Day" is NOT actually
// collapsing to one point, which is the one thing this whole adapter
// depends on — so it's flagged as a warning rather than trusted quietly.
const ACCUMULATOR = new Set(['steps', 'activeEnergyKcal', 'walkingRunningDistanceKm']);

// Returns { perDate: Map<'YYYY-MM-DD', { metrics: {...}, warnings: [...] }>, warnings: [...] }
// (perDate's warnings are per-day; the top-level ones are payload-wide.)
export function parseAutoExportPayload(body) {
  const perDate = new Map();
  const warnings = [];
  const metrics = body?.data?.metrics;
  if (!Array.isArray(metrics)) return { perDate, warnings: ['no data.metrics array in payload'] };

  for (const m of metrics) {
    const novaKey = ALIAS_TO_METRIC[normalizeKey(m?.name)];
    if (!novaKey) { warnings.push(`unrecognized metric "${m?.name}" — skipped`); continue; }
    if (!Array.isArray(m.data)) continue;

    const byDate = new Map();
    for (const point of m.data) {
      const dateStr = point?.date;
      const qty = Number(point?.qty);
      if (typeof dateStr !== 'string' || dateStr.length < 10 || !Number.isFinite(qty)) continue;
      const date = dateStr.slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(qty);
    }

    for (const [date, values] of byDate) {
      let raw, sampleWarning = null;
      if (values.length === 1) {
        raw = values[0];
      } else if (ACCUMULATOR.has(novaKey)) {
        raw = values.reduce((a, b) => a + b, 0);
        sampleWarning = `${novaKey} on ${date}: ${values.length} samples summed (expected 1) — check "Summarize Data" is ON, grouped by Day`;
      } else {
        raw = values[values.length - 1];
        sampleWarning = `${novaKey} on ${date}: ${values.length} samples, used the last (expected 1) — check "Summarize Data" is ON, grouped by Day`;
      }
      const converted = convertUnit(novaKey, raw, m.units);
      if (converted == null) { warnings.push(`${novaKey} on ${date}: unrecognized unit "${m.units}" — dropped rather than guess`); continue; }
      if (!perDate.has(date)) perDate.set(date, { metrics: {}, warnings: [] });
      const entry = perDate.get(date);
      entry.metrics[novaKey] = converted;
      if (sampleWarning) entry.warnings.push(sampleWarning);
    }
  }
  return { perDate, warnings };
}
