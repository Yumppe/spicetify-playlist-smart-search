import { state } from '../state.js';
import { loadConfig } from '../config.js';
import { normalizeText } from '../utils.js';

const boundInputs = new WeakSet();

function separatorPosition(value) {
  let escaped = false, last = -1;
  for (let i = 0; i < value.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (value[i] === '\\') { escaped = true; continue; }
    if (value[i] === ';' || value[i] === '&') last = i;
  }
  return last;
}



function bindInputLifecycle(input) {
  if (!input || boundInputs.has(input)) return;
  boundInputs.add(input);
  input.addEventListener('focus', () => {
    queueMicrotask(() => maintainSyntaxHelp());
  });
  input.addEventListener('keydown', (event) => {
    const host = state.syntaxHelpHost;
    if (!host || host.hidden || event.key !== 'ArrowDown') return;
    const button = host.querySelector('button');
    if (!button) return;
    event.preventDefault();
    button.focus();
  });
  input.addEventListener('blur', () => {
    // Suggestion clicks keep the input focused. Hide help once focus really leaves.
    setTimeout(() => {
      if (document.activeElement !== input && !state.syntaxHelpHost?.contains(document.activeElement)) clearSyntaxHelp();
    }, 0);
  });
}

function currentInput() {
  return state.nativeSearchInput?.isConnected ? state.nativeSearchInput : null;
}

function ensureHost() {
  let host = state.syntaxHelpHost;
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'ss1-syntax-assist';
  host.hidden = true;
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Smart Search suggestions');
  document.body.appendChild(host);
  state.syntaxHelpHost = host;
  return host;
}

function replaceActiveSegment(input, replacement) {
  const value = String(input.value || '');
  const separatorIndex = separatorPosition(value);
  const prefix = separatorIndex >= 0 ? value.slice(0, separatorIndex + 1) : '';
  const whitespace = value.slice(separatorIndex + 1).match(/^\s*/)?.[0] ?? '';
  input.value = `${prefix}${whitespace}${replacement}`;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function artistSuggestions(query) {
  const segment = query.slice(separatorPosition(query) + 1).trimStart();
  if (!segment.startsWith('@')) return [];
  const needle = normalizeText(segment.slice(1).trim());
  if (!needle) return [];
  const seen = new Set();
  const matches = [];
  for (const track of state.tracks) {
    for (const artist of track.artists ?? []) {
      const normalized = normalizeText(artist);
      if (!normalized || seen.has(normalized)) continue;
      if (!normalized.startsWith(needle) && !normalized.includes(needle)) continue;
      seen.add(normalized);
      matches.push(artist);
      if (matches.length >= 6) return matches;
    }
  }
  return matches;
}

function syntaxSuggestions(query) {
  const trimmed = String(query || '').trim();
  const result = [];
  if (/^@[^;&]*$/i.test(trimmed) || /[;&]\s*@[^;&]*$/i.test(trimmed)) {
    for (const artist of artistSuggestions(query)) {
      result.push({ label: `@${artist}`, hint: 'Exact artist', value: `@${artist}`, kind: 'artist' });
    }
  }
  if (/year\s*:\s*$/i.test(trimmed)) {
    result.push(
      { label: 'year:2026', hint: 'One year', value: 'year:2026' },
      { label: 'year:2017-2020', hint: 'Year range', value: 'year:2017-2020' },
      { label: 'year:>=2020', hint: '2020 or later', value: 'year:>=2020' },
    );
  }
  if (!result.length) {
    result.push(
      { label: '@Artist', hint: 'Exact artist', value: '@' },
      { label: '&', hint: 'AND', value: `${trimmed}${trimmed ? ' & ' : '& '}`, full: true },
      { label: ';', hint: 'OR', value: `${trimmed}${trimmed ? ';' : ';'}`, full: true },
      { label: '-term', hint: 'Exclude', value: `${trimmed}${trimmed ? ' & -' : '-'}`, full: true },
      { label: 'year:', hint: 'Release year', value: `${trimmed}${trimmed ? ' & year:' : 'year:'}`, full: true },
    );
  }
  return result.slice(0, 6);
}

function positionHost(host, input) {
  const rect = input.getBoundingClientRect();
  const maxWidth = Math.min(520, Math.max(300, window.innerWidth - 24));
  const width = Math.min(maxWidth, Math.max(320, rect.width * 1.65));
  let left = rect.left;
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
  host.style.width = `${width}px`;
  host.style.left = `${Math.max(12, left)}px`;
  host.style.top = `${Math.min(window.innerHeight - 12, rect.bottom + 8)}px`;
}

function render(host, input) {
  host.replaceChildren();
  const query = String(input.value || state.query || '');
  if (host.dataset.renderedQuery === query && host.childElementCount) { positionHost(host, input); host.hidden = false; return; }
  host.dataset.renderedQuery = query;
  const suggestions = syntaxSuggestions(query);
  if (!suggestions.length) { host.hidden = true; return; }

  const head = document.createElement('div');
  head.className = 'ss1-syntax-assist-head';
  const title = document.createElement('strong');
  title.textContent = 'Smart Search';
  const sub = document.createElement('span');
  sub.textContent = 'Syntax help';
  head.append(title, sub);
  host.appendChild(head);

  const list = document.createElement('div');
  list.className = 'ss1-syntax-assist-list';
  for (const item of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ss1-syntax-assist-item';
    button.setAttribute('aria-label', `${item.label}: ${item.hint}`);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); clearSyntaxHelp(); input.focus(); return; }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const buttons = [...list.querySelectorAll('button')];
      const index = buttons.indexOf(button);
      const next = index + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0 || next >= buttons.length) input.focus(); else buttons[next].focus();
    });
    const code = document.createElement('code');
    code.textContent = item.label;
    const hint = document.createElement('span');
    hint.textContent = item.hint;
    button.append(code, hint);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (item.full) {
        input.value = item.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      } else {
        replaceActiveSegment(input, item.value);
      }
    });
    list.appendChild(button);
  }
  host.appendChild(list);
  positionHost(host, input);
  host.hidden = false;
}

export function maintainSyntaxHelp() {
  const host = ensureHost();
  const input = currentInput();
  const config = loadConfig();
  if (input) bindInputLifecycle(input);
  if (!config.enabled || !config.showSyntaxHelp || !input || !state.query.trim() || (document.activeElement !== input && !host.contains(document.activeElement))) {
    host.hidden = true;
    return;
  }
  render(host, input);
}

export function clearSyntaxHelp() {
  if (state.syntaxHelpHost) { state.syntaxHelpHost.hidden = true; state.syntaxHelpHost.dataset.renderedQuery = ''; }
}
