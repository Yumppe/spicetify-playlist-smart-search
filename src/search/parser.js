import { normalizeText } from '../utils.js';

export const SYNTAX_REFERENCE = [
  { token: 'text', name: 'Normal search', description: 'Spotify playlist search.', example: 'Mora', advanced: false },
  { token: ';', name: 'OR', description: 'Match either side.', example: 'Mora;Quevedo' },
  { token: '&', name: 'AND', description: 'Match both conditions.', example: '@Quevedo & @Mora' },
  { token: '-', name: 'Exclude', description: 'Remove matching tracks.', example: 'Mora & -live' },
  { token: '@', name: 'Exact artist', description: 'Match an artist credit exactly.', example: '@Mora' },
  { token: 'year:', name: 'Release year', description: 'Match one release year.', example: 'year:2022' },
  { token: '>, >=, <, <=, =', name: 'Year comparison', description: 'Compare release years.', example: '>2017 & <2020' },
  { token: 'YYYY-YYYY', name: 'Year range', description: 'Inclusive release-year range.', example: 'year:2017-2020' },
  { token: '\\', name: 'Literal symbol', description: 'Escape ; & @ - or \\.', example: 'rock\\&roll' },
];

const ESCAPABLE = new Set([';', '&', '@', '-', '\\']);

function splitEscaped(input, delimiter) {
  const parts = [];
  let buffer = '';
  let escaped = false;
  for (const ch of String(input ?? '')) {
    if (escaped) {
      buffer += `\\${ch}`;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === delimiter) {
      parts.push(buffer);
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  if (escaped) buffer += '\\';
  parts.push(buffer);
  return parts;
}

function hasDanglingEscape(value) {
  let slashes = 0;
  for (let i = value.length - 1; i >= 0 && value[i] === '\\'; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function unescapeTerm(value, errors) {
  const input = String(value ?? '');
  let out = '';
  let escaped = false;
  for (const ch of input) {
    if (escaped) {
      if (!ESCAPABLE.has(ch)) {
        errors.push(`Unknown escape \\${ch}. Only \\;, \\&, \\@, \\-, and \\\\ need escaping.`);
      }
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    out += ch;
  }
  if (escaped) {
    errors.push('A query cannot end with a lone backslash. Escape a backslash as \\\\.');
    out += '\\';
  }
  return out;
}

function parseYearExpression(raw, errors, sourceLabel = 'year') {
  const value = String(raw ?? '').trim();
  if (!value) {
    errors.push(`${sourceLabel}: is missing a year.`);
    return { kind: 'invalid', raw: value };
  }
  let match;
  if ((match = value.match(/^(\d{4})$/))) return { kind: 'year-eq', a: Number(match[1]) };
  if ((match = value.match(/^=(\d{4})$/))) return { kind: 'year-eq', a: Number(match[1]) };
  if ((match = value.match(/^>(\d{4})$/))) return { kind: 'year-gt', a: Number(match[1]) };
  if ((match = value.match(/^>=(\d{4})$/))) return { kind: 'year-gte', a: Number(match[1]) };
  if ((match = value.match(/^<(\d{4})$/))) return { kind: 'year-lt', a: Number(match[1]) };
  if ((match = value.match(/^<=(\d{4})$/))) return { kind: 'year-lte', a: Number(match[1]) };
  if ((match = value.match(/^(\d{4})\s*-\s*(\d{4})$/))) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    return { kind: 'year-range', a: Math.min(a, b), b: Math.max(a, b) };
  }
  errors.push(`Invalid year filter “${value}”. Use year:2020, year:2017-2020, year:>2017, year:>=2017, year:<2020, or year:<=2020.`);
  return { kind: 'invalid', raw: value };
}

function parseAtom(raw, errors) {
  let text = String(raw ?? '').trim();
  if (!text) {
    errors.push('Empty search condition. Remove the extra operator.');
    return { kind: 'invalid', raw: text };
  }

  if (hasDanglingEscape(text)) {
    errors.push('A search condition cannot end with a lone backslash.');
  }

  if (text.startsWith('-') && text.length > 1) {
    return { kind: 'not', child: parseAtom(text.slice(1), errors) };
  }

  if (/^year\s*:/i.test(text)) {
    return parseYearExpression(text.replace(/^year\s*:/i, ''), errors, 'year');
  }

  // Compact continuation: year:>2017 & <2020
  if (/^(?:<=|>=|<|>|=)\s*\d{4}$/.test(text)) {
    return parseYearExpression(text.replace(/\s+/g, ''), errors, 'year comparison');
  }

  if (text.startsWith('@')) {
    const value = normalizeText(unescapeTerm(text.slice(1).trim(), errors));
    if (!value) {
      errors.push('Exact artist @ is missing an artist name.');
      return { kind: 'invalid', raw: text };
    }
    return { kind: 'field', field: 'artist', value, exact: true };
  }

  const value = normalizeText(unescapeTerm(text, errors));
  if (!value) {
    errors.push('Search text cannot be empty.');
    return { kind: 'invalid', raw: text };
  }
  return { kind: 'text', value };
}

export function parseQuery(query) {
  const raw = String(query ?? '').trim();
  const errors = [];
  if (!raw) return { raw, ast: { kind: 'true' }, errors };

  const orParts = splitEscaped(raw, ';');
  const groups = orParts.map((groupRaw) => {
    if (!groupRaw.trim()) {
      errors.push('Empty OR branch. Remove the extra semicolon.');
      return { kind: 'invalid', raw: groupRaw };
    }
    const andParts = splitEscaped(groupRaw, '&');
    const children = andParts.map((part) => parseAtom(part, errors));
    return children.length === 1 ? children[0] : { kind: 'and', children };
  });

  const ast = groups.length === 1 ? groups[0] : { kind: 'or', children: groups };
  return { raw, ast, errors: [...new Set(errors)] };
}

function containsUnescaped(input, target) {
  let escaped = false;
  for (const ch of String(input ?? '')) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === target) return true;
  }
  return false;
}

export function smartSyntaxUsed(query) {
  const value = String(query ?? '');
  if (/\\[;&@\\-]/.test(value)) return true;
  if (/\byear\s*:/i.test(value)) return true;
  if (/(?:^|[;&])\s*(?:<=|>=|<|>|=)\s*\d{4}(?:\s*(?:[;&]|$))/.test(value)) return true;
  if (containsUnescaped(value, ';') || containsUnescaped(value, '&')) return true;
  const trimmed = value.trimStart();
  if (trimmed.startsWith('@') || trimmed.startsWith('-')) return true;
  // Operators can also start an AND/OR branch.
  return /(?:^|[;&])\s*[@-]/.test(value.replace(/\\[@-]/g, ''));
}

export function describeParseErrors(errors) {
  return errors?.length ? errors.join(' ') : '';
}
