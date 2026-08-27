// src/lib/printReceipt.js
// Thermal receipt printing for standard 80mm receipt printers (also works for
// 58mm printers via the widthMm option). Opens a dedicated print window laid
// out at paper width, triggers the browser print dialog (choose the thermal
// printer), and closes itself afterwards.
//
// The receipt is deliberately built from normal HTML elements rather than a
// pre-formatted text block. This lets the browser wrap long product names,
// align amounts in a real column, and render readable sans-serif type on a
// thermal roll.
//
// Usage:
//   const ok = printReceipt({
//     storeName: "Marta's Mart",
//     receiptNo: 'SM-48213',
//     createdAt: new Date(),
//     items: [{ name: 'Peak Milk', qty: 2, price: 3400, lineTotal: 6800 }],
//     total: 6800,
//     paymentMethod: 'Cash',
//     cashier: 'marta@example.com',
//     cashierRole: 'cashier', // optional — shown as 'marta@example.com (cashier)'
//     status: 'completed', // or 'voided'
//   });
//   if (!ok) toast.error('Pop-up blocked...');
//
// Returns true when the print window was opened, false if pop-ups are blocked.

const DEFAULT_WIDTH_MM = 80; // standard thermal paper width

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

/**
 * Use a larger type scale on the standard roll and step it down slightly for
 * 58mm paper so the narrow layout remains readable without clipping.
 */
function typeScale(widthMm) {
  const compact = widthMm < 70;
  return {
    body: compact ? 11 : 13,
    store: compact ? 14 : 17,
    branding: compact ? 9 : 11,
    meta: compact ? 10 : 12,
    columnHead: compact ? 9 : 10,
    item: compact ? 11 : 13,
    itemSub: compact ? 9 : 11,
    total: compact ? 14 : 17,
    summary: compact ? 10 : 12,
    footer: compact ? 9 : 11,
  };
}

export function printReceipt(sale = {}, options = {}) {
  const {
    widthMm: requestedWidthMm = DEFAULT_WIDTH_MM,
    footer = 'Thank you for your patronage.',
    branding = 'Powered by SmartStore NG',
  } = options;

  // Keep dimensions numeric before interpolating them into the print CSS. The
  // public helper accepts a width option, but an invalid value should never
  // produce malformed CSS or a negative content width.
  const parsedWidthMm = Number(requestedWidthMm);
  const widthMm = Number.isFinite(parsedWidthMm) && parsedWidthMm >= 40
    ? parsedWidthMm
    : DEFAULT_WIDTH_MM;
  const contentWidthMm = Math.max(widthMm - 4, 1);

  const {
    storeName = 'SmartStore',
    receiptNo = '',
    createdAt = new Date(),
    items: suppliedItems = [],
    total = 0,
    paymentMethod = '',
    cashier = '',
    cashierRole = '',
    status = 'completed',
  } = sale;
  const items = Array.isArray(suppliedItems) ? suppliedItems : [];

  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const money = (value) => {
    const amount = Number(value) || 0;
    return '\u20A6' + amount.toLocaleString('en-NG', { maximumFractionDigits: 2 });
  };
  const t = typeScale(widthMm);

  const rows = items
    .map((item) => {
      const qty = Number(item.qty) || 0;
      const lineTotal = item.lineTotal ?? item.price * qty;
      return `
        <tr class="line">
          <td class="name">${escapeHtml(item.name)}</td>
          <td class="amt">${escapeHtml(money(lineTotal))}</td>
        </tr>
        <tr class="sub">
          <td colspan="2">${escapeHtml(`${qty} x ${money(item.price)}`)}</td>
        </tr>`;
    })
    .join('');

  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  // 'Served by: email (role)' when the caller knows the cashier's role; older
  // callers that only pass an email (or whose role lookup fails) still print
  // the plain email address.
  const servedBy = typeof cashierRole === 'string' && cashierRole.trim()
    ? `${cashier} (${cashierRole.trim()})`
    : cashier;

  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(receiptNo ? `${receiptNo} Receipt` : storeName)}</title>
    <style>
      @page {
        size: ${widthMm}mm auto;
        margin: 3mm 2mm;
      }
      html, body {
        width: ${contentWidthMm}mm;
        margin: 0 auto;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        font-size: ${t.body}px;
        line-height: 1.6;
        color: #000;
        -webkit-print-color-adjust: exact;
      }
      p { margin: 0; }
      table { border-spacing: 0; }
      .store {
        text-align: center;
        font-size: ${t.store}px;
        line-height: 1.25;
        font-weight: bold;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 3px;
      }
      .branding {
        text-align: center;
        font-size: ${t.branding}px;
        letter-spacing: 0.02em;
        margin-bottom: 2px;
      }
      .rule { border: 0; border-top: 1px dashed #000; margin: 9px 0; }
      .meta { width: 100%; font-size: ${t.meta}px; }
      .meta th,
      .meta td { padding: 3px 0; vertical-align: top; }
      .meta .k {
        width: 1%;
        white-space: nowrap;
        padding-right: 8px;
        text-align: left;
        font-weight: bold;
      }
      .meta td { width: 99%; overflow-wrap: anywhere; }
      .voided {
        text-align: center;
        font-weight: bold;
        font-size: ${t.item + 2}px;
        letter-spacing: 0.06em;
        border: 1px solid #000;
        padding: 4px 0;
        margin: 6px 0;
      }
      table.items {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      table.items tr { page-break-inside: avoid; }
      table.items .head th {
        font-size: ${t.columnHead}px;
        font-weight: bold;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding-bottom: 5px;
        text-align: left;
      }
      table.items .head .amt { text-align: right; }
      table.items .name {
        width: 62%;
        padding-top: 6px;
        font-size: ${t.item}px;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      table.items .amt {
        width: 38%;
        text-align: right;
        padding-top: 6px;
        font-size: ${t.item}px;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      table.items .sub td {
        font-size: ${t.itemSub}px;
        line-height: 1.4;
        color: #333;
        padding-bottom: 6px;
      }
      .summary { width: 100%; font-size: ${t.summary}px; padding-top: 2px; }
      .summary td { padding: 1px 0; }
      .summary .amt { text-align: right; }
      .total { width: 100%; }
      .total td {
        font-size: ${t.total}px;
        font-weight: bold;
        letter-spacing: 0.03em;
        padding-top: 6px;
      }
      .total .amt {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .footer {
        text-align: center;
        font-size: ${t.footer}px;
        line-height: 1.5;
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <p class="store">${escapeHtml(storeName)}</p>
    <p class="branding">${escapeHtml(branding)}</p>
    <hr class="rule" />
    <table class="meta">
      <tbody>
        <tr><th scope="row" class="k">Receipt:</th><td>${escapeHtml(receiptNo)}</td></tr>
        <tr><th scope="row" class="k">Date:</th><td>${escapeHtml(validDate.toLocaleString('en-NG'))}</td></tr>
        ${paymentMethod ? `<tr><th scope="row" class="k">Payment:</th><td>${escapeHtml(paymentMethod)}</td></tr>` : ''}
        ${cashier ? `<tr><th scope="row" class="k">Served by:</th><td>${escapeHtml(servedBy)}</td></tr>` : ''}
      </tbody>
    </table>
    ${status === 'voided' ? '<p class="voided">** VOIDED **</p>' : ''}
    <hr class="rule" />
    <table class="items">
      <thead>
        <tr class="head">
          <th scope="col">Item</th>
          <th scope="col" class="amt">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <hr class="rule" />
    <table class="total">
      <tbody>
        <tr><td>TOTAL</td><td class="amt">${escapeHtml(money(total))}</td></tr>
      </tbody>
    </table>
    <table class="summary">
      <tbody>
        <tr>
          <td>${escapeHtml(`${items.length} item${items.length === 1 ? '' : 's'} · ${totalQty} unit${totalQty === 1 ? '' : 's'}`)}</td>
          <td class="amt">${escapeHtml(paymentMethod || '')}</td>
        </tr>
      </tbody>
    </table>
    <hr class="rule" />
    <p class="footer">${escapeHtml(footer)}</p>
    <script>
      window.print();
      window.onafterprint = function () { window.close(); };
      setTimeout(function () { window.close(); }, 60000);
    </script>
  </body>
</html>`);

  win.document.close();
  return true;
}
