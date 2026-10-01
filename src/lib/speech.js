// src/lib/speech.js
// Spoken replies for StoreSense.
//
// This is the *output* half of voice only: StoreSense can read its answer
// aloud. There is no microphone, no speech recognition and no new
// permission prompt anywhere in the app.
//
// Everything here runs on the browser's built-in `speechSynthesis`, which
// is on-device, free, needs no API key and no network round-trip. That
// matters for SmartStore specifically: the assistant already answers
// offline through `localReply()` in src/lib/assistant.js, and spoken
// replies keep working in exactly the same places, including demo mode and
// a store with no data connection.

/** The longest text we will hand to the speech engine in one go. */
const MAX_SPOKEN_CHARS = 1000;

/**
 * How many catalogue rows feed the spoken vocabulary. A big supermarket
 * can hold thousands of products; the codes actually named in a 90-word
 * answer are a handful, and the cap keeps the lookup cheap.
 */
const MAX_CATALOGUE = 2000;

const STORAGE_PREFIX = 'smartstore-storesense-voice:';

/**
 * Preferred voice languages, best first.
 *
 * Nigerian English first when the device happens to ship it (some Android
 * builds do), then other English variants. We never force a language the
 * device does not have; `pickVoice` falls back to the engine default.
 */
const VOICE_PREFERENCES = ['en-NG', 'en-GB', 'en-US', 'en'];

/** Is reading answers aloud possible in this browser? SSR/jsdom safe. */
export function isSpeechOutputSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Pack and measure suffixes as they are written on a shelf label.
 *
 * Nigerian catalogue names carry these constantly - "Peak Milk 400g",
 * "Coca-Cola 50cl", "Golden Penny Semovita 1kg" - and every speech engine
 * reads the bare suffix as a letter ("four hundred gee"). Longest first,
 * so "50cl" is not matched as "l".
 */
const UNIT_WORDS = [
  ['kg', 'kilogram', 'kilograms'],
  ['mg', 'milligram', 'milligrams'],
  ['ml', 'millilitre', 'millilitres'],
  ['cl', 'centilitre', 'centilitres'],
  ['cm', 'centimetre', 'centimetres'],
  ['pcs', 'piece', 'pieces'],
  ['pkt', 'packet', 'packets'],
  ['pc', 'piece', 'pieces'],
  ['pk', 'pack', 'packs'],
  ['g', 'gram', 'grams'],
  ['l', 'litre', 'litres'],
];

const UNIT_PATTERN = new RegExp(
  `\\b(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS.map(([abbr]) => abbr).join('|')})\\b`,
  'gi'
);

/**
 * Spell a product code out so it can be written down.
 *
 * "PK-400" becomes "P K, 4 0 0". Digits are read individually because a
 * code is a sequence, not a quantity: "four hundred" is the wrong thing to
 * copy onto a restock list.
 */
function spellCode(code) {
  return String(code)
    .split('-')
    .filter(Boolean)
    .map((part) => part.split('').join(' '))
    .join(', ');
}

/**
 * Say a store's name the way its owner would say it.
 *
 * A shop name is the one piece of text in the app that is pure identity,
 * and speech engines mangle the shapes Nigerian shops actually use:
 * "J&J" is read as "J J", "Ltd" as a word, and an initials prefix like
 * "KM Supermart" as "kim". A plain name such as "Crown Jewel Supermarket"
 * is already correct and is left exactly as it is.
 *
 * @param {string} name the store name as the owner typed it
 * @returns {string} the same name, phrased for a speech engine
 */
export function spokenStoreName(name) {
  let out = String(name || '').trim();
  if (!out) return '';

  out = out.replace(/\s*&\s*/g, ' and ');
  out = out.replace(/\bLtd\.?/gi, 'Limited');
  out = out.replace(/\bPLC\b/gi, 'P L C');
  out = out.replace(/\bInt['\u2019]?l\.?/gi, 'International');
  out = out.replace(/\bNig\./gi, 'Nigeria');

  // Initials like the "KM" in "KM Supermart" are spelled; a name that is
  // simply written in capitals is shouting, not initials, so it is left.
  if (out !== out.toUpperCase()) {
    out = out.replace(/\b([A-Z]{2,4})\b/g, (match) => match.split('').join(' '));
  }

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Describe the store whose answers are being read aloud.
 *
 * Without this the spoken replies are store-blind: StoreSense knows the
 * app's own vocabulary but not whose shop it is talking about. The store
 * name is the main thing it carries, so an answer can be addressed to
 * "Crown Jewel Supermarket" and pronounced the way its owner says it.
 *
 * The catalogue is carried too, because passing the real product codes is
 * what makes code spelling safe: a shape-matching regex cannot tell the
 * SKU "PK-400" from "COVID-19", but an exact lookup against this store's
 * own codes can.
 *
 * @param {{ storeName?: string, niche?: object, products?: Array }} store
 */
export function buildSpeechContext({ storeName = '', niche = null, products = [] } = {}) {
  const skus = new Set();
  const list = Array.isArray(products) ? products.slice(0, MAX_CATALOGUE) : [];
  list.forEach((product) => {
    const sku = String(product?.sku || '').trim();
    // Single characters are not codes, and spelling them helps nobody.
    if (sku.length >= 2) skus.add(sku.toUpperCase());
  });

  const name = String(storeName || '').trim();
  return {
    storeName: name,
    spokenStoreName: spokenStoreName(name),
    skus,
    // Kept for callers that want the niche's own word for a catalogue row.
    itemNoun: niche?.itemNoun || 'Product',
  };
}

/**
 * Terms that are written for the eye but wrong for the ear.
 *
 * "Open POS Register" must not be read as "open poss register", and an
 * assistant answer that mentions SKUs should say something a shop owner
 * recognises out loud rather than spelling an acronym at them.
 */
const SPOKEN_TERMS = [
  [/\bPOS\/Card\b/g, 'P O S or card'],
  [/\bPOS\b/g, 'P O S'],
  [/\bSKUs\b/g, 'product codes'],
  [/\bSKU\b/g, 'product code'],
  [/\bCSV\b/g, 'C S V'],
  [/\bAI\b/g, 'A I'],
];

/**
 * Turn an assistant answer into something a speech engine reads correctly.
 *
 * The answers in src/lib/assistant.js are built for the screen: every
 * amount goes through a `money()` helper that prefixes a naira sign, the
 * top-seller list is joined with a middle dot, and the copy uses curly
 * apostrophes. Speech engines handle none of those well - "₦12,400" is
 * read as a bare number, silence, or the symbol's name depending on the
 * platform, and "·" is either skipped or announced.
 *
 * Answers from the Gemini endpoint are free-form, so this also strips the
 * markdown emphasis and emoji a model sometimes adds.
 *
 * Pass a context from `buildSpeechContext()` to make it aware of the store
 * being discussed: its product codes get spelled out instead of read as
 * words, and its name is pronounced properly. Nothing here changes what
 * the answer *says*, only how it sounds - the screen stays the source of
 * truth and the two never disagree on a number.
 *
 * @param {string} text an assistant answer as it appears on screen
 * @param {object} [context] from buildSpeechContext(); omit for generic speech
 * @returns {string} the same answer, phrased for a speech engine
 */
export function speakableText(text, context = null) {
  let out = String(text ?? '');
  if (!out.trim()) return '';

  // Markdown the model may add: **bold**, *italics*, `code`, # headings.
  out = out
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_]/g, '');

  // Emoji and pictographs are announced by name on some engines. These are
  // alternatives rather than a character class so the skin-tone modifiers
  // are matched on their own instead of as part of a grapheme range.
  out = out.replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F/gu, ' ');

  // Currency: "₦12,400" -> "12400 naira", "₦-500" -> "minus 500 naira".
  // Group separators are removed because reading "12,400" aloud is not
  // reliable across engines, while "12400" always becomes "twelve
  // thousand four hundred".
  out = out.replace(/₦\s*(-?)([\d,]*\d(?:\.\d+)?)/g, (_match, sign, digits) => {
    const plain = digits.replace(/,/g, '');
    return `${sign ? 'minus ' : ''}${plain} naira`;
  });
  // Any naira sign left over had no number attached to it.
  out = out.replace(/₦/g, ' naira ');

  out = out.replace(/(\d)\s*%/g, '$1 percent').replace(/%/g, ' percent');

  // This store's own product codes, spelled so they can be written down.
  // Only exact matches against the catalogue are touched, so ordinary
  // letter-and-digit words are never mistaken for a code. This runs before
  // units expand, or the "400G" inside a generated code like
  // "PEA-MIL-400G-A7F3" would be read as a weight.
  // A spelled code is parked behind a placeholder while the rest of the
  // text is processed, then put back. Without that, the "400G" inside a
  // generated code like "PEA-MIL-400G-A7F3" spells to "4 0 0 G" and the
  // unit pass below turns its tail into "0 grams". The marker is a
  // private-use character, which cannot occur in an assistant answer.
  const parked = [];
  const skus = context?.skus;
  if (skus?.size) {
    out = out.replace(
      /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g,
      (token) => {
        if (!skus.has(token.toUpperCase())) return token;
        parked.push(spellCode(token));
        return `\uE000${parked.length - 1}\uE000`;
      }
    );
  }

  // Shelf-label units in the store's product names: "400g" -> "400 grams".
  out = out.replace(UNIT_PATTERN, (match, amount, abbr) => {
    const entry = UNIT_WORDS.find(([key]) => key === abbr.toLowerCase());
    if (!entry) return match;
    const [, singular, plural] = entry;
    return `${amount} ${Number(amount) === 1 ? singular : plural}`;
  });

  // The store's own name, when it carries an acronym ("KM Stores").
  if (context?.storeName && context.spokenStoreName !== context.storeName) {
    out = out.split(context.storeName).join(context.spokenStoreName);
  }

  SPOKEN_TERMS.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });

  // Typographic punctuation -> plain equivalents, and list separators ->
  // a sentence break so the engine pauses instead of running items together.
  out = out
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*[·•]\s*/g, '. ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*\|\s*/g, '. ');

  out = out.replace(/\s+/g, ' ').trim();

  // Put the spelled product codes back now everything else is settled.
  if (parked.length) {
    out = out.replace(/\uE000(\d+)\uE000/g, (match, index) => parked[Number(index)] ?? match);
  }

  if (out.length > MAX_SPOKEN_CHARS) {
    // Cut on a sentence boundary where possible so a trimmed answer does
    // not stop mid-word.
    const clipped = out.slice(0, MAX_SPOKEN_CHARS);
    const lastStop = clipped.lastIndexOf('. ');
    out = lastStop > MAX_SPOKEN_CHARS / 2 ? clipped.slice(0, lastStop + 1) : clipped;
  }

  return out;
}

/**
 * Choose the closest English voice the device actually has installed.
 *
 * @param {Array<{lang?: string, name?: string, default?: boolean}>} voices
 * @returns {object|null} null means "let the engine use its default"
 */
export function pickVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const normalised = voices.filter((voice) => voice && typeof voice.lang === 'string');

  for (const preference of VOICE_PREFERENCES) {
    const exact = normalised.find(
      (voice) => voice.lang.toLowerCase().replace('_', '-') === preference.toLowerCase()
    );
    if (exact) return exact;
  }
  // Any English voice beats a non-English default.
  return normalised.find((voice) => voice.lang.toLowerCase().startsWith('en')) || null;
}

/** Whether this account wants spoken replies, remembered per device. */
export function readStoredVoicePref(userId) {
  if (!userId || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_PREFIX + userId) === 'on';
  } catch {
    return false;
  }
}

/** Persist the spoken-replies choice for this account on this device. */
export function writeStoredVoicePref(userId, enabled) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, enabled ? 'on' : 'off');
  } catch {
    // storage unavailable (private mode): the choice lives only in memory
  }
}

/** Stop anything currently being spoken. Safe to call at any time. */
export function cancelSpeech() {
  if (!isSpeechOutputSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // some engines throw when cancelling an empty queue
  }
}

/**
 * Read `text` aloud, replacing whatever was being said before.
 *
 * @param {string} text raw answer text (normalised here, callers pass it as-is)
 * @param {{ onEnd?: () => void, onError?: () => void, context?: object }} [options]
 * @returns {boolean} false when nothing could be spoken
 */
export function speak(text, { onEnd, onError, context = null } = {}) {
  if (!isSpeechOutputSupported()) return false;

  const spoken = speakableText(text, context);
  if (!spoken) return false;

  cancelSpeech();

  try {
    const utterance = new window.SpeechSynthesisUtterance(spoken);
    const voice = pickVoice(window.speechSynthesis.getVoices?.() || []);
    if (voice) {
      utterance.voice = voice;
      if (voice.lang) utterance.lang = voice.lang;
    }
    // Slightly under default: store numbers read aloud are easier to follow.
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => (onError || onEnd)?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    onError?.();
    return false;
  }
}
