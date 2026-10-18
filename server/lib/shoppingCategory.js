import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// THE AISLE, BY CODE FIRST (18 Oct 2026). His report: "I can't add items
// unless my Claude usage is active". Every add went past a model to pick a
// category, and when his usage ran out the add failed and the item was lost.
// Sorting is the model's job only for what code cannot place: an item goes on
// the list at once, in the aisle code knows, and a model (when there is one)
// tidies only the unknowns afterwards.
//
// Two sources, in order: what HIS list has filed this name under before (the
// memory, server/data/shopping-categories.json, operational and rebuildable),
// then a plain word table. No match is an honest "unknown", never a guess.

const DATA_DIR = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const MEMORY = () => path.join(DATA_DIR(), 'shopping-categories.json');

// one word per line of thought; matched as whole words on the cleaned name
const WORDS = {
  'Produce': 'apple apples banana bananas berries blueberries strawberries raspberries grapes orange oranges lemon lemons lime limes avocado avocados tomato tomatoes cherry potato potatoes sweet onion onions garlic ginger carrot carrots broccoli cauliflower spinach lettuce cos kale cabbage capsicum pepper peppers chilli cucumber zucchini mushroom mushrooms celery corn peas beans asparagus pumpkin kiwi mango pineapple pear pears peach watermelon melon herbs parsley coriander basil mint rocket salad shallots leek beetroot eggplant',
  'Meat & Protein': 'chicken beef mince steak pork lamb bacon ham sausage sausages turkey salmon tuna fish prawns prawn shrimp tofu tempeh thigh thighs breast fillet fillets rump brisket chorizo salami jerky kangaroo veal',
  'Dairy & Eggs': 'milk eggs egg cheese cheddar mozzarella parmesan feta yoghurt yogurt butter cream sour ricotta cottage halloumi custard skyr kefir',
  'Pantry & Seasonings': 'rice pasta spaghetti noodles oats oat flour sugar salt pepper oil olive vinegar sauce soy honey peanut jam spread cereal granola muesli stock cumin paprika cinnamon oregano spice spices seasoning tinned canned chickpeas lentils tuna stock powder whey protein baking cocoa chocolate nuts almonds cashews seeds chia mayo mayonnaise mustard ketchup sriracha syrup maple coffee tea crackers chips biscuits',
  'Frozen': 'frozen ice cream icecream gelato',
  'Bakery': 'bread loaf wraps wrap tortillas tortilla bagel bagels rolls roll buns bun croissant muffins sourdough pita',
  'Beverages': 'water juice soda coke cola pepsi sprite lemonade beer wine kombucha energy drink drinks electrolyte gatorade powerade',
  'Household & Other': 'toothpaste toothbrush floss mouthwash shampoo conditioner soap bodywash deodorant razor razors tissues toilet paper towel towels detergent dishwashing dishwasher laundry bleach sponge sponges bin bags foil wrap glad cling batteries lightbulb sunscreen moisturiser lotion vitamins tablets panadol nurofen bandaids cleaner spray',
};
// a frozen or tinned thing is in that aisle whatever it is
const OVERRIDES = [['frozen', 'Frozen'], ['ice cream', 'Frozen'], ['tinned', 'Pantry & Seasonings'], ['canned', 'Pantry & Seasonings'], ['protein powder', 'Pantry & Seasonings'], ['toilet paper', 'Household & Other'], ['paper towel', 'Household & Other'],
  ['peanut butter', 'Pantry & Seasonings'], ['almond butter', 'Pantry & Seasonings'], ['black pepper', 'Pantry & Seasonings'], ['coconut milk', 'Pantry & Seasonings'], ['protein bar', 'Pantry & Seasonings']];

const INDEX = (() => {
  const m = new Map();
  for (const [cat, words] of Object.entries(WORDS)) for (const w of words.split(/\s+/)) if (!m.has(w)) m.set(w, cat);
  return m;
})();

export const keyOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// { category, sure, from } — `sure` false means code could not place it
export function guessCategory(name, memory = {}) {
  const k = keyOf(name);
  if (!k) return { category: null, sure: false, from: null };
  if (memory[k]) return { category: memory[k], sure: true, from: 'memory' };
  for (const [phrase, cat] of OVERRIDES) if (k.includes(phrase)) return { category: cat, sure: true, from: 'words' };
  // the LAST food word decides: "chicken stock" is stock, "peanut butter" is a spread
  const words = k.split(' ');
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    const hit = INDEX.get(w) || (w.endsWith('s') ? INDEX.get(w.slice(0, -1)) : null);
    if (hit) return { category: hit, sure: true, from: 'words' };
  }
  return { category: null, sure: false, from: null };
}

export async function loadCategoryMemory() {
  try { return JSON.parse(await readFile(MEMORY(), 'utf8')) || {}; } catch { return {}; }
}

// remember where a name was filed (by a model, or by him moving it)
export async function rememberCategories(pairs) {
  const mem = await loadCategoryMemory();
  let changed = false;
  for (const { name, category } of pairs || []) {
    const k = keyOf(name);
    if (!k || !category || mem[k] === category) continue;
    mem[k] = category;
    changed = true;
  }
  if (!changed) return mem;
  await mkdir(DATA_DIR(), { recursive: true });
  await writeFile(MEMORY(), JSON.stringify(mem, null, 2), 'utf8');
  return mem;
}
