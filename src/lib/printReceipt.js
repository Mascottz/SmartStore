// src/lib/printReceipt.js
// Thermal receipt printing for standard 80mm receipt printers (also works for
// 58mm printers via the widthMm option). Opens a dedicated print window laid
// out at paper width, triggers the browser print dialog (choose the thermal
// printer), and closes itself afterwards.
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

export function printReceipt(sale, options = {}) {
  const {
    widthMm = DEFAULT_WIDTH_MM,
    footer = 'Thank you for your patronage.',
    branding = 'Powered by SmartStore NG',
  } = options;

  const {
    storeName = 'SmartStore',
    receiptNo = '',
    createdAt = new Date(),
    items = [],
    total = 0,
    paymentMethod = '',
    cashier = '',
    status = 'completed',
  } = sale;

  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const money = (n) =>
    '\u20A6' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });

  const rows = items
    .map((item) => {
      const lineTotal = item.lineTotal ?? item.price * item.qty;
      return `
        <tr>
          <td class="name">${escapeHtml(item.name)}</td>
          <td class="amt">${escapeHtml(money(lineTotal))}</td>
        </tr>
        <tr class="sub">
          <td colspan="2">${escapeHtml(`${item.qty} x ${money(item.price)}`)}</td>
        </tr>`;
    })
    .join('');

  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(receiptNo ? `${receiptNo} Receipt` : storeName)} </title>
    <style>
      @page {
        size: ${widthMm}mm auto;
        margin: 2mm;
      }
      html, body {
        width: ${widthMm - 4}mm;
        margin: 0 auto;
        padding: 0;
        font-family: 'Courier New', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.45;
        color: #000;
        -webkit-print-color-adjust: exact;
      }
      .store { text-align: center; font-size: 14px; font-weight: bold; text-transform: uppercase; }
      .branding { text-align: center; font-size: 10px; }
      .rule { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
      .meta { font-size: 11px; }
      .meta td { padding: 1px 0; vertical-align: top; }
      .meta .k { white-space: nowrap; padding-right: 6px; }
      .voided {
        text-align: center;
        font-weight: bold;
        font-size: 13px;
        border: 1px solid #000;
        padding: 2px 0;
        margin: 4px 0;
      }
      table.items { width: 100%; border-collapse: collapse; }
      table.items .name { padding-top: 3px; }
      table.items .amt { text-align: right; padding-top: 3px; white-space: nowrap; }
      table.items .sub td { font-size: 10px; color: #333; padding-bottom: 2px; }
      .total td { font-size: 14px; font-weight: bold; padding-top: 2px; }
      .total .amt { text-align: right; }
      .footer { text-align: center; font-size: 10px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <p class="store">${escapeHtml(storeName)}</p>
    <p class="branding">${escapeHtml(branding)}</p>
    <hr class="rule" />
    <table class="meta">
      <tr><td class="k">Receipt:</td><td>${escapeHtml(receiptNo)}</td></tr>
      <tr><td class="k">Date:</td><td>${escapeHtml(validDate.toLocaleString('en-NG'))}</td></tr>
      ${paymentMethod ? `<tr><td class="k">Payment:</td><td>${escapeHtml(paymentMethod)}</td></tr>` : ''}
      ${cashier ? `<tr><td class="k">Served by:</td><td>${escapeHtml(cashier)}</td></tr>` : ''}
    </table>
    ${status === 'voided' ? '<p class="voided">** VOIDED **</p>' : ''}
    <hr class="rule" />
    <table class="items">
      ${rows}
    </table>
    <hr class="rule" />
    <table class="total" style="width: 100%;">
      <tr><td>TOTAL</td><td class="amt">${escapeHtml(money(total))}</td></tr>
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
