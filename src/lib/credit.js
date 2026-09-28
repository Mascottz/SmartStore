// src/lib/credit.js
// Shared rules for partial payments and credit ("sell now, pay later") sales.
//
// Every sale carries `amountPaid`, what the customer has handed over so far
// (counting any repayments recorded later), and, for credit-type sales, a
// `customerName` so the shop knows who owes what. The outstanding balance is
// always derived as total - amountPaid; the individual repayments live in the
// credit_payments records so the ledger is never lost.

export const CREDIT_METHODS = ['Partial', 'Credit'];

// All payment methods the POS offers, in display order. `Partial` = customer
// pays part now and owes the rest; `Credit` = customer pays nothing now.
export const PAYMENT_METHODS = ['Cash', 'Transfer', 'POS/Card', 'Partial', 'Credit'];

// Methods allowed when a customer settles a debt at the till.
export const REPAYMENT_METHODS = ['Cash', 'Transfer', 'POS/Card'];

export const isCreditMethod = (method) => CREDIT_METHODS.includes(method);

/** How much of a sale is still owed. Never negative. */
export const saleBalance = (sale) =>
  Math.max(0, Number(sale?.total || 0) - Number(sale?.amountPaid ?? sale?.total ?? 0));

/** A sale the store is still owed money on (and that hasn't been voided). */
export const hasOutstandingBalance = (sale) =>
  sale?.status === 'completed' && saleBalance(sale) > 0;

/**
 * Validate the credit fields the POS collects.
 * Returns { amountPaid, customerName } for a credit sale, or throws an Error
 * with a cashier-friendly message.
 */
export function validateCreditSale({ paymentMethod, total, amountPaid, customerName }) {
  const name = (customerName || '').trim();
  if (!name) throw new Error(`Enter the customer's name so the debt can be tracked.`);
  if (name.length > 100) throw new Error(`Customer name is too long (max 100 characters).`);

  if (paymentMethod === 'Credit') {
    return { amountPaid: 0, customerName: name };
  }

  const paid = Number(amountPaid);
  if (!Number.isFinite(paid) || paid <= 0) {
    throw new Error('Enter how much the customer is paying now.');
  }
  const totalNum = Number(total) || 0;
  if (paid >= totalNum) {
    throw new Error('That covers the whole bill; use Cash, Transfer or POS/Card instead.');
  }
  return { amountPaid: paid, customerName: name };
}

/**
 * Validate a repayment recorded against an open debt.
 * Returns the clean amount, or throws with a cashier-friendly message.
 */
export function validateRepayment({ amount, balance }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Enter a valid payment amount.');
  }
  const balanceNum = Number(balance) || 0;
  if (value > balanceNum) {
    throw new Error(`Only ₦${balanceNum.toLocaleString('en-NG')} is left on this debt.`);
  }
  return value;
}
