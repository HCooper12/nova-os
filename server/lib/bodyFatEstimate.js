// A BODY FAT ESTIMATE WITHOUT A SCAN (26 Oct 2026, his ask). He has no smart
// scale and no DEXA, so Katch-McArdle needs an honest estimate, given as a
// RANGE, from the sources he named and the methods professionals use:
//
//   1. THE VISUAL GUIDE: ATHLEAN-X, "Body Fat Percentage Men" (the guide the
//      Protocols book points to: learn.athleanx.com/articles/body-fat-
//      percentage-men). Its bands and what each looks like, paraphrased. The
//      photos stay on their page; Nova links to them instead of copying them.
//      The guide itself says fat sits differently from man to man and with
//      age, so a band is a range, not a reading.
//   2. THE US NAVY TAPE METHOD: Hodgdon & Beckett 1984 (Naval Health Research
//      Center report 84-11), still the US military's field method. Neck and
//      waist (and hips for women) with height. Error against underwater
//      weighing: 2.7 points in cross-validation, 3.5 in development. We use
//      ±3.5 points, the larger of the two.
//   3. RELATIVE FAT MASS: Woolcott & Bergman 2018 (Scientific Reports),
//      64 − 20 × height ÷ waist (+12 for women), built and checked against
//      DXA in NHANES. It needs only a waist, so it is a cross-check.
//
// Code, no model: each method gives a range, and the estimate is where the
// ranges agree (the overlap), or the span of all of them with a line saying
// they disagree. The middle of the range feeds Katch-McArdle, and the range
// rides along so the plan can print what the uncertainty is worth in kcal.

export const GUIDE_URL = 'https://learn.athleanx.com/articles/body-fat-percentage-men';
export const NAVY_SEE = 3.5;

// The guide's bands for men, as it names them (it has no 31–34% band)
export const VISUAL_BANDS = [
  { id: '1-4', lo: 1, hi: 4, look: 'Extreme definition, striations and veins everywhere. Even pro bodybuilders cannot hold it for long.' },
  { id: '5-7', lo: 5, hi: 7, look: 'Very defined, some veins; striations less sharp than 1–4%.' },
  { id: '8-10', lo: 8, hi: 10, look: 'All three rows of abs clearly visible; some veins and striations in places.' },
  { id: '11-12', lo: 11, hi: 12, look: 'Some ab definition, mostly in bright light.' },
  { id: '13-15', lo: 13, hi: 15, look: 'Looks lean, but the abs are not clearly visible.' },
  { id: '16-19', lo: 16, hi: 19, look: 'Less ab definition, love handles may show, no visible veins.' },
  { id: '20-24', lo: 20, hi: 24, look: 'Definition fading, some belly overhang possible.' },
  { id: '25-30', lo: 25, hi: 30, look: 'Little definition, rounder build. The guide marks 25% as obesity in men.' },
  { id: '35-40', lo: 35, hi: 40, look: 'Little to no definition visible.' },
];

const r1 = (n) => Math.round(n * 10) / 10;

// US Navy, metric form (cm). Men: neck and waist at the navel. Women add hips.
export function navyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm }) {
  const h = Number(heightCm), w = Number(waistCm), n = Number(neckCm), hip = Number(hipCm);
  if (![h, w, n].every((x) => Number.isFinite(x) && x > 0)) return null;
  let v;
  if (sex === 'female') {
    if (!(Number.isFinite(hip) && hip > 0) || w + hip - n <= 0) return null;
    v = 495 / (1.29579 - 0.35004 * Math.log10(w + hip - n) + 0.221 * Math.log10(h)) - 450;
  } else {
    if (w - n <= 0) return null;
    v = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450;
  }
  return Number.isFinite(v) && v > 2 && v < 60 ? r1(v) : null;
}

// Relative fat mass (Woolcott & Bergman 2018)
export function relativeFatMass({ sex, heightCm, waistCm }) {
  const h = Number(heightCm), w = Number(waistCm);
  if (!(h > 0 && w > 0)) return null;
  const v = 64 - 20 * (h / w) + (sex === 'female' ? 12 : 0);
  return v > 2 && v < 60 ? r1(v) : null;
}

// Every method he gave → one range, its middle, and the lines that show why.
export function estimateBodyFat({ sex, heightCm, bandId, waistCm, neckCm, hipCm }) {
  const ranges = [];
  const lines = [];
  const band = VISUAL_BANDS.find((b) => b.id === bandId);
  if (band) {
    ranges.push({ method: 'visual', lo: band.lo, hi: band.hi });
    lines.push(`Visual guide (ATHLEAN-X): ${band.lo}–${band.hi}%, "${band.look}"`);
  }
  const navy = navyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm });
  if (navy != null) {
    ranges.push({ method: 'navy', lo: r1(Math.max(2, navy - NAVY_SEE)), hi: r1(navy + NAVY_SEE) });
    lines.push(`US Navy tape method: ${navy}% (waist ${waistCm} cm, neck ${neckCm} cm${sex === 'female' ? `, hips ${hipCm} cm` : ''}), ±${NAVY_SEE} points = ${r1(Math.max(2, navy - NAVY_SEE))}–${r1(navy + NAVY_SEE)}%`);
  }
  const rfm = relativeFatMass({ sex, heightCm, waistCm });
  if (rfm != null) lines.push(`Relative fat mass (height ÷ waist): ${rfm}%, as a cross-check`);
  if (!ranges.length) {
    return rfm != null
      ? { lo: r1(rfm - NAVY_SEE), hi: r1(rfm + NAVY_SEE), pct: rfm, method: 'rfm', lines: [...lines, `Only a waist was given, so the range is relative fat mass ±${NAVY_SEE} points. Add your neck for the Navy method.`] }
      : null;
  }
  let lo = Math.max(...ranges.map((x) => x.lo)), hi = Math.min(...ranges.map((x) => x.hi));
  let agree = true;
  if (lo > hi) {
    // the methods do not overlap: the honest range is all of them
    agree = false;
    lo = Math.min(...ranges.map((x) => x.lo));
    hi = Math.max(...ranges.map((x) => x.hi));
  }
  const pct = r1((lo + hi) / 2);
  if (ranges.length > 1) lines.push(agree ? `They agree on ${lo}–${hi}%.` : `They do not agree, so the range spans both: ${lo}–${hi}%. A measured scan would settle it.`);
  if (rfm != null && (rfm < lo - 2 || rfm > hi + 2)) lines.push(`Relative fat mass sits outside that range. Worth re-measuring your waist at the navel.`);
  return { lo, hi, pct, agree, method: ranges.map((x) => x.method).join('+'), navy, rfm, lines };
}

// a typed range ("15-20", "15 to 20", "about 18") → { lo, hi, pct } or null
export function parseRange(text) {
  const raw = String(text || '').toLowerCase();
  const m = raw.match(/(\d{1,2}(?:\.\d)?)\s*(?:%\s*)?(?:-|–|to|and)\s*(\d{1,2}(?:\.\d)?)/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo >= 3 && hi <= 60) return { lo, hi, pct: r1((lo + hi) / 2) };
  }
  return null;
}
