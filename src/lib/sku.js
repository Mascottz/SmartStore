// src/lib/sku.js
// Auto-generated stock-keeping codes for products saved without one.
//
// Cashiers rarely invent SKUs by hand, so an empty code field used to stay
// empty forever and "search by SKU" had nothing to bite on. When the field is
// left blank the pages call `generateSku(name, existingSkus)` instead, which
// builds a readable code out of the product's own name plus a short random
// tail, e.g. "Peak Milk 400g" → "PEA-MIL-400G-A7F3".
import { sanitize, clamp } from './validate';

// Words of the name that go into the code. Three keeps "brand, type, size"
// readable ("PEA-MIL-400G") without turning the code into a sentence.
const WORD_LIMIT = 3;
// Letters kept from a word that has no digits in it ("PEAK" → "PEA").
const SHORT_WORD = 3;
// Random hex characters appended so two products with near-identical names
// ("Peak Milk 400g" vs "Peak Milk 450g") still get different codes.
const SUFFIX_LEN = 4;
// Matches the SKU input's maxLength and the backends' clamp — the generated
// code always fits without being cut off mid-way.
export const SKU_MAX_LEN = 50;

/** One hex character (0-9A-F). Used per character so tests can drive it. */
function randomHexChar() {
  return Math.floor(Math.random() * 16).toString(16).toUpperCase();
}

function randomSuffix(len = SUFFIX_LEN) {
  let out = '';
  while (out.length < len) out += randomHexChar();
  return out;
}

/**
 * The name-derived part of the code, without the random tail.
 *
 * - uppercased, HTML-stripped and split into words
 * - punctuation dropped ("Coca-Cola" → "COCACOLA")
 * - words with digits in them keep their size ("400G", "75CL") because the
 *   size is usually the distinguishing bit
 * - letter-only words are shortened to their first three letters
 * - at most three words, joined with hyphens, and never longer than the
 *   space left next to the random tail
 */
export function skuPrefix(name) {
  const budget = SKU_MAX_LEN - (SUFFIX_LEN + 1); // room for "-XXXX"
  const words = sanitize(String(name ?? ''))
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^A-Z0-9]+/g, ''))
    .filter(Boolean)
    .slice(0, WORD_LIMIT)
    .map((w) => (/\d/.test(w) ? w : w.slice(0, SHORT_WORD)));

  // Fit as many whole words as the length budget allows; a single word that
  // is longer than the budget on its own is simply cut to size.
  const parts = [];
  let used = 0;
  for (const w of words) {
    const extra = w.length + (parts.length > 0 ? 1 : 0);
    if (parts.length > 0 && used + extra > budget) break;
    parts.push(w);
    used += extra;
  }
  return parts.join('-').slice(0, budget);
}

/**
 * A full SKU for a product saved without one: the name prefix, a hyphen and
 * four random hex characters — "Peak Milk 400g" → "PEA-MIL-400G-A7F3".
 *
 * `existingSkus` (optional list of the store's current codes) is avoided, so
 * re-running a CSV import or double-clicking save never hands two products
 * the same code. The name is *not* required to be unique, only the tail is
 * random, so collisions are astronomically rare to begin with.
 */
export function generateSku(name, existingSkus = []) {
  const taken = new Set(
    (Array.isArray(existingSkus) ? existingSkus : [])
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
  );
  const prefix = skuPrefix(name);

  // A handful of retries settles any collision; past that the tail space is
  // exhausted in practice (16^4 codes per name) and the last candidate is
  // returned — the backends don't enforce SKU uniqueness, so this degrades
  // politely instead of throwing in the middle of a sale.
  const MAX_ATTEMPTS = 64;
  let sku = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const tail = randomSuffix();
    sku = prefix ? `${prefix}-${tail}` : tail;
    if (!taken.has(sku.toLowerCase())) return clamp(sku, SKU_MAX_LEN);
  }
  return clamp(sku, SKU_MAX_LEN);
}
