import { generateSku } from './sku';
import { sanitize } from './validate';

const HEADER_ALIASES = {
  name: ['name', 'product', 'product name', 'item', 'item name', 'service', 'menu item'],
  sku: ['sku', 'barcode', 'bar code', 'code', 'item code'],
  category: ['category', 'cat', 'shelf', 'department', 'dept'],
  costPrice: ['cost', 'cost price', 'buy', 'buy price', 'buying price', 'wholesale', 'cp'],
  salePrice: ['price', 'selling price', 'sell', 'sale price', 'retail', 'retail price', 'sp'],
  stock: ['stock', 'qty', 'quantity', 'units', 'unit', 'pcs', 'pieces'],
  expiryDate: ['expiry', 'expiry date', 'exp', 'exp date'],
};

const LABEL_TO_FIELD = Object.entries(HEADER_ALIASES).reduce((map, [field, labels]) => {
  labels.forEach((label) => map.set(label, field));
  return map;
}, new Map());

const normaliseLabel = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const toNumber = (value) => {
  const cleaned = String(value || '')
    .replace(/[₦,\s]/g, '')
    .replace(/^n/i, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const moneyPattern = '([₦Nn]?\\s*\\d[\\d,]*(?:\\.\\d+)?)';
const stopLookahead = '(?=\\s+(?:sku|barcode|code|cat|category|shelf|dept|department|cost|buy|buying|wholesale|cp|selling|sell|sale|retail|price|sp|stock|qty|quantity|units?|pcs?|pieces|exp|expiry|x)\\b|[,;|]|$)';

function splitDelimited(line, preferredDelimiter) {
  const delimiters = preferredDelimiter ? [preferredDelimiter] : ['\t', '|', ';', ','];
  for (const delimiter of delimiters) {
    const parts = String(line)
      .split(delimiter)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) return { delimiter, parts };
  }
  return { delimiter: null, parts: [String(line).trim()].filter(Boolean) };
}

function fieldForHeader(value) {
  return LABEL_TO_FIELD.get(normaliseLabel(value)) || null;
}

function detectHeader(line) {
  const split = splitDelimited(line);
  if (!split.delimiter) return null;
  const fields = split.parts.map(fieldForHeader);
  const recognised = fields.filter(Boolean);
  if (!fields.includes('name') || recognised.length < 2) return null;
  return { delimiter: split.delimiter, fields };
}

function normaliseDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const slash = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

function findKnownCategory(line, categories = []) {
  const names = categories
    .map((category) => sanitize(category))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`, 'i');
    if (pattern.test(line)) return name;
  }
  return '';
}

function readLabelledFields(line) {
  let work = ` ${line} `;
  const out = {};

  const take = (field, regex, mapper = (v) => v) => {
    work = work.replace(regex, (match, value) => {
      if (out[field] === undefined) out[field] = mapper(value);
      return ' ';
    });
  };

  take('sku', /\b(?:sku|barcode|bar\s*code|code)\s*[:#=-]?\s*([a-z0-9][-a-z0-9._/]{1,49})\b/gi, sanitize);
  take(
    'expiryDate',
    /\b(?:exp(?:iry)?(?:\s*date)?)\s*[:#=-]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/gi,
    normaliseDate
  );
  take(
    'category',
    new RegExp(`\\b(?:cat(?:egory)?|shelf|dept|department)\\s*[:#=\\-]?\\s*([a-z0-9][a-z0-9 &'/.\\-]{1,80}?)${stopLookahead}`, 'gi'),
    sanitize
  );
  take(
    'costPrice',
    new RegExp(`\\b(?:cost(?:\\s*price)?|buy(?:ing)?(?:\\s*price)?|wholesale|cp)\\s*[:#=\\-]?\\s*${moneyPattern}`, 'gi'),
    toNumber
  );
  take(
    'salePrice',
    new RegExp(`\\b(?:selling(?:\\s*price)?|sell|sale(?:\\s*price)?|retail(?:\\s*price)?|price|sp)\\s*[:#=\\-]?\\s*${moneyPattern}`, 'gi'),
    toNumber
  );
  take('stock', /\b(?:stock|qty|quantity|units?|pcs?|pieces)\s*[:#=x-]?\s*(\d+)\b/gi, (v) => Math.floor(toNumber(v)));
  take('stock', /\bx\s*(\d+)\b/gi, (v) => Math.floor(toNumber(v)));
  take('stock', /\b(\d+)\s*(?:pcs?|pieces|units?)\b/gi, (v) => Math.floor(toNumber(v)));
  take('salePrice', /@\s*([₦Nn]?\s*\d[\d,]*(?:\.\d+)?)/g, toNumber);

  return { fields: out, remainder: work.replace(/\s+/g, ' ').trim() };
}

function assignNumbers(row, numbers, trackStock) {
  const unused = numbers.filter((n) => Number(n) > 0);
  if (!unused.length) return;

  if (row.costPrice === undefined && row.salePrice === undefined && row.stock === undefined) {
    if (unused.length >= 3) {
      row.costPrice = unused[0];
      row.salePrice = unused[1];
      row.stock = Math.floor(unused[2]);
      return;
    }
    if (unused.length === 2) {
      row.salePrice = unused[0];
      if (trackStock) row.stock = Math.floor(unused[1]);
      else row.costPrice = unused[1];
      return;
    }
    row.salePrice = unused[0];
    return;
  }

  for (const value of unused) {
    if (row.costPrice === undefined && row.salePrice !== undefined && value <= row.salePrice) {
      row.costPrice = value;
    } else if (row.salePrice === undefined) {
      row.salePrice = value;
    } else if (trackStock && row.stock === undefined) {
      row.stock = Math.floor(value);
    }
  }
}

function parseDelimitedNoHeader(line, categories, trackStock) {
  const { delimiter, parts } = splitDelimited(line);
  if (!delimiter || parts.length < 2) return null;

  const row = {};
  const unknown = [];
  const numbers = [];

  for (const part of parts) {
    const labelled = readLabelledFields(part);
    Object.assign(row, labelled.fields);
    const clean = labelled.remainder.trim();
    if (!clean) continue;

    const headerField = fieldForHeader(clean.split(/[:=]/)[0]);
    if (headerField && clean.includes(':')) {
      const value = clean.split(/[:=]/).slice(1).join(':').trim();
      if (headerField === 'costPrice' || headerField === 'salePrice' || headerField === 'stock') {
        row[headerField] = headerField === 'stock' ? Math.floor(toNumber(value)) : toNumber(value);
      } else if (headerField === 'expiryDate') {
        row.expiryDate = normaliseDate(value);
      } else {
        row[headerField] = sanitize(value);
      }
      continue;
    }

    const knownCategory = findKnownCategory(clean, categories);
    if (knownCategory && !row.category) {
      row.category = knownCategory;
      continue;
    }

    const maybeDate = normaliseDate(clean);
    if (maybeDate && !row.expiryDate) {
      row.expiryDate = maybeDate;
      continue;
    }

    if (/^[₦Nn]?\s*\d[\d,]*(?:\.\d+)?$/.test(clean)) {
      numbers.push(toNumber(clean));
      continue;
    }

    unknown.push(clean);
  }

  if (!row.name && unknown.length) row.name = sanitize(unknown.shift());
  if (!row.category && unknown.length) row.category = sanitize(unknown.shift());
  if (unknown.length && !row.name) row.name = sanitize(unknown.join(' '));
  assignNumbers(row, numbers, trackStock);
  return row;
}

function parseFreeTextLine(line, categories) {
  const labelled = readLabelledFields(line);
  const row = { ...labelled.fields };
  let remainder = labelled.remainder;

  if (!row.category) {
    const knownCategory = findKnownCategory(remainder || line, categories);
    if (knownCategory) {
      row.category = knownCategory;
      remainder = remainder.replace(new RegExp(escapeRegExp(knownCategory), 'i'), ' ');
    }
  }

  if (row.salePrice === undefined) {
    const moneyMatches = [...remainder.matchAll(/[₦Nn]\s*\d[\d,]*(?:\.\d+)?/g)];
    if (moneyMatches.length) {
      const last = moneyMatches[moneyMatches.length - 1][0];
      row.salePrice = toNumber(last);
      remainder = remainder.replace(last, ' ');
    }
  }

  row.name = sanitize(remainder.replace(/\s+/g, ' ').trim());
  return row;
}

function prepareRow(rawRow, lineNumber, rawLine, options, usedSkus) {
  const cleanName = sanitize(rawRow.name);
  const manualSku = sanitize(rawRow.sku);
  const sku = manualSku || (cleanName ? generateSku(cleanName, [...usedSkus]) : '');
  if (sku) usedSkus.add(sku.toLowerCase());

  const salePrice = Math.max(0, Number(rawRow.salePrice) || 0);
  const costPrice = Math.max(0, Number(rawRow.costPrice) || 0);
  const stock = options.trackStock ? Math.max(0, Math.floor(Number(rawRow.stock) || 0)) : 0;
  const expiryDate = options.hasExpiry ? normaliseDate(rawRow.expiryDate) : '';
  const category = sanitize(rawRow.category) || 'General';

  const issues = [];
  if (!cleanName) issues.push('Add a name');
  if (salePrice <= 0) issues.push('Add selling price');
  if (options.hasExpiry && rawRow.expiryDate && !expiryDate) issues.push('Check expiry date');

  const warnings = [];
  if (costPrice > 0 && salePrice > 0 && costPrice > salePrice) {
    warnings.push('Cost is higher than selling price');
  }
  if (!manualSku && sku) warnings.push(`SKU generated as ${sku}`);

  return {
    lineNumber,
    raw: rawLine,
    name: cleanName,
    sku,
    category,
    costPrice,
    salePrice,
    stock,
    expiryDate,
    issues,
    warnings,
  };
}

function parseHeaderRows(lines, header, options, usedSkus) {
  const rows = [];
  const rejected = [];
  lines.slice(1).forEach(({ text, lineNumber }) => {
    const parts = splitDelimited(text, header.delimiter).parts;
    const rawRow = {};
    header.fields.forEach((field, index) => {
      if (!field) return;
      const value = parts[index] || '';
      if (field === 'costPrice' || field === 'salePrice') rawRow[field] = toNumber(value);
      else if (field === 'stock') rawRow[field] = Math.floor(toNumber(value));
      else if (field === 'expiryDate') rawRow[field] = normaliseDate(value);
      else rawRow[field] = sanitize(value);
    });
    const row = prepareRow(rawRow, lineNumber, text, options, usedSkus);
    if (!row.name && !row.salePrice) {
      rejected.push({ lineNumber, raw: text, reason: 'Could not find product details' });
    } else {
      rows.push(row);
    }
  });
  return { rows, rejected };
}

/**
 * Arrange messy stock-list text into SmartStore inventory rows. It is designed
 * for review-before-save: rows with missing names or selling prices are kept in
 * the preview with issues instead of being imported silently.
 */
export function parseStoreSenseInventory(input, options = {}) {
  const opts = {
    existingSkus: [],
    categories: [],
    trackStock: true,
    hasExpiry: false,
    ...options,
  };
  const lines = String(input || '')
    .split(/\r?\n/)
    .map((text, index) => ({ text: text.trim(), lineNumber: index + 1 }))
    .filter(({ text }) => text && !/^#/.test(text));

  const usedSkus = new Set(
    (Array.isArray(opts.existingSkus) ? opts.existingSkus : [])
      .filter(Boolean)
      .map((sku) => String(sku).toLowerCase())
  );

  if (!lines.length) return { rows: [], rejected: [] };

  const header = detectHeader(lines[0].text);
  if (header) return parseHeaderRows(lines, header, opts, usedSkus);

  const rows = [];
  const rejected = [];
  lines.forEach(({ text, lineNumber }) => {
    const rawRow =
      parseDelimitedNoHeader(text, opts.categories, opts.trackStock) ||
      parseFreeTextLine(text, opts.categories);
    const row = prepareRow(rawRow, lineNumber, text, opts, usedSkus);
    if (!row.name && !row.salePrice) {
      rejected.push({ lineNumber, raw: text, reason: 'Could not find product details' });
    } else {
      rows.push(row);
    }
  });

  return { rows, rejected };
}

export function isStoreSenseRowReady(row) {
  return Boolean(sanitize(row?.name)) && Number(row?.salePrice) > 0;
}
