// StoreSense spoken replies.
//
// The assistant's answers are written for the screen (naira signs, middle
// dots, curly apostrophes, the odd acronym). These tests pin down the
// translation into something a speech engine reads correctly, because a
// wrong number read aloud is worse than no audio at all.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  isSpeechOutputSupported,
  pickVoice,
  readStoredVoicePref,
  speak,
  speakableText,
  writeStoredVoicePref,
} from './speech';
import { localReply } from './assistant';

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
