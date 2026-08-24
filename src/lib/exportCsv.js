// src/lib/exportCsv.js
// Download an array of objects as a CSV file.

/**
 * Convert an array of flat objects to a CSV string and trigger a browser download.
 * @param {string} filename  File name (without extension).
 * @param {string[]} headers Column header labels.
 * @param {string[][]} rows  Array of row arrays (same order as headers).
 */
export function downloadCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const csv = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
