// THE FUEL PICTURE, FOR AGENTS THAT ADVISE HIM.
//
// His instruction, 7 Sep 2026: "Coach should also be an expert when it comes
// to nutrition and the Fuel platform." Until now the Coach saw nutrition only
// as AGGREGATES — protein floor hit 3/7, average 88g — which is enough to
// diagnose a miss and useless for fixing one. It could not see what he
// actually plans to eat today, what is cooked and waiting in the fridge, or
// what is in his recipe collection, so it could never say "your rotation is
// 40g short — swap the snack for the yoghurt pouch you already have".
//
// This is the deterministic half: real numbers from the real files, no model.
// Kept compact deliberately — it rides inside a prompt that already carries
// training, health and history.

import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { getPortions } from './portions.js';
import { getToday, totalsOf } from './foodLog.js';

const g = (n) => Math.round(Number(n) || 0);
const macroLine = (m = {}) => `${g(m.p)}P · ${g(m.c)}C · ${g(m.f)}F · ${g(m.kcal)} kcal`;

export async function fuelContext(vaultPath) {
  const { recipes, profile } = await loadRecipeData(vaultPath);
  const rotation = await loadRotation(vaultPath, recipes);
  const day = await getToday();
  const logged = totalsOf(day.entries || []);
  const portions = await getPortions(vaultPath).catch(() => ({}));

  const lines = ['FUEL — his actual eating system (Nova\'s Fuel screen, backed by his vault):'];

  if (profile) {
    const target = profile.targetKcal ? `${profile.targetKcal} kcal` : 'no calorie target set';
    const floor = profile.proteinFloorG ? `${profile.proteinFloorG}g protein floor` : 'no protein floor set';
    lines.push(`- Targets: ${target} · ${floor}${profile.goal ? ` · goal: ${profile.goal}` : ''}`);
  } else {
    lines.push('- Targets: NONE SET — his About You profile is empty, so any calorie or protein number you use is your own assumption. Say so if it matters.');
  }

  // today's plan, dish by dish: what is in focus, what he has ticked
  const slotLines = [];
  for (const key of rotation.order || []) {
    const dishes = rotation.options?.[key] || [];
    if (!dishes.length) continue;
    const label = rotation.labels?.[key] || key;
    const parts = dishes.map((d) => {
      const marks = [d.focus ? '★' : null, d.eaten ? '✓ eaten' : null].filter(Boolean).join(' ');
      const fridge = d.portionsLeft == null ? '' : d.out ? ', NONE COOKED' : `, ${d.portionsLeft} cooked`;
      return `${d.name}${marks ? ` (${marks})` : ''} [${macroLine(d.macros)}${fridge}]`;
    });
    slotLines.push(`  · ${label}: ${parts.join(' / ')}`);
  }
  if (slotLines.length) {
    lines.push(`- Today's rotation (★ = the one that counts toward the plan; ✓ = ticked eaten):`);
    lines.push(...slotLines);
    lines.push(`- Rotation as planned: ${macroLine(rotation.totals)} · eaten so far from it: ${macroLine(rotation.consumedTotals)}`);
  } else {
    lines.push('- Today\'s rotation is empty — nothing is planned.');
  }

  lines.push(`- Logged today (everything, rotation + off-plan): ${macroLine(logged)} across ${(day.entries || []).length} entr${(day.entries || []).length === 1 ? 'y' : 'ies'}`);

  const counted = Object.entries(portions.counts || portions || {}).filter(([, n]) => typeof n === 'number');
  if (counted.length) {
    const byId = new Map(recipes.map((r) => [r.id, r.name]));
    lines.push(`- In the fridge (cooked portions he has counted): ${counted.map(([id, n]) => `${byId.get(id) || id} × ${n}`).join(' · ')}`);
  }

  // the collection itself — what he can actually reach for tonight
  const byCat = new Map();
  for (const r of recipes) {
    const cat = r.category || 'Other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(`${r.name} (${g(r.macros?.p)}P/${g(r.macros?.kcal)})`);
  }
  const cats = [...byCat.entries()].map(([cat, names]) => `  · ${cat}: ${names.slice(0, 14).join(', ')}${names.length > 14 ? `, +${names.length - 14} more` : ''}`);
  if (cats.length) {
    lines.push(`- His recipe collection (${recipes.length} dishes he actually cooks — name these, never invent one):`);
    lines.push(...cats);
  }

  lines.push('You are as much his nutrition coach as his training coach: the two are one system. When training advice has a fuel consequence (or the reverse), say it, and name a real dish from the collection above rather than a generic food.');
  return lines.join('\n');
}
