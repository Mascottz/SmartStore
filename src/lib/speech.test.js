// StoreSense spoken replies.
//
// The assistant's answers are written for the screen (naira signs, middle
// dots, curly apostrophes, the odd acronym). These tests pin down the
// translation into something a speech engine reads correctly, because a
// wrong number read aloud is worse than no audio at all.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildSpeechContext,
  isSpeechOutputSupported,
  pickVoice,
  readStoredVoicePref,
  speak,
  speakableText,
  spokenStoreName,
  writeStoredVoicePref,
} from './speech';
import { localReply } from './assistant';
import { generateSku } from './sku';

beforeEach(() => {
  globalThis.__resetSpeech?.();
  localStorage.clear();
});

describe('speakableText: money', () => {
  it('reads naira amounts as words, without the symbol', () => {
    expect(speakableText('Today you made ₦12,400.')).toBe(
      'Today you made 12400 naira.'
    );
  });

  it('keeps a negative balance understandable', () => {
    // money() renders a loss as "₦-3,000"; "minus" must survive.
    expect(speakableText('That leaves ₦-3,000 before cost of goods.')).toBe(
      'That leaves minus 3000 naira before cost of goods.'
    );
  });

  it('handles kobo and a bare symbol', () => {
    expect(speakableText('₦1,250.50 owed')).toBe('1250.50 naira owed');
    expect(speakableText('amounts are in ₦')).toBe('amounts are in naira');
  });

  it('reads zero rather than dropping it', () => {
    expect(speakableText('Outstanding: ₦0.')).toBe('Outstanding: 0 naira.');
  });
});

describe('speakableText: punctuation and terms', () => {
  it('turns the top-seller middle dot into a sentence break', () => {
    expect(speakableText('1. Peak Milk (12 sold) · 2. Indomie (9 sold)')).toBe(
      '1. Peak Milk (12 sold). 2. Indomie (9 sold)'
    );
  });

  it('spells out POS and avoids reading it as a word', () => {
    expect(speakableText('Open POS Register')).toBe('Open P O S Register');
    expect(speakableText('choose Cash, Transfer, POS/Card')).toBe(
      'choose Cash, Transfer, P O S or card'
    );
  });

  it('says product codes instead of spelling SKU', () => {
    expect(speakableText('arrange names and generated SKUs')).toBe(
      'arrange names and generated product codes'
    );
  });

  it('normalises curly apostrophes', () => {
    expect(speakableText('Your stock looks healthy; I\u2019d review these.')).toBe(
      "Your stock looks healthy; I'd review these."
    );
  });

  it('reads percentages', () => {
    expect(speakableText('margin of 32%')).toBe('margin of 32 percent');
  });
});

describe('speakableText: free-form model output', () => {
  it('strips markdown the Gemini endpoint may add', () => {
    expect(speakableText('**Sales** are _up_ today. `check reports`')).toBe(
      'Sales are up today. check reports'
    );
  });

  it('drops emoji rather than letting them be announced', () => {
    expect(speakableText('Stock is low 🚨 on 3 items')).toBe('Stock is low on 3 items');
  });

  it('collapses the whitespace left behind', () => {
    expect(speakableText('  too    many\n\nspaces ')).toBe('too many spaces');
  });

  it('returns nothing for empty input', () => {
    expect(speakableText('')).toBe('');
    expect(speakableText(null)).toBe('');
    expect(speakableText(undefined)).toBe('');
  });

  it('caps a runaway answer on a sentence boundary', () => {
    const long = `${'This is a sentence. '.repeat(100)}`;
    const out = speakableText(long);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out.endsWith('.')).toBe(true);
  });
});

describe('speakableText: real assistant answers', () => {
  // The point of the normaliser is the strings assistant.js actually
  // produces, so drive it with the real thing rather than fixtures.
  const context = {
    storeName: 'Ada Stores',
    today: { sales: 3, revenue: 12400 },
    last7Days: { sales: 20, revenue: 150000 },
    thisMonth: { sales: 50, revenue: 400000, expenses: 90000 },
    catalogue: { items: 10, trackStock: true, lowStockCount: 2, lowStock: [
      { name: 'Peak Milk 400g', quantity: 4 },
      { name: 'Indomie', quantity: 9 },
    ] },
    topSellers: [
      { name: 'Peak Milk 400g', units: 12, revenue: 9000 },
      { name: 'Indomie', units: 9, revenue: 4000 },
    ],
    creditBook: { openAccounts: 2, outstanding: 7500, paymentsRecorded: 1 },
  };

  it('leaves no naira sign in a sales answer', () => {
    const spoken = speakableText(localReply('How are sales today?', context).answer);
    expect(spoken).not.toMatch(/₦/);
    expect(spoken).toContain('12400 naira');
    expect(spoken).toContain('150000 naira');
  });

  it('leaves no naira sign or middle dot in a credit or top-seller answer', () => {
    const credit = speakableText(localReply('How much credit is open?', context).answer);
    expect(credit).not.toMatch(/₦/);
    expect(credit).toContain('7500 naira');

    const top = speakableText(localReply('What is selling best?', context).answer);
    expect(top).not.toMatch(/[₦·]/);
  });
});

describe('store-aware speech: shelf units', () => {
  // Nigerian catalogue names are full of pack sizes, and a bare suffix is
  // read as a letter ("four hundred gee") by every engine.
  it('expands the units in a real catalogue name', () => {
    expect(speakableText('Peak Milk 400g')).toBe('Peak Milk 400 grams');
    expect(speakableText('Coca-Cola 50cl')).toBe('Coca-Cola 50 centilitres');
    expect(speakableText('Eva Water 75cl')).toBe('Eva Water 75 centilitres');
    expect(speakableText('Ariel Detergent 900g')).toBe('Ariel Detergent 900 grams');
  });

  it('keeps a single unit singular', () => {
    expect(speakableText('Golden Penny Semovita 1kg')).toBe(
      'Golden Penny Semovita 1 kilogram'
    );
    expect(speakableText('Bottled Water 1L')).toBe('Bottled Water 1 litre');
    expect(speakableText('Rice 5kg')).toBe('Rice 5 kilograms');
  });

  it('handles the longer suffixes without mistaking them for shorter ones', () => {
    // "50cl" must not be read as litres, and "12pcs" not as "pc".
    expect(speakableText('Juice 50cl and Syrup 100ml')).toBe(
      'Juice 50 centilitres and Syrup 100 millilitres'
    );
    expect(speakableText('Biro 12pcs, Water 6pk')).toBe(
      'Biro 12 pieces, Water 6 packs'
    );
  });

  it('leaves ordinary counts alone', () => {
    expect(speakableText('Peak Milk (4 left)')).toBe('Peak Milk (4 left)');
    expect(speakableText('12 sold across 3 sales')).toBe('12 sold across 3 sales');
  });
});

describe('store-aware speech: this store\u2019s product codes', () => {
  const context = buildSpeechContext({
    storeName: 'Demo Supermart',
    niche: { itemNoun: 'Product' },
    products: [
      { name: 'Peak Milk 400g', sku: 'PK-400' },
      { name: 'Golden Penny Semovita 1kg', sku: 'GP-SEM1' },
    ],
  });

  it('spells a code out so it can be written down', () => {
    expect(speakableText('The SKU is PK-400.', context)).toBe(
      'The product code is P K, 4 0 0.'
    );
  });

  it('reads code digits one by one, not as a quantity', () => {
    // "GP-SEM1" is a sequence to copy down, not "gee pee sem one".
    expect(speakableText('Use GP-SEM1', context)).toBe('Use G P, S E M 1');
  });

  it('only touches codes this store actually has', () => {
    // A shape-matching regex cannot tell a SKU from these; an exact
    // lookup against the real catalogue can.
    const text = 'COVID-19 kits, ISO-9001 and PK-400';
    expect(speakableText(text, context)).toBe(
      'COVID-19 kits, ISO-9001 and P K, 4 0 0'
    );
  });

  it('keeps a generated code intact instead of reading part of it as a weight', () => {
    // generateSku('Peak Milk 400g') produces a "400G" group; spelling it
    // must not then be expanded into grams.
    const sku = generateSku('Peak Milk 400g', []);
    expect(sku).toMatch(/^PEA-MIL-400G-[0-9A-F]{4}$/);

    const withSku = buildSpeechContext({ products: [{ name: 'Peak Milk 400g', sku }] });
    const spoken = speakableText(`Saved as ${sku}.`, withSku);

    expect(spoken).not.toMatch(/gram/);
    expect(spoken).toContain('P E A, M I L, 4 0 0 G,');
  });

  it('is unchanged when the store has no codes yet', () => {
    const empty = buildSpeechContext({ products: [] });
    expect(speakableText('The SKU is PK-400.', empty)).toBe(
      'The product code is PK-400.'
    );
    // And with no context at all, speech still works generically.
    expect(speakableText('The SKU is PK-400.')).toBe('The product code is PK-400.');
  });

  it('ignores a one-character code, which is not worth spelling', () => {
    const context1 = buildSpeechContext({ products: [{ name: 'Bag', sku: 'A' }] });
    expect(context1.skus.has('A')).toBe(false);
  });
});

describe('knowing the store name', () => {
  it('leaves an ordinary shop name exactly as the owner typed it', () => {
    // The common case: nothing to fix, so nothing is touched.
    expect(spokenStoreName('Crown Jewel Supermarket')).toBe('Crown Jewel Supermarket');
    expect(spokenStoreName('Ada Stores')).toBe('Ada Stores');
    expect(spokenStoreName('Mama T Place')).toBe('Mama T Place');
  });

  it('spells an initials prefix instead of reading it as a word', () => {
    expect(spokenStoreName('KM Supermart')).toBe('K M Supermart');
    expect(spokenStoreName('ABC Ventures')).toBe('A B C Ventures');
  });

  it('reads the ampersand Nigerian shop names are full of', () => {
    expect(spokenStoreName('J&J Minimart')).toBe('J and J Minimart');
    expect(spokenStoreName('Chidi & Sons Enterprises')).toBe('Chidi and Sons Enterprises');
  });

  it('expands the usual business suffixes', () => {
    expect(spokenStoreName('ABC Ventures Ltd')).toBe('A B C Ventures Limited');
    expect(spokenStoreName('Zenith PLC')).toBe('Zenith P L C');
    expect(spokenStoreName('RC Pharmacy Nig.')).toBe('R C Pharmacy Nigeria');
  });

  it('treats an all-caps name as shouting, not as initials', () => {
    // "ADA STORES" spelled letter by letter would be unbearable.
    expect(spokenStoreName('ADA STORES')).toBe('ADA STORES');
  });

  it('copes with a missing name', () => {
    expect(spokenStoreName('')).toBe('');
    expect(spokenStoreName(null)).toBe('');
    expect(spokenStoreName(undefined)).toBe('');
  });

  it('uses the name wherever it appears in an answer', () => {
    const context = buildSpeechContext({ storeName: 'KM Supermart' });
    expect(speakableText('KM Supermart made ₦5,000 today.', context)).toBe(
      'K M Supermart made 5000 naira today.'
    );
  });

  it('says a plain name unchanged inside a real greeting', () => {
    const context = buildSpeechContext({ storeName: 'Crown Jewel Supermarket' });
    const spoken = speakableText(
      'I can help you with any part of Crown Jewel Supermarket, from ringing up a sale.',
      context
    );
    expect(spoken).toContain('Crown Jewel Supermarket');
  });

  it('needs no store name to work at all', () => {
    const context = buildSpeechContext({});
    expect(context.storeName).toBe('');
    expect(speakableText('Sales are up.', context)).toBe('Sales are up.');
  });
});

describe('store-aware speech: whole answers from the real assistant', () => {
  const demoProducts = [
    { name: 'Peak Milk 400g', sku: 'PK-400', stock: 4, salePrice: 2800 },
    { name: 'Coca-Cola 50cl', sku: 'CC-50', stock: 9, salePrice: 400 },
  ];
  const speechContext = buildSpeechContext({
    storeName: 'Demo Supermart',
    products: demoProducts,
  });
  const assistantContext = {
    storeName: 'Demo Supermart',
    today: { sales: 0, revenue: 0 },
    last7Days: { sales: 0, revenue: 0 },
    thisMonth: { sales: 0, revenue: 0, expenses: 0 },
    catalogue: {
      items: 2,
      trackStock: true,
      lowStockCount: 2,
      lowStock: demoProducts.map((p) => ({ name: p.name, quantity: p.stock })),
    },
    topSellers: demoProducts.map((p, i) => ({ name: p.name, units: 12 - i, revenue: 100 })),
    creditBook: { openAccounts: 0, outstanding: 0, paymentsRecorded: 0 },
  };

  it('speaks a restock answer with the pack sizes said properly', () => {
    const answer = localReply('What needs restocking?', assistantContext).answer;
    expect(answer).toContain('Peak Milk 400g'); // on screen, unchanged

    const spoken = speakableText(answer, speechContext);
    expect(spoken).toContain('Peak Milk 400 grams (4 left)');
    expect(spoken).toContain('Coca-Cola 50 centilitres (9 left)');
    // No bare unit letter survives next to a number.
    expect(spoken).not.toMatch(/\d\s?(g|cl|kg|ml)\b/);
  });

  it('speaks a top-seller answer with pack sizes and no middle dot', () => {
    const spoken = speakableText(
      localReply('What is selling best?', assistantContext).answer,
      speechContext
    );
    expect(spoken).toContain('Peak Milk 400 grams (12 sold)');
    expect(spoken).not.toMatch(/[·₦]/);
  });
});

describe('pickVoice', () => {
  it('prefers a Nigerian English voice when the device has one', () => {
    const voices = [
      { lang: 'en-US', name: 'US' },
      { lang: 'en-NG', name: 'NG' },
      { lang: 'fr-FR', name: 'FR' },
    ];
    expect(pickVoice(voices).name).toBe('NG');
  });

  it('falls back through en-GB then en-US', () => {
    expect(pickVoice([{ lang: 'en-US', name: 'US' }, { lang: 'en-GB', name: 'GB' }]).name).toBe('GB');
    expect(pickVoice([{ lang: 'fr-FR', name: 'FR' }, { lang: 'en-US', name: 'US' }]).name).toBe('US');
  });

  it('takes any English voice over a non-English default', () => {
    expect(pickVoice([{ lang: 'fr-FR', name: 'FR' }, { lang: 'en-AU', name: 'AU' }]).name).toBe('AU');
  });

  it('lets the engine decide when there is nothing suitable', () => {
    expect(pickVoice([{ lang: 'fr-FR', name: 'FR' }])).toBeNull();
    expect(pickVoice([])).toBeNull();
    expect(pickVoice(null)).toBeNull();
  });
});

describe('speak', () => {
  it('sends normalised text to the engine', () => {
    expect(isSpeechOutputSupported()).toBe(true);
    expect(speak('You made ₦5,000 today.')).toBe(true);
    expect(window.speechSynthesis.spoken).toHaveLength(1);
    expect(window.speechSynthesis.spoken[0].text).toBe('You made 5000 naira today.');
  });

  it('refuses to queue an empty utterance', () => {
    expect(speak('   ')).toBe(false);
    expect(window.speechSynthesis.spoken).toHaveLength(0);
  });

  it('reports completion back to the caller', async () => {
    let ended = false;
    speak('All done', { onEnd: () => (ended = true) });
    await Promise.resolve();
    expect(ended).toBe(true);
  });
});

describe('the spoken-replies preference', () => {
  it('defaults to off and round-trips per account', () => {
    expect(readStoredVoicePref('user-1')).toBe(false);
    writeStoredVoicePref('user-1', true);
    expect(readStoredVoicePref('user-1')).toBe(true);
    // Stored per account, so one user's choice is not another's.
    expect(readStoredVoicePref('user-2')).toBe(false);
    writeStoredVoicePref('user-1', false);
    expect(readStoredVoicePref('user-1')).toBe(false);
  });

  it('ignores a missing user id instead of throwing', () => {
    expect(readStoredVoicePref(null)).toBe(false);
    expect(() => writeStoredVoicePref(null, true)).not.toThrow();
  });
});
