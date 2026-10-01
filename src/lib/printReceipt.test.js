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
    // close the popup out from under a user who is still choosing a printer;
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

  it('prints batch numbers and expiry dates on pharmacy lines', () => {
    printReceipt({
      ...sale,
      items: [
        {
          name: 'Amoxil 500mg Caps',
          qty: 25,
          price: 4500,
          lineTotal: 112500,
          isRx: true,
          batches: [
            { batchNo: 'AMX-2419', expiryDate: '2026-11-15', qty: 20 },
            { batchNo: 'AMX-2501', expiryDate: '2027-07-28', qty: 5 },
          ],
        },
      ],
    });
    // [Rx] marks the prescription-only line…
    expect(written).toContain('Amoxil 500mg Caps [Rx]');
    // …and the FEFO allocation is printed for traceability.
    expect(written).toContain('AMX-2419 exp 2026-11-15 x 20');
    expect(written).toContain('AMX-2501 exp 2027-07-28 x 5');
    expect(written).toContain('Prescription item dispensed after prescription check.');
  });

  it('marks controlled lines and names the verifying pharmacist', () => {
    printReceipt({
      ...sale,
      items: [
        {
          name: 'Tramadol 50mg Cap',
          qty: 2,
          price: 1800,
          lineTotal: 3600,
          isRx: true,
          isControlled: true,
          batches: [{ batchNo: 'TRA-11', expiryDate: '2027-04-01', qty: 2 }],
        },
      ],
      verifiedBy: 'pharmacist@healthway.ng',
    });
    expect(written).toContain('Tramadol 50mg Cap [Rx] [CD]');
    expect(written).toContain('TRA-11 exp 2027-04-01 x 2');
    expect(written).toContain(
      'Verified by pharmacist@healthway.ng (pharmacist).'
    );
  });
});
