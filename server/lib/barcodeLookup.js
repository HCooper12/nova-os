// Open Food Facts is a free, no-auth-required public product database —
// good coverage for packaged foods by UPC/EAN barcode. Their usage policy
// asks API consumers to identify themselves with a descriptive User-Agent.
const OFF_URL = (code) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,serving_size`;
const USER_AGENT = 'NovaOS-Personal/1.0 (single-user personal app)';

export async function lookupBarcode(code) {
  const res = await fetch(OFF_URL(code), { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`lookup failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const n = data.product.nutriments || {};
  const hasServing = [n.proteins_serving, n.carbohydrates_serving, n.fat_serving, n['energy-kcal_serving']].every((v) => v != null);
  const basis = hasServing ? (data.product.serving_size ? `per serving, ${data.product.serving_size}` : 'per serving') : 'per 100g';
  const raw = hasServing
    ? { p: n.proteins_serving, c: n.carbohydrates_serving, f: n.fat_serving, kcal: n['energy-kcal_serving'] }
    : { p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0, kcal: n['energy-kcal_100g'] || 0 };

  return {
    name: `${data.product.product_name || 'Unknown product'} (${basis})`,
    macros: {
      p: Math.round(raw.p * 10) / 10,
      c: Math.round(raw.c * 10) / 10,
      f: Math.round(raw.f * 10) / 10,
      kcal: Math.round(raw.kcal),
    },
  };
}
