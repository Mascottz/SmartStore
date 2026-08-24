// src/lib/paystack.js
// Paystack inline-popup helper. Loads the Paystack script the first time the
// app needs it (dynamic script injection), then opens a hosted checkout
// modal for Card / Transfer / USSD / Bank payments.
//
// Configure with a public key in your environment:
//   VITE_PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxxxxx
//
// Amounts are passed in **Naira** and converted to kobo (the smallest NGN
// unit Paystack expects) inside initializePayment().

const SCRIPT_URL = 'https://js.paystack.co/v1/inline.js';

// Caches the in-flight/finished script load so we never inject <script> twice.
let scriptPromise = null;

/**
 * Dynamically load the Paystack inline script.
 * Returns the global `PaystackPop` object, or rejects if it cannot load.
 */
export function loadPaystackScript() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    const script = existing || document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.PaystackPop) resolve(window.PaystackPop);
      else reject(new Error('Paystack loaded but PaystackPop is missing.'));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the Paystack script. Check your network.'));
    };
    if (!existing) document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * True when a valid Paystack public key is present in the environment.
 * Accepted shapes: pk_test_... / pk_live_...
 */
export function isPaystackConfigured() {
  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
  if (!key) return false;
  return /^pk_(test|live)_[A-Za-z0-9]+$/.test(key);
}

/**
 * Build a reasonably unique transaction reference, e.g. SS-1727101234567-AB12.
 */
export function makeReference(prefix = 'SS') {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${now}-${rand}`;
}

/**
 * Open the Paystack inline checkout.
 *
 * @param {object} options
 * @param {string}   options.email          Customer email (required by Paystack).
 * @param {number}   options.amount         Amount in NAIRA (converted to kobo).
 * @param {string}   [options.reference]    Unique transaction reference.
 * @param {function} [options.onSuccess]    Called with the Paystack response on success.
 * @param {function} [options.onCancel]     Called when the customer closes the popup.
 * @param {string}   [options.currency]     Defaults to 'NGN'.
 * @param {function} [options.onError]      Called if Paystack fails to initialise.
 */
export async function initializePayment({
  email,
  amount,
  reference,
  onSuccess,
  onCancel,
  onError,
  currency = 'NGN',
}) {
  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
  if (!key) {
    throw new Error('Paystack is not configured. Set VITE_PAYSTACK_PUBLIC_KEY.');
  }
  if (!email) {
    throw new Error('An email address is required to start a Paystack payment.');
  }

  let PaystackPop;
  try {
    PaystackPop = await loadPaystackScript();
  } catch (error) {
    if (onError) onError(error);
    throw error;
  }

  if (!PaystackPop || typeof PaystackPop.setup !== 'function') {
    const error = new Error('Paystack is unavailable right now. Please try again.');
    if (onError) onError(error);
    throw error;
  }

  // amount is in Naira -> kobo. Paystack charges in the smallest unit.
  const amountKobo = Math.round(Number(amount || 0) * 100);
  if (!amountKobo || amountKobo <= 0) {
    throw new Error('Invalid payment amount.');
  }

  const ref = reference || makeReference();

  const handler = PaystackPop.setup({
    key,
    email,
    amount: amountKobo,
    currency,
    ref,
    callback: (response) => {
      if (onSuccess) onSuccess(response);
    },
    onClose: () => {
      if (onCancel) onCancel();
    },
  });

  handler.openIframe();
  return { reference: ref };
}
