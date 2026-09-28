// Unit tests for the shared credit rules the POS and Credit Book both use.
import { describe, expect, it } from 'vitest';
import {
  hasOutstandingBalance,
  isCreditMethod,
  saleBalance,
  validateCreditSale,
  validateRepayment,
} from './credit';

describe('isCreditMethod', () => {
  it('only flags Partial and Credit', () => {
    expect(isCreditMethod('Partial')).toBe(true);
    expect(isCreditMethod('Credit')).toBe(true);
    for (const m of ['Cash', 'Transfer', 'POS/Card']) {
      expect(isCreditMethod(m)).toBe(false);
    }
  });
});

describe('saleBalance', () => {
  it('treats a sale without amountPaid as fully paid (legacy records)', () => {
    expect(saleBalance({ total: 500 })).toBe(0);
  });

  it('returns what is left to pay, never negative', () => {
    expect(saleBalance({ total: 500, amountPaid: 200 })).toBe(300);
    expect(saleBalance({ total: 500, amountPaid: 500 })).toBe(0);
    expect(saleBalance({ total: 500, amountPaid: 999 })).toBe(0);
  });
});

describe('hasOutstandingBalance', () => {
  it('is false for settled or voided sales', () => {
    expect(hasOutstandingBalance({ status: 'completed', total: 10, amountPaid: 0 })).toBe(true);
    expect(hasOutstandingBalance({ status: 'completed', total: 10, amountPaid: 10 })).toBe(false);
    expect(hasOutstandingBalance({ status: 'voided', total: 10, amountPaid: 0 })).toBe(false);
  });
});

describe('validateCreditSale', () => {
  it('requires a customer name', () => {
    expect(() =>
      validateCreditSale({ paymentMethod: 'Credit', total: 100, customerName: '' })
    ).toThrow(/name/i);
    expect(() =>
      validateCreditSale({ paymentMethod: 'Credit', total: 100, customerName: '  ' })
    ).toThrow(/name/i);
  });

  it('returns zero paid for Credit', () => {
    expect(
      validateCreditSale({ paymentMethod: 'Credit', total: 100, customerName: 'Ada' })
    ).toEqual({ amountPaid: 0, customerName: 'Ada' });
  });

  it('checks the part payment against the total', () => {
    expect(
      validateCreditSale({
        paymentMethod: 'Partial',
        total: 100,
        amountPaid: '40',
        customerName: 'Ada',
      })
    ).toEqual({ amountPaid: 40, customerName: 'Ada' });

    expect(() =>
      validateCreditSale({ paymentMethod: 'Partial', total: 100, amountPaid: 0, customerName: 'Ada' })
    ).toThrow(/paying now/i);
    expect(() =>
      validateCreditSale({ paymentMethod: 'Partial', total: 100, amountPaid: 100, customerName: 'Ada' })
    ).toThrow(/whole bill/i);
    expect(() =>
      validateCreditSale({ paymentMethod: 'Partial', total: 100, amountPaid: 150, customerName: 'Ada' })
    ).toThrow(/whole bill/i);
  });
});

describe('validateRepayment', () => {
  it('allows any positive amount up to the outstanding balance', () => {
    expect(validateRepayment({ amount: '50', balance: 100 })).toBe(50);
    expect(validateRepayment({ amount: 100, balance: 100 })).toBe(100);
    expect(() => validateRepayment({ amount: 0, balance: 100 })).toThrow(/valid/i);
    expect(() => validateRepayment({ amount: -1, balance: 100 })).toThrow(/valid/i);
    expect(() => validateRepayment({ amount: 101, balance: 100 })).toThrow(/left/i);
  });
});
