// src/lib/printReceipt.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { printReceipt } from './printReceipt';

const sale = {
  storeName: "Marta's Mart",
  receiptNo: 'SM-48213',
  createdAt: new Date('2026-08-27T10:00:00Z'),
  items: [
    { name: 'Peak Milk 400g', qty: 2, price: 3400, lineTotal: 6800 },
    // no lineTotal: must fall back to qty * price
    { name: 'Golden Penny Semovita 1kg (family size pack)', qty: 3, price: 1750 },
  ],
  total: 12050,
  paymentMethod: 'Cash',
  cashier: 'ada@shop.com',
};

let written = '';

beforeEach(() => {
  written = '';
  vi.spyOn(window, 'open').mockImplementation(
    () => ({
      document: {
        write: (html) => {
          written += html;
        },
        close: () => {},
      },
    })
  );
});

describe('printReceipt', () => {
  it('opens a print window and writes the receipt', () => {
    expect(printReceipt(sale)).toBe(true);
    expect(written).toContain('SM-48213');
    expect(written).toContain("Marta&#39;s Mart");
    expect(written).toContain('12,050');
    // fallback line total (3 x 1,750)
    expect(written).toContain('3 x ₦1,750');
  });

  it('returns false when the pop-up is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(printReceipt(sale)).toBe(false);
  });

  it('registers onafterprint BEFORE window.print() so the popup closes after printing', () => {
    // The dimmed-popup bug: on browsers where window.print() blocks, the
    // "afterprint" event fires before any line after print() executes, so a
    // handler assigned after the call never runs and the popup stays open.
    printReceipt(sale);

    const script = written.slice(written.indexOf('<script>'), written.indexOf('</script>'));
    // Match the actual call (with its semicolon) so the explanatory comment
    // mentioning window.print() cannot satisfy the assertion.
    const handlerAt = script.indexOf('window.onafterprint');
    const printAt = script.indexOf('window.print();');

    expect(handlerAt).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(-1);
    expect(handlerAt).toBeLessThan(printAt);
    // the handler must close the window
    expect(script).toMatch(/window\.onafterprint\s*=\s*function\s*\(\)\s*\{\s*window\.close\(\);\s*\}/);
  });

  it('keeps a 10-second fallback that closes the window when afterprint never fires', () => {
    printReceipt(sale);
    // print() blocks while the dialog is open, so a short fallback cannot
    // close the popup out from under a user who is still choosing a printer —
    // it only fires once the dialog has gone away and afterprint was missed.
    expect(written).toMatch(/setTimeout\(function\s*\(\)\s*\{\s*window\.close\(\);\s*\},\s*10000\)/);
  });

  it('prints "Served by: email (role)" when the cashier role is known', () => {
    printReceipt({ ...sale, cashierRole: 'cashier' });
    expect(written).toContain('Served by:');
    expect(written).toContain('ada@shop.com (cashier)');
  });

  it('falls back to the bare email when there is no role to show', () => {
    printReceipt(sale);
    expect(written).toContain('Served by:');
    expect(written).toContain('>ada@shop.com</td>');
    expect(written).not.toContain('ada@shop.com (');
  });
});
