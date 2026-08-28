// Auto-SKU generation: "Peak Milk 400g" → "PEA-MIL-400G-A7F3".
//
// The format is deliberately readable (a person can guess the product from
// the code) but never longer than the 50 characters the SKU field and both
// backends accept. The tail is random so similar names don't collide, and the
// tests drive Math.random to pin the exact codes down.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateSku, skuPrefix, SKU_MAX_LEN } from './sku';

/** Queue of Math.random values the generator consumes one hex char at a time. */
function randomQueue(values) {
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const v = values.shift();
    return v === undefined ? 0 : v;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('skuPrefix', () => {
  it('keeps three-letter initials and whole size tokens', () => {
    expect(skuPrefix('Peak Milk 400g')).toBe('PEA-MIL-400G');
    expect(skuPrefix('Eva Water 75cl')).toBe('EVA-WAT-75CL');
  });

  it('caps the code at three words and three letters per word', () => {
    // "1kg" is the fourth word — dropped, not squeezed in.
    expect(skuPrefix('Golden Penny Semovita 1kg')).toBe('GOL-PEN-SEM');
    expect(skuPrefix('Indomie Chicken 70g')).toBe('IND-CHI-70G');
  });

  it('drops punctuation and HTML instead of turning it into dashes', () => {
    expect(skuPrefix('<b>Coca-Cola</b> 50cl')).toBe('COC-50CL');
    // "&" is dropped entirely; the first three words win, so "110g!" misses out.
    expect(skuPrefix('Dettol Soap & Fresh 110g!')).toBe('DET-SOA-FRE');
  });

  it('handles short and missing names without building "-TAIL"', () => {
    expect(skuPrefix('Ariel 900g')).toBe('ARI-900G');
    expect(skuPrefix('  ')).toBe('');
    expect(skuPrefix(null)).toBe('');
  });

  it('never eats into the space the random tail needs', () => {
    const digits = '9'.repeat(80);
    const prefix = skuPrefix(`Item ${digits} Extra`);
    expect(prefix.length).toBeLessThanOrEqual(SKU_MAX_LEN - 5);
    expect(prefix).toBe('ITE');
  });
});

describe('generateSku', () => {
  it('appends four random hex characters to the name prefix', () => {
    randomQueue([0.5, 0.5, 0.5, 0.5]); // floor(0.5 * 16) = 8 → "8888"
    expect(generateSku('Peak Milk 400g')).toBe('PEA-MIL-400G-8888');
  });

  it('produces format-matching codes for real names', () => {
    expect(generateSku('Peak Milk 400g')).toMatch(/^PEA-MIL-400G-[0-9A-F]{4}$/);
    expect(generateSku('Eva Water 75cl')).toMatch(/^EVA-WAT-75CL-[0-9A-F]{4}$/);
  });

  it('is a bare tail when there is no usable prefix', () => {
    randomQueue([0, 0, 0, 0]);
    expect(generateSku('   ')).toBe('0000');
  });

  it('never exceeds the 50-character SKU limit', () => {
    const digits = '7'.repeat(120);
    const sku = generateSku(`Bag ${digits}`);
    expect(sku.length).toBeLessThanOrEqual(SKU_MAX_LEN);
  });

  it('avoids codes the store already uses', () => {
    // First roll builds …-8888, which is taken; the generator rolls again.
    randomQueue([
      0.5, 0.5, 0.5, 0.5, // attempt 1 → 8888 (taken)
      0.1, 0.1, 0.1, 0.1, // attempt 2 → 1111
    ]);
    const sku = generateSku('Peak Milk 400g', ['PEA-MIL-400G-8888', 'EVA-WAT-75CL-8888']);
    expect(sku).toBe('PEA-MIL-400G-1111');
  });

  it('treats taken codes case-insensitively', () => {
    randomQueue([
      0.5, 0.5, 0.5, 0.5,
      0.25, 0.25, 0.25, 0.25, // floor(4) → "4444"
    ]);
    expect(generateSku('Peak Milk 400g', ['pea-mil-400g-8888'])).toBe(
      'PEA-MIL-400G-4444'
    );
  });
});
