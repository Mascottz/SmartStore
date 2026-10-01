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
 * @param {string} text an assistant answer as it appears on screen
 * @returns {string} the same answer, phrased for a speech engine
 */
export function speakableText(text) {
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
 * @param {{ onEnd?: () => void, onError?: () => void }} [handlers]
 * @returns {boolean} false when nothing could be spoken
 */
export function speak(text, { onEnd, onError } = {}) {
  if (!isSpeechOutputSupported()) return false;

  const spoken = speakableText(text);
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
