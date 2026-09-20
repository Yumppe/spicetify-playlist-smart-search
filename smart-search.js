// Playlist Smart Search 1.1.0-release
(() => {
  'use strict';

  // src/state.js
  const __mod0 = (() => {
    const state = {
      S: null,
      playlistId: null,
      tracks: [],
      filtered: [],
      query: '',
      queryAst: { kind: 'true' },
      queryErrors: [],
      loading: false,
      loadingPlaylistId: null,
      lastError: null,
      source: null,
      cache: new Map(),
      hiddenTracklist: null,
      hiddenTracklistDisplay: '',
      nativeSearchInput: null,
      nativeSearchListener: null,
      nativeSearchMissingSince: 0,
      nativeAdapterMode: 'idle',
      nativeAdapterError: null,
      nativeAdapterResultCount: 0,
      resultsHost: null,
      resultsList: null,
      resultsSentinel: null,
      resultsObserver: null,
      renderedCount: 0,
      playbackSession: null,
      playbackMaintenanceInFlight: false,
      playbackBusy: false,
      routeGeneration: 0,
      smartRefreshPending: false,
      yearMetadataLoading: false,
      lastYearMetadataSummary: null,
      mutationWatcher: null,
      lastPlaylistFingerprint: '',
    };
    return { state };
  })();

  // src/utils.js
  const __mod1 = (() => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function safeClone(value) {
      try { return structuredClone(value); }
      catch { return JSON.parse(JSON.stringify(value)); }
    }

    function normalizeText(value) {
      return String(value ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/[’‘`´]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    }

    function safeErrorMessage(error) {
      if (!error) return '';
      const raw = String(error?.message ?? error);
      return raw
        .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
        .replace(/spotify:(playlist|track|album|artist):[A-Za-z0-9]+/gi, 'spotify:$1:[redacted]')
        .slice(0, 500);
    }

    function consoleWarn(message, error) {
      const detail = safeErrorMessage(error);
      console.warn(`[Smart Search] ${message}${detail ? ` ${detail}` : ''}`);
    }

    function consoleError(message, error) {
      const detail = safeErrorMessage(error);
      console.error(`[Smart Search] ${message}${detail ? ` ${detail}` : ''}`);
    }

    function getPath(object, path) {
      let current = object;
      for (const key of path) {
        if (current == null) return undefined;
        current = current[key];
      }
      return current;
    }

    function firstDefined(object, paths) {
      for (const path of paths) {
        const value = getPath(object, path);
        if (value !== undefined && value !== null) return value;
      }
      return undefined;
    }
    return { safeClone, normalizeText, safeErrorMessage, consoleWarn, consoleError, getPath, firstDefined, sleep };
  })();

  // src/constants.js
  const __mod2 = (() => {
    const VERSION = '1.1.0-release';
    const RELEASE_SEEN_KEY = 'smart-search:last-seen-release';
    const RELEASE_NOTES_REVISION = 2;
    const CONFIG_KEY = 'smart-search-config-v2';
    const PROJECT_URL = 'https://github.com/Yumppe/spicetify-playlist-smart-search';
    const BUG_REPORT_URL = `${PROJECT_URL}/issues/new?template=bug_report.md`;
    const FEATURE_REQUEST_URL = `${PROJECT_URL}/issues/new?template=feature_request.md`;
    const STYLE_ID = 'smart-search-production-style';
    const RESULTS_HOST_ID = 'smart-search-results-root';
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const PAGE_SIZE = 50;
    const RENDER_CHUNK = 80;
    const PLAYBACK_BUFFER_TARGET = 24;
    const PLAYBACK_BUFFER_LOW_WATER = 8;
    const PLAYBACK_REFILL_CHUNK = 16;
    const MUTATION_DEBOUNCE_MS = 450;
    const MUTATION_REFRESH_COOLDOWN_MS = 1800;
    return { VERSION, RELEASE_SEEN_KEY, RELEASE_NOTES_REVISION, CONFIG_KEY, PROJECT_URL, BUG_REPORT_URL, FEATURE_REQUEST_URL, STYLE_ID, RESULTS_HOST_ID, CACHE_TTL_MS, PAGE_SIZE, RENDER_CHUNK, PLAYBACK_BUFFER_TARGET, PLAYBACK_BUFFER_LOW_WATER, PLAYBACK_REFILL_CHUNK, MUTATION_DEBOUNCE_MS, MUTATION_REFRESH_COOLDOWN_MS };
  })();

  // src/ui/styles.js
  const __mod3 = (() => {
    const { STYLE_ID, RESULTS_HOST_ID } = __mod2;
    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
    #${RESULTS_HOST_ID}{display:block;width:100%;color:var(--spice-text,#fff);font-family:var(--encore-body-font-stack,inherit);contain:layout style}
    #${RESULTS_HOST_ID}[hidden]{display:none!important}
    #${RESULTS_HOST_ID} *{box-sizing:border-box}
    .smart-search-native-active{box-shadow:0 0 0 1px var(--spice-button,#1ed760)!important}
    .ss1-shell{width:100%;padding:0 8px 18px}
    .ss1-toolbar{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 8px 8px 12px;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}
    .ss1-summary{display:flex;align-items:center;gap:9px;min-width:0;color:var(--spice-subtext,#b3b3b3);font-size:13px}.ss1-summary strong{color:var(--spice-text,#fff);font-size:14px}
    .ss1-smart-dot{width:8px;height:8px;border-radius:50%;background:var(--spice-button,#1ed760);box-shadow:0 0 0 3px color-mix(in srgb,var(--spice-button,#1ed760) 18%,transparent)}
    .ss1-progress{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ss1-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
    .ss1-button{min-height:32px;border:0;border-radius:999px;padding:0 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--spice-text,#fff);background:color-mix(in srgb,var(--spice-text,#fff) 10%,transparent);display:inline-flex;align-items:center;justify-content:center;text-align:center;line-height:1.2;text-decoration:none;box-sizing:border-box}
    .ss1-button:hover:not(:disabled){background:color-mix(in srgb,var(--spice-text,#fff) 17%,transparent);transform:scale(1.02)}.ss1-button:focus-visible{outline:2px solid var(--spice-text,#fff);outline-offset:2px}
    .ss1-button.primary{background:var(--spice-button,#1ed760);color:#000!important}.ss1-button:disabled{opacity:.45;cursor:default;transform:none}.ss1-button.icon{width:32px;padding:0;display:grid;place-items:center}
    .ss1-status{padding:18px 12px;color:var(--spice-subtext,#b3b3b3);font-size:14px}.ss1-status.error{color:#f15e6c;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}.ss1-status.query-error{color:#f6c453}
    .ss1-column-header,.ss1-row{display:grid;grid-template-columns:42px minmax(240px,2fr) minmax(170px,1fr) minmax(135px,.8fr) 64px;align-items:center;column-gap:12px}
    .ss1-column-header{position:sticky;top:0;z-index:2;min-height:36px;padding:0 12px;color:var(--spice-subtext,#b3b3b3);font-size:12px;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent);background:var(--spice-main,#121212)}
    .ss1-row{position:relative;min-height:56px;padding:4px 12px;border-radius:4px;color:var(--spice-text,#fff)}.ss1-row:hover,.ss1-row:focus-within{background:color-mix(in srgb,var(--spice-text,#fff) 9%,transparent)}.ss1-row.is-playing .ss1-title{color:var(--spice-button,#1ed760)}
    .ss1-row-number{position:relative;text-align:right;color:var(--spice-subtext,#b3b3b3);font-variant-numeric:tabular-nums}.ss1-row-play{position:absolute;right:-2px;top:50%;translate:0 -50%;display:none;width:28px;height:28px;border:0;background:transparent;color:var(--spice-text,#fff);cursor:pointer}.ss1-row:hover .ss1-row-index,.ss1-row:focus-within .ss1-row-index{visibility:hidden}.ss1-row:hover .ss1-row-play,.ss1-row:focus-within .ss1-row-play{display:block}
    .ss1-title-cell{display:flex;align-items:center;gap:12px;min-width:0}.ss1-cover,.ss1-cover-placeholder{width:40px;height:40px;border-radius:4px;background:#282828;flex:0 0 auto}.ss1-cover{object-fit:cover}.ss1-title-stack,.ss1-title,.ss1-artists,.ss1-album,.ss1-added{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ss1-title{font-size:14px}.ss1-artists,.ss1-album,.ss1-added,.ss1-duration{font-size:12px;color:var(--spice-subtext,#b3b3b3)}.ss1-duration{text-align:right;font-variant-numeric:tabular-nums}.ss1-sentinel{height:1px}
    .ss1-help{padding:12px;color:var(--spice-subtext,#b3b3b3);font-size:11px;line-height:1.55;border-top:1px solid color-mix(in srgb,var(--spice-text,#fff) 8%,transparent)}.ss1-help code{color:var(--spice-text,#fff)}.ss1-collapsed-note{padding:14px 12px;color:var(--spice-subtext,#b3b3b3);font-size:12px}
    .ss1-settings{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow-x:hidden;color:var(--spice-text,#fff)}.ss1-settings-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}.ss1-settings-copy{min-width:0;overflow-wrap:anywhere}.ss1-settings-title{font-weight:700}.ss1-settings-desc{margin-top:3px;color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.4}
    .ss1-toggle{min-width:48px;height:28px;border:0;border-radius:999px;padding:3px;background:#535353;cursor:pointer;position:relative;flex:0 0 auto}.ss1-toggle::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform 120ms ease}.ss1-toggle[aria-pressed='true']{background:var(--spice-button,#1ed760)}.ss1-toggle[aria-pressed='true']::after{transform:translateX(20px)}
    .ss1-panel{margin-top:18px;padding:14px;border-radius:10px;background:color-mix(in srgb,var(--spice-text,#fff) 6%,transparent);border:1px solid color-mix(in srgb,var(--spice-text,#fff) 7%,transparent)}.ss1-panel-title{font-weight:700;margin-bottom:7px}.ss1-panel-desc,.ss1-muted{color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.5}.ss1-collapsible{padding:0}.ss1-panel-summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;padding:14px;user-select:none}.ss1-panel-summary::-webkit-details-marker{display:none}.ss1-panel-summary .ss1-panel-title{margin:0}.ss1-panel-chevron{color:var(--spice-subtext,#b3b3b3);font-size:18px;transition:transform 120ms ease}.ss1-collapsible[open] .ss1-panel-chevron{transform:rotate(180deg)}.ss1-panel-body{padding:0 14px 14px;border-top:1px solid color-mix(in srgb,var(--spice-text,#fff) 8%,transparent)}.ss1-tutorial-grid{display:grid;grid-template-columns:minmax(150px,auto) 1fr;gap:10px 18px;margin-top:14px;align-items:start;font-size:12px}.ss1-tutorial-grid>code{color:var(--spice-text,#fff);white-space:nowrap;font-weight:700}.ss1-tutorial-meaning{display:flex;gap:7px;min-width:0}.ss1-tutorial-meaning strong{min-width:96px}.ss1-tutorial-meaning span{color:var(--spice-subtext,#b3b3b3)}
    .ss1-diag-grid{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:7px 14px;font-size:12px;margin-top:12px}.ss1-diag-ok{color:var(--spice-button,#1ed760)}.ss1-diag-bad{color:#f6c453}.ss1-diag-neutral{color:var(--spice-subtext,#b3b3b3)}.ss1-panel-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ss1-action-feedback{margin-top:10px;padding:8px 10px;border-radius:7px;background:color-mix(in srgb,var(--spice-text,#fff) 6%,transparent);font-size:12px;line-height:1.4;color:var(--spice-subtext,#b3b3b3)}.ss1-feedback-ok{color:var(--spice-button,#1ed760)}.ss1-feedback-warn{color:#f6c453}.ss1-feedback-error{color:#f15e6c}.ss1-pre{margin-top:10px;padding:10px;border-radius:6px;background:rgba(0,0,0,.25);font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:220px;overflow:auto}.ss1-version{margin-top:16px;color:var(--spice-subtext,#b3b3b3);font-size:11px}
    .ss1-release-notes{min-width:0;color:var(--spice-text,#fff);padding:2px 0}.ss1-release-header{padding:12px 14px;border-radius:10px;background:color-mix(in srgb,var(--spice-text,#fff) 6%,transparent);border:1px solid color-mix(in srgb,var(--spice-text,#fff) 7%,transparent)}.ss1-release-kicker{font-size:15px;font-weight:800}.ss1-release-subtitle{margin-top:3px;color:var(--spice-subtext,#b3b3b3);font-size:12px}.ss1-release-list{margin:14px 0 0;padding:0;list-style:none;color:var(--spice-text,#fff);font-size:13px;line-height:1.5}.ss1-release-list li{position:relative;padding:9px 12px 9px 28px;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 7%,transparent)}.ss1-release-list li::before{content:'•';position:absolute;left:10px;top:8px;color:var(--spice-button,#1ed760);font-weight:900}.ss1-release-list li:last-child{border-bottom:0}.ss1-release-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid color-mix(in srgb,var(--spice-text,#fff) 8%,transparent)}.ss1-release-actions .ss1-button{min-width:118px}
    @media(max-width:760px){.ss1-tutorial-grid{grid-template-columns:1fr}.ss1-tutorial-meaning{display:block}.ss1-tutorial-meaning strong{display:block;margin-bottom:2px}}
    @media(max-width:1000px){.ss1-column-header,.ss1-row{grid-template-columns:38px minmax(220px,2fr) minmax(150px,1fr) 60px}.ss1-date-column{display:none}}@media(max-width:760px){.ss1-toolbar{align-items:flex-start;flex-direction:column}.ss1-actions{width:100%}.ss1-column-header,.ss1-row{grid-template-columns:34px minmax(180px,1fr) 56px}.ss1-album-column,.ss1-date-column{display:none}.ss1-shell{padding-left:0;padding-right:0}.ss1-syntax-grid{grid-template-columns:auto 1fr}.ss1-syntax-grid .ss1-syntax-description{grid-column:1/-1}}
    `;
      document.head.appendChild(style);
    }
    return { injectStyles };
  })();

  // src/config.js
  const __mod4 = (() => {
    const { CONFIG_KEY } = __mod2;
    const { state } = __mod0;
    const { safeClone } = __mod1;
    const DEFAULT_CONFIG = {
      enabled: true,
      resultsCollapsed: false,
      showSyntaxHelp: true,
      preferNativeRows: true,
      livePlaylistRefresh: true,
    };

    function loadConfig() {
      try {
        const raw = state.S?.LocalStorage?.get?.(CONFIG_KEY) ?? globalThis.localStorage?.getItem?.(CONFIG_KEY);
        if (!raw) return safeClone(DEFAULT_CONFIG);
        const parsed = JSON.parse(raw);
        return {
          enabled: parsed?.enabled !== false,
          resultsCollapsed: Boolean(parsed?.resultsCollapsed),
          showSyntaxHelp: parsed?.showSyntaxHelp !== false,
          preferNativeRows: parsed?.preferNativeRows !== false,
          livePlaylistRefresh: parsed?.livePlaylistRefresh !== false,
        };
      } catch {
        return safeClone(DEFAULT_CONFIG);
      }
    }

    function saveConfig(config) {
      const raw = JSON.stringify(config);
      try { state.S?.LocalStorage?.set?.(CONFIG_KEY, raw); } catch {}
      try { globalThis.localStorage?.setItem?.(CONFIG_KEY, raw); } catch {}
    }

    function updateConfig(patch) {
      const next = { ...loadConfig(), ...patch };
      saveConfig(next);
      return next;
    }
    return { loadConfig, saveConfig, updateConfig, DEFAULT_CONFIG };
  })();

  // src/search/parser.js
  const __mod5 = (() => {
    const { normalizeText } = __mod1;
    const SYNTAX_REFERENCE = [
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

    function parseQuery(query) {
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

    function smartSyntaxUsed(query) {
      const value = String(query ?? '');
      if (/\\[;&@\\-]/.test(value)) return true;
      if (/\byear\s*:/i.test(value)) return true;
      if (/(?:^|[;&])\s*(?:<=|>=|<|>|=)\s*\d{4}(?:\s*(?:[;&]|$))/.test(value)) return true;
      if (containsUnescaped(value, ';') || containsUnescaped(value, '&')) return true;
      const trimmed = value.trimStart();
      if (trimmed.startsWith('@') || trimmed.startsWith('-')) return true;
      // Also detect operators at the beginning of an AND/OR branch.
      return /(?:^|[;&])\s*[@-]/.test(value.replace(/\\[@-]/g, ''));
    }

    function describeParseErrors(errors) {
      return errors?.length ? errors.join(' ') : '';
    }
    return { parseQuery, smartSyntaxUsed, describeParseErrors, SYNTAX_REFERENCE };
  })();

  // src/spotify/capabilities.js
  const __mod6 = (() => {
    const { state } = __mod0;
    const PLAYLIST_DEFINITION_NAMES = [
      'FetchPlaylistContents',
      'fetchPlaylist',
      'fetchPlaylistContents',
      'fetchPlaylistContentsWithGatedEntityRelations',
    ];

    function operationName(definition) {
      try {
        return definition?.definitions?.find((item) => item?.kind === 'OperationDefinition')?.name?.value ?? '';
      } catch {
        return '';
      }
    }

    function graphQLDefinitionPools(S = state.S ?? globalThis.Spicetify) {
      const graphQL = S?.GraphQL;
      return [
        graphQL?.Definitions,
        graphQL?.QueryDefinitions,
      ].filter((pool, index, all) => pool && typeof pool === 'object' && all.indexOf(pool) === index);
    }

    function playlistGraphQLDefinitions(S = state.S ?? globalThis.Spicetify) {
      const found = [];
      const seen = new Set();
      for (const pool of graphQLDefinitionPools(S)) {
        for (const name of PLAYLIST_DEFINITION_NAMES) {
          const definition = pool?.[name];
          if (definition && !seen.has(definition)) {
            seen.add(definition);
            found.push([name, definition]);
          }
        }
        for (const [key, definition] of Object.entries(pool)) {
          if (!definition || seen.has(definition)) continue;
          const op = operationName(definition);
          if (/playlist/i.test(key) && /contents/i.test(key) || /playlist/i.test(op) && /contents/i.test(op)) {
            seen.add(definition);
            found.push([op || key, definition]);
          }
        }
      }
      return found;
    }

    function detectCapabilities() {
      const S = state.S ?? globalThis.Spicetify;
      const playerApi = S?.Platform?.PlayerAPI;
      const queueController = playerApi?._queue;
      const queueCore = queueController?._queue;
      const queueClient = queueController?._client;
      const pools = graphQLDefinitionPools(S);
      const playlistDefinitions = playlistGraphQLDefinitions(S);

      return {
        spicetify: Boolean(S),
        platform: Boolean(S?.Platform),
        player: Boolean(S?.Player),
        playerEvents: typeof S?.Player?.addEventListener === 'function',
        playerPlayUri: typeof S?.Player?.playUri === 'function',
        playerNext: typeof S?.Player?.next === 'function',
        history: Boolean(S?.Platform?.History),
        historyListen: typeof S?.Platform?.History?.listen === 'function',
        playlistApi: Boolean(S?.Platform?.PlaylistAPI),
        playlistGetContents: typeof S?.Platform?.PlaylistAPI?.getContents === 'function',
        cosmosAsync: typeof S?.CosmosAsync?.get === 'function',
        graphql: Boolean(S?.GraphQL),
        graphqlRequest: typeof S?.GraphQL?.Request === 'function',
        graphqlDefinitions: pools.length > 0,
        graphqlPlaylistDefinition: playlistDefinitions.length > 0,
        graphqlPlaylistDefinitionNames: playlistDefinitions.map(([name]) => name),
        localStorage: Boolean(S?.LocalStorage?.get && S?.LocalStorage?.set),
        popupModal: typeof S?.PopupModal?.display === 'function',
        menuItem: typeof S?.Menu?.Item === 'function',
        silentAddToQueue: typeof S?.addToQueue === 'function',
        platformAddToQueue: typeof playerApi?.addToQueue === 'function',
        clearQueue: typeof playerApi?.clearQueue === 'function',
        updateContext: typeof playerApi?.updateContext === 'function',
        nativeSetQueue: Boolean(queueClient?.setQueue && queueCore),
        queueState: Boolean(queueController?._queueState),
      };
    }

    function capabilityRows() {
      const c = detectCapabilities();
      const graphQLReady = c.graphqlRequest && c.graphqlPlaylistDefinition;
      const graphQLStatus = graphQLReady ? 'Ready' : c.graphqlRequest ? 'Not exposed' : 'Unavailable';
      const graphQLTone = graphQLReady ? 'ok' : c.playlistGetContents ? 'neutral' : 'warn';
      const nativeStatus = state.nativeAdapterMode === 'native'
        ? 'Active'
        : state.nativeAdapterMode === 'fallback'
          ? 'Fallback'
          : state.nativeAdapterMode === 'attaching'
            ? 'Checking…'
            : 'Not tested';
      const nativeTone = state.nativeAdapterMode === 'fallback' ? 'warn' : state.nativeAdapterMode === 'native' ? 'ok' : 'neutral';

      return [
        { name: 'Playlist API', status: c.playlistGetContents ? 'Available' : 'Unavailable', tone: c.playlistGetContents ? 'ok' : 'warn', note: 'Primary playlist source' },
        { name: 'GraphQL fallback', status: graphQLStatus, tone: graphQLTone, note: graphQLReady ? `Fallback definition: ${c.graphqlPlaylistDefinitionNames[0]}` : c.playlistGetContents ? 'Not needed unless the Playlist API fails' : 'No compatible playlist definition detected' },
        { name: 'Release-year lookup', status: c.cosmosAsync ? 'Available' : 'Unavailable', tone: c.cosmosAsync ? 'ok' : 'warn', note: 'Used only when a year filter needs missing release dates' },
        { name: 'Native playlist rows', status: nativeStatus, tone: nativeTone, note: state.nativeAdapterMode === 'idle' ? 'Checked when Smart Search is active' : `Adapter: ${state.nativeAdapterMode}` },
        { name: 'Silent queue API', status: c.silentAddToQueue ? 'Available' : 'Unavailable', tone: c.silentAddToQueue ? 'ok' : 'neutral', note: 'Preferred compatibility queue' },
        { name: 'Platform queue API', status: c.platformAddToQueue ? 'Available' : 'Unavailable', tone: c.platformAddToQueue ? 'ok' : 'neutral', note: 'Queue fallback' },
        { name: 'Private setQueue bridge', status: c.nativeSetQueue ? 'Available' : 'Unavailable', tone: c.nativeSetQueue ? 'ok' : 'neutral', note: 'Optional native filtered playback' },
        { name: 'Queue clearing', status: c.clearQueue ? 'Available' : 'Unavailable', tone: c.clearQueue ? 'ok' : 'neutral', note: 'Compatibility playback helper' },
        { name: 'Playback context sync', status: c.updateContext ? 'Available' : 'Unavailable', tone: c.updateContext ? 'ok' : 'neutral', note: 'Optional; failure is non-fatal' },
        { name: 'Settings modal', status: c.popupModal ? 'Available' : 'Unavailable', tone: c.popupModal ? 'ok' : 'warn', note: 'Settings UI' },
        { name: 'Settings menu', status: c.menuItem ? 'Available' : 'Unavailable', tone: c.menuItem ? 'ok' : 'neutral', note: 'Profile-menu entry' },
      ];
    }
    return { graphQLDefinitionPools, playlistGraphQLDefinitions, detectCapabilities, capabilityRows };
  })();

  // src/events.js
  const __mod7 = (() => {
    const listeners = new Map();

    function on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event)?.delete(handler);
    }

    function emit(event, payload) {
      for (const handler of listeners.get(event) ?? []) {
        try { handler(payload); } catch (error) { console.warn('[Smart Search] event handler failed', event, error); }
      }
    }
    return { on, emit };
  })();

  // src/ui/dom.js
  const __mod8 = (() => {
    const { state } = __mod0;
    function findPlaylistPage() {
      return document.querySelector('[data-testid="playlist-page"]') || document.querySelector('main');
    }

    function findTracklistContainer() {
      const page = findPlaylistPage();
      if (!page) return null;
      return page.querySelector('[data-testid="playlist-tracklist"]')
        || page.querySelector('.main-trackList-trackList')
        || page.querySelector('[role="grid"]');
    }

    function playlistIdFromLocation() {
      const path = state.S?.Platform?.History?.location?.pathname || location.pathname || '';
      const match = path.match(/\/playlist\/([A-Za-z0-9]+)/);
      return match ? match[1] : null;
    }

    function nativeSearchCandidates() {
      const page = findPlaylistPage();
      if (!page) return [];
      return [...page.querySelectorAll('input')].filter((input) => {
        const hint = `${input.getAttribute('placeholder') || ''} ${input.getAttribute('aria-label') || ''}`.toLocaleLowerCase();
        return input.getAttribute('role') === 'searchbox' || hint.includes('playlist') || input.classList.contains('x-filterBox-filterInput');
      });
    }

    function restoreNativeTracklist() {
      if (!state.hiddenTracklist) return;
      state.hiddenTracklist.style.display = state.hiddenTracklistDisplay;
      state.hiddenTracklist = null;
      state.hiddenTracklistDisplay = '';
    }

    function hideNativeTracklist() {
      const tracklist = findTracklistContainer();
      if (!tracklist) return;
      if (state.hiddenTracklist && state.hiddenTracklist !== tracklist) restoreNativeTracklist();
      if (state.hiddenTracklist === tracklist) {
        if (tracklist.style.display !== 'none') tracklist.style.display = 'none';
        return;
      }
      state.hiddenTracklist = tracklist;
      state.hiddenTracklistDisplay = tracklist.style.display || '';
      tracklist.style.display = 'none';
    }

    function setNativeSmartState(active) {
      state.nativeSearchInput?.classList.toggle('smart-search-native-active', active);
    }
    return { findPlaylistPage, findTracklistContainer, playlistIdFromLocation, nativeSearchCandidates, restoreNativeTracklist, hideNativeTracklist, setNativeSmartState };
  })();

  // src/spotify/react-internals.js
  const __mod9 = (() => {
    function reactFiberFor(element) {
      if (!element) return null;
      for (const key of Object.getOwnPropertyNames(element)) {
        if (!key.startsWith('__reactFiber$') && !key.startsWith('__reactInternalInstance$')) continue;
        try { return element[key] ?? null; } catch { return null; }
      }
      return null;
    }

    function fiberChainFromFiber(start, maxDepth = 48) {
      const result = [];
      let fiber = start;
      const seen = new Set();
      while (fiber && result.length < maxDepth && !seen.has(fiber)) {
        seen.add(fiber);
        result.push(fiber);
        fiber = fiber.return;
      }
      return result;
    }

    function fiberChainFrom(element, maxDepth = 48) {
      return fiberChainFromFiber(reactFiberFor(element), maxDepth);
    }

    function propsForFiber(fiber) {
      return fiber?.memoizedProps && typeof fiber.memoizedProps === 'object'
        ? fiber.memoizedProps
        : fiber?.pendingProps && typeof fiber.pendingProps === 'object'
          ? fiber.pendingProps
          : null;
    }
    return { reactFiberFor, fiberChainFromFiber, fiberChainFrom, propsForFiber };
  })();

  // src/diagnostics.js
  const __mod10 = (() => {
    const { VERSION } = __mod2;
    const { state } = __mod0;
    const { loadConfig } = __mod4;
    const { detectCapabilities } = __mod6;
    const { safeErrorMessage } = __mod1;
    const log = [];
    const MAX_LOG = 30;

    function recordDiagnostic(type, detail = '') {
      log.push({ at: new Date().toISOString(), type, detail: safeErrorMessage(detail) });
      if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    }

    function clientVersion() {
      const S = state.S;
      return S?.Platform?.Session?.clientVersion
        ?? S?.Platform?.Session?.client_version
        ?? S?.Platform?.Session?.productState?.client_version
        ?? S?.Platform?.PlatformData?.client_version
        ?? S?.Platform?.PlatformData?.clientVersion
        ?? globalThis.Spicetify?.Platform?.Session?.clientVersion
        ?? 'unknown';
    }

    function spicetifyVersion() {
      return globalThis.Spicetify?.version ?? globalThis.Spicetify?.Config?.version ?? 'unknown';
    }

    function diagnosticsSnapshot() {
      const session = state.playbackSession;
      return {
        extensionVersion: VERSION,
        spotifyClientVersion: clientVersion(),
        spicetifyVersion: spicetifyVersion(),
        playlistId: state.playlistId ? '[present]' : null,
        playlistSource: state.source,
        loadedTracks: state.tracks.length,
        filteredTracks: state.filtered.length,
        queryActive: Boolean(state.query),
        queryErrors: [...state.queryErrors],
        nativeAdapterMode: state.nativeAdapterMode,
        nativeAdapterError: state.nativeAdapterError,
        nativeAdapterResultCount: state.nativeAdapterResultCount,
        playbackMethod: session?.method ?? null,
        playbackActive: Boolean(session?.active),
        cacheEntries: state.cache.size,
        config: loadConfig(),
        capabilities: detectCapabilities(),
        recentEvents: [...log],
      };
    }

    function diagnosticsText() {
      return JSON.stringify(diagnosticsSnapshot(), null, 2);
    }

    async function copyDiagnostics() {
      const text = diagnosticsText();
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    }
    return { copyDiagnostics, recordDiagnostic, diagnosticsSnapshot, diagnosticsText };
  })();

  // src/spotify/mutation-watcher.js
  const __mod11 = (() => {
    const { MUTATION_DEBOUNCE_MS, MUTATION_REFRESH_COOLDOWN_MS, RESULTS_HOST_ID } = __mod2;
    const { state } = __mod0;
    const { loadConfig } = __mod4;
    const { emit } = __mod7;
    const { findPlaylistPage, findTracklistContainer } = __mod8;
    const { recordDiagnostic } = __mod10;
    let observer = null;
    let root = null;
    let debounceTimer = null;
    let lastRefreshAt = 0;
    let suspendedUntil = 0;

    function suspendMutationWatcher(ms = 300) {
      suspendedUntil = Math.max(suspendedUntil, Date.now() + ms);
    }

    function isOwnMutation(mutation) {
      const target = mutation.target?.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target?.parentElement;
      return Boolean(target?.closest?.(`#${RESULTS_HOST_ID}`));
    }

    function scheduleCandidateRefresh() {
      if (!loadConfig().livePlaylistRefresh || Date.now() < suspendedUntil) return;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const now = Date.now();
        if (now - lastRefreshAt < MUTATION_REFRESH_COOLDOWN_MS) return;
        lastRefreshAt = now;
        recordDiagnostic('playlist-mutation-candidate', 'DOM change detected');
        emit('playlist-mutation-candidate', { reason: 'dom-mutation' });
      }, MUTATION_DEBOUNCE_MS);
    }

    function maintainMutationWatcher() {
      if (!loadConfig().livePlaylistRefresh || !state.playlistId) {
        stopMutationWatcher();
        return;
      }
      const nextRoot = findTracklistContainer() ?? findPlaylistPage();
      if (!nextRoot) return;
      if (observer && root === nextRoot) return;
      stopMutationWatcher();
      root = nextRoot;
      observer = new MutationObserver((mutations) => {
        if (Date.now() < suspendedUntil) return;
        if (mutations.every(isOwnMutation)) return;
        // Child-list changes catch playlist row replacement after add/remove operations.
        // The refresh is debounced + fingerprinted by playlist-source, so harmless React
        // remounts do not alter state even if they trigger this fallback observer.
        if (mutations.some((mutation) => mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length))) {
          scheduleCandidateRefresh();
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    }

    function stopMutationWatcher() {
      try { observer?.disconnect(); } catch {}
      observer = null;
      root = null;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return { suspendMutationWatcher, maintainMutationWatcher, stopMutationWatcher };
  })();

  // src/spotify/native-list-adapter.js
  const __mod12 = (() => {
    const { state } = __mod0;
    const { loadConfig } = __mod4;
    const { emit } = __mod7;
    const { consoleWarn, sleep } = __mod1;
    const { findPlaylistPage, findTracklistContainer, restoreNativeTracklist, setNativeSmartState } = __mod8;
    const { reactFiberFor, fiberChainFrom, fiberChainFromFiber, propsForFiber } = __mod9;
    const { suspendMutationWatcher } = __mod11;
    const { recordDiagnostic } = __mod10;
    let nativePatch = null;
    let attachGeneration = 0;
    let lastKnownTarget = null;
    let structuralScanAt = 0;
    let nativeFilterSuppressed = false;
    let headerCountElement = null;
    let headerCountOriginalText = '';
    let nativeListObserver = null;
    let nativeListObserverRoot = null;
    let nativeListObserverPlaylistId = null;
    let nativeListMaintenanceQueued = false;
    let sortBridgeInstalled = false;
    let sortRefreshTimer = null;

    function primitiveSortKey(value) {
      if (value == null) return '';
      if (typeof value === 'string' || typeof value === 'number') return String(value);
      if (typeof value === 'symbol') return value.description || String(value);
      if (typeof value === 'object') {
        for (const key of ['id', 'key', 'name', 'type', 'columnType', 'value']) {
          try {
            const nested = value[key];
            if (nested != null && nested !== value) {
              const result = primitiveSortKey(nested);
              if (result) return result;
            }
          } catch {}
        }
      }
      try { return String(value); } catch { return ''; }
    }

    function nativeTargetScore(fiber) {
      const props = propsForFiber(fiber);
      const cache = props?.itemsCache;
      if (!cache || typeof cache !== 'object') return -1;
      if (typeof cache.getItem !== 'function' && typeof cache.getItems !== 'function') return -1;
      let score = 20;
      if (typeof cache.getItem === 'function') score += 3;
      if (typeof cache.getItems === 'function') score += 4;
      if (typeof cache.invalidateCache === 'function') score += 1;
      if (props.sortState && typeof props.sortState === 'object') score += 6;
      if (typeof props.onSort === 'function') score += 4;
      if (typeof props.resolveItem === 'function') score += 3;
      if (typeof props.renderRow === 'function' || typeof props.renderRows === 'function') score += 2;
      if (typeof props.nrTracks === 'number') score += 2;
      if (typeof props.rowCount === 'number') score += 1;
      if (props.canFetchAllTracks === true) score += 1;
      return score;
    }

    function sortStateForFiber(fiber) {
      for (const item of fiberChainFromFiber(fiber, 18)) {
        const sort = propsForFiber(item)?.sortState;
        if (sort && typeof sort === 'object') return sort;
      }
      return null;
    }

    function sortSignatureFromState(sortState) {
      if (!sortState || typeof sortState !== 'object') return '';
      const column = primitiveSortKey(sortState.column ?? sortState.field ?? sortState.key ?? '');
      const order = primitiveSortKey(sortState.order ?? sortState.direction ?? '');
      return `${column}|${order}`;
    }

    function targetFromFiber(fiber) {
      const score = nativeTargetScore(fiber);
      if (score < 0) return null;
      const props = propsForFiber(fiber);
      const cache = props?.itemsCache;
      const sortState = sortStateForFiber(fiber);
      return {
        cache,
        fiber,
        chain: fiberChainFromFiber(fiber),
        sortState,
        sortSignature: sortSignatureFromState(sortState),
        score,
      };
    }

    function isTargetUsable(target) {
      return Boolean(target?.cache && typeof target.cache === 'object'
        && (typeof target.cache.getItem === 'function' || typeof target.cache.getItems === 'function'));
    }

    function nativeAnchorElements() {
      const page = findPlaylistPage();
      if (!page) return [];
      const result = [];
      const add = (element) => { if (element && !result.includes(element)) result.push(element); };
      add(findTracklistContainer());
      add(state.nativeSearchInput);
      add(page);
      for (const element of [...page.querySelectorAll('.main-trackList-trackListRow,[role="row"],[role="columnheader"],[aria-sort],button[role="combobox"],.x-filterBox-filterInput')].slice(0, 18)) add(element);
      return result;
    }

    function bestTargetFromAncestorChains() {
      let best = null;
      for (const element of nativeAnchorElements()) {
        for (const fiber of fiberChainFrom(element, 56)) {
          const target = targetFromFiber(fiber);
          if (target && (!best || target.score > best.score)) best = target;
        }
      }
      return best;
    }

    function bestTargetFromFiberNeighborhood() {
      const starts = nativeAnchorElements().map(reactFiberFor).filter(Boolean);
      if (!starts.length) return null;
      const queue = [...starts];
      const seen = new Set();
      let best = null;
      while (queue.length && seen.size < 9000) {
        const fiber = queue.shift();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);
        const target = targetFromFiber(fiber);
        if (target && (!best || target.score > best.score)) {
          best = target;
          if (best.score >= 38) break;
        }
        for (const next of [fiber.return, fiber.child, fiber.sibling, fiber.alternate]) {
          if (next && !seen.has(next)) queue.push(next);
        }
      }
      return best;
    }

    function discoverNativeTarget(forceStructuralScan = false) {
      if (!loadConfig().preferNativeRows) return null;
      if (nativePatch?.active && nativePatch.cache) {
        const current = targetFromFiber(nativePatch.targetFiber);
        if (current && current.cache === nativePatch.cache) return current;
      }
      if (isTargetUsable(lastKnownTarget)) {
        const refreshed = targetFromFiber(lastKnownTarget.fiber);
        if (refreshed && refreshed.cache === lastKnownTarget.cache) {
          lastKnownTarget = refreshed;
          return refreshed;
        }
      }
      const ancestor = bestTargetFromAncestorChains();
      if (ancestor) {
        lastKnownTarget = ancestor;
        return ancestor;
      }
      const now = Date.now();
      if (!forceStructuralScan && now - structuralScanAt < 120) return null;
      structuralScanAt = now;
      const structural = bestTargetFromFiberNeighborhood();
      if (structural) lastKnownTarget = structural;
      return structural;
    }

    function primeNativeListTarget() {
      if (state.playlistId && loadConfig().preferNativeRows) discoverNativeTarget(false);
    }

    function compareText(a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    }

    function sortDirection(sortState) {
      const raw = sortState?.order ?? sortState?.direction;
      if (typeof raw === 'number') {
        if (raw === 2 || raw < 0) return -1;
        if (raw === 1 || raw > 0) return 1;
        return 0;
      }
      const text = primitiveSortKey(raw).toLowerCase();
      if (/desc|reverse|down/.test(text)) return -1;
      if (/asc|forward|up/.test(text)) return 1;
      return 0;
    }

    function sortColumn(sortState) {
      return primitiveSortKey(sortState?.column ?? sortState?.field ?? sortState?.key).toLowerCase();
    }

    function sortedTracksForNative(target) {
      const base = [...state.filtered];
      const column = sortColumn(target.sortState);
      const direction = sortDirection(target.sortState);
      if (!direction || !column) return base;
      let selector = null;
      if (/album/.test(column)) selector = (track) => track.albumNorm;
      else if (/date|added|recent/.test(column)) selector = (track) => Date.parse(track.addedAt || '') || 0;
      else if (/duration|time|length/.test(column)) selector = (track) => track.duration;
      else if (/artist/.test(column)) selector = (track) => track.artistNorm[0] || '';
      else if (/title|name|track/.test(column)) selector = (track) => track.titleNorm;
      else if (/custom|order|index|position/.test(column)) selector = (track) => track.playlistIndex;
      if (!selector) return base;
      return base.map((track, index) => ({ track, index, value: selector(track) }))
        .sort((a, b) => {
          const cmp = typeof a.value === 'number' && typeof b.value === 'number'
            ? a.value - b.value
            : compareText(String(a.value), String(b.value));
          return cmp ? cmp * direction : a.index - b.index;
        })
        .map((entry) => entry.track);
    }

    function replaceFirstArray(value, replacement, total) {
      if (Array.isArray(value)) return replacement;
      if (!value || typeof value !== 'object') return value;
      for (const key of ['items', 'tracks', 'rows', 'entries', 'values']) {
        if (!Array.isArray(value[key])) continue;
        const clone = { ...value, [key]: replacement };
        for (const totalKey of ['total', 'totalCount', 'count', 'length']) {
          if (typeof clone[totalKey] === 'number') clone[totalKey] = total;
        }
        return clone;
      }
      return value;
    }

    function numericRange(args, fallbackCount) {
      const nums = args.filter((value) => Number.isInteger(value) && value >= 0).map(Number);
      const start = nums[0] ?? 0;
      let count = nums[1] ?? fallbackCount;
      if (nums.length >= 2 && start > 0 && nums[1] > start && nums[1] - start <= 500) count = nums[1] - start;
      if (!Number.isFinite(count) || count <= 0) count = fallbackCount;
      return { start, count: Math.min(Math.max(1, count), 1000) };
    }

    function forceTracklistUpdate(chain) {
      for (const fiber of chain) {
        const stateNode = fiber?.stateNode;
        if (stateNode && typeof stateNode.forceUpdate === 'function') {
          try { stateNode.forceUpdate(); return; } catch {}
        }
        let hook = fiber?.memoizedState;
        let guard = 0;
        while (hook && guard++ < 28) {
          if (typeof hook.memoizedState === 'number' && typeof hook.queue?.dispatch === 'function') {
            try { hook.queue.dispatch((value) => Number(value || 0) + 1); return; } catch {}
          }
          hook = hook.next;
        }
      }
      try { findTracklistContainer()?.dispatchEvent(new Event('scroll', { bubbles: true })); } catch {}
    }

    function mutateFiberCounts(chain, patch) {
      const count = patch.orderedRawItems.length;
      for (const fiber of chain) {
        for (const key of ['memoizedProps', 'pendingProps']) {
          const props = fiber?.[key];
          if (!props || typeof props !== 'object') continue;
          try {
            if ('nrTracks' in props) props.nrTracks = count;
            if ('rowCount' in props && typeof props.rowCount === 'number') props.rowCount = count;
            if ('itemsCache' in props && props.itemsCache !== patch.cache && nativeTargetScore(fiber) >= 0) props.itemsCache = patch.cache;
            if ('getItems' in props && typeof patch.cache.getItems === 'function') props.getItems = patch.cache.getItems;
          } catch {}
        }
      }
    }

    function patchNativeCache(patch, chain) {
      suspendMutationWatcher(350);
      const cache = patch.cache;
      if (patch.originalGetItem) {
        try {
          const wrapped = function smartSearchGetItem(index, ...rest) {
            if (!patch.active) return patch.originalGetItem.call(cache, index, ...rest);
            const value = patch.orderedRawItems[Number(index) || 0];
            return patch.originalGetItemWasPromise ? Promise.resolve(value) : value;
          };
          patch.wrappedGetItem = wrapped;
          cache.getItem = wrapped;
        } catch {}
      }
      if (patch.originalGetItems) {
        try {
          const wrapped = function smartSearchGetItems(...args) {
            const originalResult = patch.originalGetItems.apply(cache, args);
            if (!patch.active) return originalResult;
            const adapt = (result) => {
              let fallbackCount = 50;
              if (Array.isArray(result)) fallbackCount = Math.max(1, result.length || 50);
              else if (Array.isArray(result?.items)) fallbackCount = Math.max(1, result.items.length || 50);
              else if (Array.isArray(result?.tracks)) fallbackCount = Math.max(1, result.tracks.length || 50);
              const { start, count } = numericRange(args, fallbackCount);
              const replacement = patch.orderedRawItems.slice(start, start + count);
              const adapted = replaceFirstArray(result, replacement, patch.orderedRawItems.length);
              return adapted === result && !Array.isArray(result) ? replacement : adapted;
            };
            return originalResult && typeof originalResult.then === 'function'
              ? Promise.resolve(originalResult).then(adapt)
              : adapt(originalResult);
          };
          patch.wrappedGetItems = wrapped;
          cache.getItems = wrapped;
        } catch {}
      }
      try {
        const descriptor = Object.getOwnPropertyDescriptor(cache, 'nrValidItems');
        if (!descriptor || descriptor.configurable !== false) {
          Object.defineProperty(cache, 'nrValidItems', {
            configurable: true,
            enumerable: descriptor?.enumerable ?? true,
            get: () => patch.active ? patch.orderedRawItems.length : patch.originalNrValue,
            set: (value) => { patch.originalNrValue = value; },
          });
        } else if (descriptor.writable) cache.nrValidItems = patch.orderedRawItems.length;
      } catch {
        try { cache.nrValidItems = patch.orderedRawItems.length; } catch {}
      }
      mutateFiberCounts(chain, patch);
      forceTracklistUpdate(chain);
    }

    function restoreFiberCounts(chain, patch) {
      const fullCount = Number(patch.originalNrValue) || state.tracks.length;
      for (const fiber of chain ?? []) {
        for (const key of ['memoizedProps', 'pendingProps']) {
          const props = fiber?.[key];
          if (!props || typeof props !== 'object') continue;
          try {
            if ('nrTracks' in props) props.nrTracks = fullCount;
            if ('rowCount' in props && typeof props.rowCount === 'number') props.rowCount = fullCount;
            if ('getItems' in props && patch.originalGetItems) props.getItems = patch.originalGetItems;
          } catch {}
        }
      }
    }

    function restoreNativePatch(forceUpdate = true) {
      const patch = nativePatch;
      nativePatch = null;
      if (!patch) return;
      patch.active = false;
      suspendMutationWatcher(350);
      try { if (patch.originalGetItem) patch.cache.getItem = patch.originalGetItem; } catch {}
      try { if (patch.originalGetItems) patch.cache.getItems = patch.originalGetItems; } catch {}
      try {
        if (patch.originalNrDescriptor) Object.defineProperty(patch.cache, 'nrValidItems', patch.originalNrDescriptor);
        else patch.cache.nrValidItems = patch.originalNrValue;
      } catch {}
      restoreFiberCounts(patch.targetChain, patch);
      if (forceUpdate) forceTracklistUpdate(patch.targetChain ?? []);
    }

    function orderedRawItemsForTarget(target) {
      const tracks = sortedTracksForNative(target);
      const raw = [];
      const accepted = [];
      for (const track of tracks) {
        if (!track.rawItem) continue;
        raw.push(track.rawItem);
        accepted.push(track);
      }
      return { raw, tracks: accepted };
    }

    function nativePatchNeedsRepair(patch) {
      if (!patch.active) return false;
      if (patch.originalGetItem && patch.wrappedGetItem && patch.cache.getItem !== patch.wrappedGetItem) return true;
      if (patch.originalGetItems && patch.wrappedGetItems && patch.cache.getItems !== patch.wrappedGetItems) return true;
      return false;
    }

    function refreshActivePatchForTarget(target) {
      const patch = nativePatch;
      if (!patch || patch.cache !== target.cache) return;
      const ordered = orderedRawItemsForTarget(target);
      patch.orderedRawItems = ordered.raw;
      patch.orderedTracks = ordered.tracks;
      patch.sortSignature = target.sortSignature;
      patch.targetFiber = target.fiber;
      patch.targetChain = target.chain;
      patch.active = true;
      state.filtered = ordered.tracks;
      state.nativeAdapterResultCount = ordered.raw.length;
      patchNativeCache(patch, target.chain);
      updateHeaderResultCount();
      emit('render');
    }

    function disconnectNativeListObserver() {
      try { nativeListObserver?.disconnect(); } catch {}
      nativeListObserver = null;
      nativeListObserverRoot = null;
      nativeListObserverPlaylistId = null;
      nativeListMaintenanceQueued = false;
    }

    function ensureNativeListObserver() {
      if (!state.query || state.nativeAdapterMode === 'idle') {
        disconnectNativeListObserver();
        return;
      }
      const playlistId = state.playlistId;
      const root = findPlaylistPage();
      if (!playlistId || !root) return;
      if (nativeListObserver && nativeListObserverRoot === root && nativeListObserverPlaylistId === playlistId) return;
      disconnectNativeListObserver();
      nativeListObserverRoot = root;
      nativeListObserverPlaylistId = playlistId;
      nativeListObserver = new MutationObserver(() => {
        if (nativeListMaintenanceQueued || !nativeAdapterIsActive()) return;
        nativeListMaintenanceQueued = true;
        queueMicrotask(() => {
          nativeListMaintenanceQueued = false;
          if (!nativeAdapterIsActive() || state.playlistId !== nativeListObserverPlaylistId) return;
          maintainNativeSmartMode();
        });
      });
      nativeListObserver.observe(root, { childList: true, subtree: true });
    }

    async function attachNativeAdapter(query, generation = attachGeneration) {
      if (!loadConfig().preferNativeRows) {
        state.nativeAdapterMode = 'fallback';
        state.nativeAdapterError = 'Native rows disabled in settings';
        emit('render');
        return false;
      }
      state.nativeAdapterMode = 'attaching';
      state.nativeAdapterError = null;
      const deadline = Date.now() + 160;
      let lastReason = 'native list model not found';
      while (Date.now() < deadline) {
        if (generation !== attachGeneration || state.query !== query) return false;
        const target = discoverNativeTarget(true);
        if (!target) {
          lastReason = 'native list model not found from current Spotify React tree';
          await sleep(8);
          continue;
        }
        try {
          if (nativePatch?.cache !== target.cache) restoreNativePatch(false);
          const ordered = orderedRawItemsForTarget(target);
          if (!ordered.raw.length && state.filtered.length) throw new Error('native list raw playlist items are unavailable');
          const cache = target.cache;
          const patch = nativePatch ?? {
            cache,
            originalGetItem: typeof cache.getItem === 'function' ? cache.getItem : null,
            originalGetItems: typeof cache.getItems === 'function' ? cache.getItems : null,
            originalNrDescriptor: Object.getOwnPropertyDescriptor(cache, 'nrValidItems'),
            originalNrValue: cache.nrValidItems,
            originalGetItemWasPromise: null,
            wrappedGetItem: null,
            wrappedGetItems: null,
            orderedRawItems: [],
            orderedTracks: [],
            query,
            sortSignature: target.sortSignature,
            targetFiber: target.fiber,
            targetChain: target.chain,
            active: true,
          };
          if (patch.originalGetItemWasPromise === null && patch.originalGetItem) {
            try {
              const sample = patch.originalGetItem.call(cache, 0);
              patch.originalGetItemWasPromise = Boolean(sample && typeof sample.then === 'function');
            } catch { patch.originalGetItemWasPromise = false; }
          }
          nativePatch = patch;
          Object.assign(patch, {
            orderedRawItems: ordered.raw,
            orderedTracks: ordered.tracks,
            query,
            sortSignature: target.sortSignature,
            targetFiber: target.fiber,
            targetChain: target.chain,
            active: true,
          });
          state.filtered = ordered.tracks;
          patchNativeCache(patch, target.chain);
          state.nativeAdapterMode = 'native';
          state.nativeAdapterResultCount = patch.orderedRawItems.length;
          state.nativeAdapterError = null;
          setNativeSmartState(true);
          restoreNativeTracklist();
          updateHeaderResultCount();
          ensureNativeListObserver();
          recordDiagnostic('native-adapter', `attached; ${patch.orderedRawItems.length} results`);
          emit('render');
          return true;
        } catch (error) {
          lastReason = error?.message || String(error);
          restoreNativePatch(false);
          await sleep(8);
        }
      }
      state.nativeAdapterMode = 'fallback';
      state.nativeAdapterResultCount = state.filtered.length;
      state.nativeAdapterError = lastReason;
      recordDiagnostic('native-adapter-fallback', lastReason);
      consoleWarn('Spotify native playlist list adapter was unavailable; using compatibility view.', lastReason);
      emit('render');
      return false;
    }

    function beginNativeSmartMode(query) {
      const generation = ++attachGeneration;
      state.nativeAdapterMode = 'attaching';
      state.nativeAdapterResultCount = state.filtered.length;
      queueMicrotask(() => {
        if (generation !== attachGeneration || state.query !== query) return;
        void attachNativeAdapter(query, generation);
      });
    }

    function endNativeSmartMode() {
      attachGeneration += 1;
      disconnectNativeListObserver();
      restoreNativePatch(true);
      releaseSpotifyNativeFilterSuppression();
      restoreHeaderResultCount();
      state.nativeAdapterMode = 'idle';
      state.nativeAdapterError = null;
      state.nativeAdapterResultCount = 0;
      restoreNativeTracklist();
      setNativeSmartState(false);
      emit('render');
    }

    function nativeAdapterIsActive() {
      return state.nativeAdapterMode === 'native' && Boolean(nativePatch?.active);
    }

    function nativeAdapterStatusText() {
      if (state.nativeAdapterMode === 'native') return `Native Spotify list · ${state.nativeAdapterResultCount} results`;
      if (state.nativeAdapterMode === 'attaching') return 'Connecting to Spotify playlist list…';
      if (state.nativeAdapterMode === 'fallback') return `Compatibility result view${state.nativeAdapterError ? ` · ${state.nativeAdapterError}` : ''}`;
      return 'Idle';
    }

    function maintainNativeSmartMode() {
      if (!state.query) {
        if (state.nativeAdapterMode !== 'idle') endNativeSmartMode();
        primeNativeListTarget();
        return;
      }
      if (!loadConfig().preferNativeRows) {
        if (state.nativeAdapterMode === 'native' || state.nativeAdapterMode === 'attaching') endNativeSmartMode();
        state.nativeAdapterMode = 'fallback';
        return;
      }
      ensureNativeListObserver();
      if (state.nativeAdapterMode === 'native' && nativePatch) {
        const target = discoverNativeTarget(false);
        if (!target) return;
        if (target.cache !== nativePatch.cache) {
          lastKnownTarget = target;
          beginNativeSmartMode(state.query);
          return;
        }
        if (target.sortSignature !== nativePatch.sortSignature) {
          lastKnownTarget = target;
          refreshActivePatchForTarget(target);
          return;
        }
        if (nativePatchNeedsRepair(nativePatch)) {
          nativePatch.targetChain = target.chain;
          patchNativeCache(nativePatch, target.chain);
          updateHeaderResultCount();
          return;
        }
        nativePatch.targetChain = target.chain;
        mutateFiberCounts(target.chain, nativePatch);
        updateHeaderResultCount();
      }
    }

    function ownText(element) {
      return Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join('').trim();
    }

    function findPlaylistSongCountElement() {
      const page = findPlaylistPage();
      const tracklist = findTracklistContainer();
      if (!page) return null;
      const trackTop = tracklist?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      let best = null;
      let bestScore = -1;
      for (const element of [...page.querySelectorAll('span,div,p')]) {
        const text = ownText(element);
        if (!text || text.length > 120 || !/\b\d[\d,.\s]*\s+(songs?|tracks?)\b/i.test(text)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top > trackTop) continue;
        let score = 10;
        if (/saves?|followers?/i.test(text)) score += 3;
        if (/min|hr|sec/i.test(text)) score += 2;
        if (element.children.length === 0) score += 1;
        if (score > bestScore) { best = element; bestScore = score; }
      }
      return best;
    }

    function updateHeaderResultCount() {
      if (state.nativeAdapterMode !== 'native') return;
      const count = state.nativeAdapterResultCount || state.filtered.length;
      const element = headerCountElement && document.contains(headerCountElement) ? headerCountElement : findPlaylistSongCountElement();
      if (!element) return;
      if (element !== headerCountElement) {
        headerCountElement = element;
        headerCountOriginalText = ownText(element) || element.textContent || '';
      }
      const current = ownText(element) || element.textContent || '';
      const source = headerCountOriginalText || current;
      const next = source.replace(/\b\d[\d,.\s]*(?=\s+(?:songs?|tracks?)\b)/i, String(count));
      if (next && element.textContent !== next) element.textContent = next;
    }

    function restoreHeaderResultCount() {
      if (headerCountElement && document.contains(headerCountElement) && headerCountOriginalText) {
        try { headerCountElement.textContent = headerCountOriginalText; } catch {}
      }
      headerCountElement = null;
      headerCountOriginalText = '';
    }

    function searchControllerFor(input) {
      if (!input) return null;
      for (const fiber of fiberChainFrom(input, 32)) {
        const props = propsForFiber(fiber);
        if (!props || (typeof props.onFilter !== 'function' && typeof props.onClear !== 'function')) continue;
        let hook = fiber.memoizedState;
        let textHook = null;
        let guard = 0;
        while (hook && guard++ < 24) {
          if (typeof hook.memoizedState === 'string' && typeof hook.queue?.dispatch === 'function') {
            textHook = hook;
            break;
          }
          hook = hook.next;
        }
        return { props, textHook };
      }
      return null;
    }

    function suppressSpotifyNativeFilter(input, value) {
      const controller = searchControllerFor(input);
      if (!nativeFilterSuppressed) {
        nativeFilterSuppressed = true;
        try { controller?.props?.onClear?.(); } catch (error) { consoleWarn('Could not clear Spotify native playlist filter.', error); }
      }
      queueMicrotask(() => {
        try { controller?.textHook?.queue?.dispatch?.(value); } catch (error) { consoleWarn('Could not synchronize Spotify search text state.', error); }
      });
    }

    function releaseSpotifyNativeFilterSuppression() {
      nativeFilterSuppressed = false;
    }


    function installNativeAdapterBridges() {
      if (sortBridgeInstalled) return;
      sortBridgeInstalled = true;
      document.addEventListener('click', (event) => {
        if (!nativeAdapterIsActive() || !state.query) return;
        const target = event.target;
        const control = target?.closest?.('[role="columnheader"], [aria-sort], button[role="combobox"]');
        if (!control || !findPlaylistPage()?.contains(control)) return;
        if (sortRefreshTimer !== null) clearTimeout(sortRefreshTimer);
        sortRefreshTimer = setTimeout(() => {
          sortRefreshTimer = null;
          const latest = discoverNativeTarget(true);
          if (latest) lastKnownTarget = latest;
          maintainNativeSmartMode();
        }, 0);
      }, true);
    }
    return { attachNativeAdapter, discoverNativeTarget, primeNativeListTarget, beginNativeSmartMode, endNativeSmartMode, nativeAdapterIsActive, nativeAdapterStatusText, maintainNativeSmartMode, updateHeaderResultCount, suppressSpotifyNativeFilter, releaseSpotifyNativeFilterSuppression, installNativeAdapterBridges };
  })();

  // src/release-notes.js
  const __mod13 = (() => {
    const { PROJECT_URL, RELEASE_SEEN_KEY, RELEASE_NOTES_REVISION, VERSION } = __mod2;
    const { state } = __mod0;
    const RELEASE_NOTES = {
      version: VERSION,
      revision: RELEASE_NOTES_REVISION,
      title: 'Smart Search 1.1.0',
      notes: [
        'Rebuilt the extension from the original 1.0 single-file codebase into maintainable modules, while still shipping one bundled extension file.',
        'Reworked advanced search into a compact syntax: ; for OR, & for AND, - to exclude, @ for exact artists, compact year comparisons/ranges, and escaping for reserved symbols.',
        'Removed the old artist:, title:, track:, album: prefixes and quote-based syntax.',
        'Added clearer malformed-query messages instead of silently returning no results.',
        'Added automated parser and matcher tests plus an in-app parser self-check.',
        'Added a searchable settings tutorial that documents the syntax actually supported by this release.',
        'Added diagnostics for Spotify/Spicetify capabilities, raw diagnostics, clipboard copy, and manual playlist refresh.',
        'Improved feature detection and fallback handling for PlaylistAPI, GraphQL, Spotify native rows, and private playback/queue APIs.',
        'Added live playlist-change detection with cache invalidation and automatic refresh after tracks are added or removed.',
        'Added on-demand release-year metadata lookup so year filters work even when PlaylistAPI does not include release dates.',
        'Added first-install/update release notes and a Release notes button in Settings.',
        'Cleaned up settings text and controls while keeping normal Spotify playlist search untouched until advanced syntax is used.',
      ],
    };

    function releaseToken() {
      return `${VERSION}:${RELEASE_NOTES_REVISION}`;
    }

    function readSeenRelease() {
      try {
        return state.S?.LocalStorage?.get?.(RELEASE_SEEN_KEY)
          ?? globalThis.localStorage?.getItem?.(RELEASE_SEEN_KEY)
          ?? '';
      } catch {
        return '';
      }
    }

    function writeSeenRelease(value) {
      try { state.S?.LocalStorage?.set?.(RELEASE_SEEN_KEY, value); } catch {}
      try { globalThis.localStorage?.setItem?.(RELEASE_SEEN_KEY, value); } catch {}
    }

    function buildReleaseNotesContent() {
      const content = document.createElement('div');
      content.className = 'ss1-release-notes';

      const header = document.createElement('div');
      header.className = 'ss1-release-header';
      const intro = document.createElement('div');
      intro.className = 'ss1-release-kicker';
      intro.textContent = "What's new on this version";
      const subtitle = document.createElement('div');
      subtitle.className = 'ss1-release-subtitle';
      subtitle.textContent = 'Changes since Smart Search 1.0';
      header.append(intro, subtitle);

      const list = document.createElement('ul');
      list.className = 'ss1-release-list';
      for (const note of RELEASE_NOTES.notes) {
        const item = document.createElement('li');
        item.textContent = note;
        list.appendChild(item);
      }

      const actions = document.createElement('div');
      actions.className = 'ss1-release-actions';

      const github = document.createElement('a');
      github.className = 'ss1-button';
      github.href = PROJECT_URL;
      github.target = '_blank';
      github.rel = 'noopener noreferrer';
      github.textContent = 'View on GitHub';

      const close = document.createElement('button');
      close.className = 'ss1-button primary';
      close.type = 'button';
      close.textContent = 'Got it';
      close.addEventListener('click', () => state.S?.PopupModal?.hide?.());

      actions.append(github, close);
      content.append(header, list, actions);
      return content;
    }

    function showReleaseNotes({ markSeen = false } = {}) {
      if (typeof state.S?.PopupModal?.display !== 'function') return false;
      state.S.PopupModal.display({
        title: RELEASE_NOTES.title,
        content: buildReleaseNotesContent(),
        isLarge: false,
      });
      if (markSeen) writeSeenRelease(releaseToken());
      return true;
    }

    function maybeShowReleaseNotes() {
      if (readSeenRelease() === releaseToken()) return false;
      return showReleaseNotes({ markSeen: true });
    }
    return { showReleaseNotes, maybeShowReleaseNotes, RELEASE_NOTES };
  })();

  // src/ui/settings.js
  const __mod14 = (() => {
    const { BUG_REPORT_URL, FEATURE_REQUEST_URL, PROJECT_URL, VERSION } = __mod2;
    const { state } = __mod0;
    const { loadConfig, updateConfig } = __mod4;
    const { SYNTAX_REFERENCE, parseQuery } = __mod5;
    const { capabilityRows } = __mod6;
    const { nativeAdapterStatusText } = __mod12;
    const { copyDiagnostics, diagnosticsText } = __mod10;
    const { emit, on } = __mod7;
    const { showReleaseNotes } = __mod13;
    const { consoleWarn } = __mod1;
    let settingsMenuItem = null;

    function createSettingsToggle(parent, title, description, key) {
      const row = document.createElement('div'); row.className = 'ss1-settings-row';
      const copy = document.createElement('div'); copy.className = 'ss1-settings-copy';
      const heading = document.createElement('div'); heading.className = 'ss1-settings-title'; heading.textContent = title;
      const detail = document.createElement('div'); detail.className = 'ss1-settings-desc'; detail.textContent = description;
      copy.append(heading, detail);
      const toggle = document.createElement('button'); toggle.className = 'ss1-toggle'; toggle.type = 'button'; toggle.setAttribute('role', 'switch');
      const refresh = () => {
        const value = Boolean(loadConfig()[key]);
        toggle.setAttribute('aria-pressed', String(value));
        toggle.setAttribute('aria-checked', String(value));
        toggle.setAttribute('aria-label', `${title}: ${value ? 'on' : 'off'}`);
      };
      refresh();
      toggle.addEventListener('click', () => {
        const current = loadConfig();
        updateConfig({ [key]: !current[key] });
        refresh();
        emit('config-changed', { key });
      });
      row.append(copy, toggle); parent.appendChild(row);
    }

    function createCollapsiblePanel(titleText) {
      const details = document.createElement('details');
      details.className = 'ss1-panel ss1-collapsible';
      const summary = document.createElement('summary');
      summary.className = 'ss1-panel-summary';
      const title = document.createElement('span');
      title.className = 'ss1-panel-title';
      title.textContent = titleText;
      const chevron = document.createElement('span');
      chevron.className = 'ss1-panel-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '⌄';
      summary.append(title, chevron);
      const body = document.createElement('div');
      body.className = 'ss1-panel-body';
      details.append(summary, body);
      return { details, body };
    }

    function buildSyntaxPanel() {
      const { details, body } = createCollapsiblePanel('Search tutorial');
      const grid = document.createElement('div');
      grid.className = 'ss1-tutorial-grid';
      for (const item of SYNTAX_REFERENCE) {
        const example = document.createElement('code');
        example.textContent = item.example;
        const meaning = document.createElement('div');
        meaning.className = 'ss1-tutorial-meaning';
        const name = document.createElement('strong');
        name.textContent = item.name;
        const description = document.createElement('span');
        description.textContent = item.description;
        meaning.append(name, description);
        grid.append(example, meaning);
      }
      body.appendChild(grid);
      return details;
    }

    function runSelfCheck() {
      const cases = [
        ['@Mora & @Quevedo', true],
        ['year:>2017 & <2020', true],
        ['Mora;Quevedo', true],
        ['rock\\&roll', true],
        ['year:20xx', false],
      ];
      const failures = [];
      for (const [query, valid] of cases) {
        const parsed = parseQuery(query);
        const actual = parsed.errors.length === 0;
        if (actual !== valid) failures.push(`${query}: expected ${valid ? 'valid' : 'invalid'}, got ${actual ? 'valid' : parsed.errors.join(' ')}`);
      }
      return { total: cases.length, failures };
    }

    function setFeedback(element, message, tone = 'neutral') {
      element.textContent = message;
      element.className = `ss1-action-feedback ss1-feedback-${tone}`;
      element.hidden = !message;
    }

    function setBusy(button, busy, busyLabel, normalLabel) {
      button.disabled = busy;
      button.textContent = busy ? busyLabel : normalLabel;
    }

    function buildDiagnosticsPanel() {
      const { details, body } = createCollapsiblePanel('Diagnostics');
      const adapter = document.createElement('div');
      adapter.className = 'ss1-muted';
      adapter.textContent = `Adapter: ${nativeAdapterStatusText()}`;

      const grid = document.createElement('div');
      grid.className = 'ss1-diag-grid';
      const renderRows = () => {
        grid.replaceChildren();
        for (const row of capabilityRows()) {
          const label = document.createElement('span');
          label.textContent = `${row.name} — ${row.note}`;
          const value = document.createElement('strong');
          value.className = row.tone === 'ok' ? 'ss1-diag-ok' : row.tone === 'warn' ? 'ss1-diag-bad' : 'ss1-diag-neutral';
          value.textContent = row.status;
          grid.append(label, value);
        }
      };
      renderRows();

      const feedback = document.createElement('div');
      feedback.className = 'ss1-action-feedback';
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      feedback.hidden = true;

      const pre = document.createElement('pre');
      pre.className = 'ss1-pre';
      pre.hidden = true;

      const actions = document.createElement('div');
      actions.className = 'ss1-panel-actions';

      const refresh = document.createElement('button');
      refresh.className = 'ss1-button';
      refresh.type = 'button';
      refresh.textContent = 'Refresh diagnostics';
      refresh.addEventListener('click', async () => {
        setBusy(refresh, true, 'Refreshing…', 'Refresh diagnostics');
        setFeedback(feedback, 'Refreshing diagnostics…');
        await new Promise((resolve) => setTimeout(resolve, 80));
        renderRows();
        adapter.textContent = `Adapter: ${nativeAdapterStatusText()}`;
        if (!pre.hidden) pre.textContent = diagnosticsText();
        setBusy(refresh, false, 'Refreshing…', 'Refresh diagnostics');
        setFeedback(feedback, 'Diagnostics refreshed.', 'ok');
      });

      const copy = document.createElement('button');
      copy.className = 'ss1-button';
      copy.type = 'button';
      copy.textContent = 'Copy diagnostics';
      copy.addEventListener('click', async () => {
        setBusy(copy, true, 'Copying…', 'Copy diagnostics');
        setFeedback(feedback, 'Copying diagnostics…');
        try {
          const copied = await copyDiagnostics();
          setFeedback(feedback, copied ? 'Diagnostics copied to the clipboard.' : 'Clipboard access is unavailable.', copied ? 'ok' : 'warn');
        } catch (error) {
          setFeedback(feedback, `Could not copy diagnostics: ${error?.message || error}`, 'error');
        } finally {
          setBusy(copy, false, 'Copying…', 'Copy diagnostics');
        }
      });

      const show = document.createElement('button');
      show.className = 'ss1-button';
      show.type = 'button';
      show.textContent = 'Show raw diagnostics';
      show.addEventListener('click', () => {
        pre.hidden = !pre.hidden;
        pre.textContent = diagnosticsText();
        show.textContent = pre.hidden ? 'Show raw diagnostics' : 'Hide raw diagnostics';
        setFeedback(feedback, pre.hidden ? 'Raw diagnostics hidden.' : 'Raw diagnostics shown.');
      });

      const forceRefresh = document.createElement('button');
      forceRefresh.className = 'ss1-button';
      forceRefresh.type = 'button';
      forceRefresh.textContent = 'Refresh playlist data';
      forceRefresh.disabled = !state.playlistId;
      forceRefresh.addEventListener('click', () => {
        setBusy(forceRefresh, true, 'Refreshing playlist…', 'Refresh playlist data');
        setFeedback(feedback, 'Refreshing playlist data…');
        emit('manual-playlist-refresh');
      });

      const offRefreshStatus = on('playlist-refresh-status', (event) => {
        if (!details.isConnected) {
          offRefreshStatus();
          return;
        }
        if (event?.reason !== 'manual-refresh') return;
        if (event.phase === 'start') {
          setBusy(forceRefresh, true, 'Refreshing playlist…', 'Refresh playlist data');
          setFeedback(feedback, 'Refreshing playlist data…');
        } else if (event.phase === 'done') {
          setBusy(forceRefresh, false, 'Refreshing playlist…', 'Refresh playlist data');
          const suffix = event.changed ? ' Playlist changes detected.' : ' No playlist changes detected.';
          setFeedback(feedback, `Playlist data refreshed.${suffix}`, 'ok');
          renderRows();
          if (!pre.hidden) pre.textContent = diagnosticsText();
        } else if (event.phase === 'unavailable') {
          setBusy(forceRefresh, false, 'Refreshing playlist…', 'Refresh playlist data');
          setFeedback(feedback, 'Open a playlist before refreshing playlist data.', 'warn');
        } else if (event.phase === 'error') {
          setBusy(forceRefresh, false, 'Refreshing playlist…', 'Refresh playlist data');
          setFeedback(feedback, event.message || 'Playlist refresh failed.', 'error');
        }
      });

      const self = document.createElement('button');
      self.className = 'ss1-button';
      self.type = 'button';
      self.textContent = 'Run parser self-check';
      self.addEventListener('click', async () => {
        setBusy(self, true, 'Running self-check…', 'Run parser self-check');
        setFeedback(feedback, 'Running parser self-check…');
        await new Promise((resolve) => setTimeout(resolve, 80));
        const result = runSelfCheck();
        setBusy(self, false, 'Running self-check…', 'Run parser self-check');
        if (result.failures.length) setFeedback(feedback, `Parser self-check failed: ${result.failures[0]}`, 'error');
        else setFeedback(feedback, `Parser self-check passed (${result.total}/${result.total}).`, 'ok');
      });

      actions.append(refresh, copy, show, forceRefresh, self);
      body.append(adapter, grid, actions, feedback, pre);
      return details;
    }

    function buildSupportPanel() {
      const box = document.createElement('div');
      box.className = 'ss1-panel';
      const title = document.createElement('div');
      title.className = 'ss1-panel-title';
      title.textContent = 'Support & feedback';
      const desc = document.createElement('div');
      desc.className = 'ss1-panel-desc';
      desc.textContent = 'Found a bug or have an idea? Create a GitHub Issue.';
      const actions = document.createElement('div');
      actions.className = 'ss1-panel-actions';
      for (const [label, url] of [['Report a bug', BUG_REPORT_URL], ['Suggest a feature', FEATURE_REQUEST_URL], ['View on GitHub', PROJECT_URL]]) {
        const link = document.createElement('a');
        link.className = 'ss1-button';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = label;
        actions.appendChild(link);
      }
      const notes = document.createElement('button');
      notes.className = 'ss1-button';
      notes.type = 'button';
      notes.textContent = 'Release notes';
      notes.addEventListener('click', () => showReleaseNotes({ markSeen: false }));
      actions.appendChild(notes);
      box.append(title, desc, actions);
      return box;
    }

    function showSettings() {
      const content = document.createElement('div');
      content.className = 'ss1-settings';
      createSettingsToggle(content, 'Enabled', 'Use Smart Search on playlist pages.', 'enabled');
      createSettingsToggle(content, 'Prefer Spotify native rows', 'Use Spotify’s playlist rows when the current client supports them.', 'preferNativeRows');
      createSettingsToggle(content, 'Live playlist refresh', 'Update Smart Search after tracks are added or removed.', 'livePlaylistRefresh');
      createSettingsToggle(content, 'Collapse compatibility results by default', 'Keep the fallback result list compact.', 'resultsCollapsed');
      createSettingsToggle(content, 'Show syntax help', 'Show a short search reminder under compatibility results.', 'showSyntaxHelp');
      content.append(buildSyntaxPanel(), buildDiagnosticsPanel(), buildSupportPanel());
      const version = document.createElement('div');
      version.className = 'ss1-version';
      version.textContent = `smart-search ${VERSION}`;
      content.appendChild(version);
      state.S?.PopupModal?.display?.({ title: 'Smart Search', content, isLarge: true });
      setTimeout(() => {
        try {
          const dialog = content.closest?.('[role="dialog"]');
          if (dialog) {
            dialog.style.width = 'min(860px, calc(100vw - 96px))';
            dialog.style.maxWidth = 'min(860px, calc(100vw - 96px))';
            dialog.style.overflowX = 'hidden';
          }
        } catch {}
      }, 0);
    }

    function registerSettingsMenu() {
      if (settingsMenuItem) return true;
      if (typeof state.S?.Menu?.Item !== 'function') return false;
      try {
        settingsMenuItem = new state.S.Menu.Item('Smart Search settings', false, showSettings, 'search');
        settingsMenuItem.register();
        return true;
      } catch (error) {
        settingsMenuItem = null;
        consoleWarn('Settings menu is not ready yet; Smart Search will retry later.', error);
        return false;
      }
    }

    function registerSettingsMenuDeferred() {
      let attempts = 0;
      const attempt = () => {
        if (settingsMenuItem) return;
        attempts += 1;
        if (registerSettingsMenu()) return;
        if (attempts < 40) setTimeout(attempt, 500);
      };
      setTimeout(attempt, 1000);
    }
    return { showSettings, registerSettingsMenu, registerSettingsMenuDeferred };
  })();

  // src/spotify/playback.js
  const __mod15 = (() => {
    const { PLAYBACK_BUFFER_TARGET, PLAYBACK_BUFFER_LOW_WATER, PLAYBACK_REFILL_CHUNK } = __mod2;
    const { state } = __mod0;
    const { detectCapabilities } = __mod6;
    const { findPlaylistPage, findTracklistContainer } = __mod8;
    const { nativeAdapterIsActive } = __mod12;
    const { consoleError, consoleWarn } = __mod1;
    const { emit } = __mod7;
    const { recordDiagnostic } = __mod10;
    function fisherYates(input) {
      const result = [...input];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const random = Math.floor(Math.random() * (index + 1));
        [result[index], result[random]] = [result[random], result[index]];
      }
      return result;
    }

    function makeNativeQueueItem(track) {
      return {
        contextTrack: { uri: track.uri, uid: '', metadata: { is_queued: 'false' } },
        removed: [],
        blocked: [],
        provider: 'context',
      };
    }

    function makeDelimiterQueueItem() {
      return {
        contextTrack: { uri: 'spotify:delimiter', uid: '', metadata: { is_queued: 'false' } },
        removed: [],
        blocked: [],
        provider: 'context',
      };
    }

    function queueUpcomingCount() {
      const queueState = state.S?.Platform?.PlayerAPI?._queue?._queueState;
      const counts = [
        Array.isArray(queueState?.nextUp) ? queueState.nextUp.length : null,
        Array.isArray(queueState?.queued) ? queueState.queued.length : null,
      ].filter((value) => Number.isFinite(value));
      return counts.length ? counts.reduce((sum, value) => sum + value, 0) : null;
    }

    function buildNativeQueuePayload(sequence, queueCore) {
      return {
        nextTracks: [...sequence.map(makeNativeQueueItem), makeDelimiterQueueItem()],
        prevTracks: Array.isArray(queueCore?.prevTracks) ? queueCore.prevTracks : [],
        queueRevision: queueCore?.queueRevision,
      };
    }

    async function syncSpotifyPlaybackContext(contextUri) {
      if (!contextUri || typeof state.S?.Platform?.PlayerAPI?.updateContext !== 'function') return;
      try {
        const playerState = state.S.Platform.PlayerAPI.getState?.();
        const sessionId = playerState?.sessionId;
        if (!sessionId) return;
        await state.S.Platform.PlayerAPI.updateContext(sessionId, { uri: contextUri, url: `context://${contextUri}` });
      } catch (error) {
        consoleWarn('Could not synchronize the Spotify playback context.', error);
      }
    }

    async function playWithNativeSetQueue(sequence, shuffle, smartShuffle = false) {
      const controller = state.S?.Platform?.PlayerAPI?._queue;
      const queueCore = controller?._queue;
      const client = controller?._client;
      if (!client?.setQueue || !queueCore) throw new Error('Native Spotify queue API is unavailable');
      await client.setQueue(buildNativeQueuePayload(sequence, queueCore));
      const contextUri = state.playlistId ? `spotify:playlist:${state.playlistId}` : null;
      await syncSpotifyPlaybackContext(contextUri);
      state.playbackSession = {
        active: true,
        method: 'native-setQueue',
        sequence,
        currentIndex: -1,
        nextEnqueueIndex: sequence.length,
        startedAt: Date.now(),
        shuffle,
        smartShuffle,
        contextUri,
        query: state.query,
        lastCurrentUri: null,
        refillCount: 0,
      };
      const nextResult = state.S?.Player?.next?.();
      if (nextResult && typeof nextResult.then === 'function') await nextResult;
    }

    async function reseedNativeQueueTail(session) {
      const controller = state.S?.Platform?.PlayerAPI?._queue;
      const queueCore = controller?._queue;
      const client = controller?._client;
      if (!client?.setQueue || !queueCore) return;
      const remaining = session.sequence.slice(Math.max(0, session.currentIndex + 1));
      if (!remaining.length) return;
      await client.setQueue(buildNativeQueuePayload(remaining, queueCore));
      await syncSpotifyPlaybackContext(session.contextUri ?? null);
      session.refillCount += 1;
      session.lastNativeReseedAt = Date.now();
    }

    async function enqueueTracks(tracks) {
      if (!tracks.length) return;
      const contexts = tracks.map((track) => ({ uri: track.uri, uid: track.uid || undefined }));
      const c = detectCapabilities();
      if (c.silentAddToQueue) {
        await state.S.addToQueue(contexts);
        return;
      }
      if (c.platformAddToQueue) {
        await state.S.Platform.PlayerAPI.addToQueue(contexts);
        return;
      }
      throw new Error('No compatible queue API is available');
    }

    async function refillSlidingQueue(force = false) {
      const session = state.playbackSession;
      if (!session?.active || session.method !== 'sliding-addToQueue') return;
      const remainingBuffered = Math.max(0, session.nextEnqueueIndex - session.currentIndex - 1);
      if (!force && remainingBuffered > PLAYBACK_BUFFER_LOW_WATER) return;
      if (session.nextEnqueueIndex >= session.sequence.length) return;
      const desiredEnd = Math.min(
        session.sequence.length,
        Math.max(session.nextEnqueueIndex + PLAYBACK_REFILL_CHUNK, session.currentIndex + 1 + PLAYBACK_BUFFER_TARGET),
      );
      const slice = session.sequence.slice(session.nextEnqueueIndex, desiredEnd);
      await enqueueTracks(slice);
      session.nextEnqueueIndex = desiredEnd;
      session.refillCount += 1;
    }

    async function playWithSlidingQueue(sequence, shuffle) {
      const first = sequence[0];
      if (!first) return;
      if (typeof state.S?.Platform?.PlayerAPI?.clearQueue === 'function') await state.S.Platform.PlayerAPI.clearQueue();
      if (typeof state.S?.Player?.playUri !== 'function') throw new Error('Spicetify.Player.playUri is unavailable');
      await state.S.Player.playUri(first.uri);
      state.playbackSession = {
        active: true,
        method: 'sliding-addToQueue',
        sequence,
        currentIndex: 0,
        nextEnqueueIndex: 1,
        startedAt: Date.now(),
        shuffle,
        query: state.query,
        lastCurrentUri: first.uri,
        refillCount: 0,
      };
      await refillSlidingQueue(true);
    }

    function findSessionIndexForUri(session, uri, preferNextDuplicate = false) {
      let start = Math.max(0, session.currentIndex);
      if (preferNextDuplicate && session.lastCurrentUri === uri && start < session.sequence.length - 1) start += 1;
      for (let index = start; index < session.sequence.length; index += 1) if (session.sequence[index]?.uri === uri) return index;
      for (let index = 0; index < start; index += 1) if (session.sequence[index]?.uri === uri) return index;
      return -1;
    }

    function queueItemUri(item) {
      if (!item || typeof item !== 'object') return null;
      if (typeof item.uri === 'string' && item.uri.startsWith('spotify:track:')) return item.uri;
      if (typeof item.contextTrack?.uri === 'string' && item.contextTrack.uri.startsWith('spotify:track:')) return item.contextTrack.uri;
      return null;
    }

    function nativeContextUpcomingUris() {
      const queueState = state.S?.Platform?.PlayerAPI?._queue?._queueState;
      const nextUp = Array.isArray(queueState?.nextUp) ? queueState.nextUp : [];
      const result = [];
      for (const item of nextUp) {
        if (item?.provider && item.provider !== 'context') continue;
        const uri = queueItemUri(item);
        if (uri) result.push(uri);
      }
      return result;
    }

    function nativeQueueDiverged(session) {
      if (session.method !== 'native-setQueue' || session.currentIndex < 0) return false;
      const expected = session.sequence.slice(session.currentIndex + 1, session.currentIndex + 9).map((track) => track.uri);
      if (!expected.length) return false;
      const actual = nativeContextUpcomingUris().slice(0, expected.length);
      if (!actual.length) return false;
      const comparable = Math.min(expected.length, actual.length);
      for (let index = 0; index < comparable; index += 1) if (expected[index] !== actual[index]) return true;
      return false;
    }

    async function maintainPlaybackSession(reason = 'poll') {
      const session = state.playbackSession;
      if (!session?.active || state.playbackMaintenanceInFlight) return;
      state.playbackMaintenanceInFlight = true;
      try {
        const currentUri = state.S?.Player?.data?.item?.uri || null;
        if (!currentUri) return;
        const index = findSessionIndexForUri(session, currentUri, reason === 'songchange');
        if (index < 0) {
          if (Date.now() - session.startedAt > 4000) session.active = false;
          return;
        }
        session.currentIndex = index;
        session.lastCurrentUri = currentUri;
        if (session.method === 'sliding-addToQueue') await refillSlidingQueue(false);
        if (session.method === 'native-setQueue') {
          const upcoming = queueUpcomingCount();
          const remaining = Math.max(0, session.sequence.length - index - 1);
          const cooldownDone = !session.lastNativeReseedAt || Date.now() - session.lastNativeReseedAt > 500;
          const needsRefill = upcoming !== null && remaining > PLAYBACK_BUFFER_LOW_WATER && upcoming <= PLAYBACK_BUFFER_LOW_WATER;
          const contextWasRegenerated = reason === 'songchange' && nativeQueueDiverged(session);
          if (cooldownDone && (needsRefill || contextWasRegenerated)) await reseedNativeQueueTail(session);
        }
        emit('playback-update');
      } catch (error) {
        consoleWarn('Playback maintenance failed.', error);
      } finally {
        state.playbackMaintenanceInFlight = false;
      }
    }

    function spotifyShuffleState() {
      try {
        if (typeof state.S?.Player?.getShuffle === 'function') return Boolean(state.S.Player.getShuffle());
      } catch {}
      return Boolean(state.S?.Player?.data?.shuffle);
    }

    function spotifySmartShuffleState() {
      return Boolean(state.S?.Player?.data?.smartShuffle ?? state.S?.Platform?.PlayerAPI?._state?.smartShuffle);
    }

    function sequenceFromSelected(startIndex, shuffle) {
      const source = [...state.filtered];
      if (!source.length) return [];
      const index = Math.max(0, Math.min(startIndex, source.length - 1));
      const selected = source[index];
      if (!shuffle) return source.slice(index);
      const remaining = source.filter((_, itemIndex) => itemIndex !== index);
      return [selected, ...fisherYates(remaining)];
    }

    async function playFilteredRespectingSpotify(startIndex = 0) {
      if (!state.filtered.length || state.playbackBusy) return;
      const shuffle = spotifyShuffleState();
      const smartShuffle = spotifySmartShuffleState();
      const sequence = sequenceFromSelected(startIndex, shuffle || smartShuffle);
      if (!sequence.length) return;
      state.playbackBusy = true;
      emit('playback-update');
      try {
        if (detectCapabilities().nativeSetQueue) {
          try { await playWithNativeSetQueue(sequence, shuffle || smartShuffle, smartShuffle); }
          catch (error) {
            consoleWarn('Native Smart Search playback bridge failed; using compatibility queue.', error);
            await playWithSlidingQueue(sequence, shuffle || smartShuffle);
          }
        } else {
          await playWithSlidingQueue(sequence, shuffle || smartShuffle);
        }
        recordDiagnostic('playback-start', state.playbackSession?.method ?? 'unknown');
      } catch (error) {
        state.playbackSession = null;
        consoleError('Could not start Smart Search playback.', error);
        state.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
      } finally {
        state.playbackBusy = false;
        emit('playback-update');
      }
    }

    async function playFiltered(startIndex = 0, shuffle = false) {
      if (!state.filtered.length || state.playbackBusy) return;
      state.playbackBusy = true;
      emit('playback-update');
      let sequence = [...state.filtered];
      if (shuffle) sequence = fisherYates(sequence);
      else {
        const index = Math.max(0, Math.min(startIndex, sequence.length - 1));
        sequence = [...sequence.slice(index), ...sequence.slice(0, index)];
      }
      try {
        if (detectCapabilities().nativeSetQueue) {
          try { await playWithNativeSetQueue(sequence, shuffle); }
          catch (error) {
            consoleWarn('Native queue setup failed; using compatibility queue.', error);
            await playWithSlidingQueue(sequence, shuffle);
          }
        } else await playWithSlidingQueue(sequence, shuffle);
      } catch (error) {
        state.playbackSession = null;
        consoleError('Could not start filtered playback.', error);
        state.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
      } finally {
        state.playbackBusy = false;
        emit('playback-update');
      }
    }

    function smartResultIndexForRow(row) {
      const rowIndex = Number(row.getAttribute('aria-rowindex'));
      if (Number.isInteger(rowIndex)) {
        const filteredIndex = rowIndex - 2;
        if (filteredIndex >= 0 && filteredIndex < state.filtered.length) return filteredIndex;
      }
      const href = row.querySelector('a[href*="/track/"]')?.getAttribute('href') || '';
      const match = href.match(/\/track\/([A-Za-z0-9]+)/);
      if (match) {
        const uri = `spotify:track:${match[1]}`;
        const index = state.filtered.findIndex((track) => track.uri === uri);
        if (index >= 0) return index;
      }
      return null;
    }

    function isRowPlayButton(target, row) {
      const button = target.closest?.('button');
      if (!button || !row.contains(button)) return false;
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();
      if (/play|pause/.test(label)) return true;
      return Boolean(button.closest('.main-trackList-rowImagePlayButton,.main-trackList-rowPlayPauseButton'));
    }

    function isPlaylistMainPlayButton(target) {
      const button = target.closest?.('button');
      if (!button || findTracklistContainer()?.contains(button)) return false;
      const page = findPlaylistPage();
      if (!page?.contains(button)) return false;
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();
      const cls = button.className?.toString?.().toLowerCase?.() || '';
      return /(^|\s)play(\s|$)|play playlist/.test(label) || /playbutton/.test(cls);
    }

    function interceptNativePlayback(event) {
      if (!nativeAdapterIsActive() || !state.query) return;
      const target = event.target;
      if (!target?.closest) return;
      const row = target.closest('[role="row"],.main-trackList-trackListRow');
      let shouldPlay = false;
      let index = 0;
      if (row) {
        if (event.type === 'dblclick') shouldPlay = true;
        else if (event.type === 'click' && isRowPlayButton(target, row)) shouldPlay = true;
        else if (event.type === 'keydown' && event.key === 'Enter') shouldPlay = true;
        if (shouldPlay) {
          const resolved = smartResultIndexForRow(row);
          if (resolved === null) return;
          index = resolved;
        }
      } else if (event.type === 'click' && isPlaylistMainPlayButton(target)) {
        shouldPlay = true;
        index = 0;
      }
      if (!shouldPlay) return;
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      } catch {}
      void playFilteredRespectingSpotify(index);
    }

    function installPlaybackBridge() {
      document.addEventListener('click', interceptNativePlayback, true);
      document.addEventListener('dblclick', interceptNativePlayback, true);
      document.addEventListener('keydown', interceptNativePlayback, true);
    }
    return { maintainPlaybackSession, playFilteredRespectingSpotify, playFiltered, installPlaybackBridge };
  })();

  // src/ui/results.js
  const __mod16 = (() => {
    const { RESULTS_HOST_ID, RENDER_CHUNK } = __mod2;
    const { state } = __mod0;
    const { loadConfig, updateConfig } = __mod4;
    const { SYNTAX_REFERENCE } = __mod5;
    const { findPlaylistPage, findTracklistContainer, hideNativeTracklist, restoreNativeTracklist, setNativeSmartState } = __mod8;
    const { playFiltered } = __mod15;
    function formatDuration(ms) {
      const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    function formatAddedDate(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      try { return new Intl.DateTimeFormat(navigator.language || 'en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date); }
      catch { return date.toLocaleDateString(); }
    }


    function queryUsesYear(node) {
      if (!node || typeof node !== 'object') return false;
      if (['year-eq', 'year-gt', 'year-gte', 'year-lt', 'year-lte', 'year-range'].includes(node.kind)) return true;
      if (node.kind === 'not') return queryUsesYear(node.child);
      if (node.kind === 'and' || node.kind === 'or') return node.children?.some(queryUsesYear) ?? false;
      return false;
    }

    function syntaxHelpText() {
      return SYNTAX_REFERENCE.filter((item) => item.advanced !== false).slice(0, 7).map((item) => `<code>${item.example}</code>`).join(' · ');
    }

    function ensureHost() {
      let host = document.getElementById(RESULTS_HOST_ID);
      const tracklist = findTracklistContainer();
      const page = findPlaylistPage();
      const anchorParent = tracklist?.parentElement || page;
      if (!anchorParent) return null;
      if (!host) {
        host = document.createElement('div');
        host.id = RESULTS_HOST_ID;
        host.setAttribute('role', 'region');
        host.setAttribute('aria-label', 'Smart Search results');
        host.innerHTML = `<div class="ss1-shell">
          <div class="ss1-toolbar" hidden>
            <div class="ss1-summary"><span class="ss1-smart-dot" aria-hidden="true"></span><strong>Smart Search</strong><span class="ss1-count"></span><span class="ss1-progress"></span></div>
            <div class="ss1-actions"><button class="ss1-button primary" data-action="play" type="button">▶ Play results</button><button class="ss1-button" data-action="shuffle" type="button">⇄ Shuffle</button><button class="ss1-button icon" data-action="collapse" type="button" aria-label="Collapse results">⌃</button></div>
          </div>
          <div class="ss1-body" hidden>
            <div class="ss1-column-header"><span>#</span><span>Title</span><span class="ss1-album-column">Album</span><span class="ss1-date-column">Date added</span><span style="text-align:right">Time</span></div>
            <div class="ss1-status" role="status" aria-live="polite" hidden></div>
            <div class="ss1-results"></div><div class="ss1-sentinel"></div>
            <div class="ss1-help" hidden>Compact syntax: ${syntaxHelpText()}</div>
          </div>
          <div class="ss1-collapsed-note" hidden>Results are collapsed. Playback still uses the complete filtered result set.</div>
        </div>`;
        anchorParent.insertBefore(host, tracklist || null);
        state.resultsHost = host;
        state.resultsList = host.querySelector('.ss1-results');
        state.resultsSentinel = host.querySelector('.ss1-sentinel');
        host.querySelector('[data-action="play"]')?.addEventListener('click', () => playFiltered(0, false));
        host.querySelector('[data-action="shuffle"]')?.addEventListener('click', () => playFiltered(0, true));
        host.querySelector('[data-action="collapse"]')?.addEventListener('click', () => {
          const config = updateConfig({ resultsCollapsed: !loadConfig().resultsCollapsed });
          renderSmartSearch(config);
        });
        try { state.resultsObserver?.disconnect(); } catch {}
        state.resultsObserver = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) appendResultChunk();
        }, { root: null, rootMargin: '500px 0px' });
        if (state.resultsSentinel) state.resultsObserver.observe(state.resultsSentinel);
      } else if (host.parentElement !== anchorParent || (tracklist && host.nextSibling !== tracklist)) {
        anchorParent.insertBefore(host, tracklist || null);
      }
      state.resultsHost = host;
      state.resultsList = host.querySelector('.ss1-results');
      state.resultsSentinel = host.querySelector('.ss1-sentinel');
      return host;
    }

    function createResultRow(track, resultIndex) {
      const row = document.createElement('div');
      row.className = 'ss1-row';
      row.tabIndex = 0;
      row.dataset.uri = track.uri;
      row.setAttribute('aria-label', `${track.title} — ${track.artists.join(', ')}`);
      const number = document.createElement('div'); number.className = 'ss1-row-number';
      const index = document.createElement('span'); index.className = 'ss1-row-index'; index.textContent = String(resultIndex + 1);
      const play = document.createElement('button'); play.className = 'ss1-row-play'; play.type = 'button'; play.textContent = '▶'; play.setAttribute('aria-label', `Play ${track.title}`);
      play.addEventListener('click', (event) => { event.stopPropagation(); void playFiltered(resultIndex, false); });
      number.append(index, play);
      const titleCell = document.createElement('div'); titleCell.className = 'ss1-title-cell';
      if (track.image) { const image = document.createElement('img'); image.className = 'ss1-cover'; image.src = track.image; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; titleCell.appendChild(image); }
      else { const placeholder = document.createElement('div'); placeholder.className = 'ss1-cover-placeholder'; titleCell.appendChild(placeholder); }
      const stack = document.createElement('div'); stack.className = 'ss1-title-stack';
      const title = document.createElement('div'); title.className = 'ss1-title'; title.textContent = track.title;
      const artists = document.createElement('div'); artists.className = 'ss1-artists'; artists.textContent = track.artists.join(', '); stack.append(title, artists); titleCell.appendChild(stack);
      const album = document.createElement('div'); album.className = 'ss1-album ss1-album-column'; album.textContent = track.album;
      const added = document.createElement('div'); added.className = 'ss1-added ss1-date-column'; added.textContent = formatAddedDate(track.addedAt);
      const duration = document.createElement('div'); duration.className = 'ss1-duration'; duration.textContent = formatDuration(track.duration);
      row.append(number, titleCell, album, added, duration);
      row.addEventListener('dblclick', () => void playFiltered(resultIndex, false));
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void playFiltered(resultIndex, false); } });
      return row;
    }

    function appendResultChunk() {
      const list = state.resultsList;
      if (!list || loadConfig().resultsCollapsed || !state.query || state.queryErrors.length) return;
      const end = Math.min(state.filtered.length, state.renderedCount + RENDER_CHUNK);
      if (end <= state.renderedCount) return;
      const fragment = document.createDocumentFragment();
      for (let index = state.renderedCount; index < end; index += 1) fragment.appendChild(createResultRow(state.filtered[index], index));
      list.appendChild(fragment);
      state.renderedCount = end;
      updatePlayingRowStyles();
    }

    function resetRenderedResults() {
      state.renderedCount = 0;
      state.resultsList?.replaceChildren();
      appendResultChunk();
    }

    function updatePlayingRowStyles() {
      const currentUri = state.S?.Player?.data?.item?.uri || '';
      state.resultsHost?.querySelectorAll('.ss1-row').forEach((row) => row.classList.toggle('is-playing', Boolean(currentUri && row.dataset.uri === currentUri)));
    }

    function updatePlaybackUi() {
      const host = state.resultsHost;
      if (!host) return;
      const play = host.querySelector('[data-action="play"]');
      const shuffle = host.querySelector('[data-action="shuffle"]');
      const progress = host.querySelector('.ss1-progress');
      const disabled = state.playbackBusy || !state.filtered.length || state.queryErrors.length > 0;
      if (play) { play.disabled = disabled; play.textContent = state.playbackBusy ? 'Starting…' : '▶ Play results'; }
      if (shuffle) shuffle.disabled = disabled;
      if (progress) {
        const session = state.playbackSession;
        const belongs = session?.active && session.query === state.query && session.sequence.length > 0 && state.filtered.length > 0;
        progress.textContent = belongs && session.currentIndex >= 0 ? `· Playing ${Math.min(session.currentIndex + 1, session.sequence.length)}/${session.sequence.length}` : '';
      }
      updatePlayingRowStyles();
    }

    function renderSmartSearch(config = loadConfig()) {
      const active = config.enabled && Boolean(state.query.trim());
      if (active && !state.queryErrors.length && !state.yearMetadataLoading && (state.nativeAdapterMode === 'native' || state.nativeAdapterMode === 'attaching')) {
        restoreNativeTracklist();
        const existing = document.getElementById(RESULTS_HOST_ID);
        if (existing) existing.hidden = true;
        setNativeSmartState(true);
        return;
      }
      const host = ensureHost();
      if (!host) return;
      const toolbar = host.querySelector('.ss1-toolbar');
      const body = host.querySelector('.ss1-body');
      const status = host.querySelector('.ss1-status');
      const count = host.querySelector('.ss1-count');
      const help = host.querySelector('.ss1-help');
      const collapsedNote = host.querySelector('.ss1-collapsed-note');
      const collapse = host.querySelector('[data-action="collapse"]');
      host.hidden = !active;
      if (!active) {
        if (toolbar) toolbar.hidden = true;
        if (body) body.hidden = true;
        if (collapsedNote) collapsedNote.hidden = true;
        setNativeSmartState(false);
        restoreNativeTracklist();
        return;
      }
      setNativeSmartState(true);
      hideNativeTracklist();
      if (toolbar) toolbar.hidden = false;
      if (count) count.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? '' : 's'} · compatibility mode`;
      if (collapse) {
        collapse.textContent = config.resultsCollapsed ? '⌄' : '⌃';
        collapse.title = config.resultsCollapsed ? 'Expand results' : 'Collapse results';
        collapse.setAttribute('aria-label', collapse.title);
      }
      if (config.resultsCollapsed) {
        if (body) body.hidden = true;
        if (collapsedNote) collapsedNote.hidden = false;
      } else {
        if (body) body.hidden = false;
        if (collapsedNote) collapsedNote.hidden = true;
        if (help) help.hidden = !config.showSyntaxHelp;
        if (status) { status.hidden = true; status.className = 'ss1-status'; }
        if (state.queryErrors.length) {
          if (status) { status.hidden = false; status.className = 'ss1-status query-error'; status.textContent = state.queryErrors.join(' '); }
        } else if (state.yearMetadataLoading) {
          if (status) { status.hidden = false; status.textContent = 'Loading release years…'; }
        } else if (state.loading) {
          if (status) { status.hidden = false; status.textContent = 'Loading playlist…'; }
        } else if (state.lastError || state.nativeAdapterError) {
          if (status) { status.hidden = false; status.className = 'ss1-status error'; status.textContent = state.lastError || 'Spotify native list integration is unavailable; using compatibility mode.'; }
        } else if (!state.filtered.length && queryUsesYear(state.queryAst) && state.lastYearMetadataSummary?.failed) {
          if (status) { status.hidden = false; status.className = 'ss1-status query-error'; status.textContent = 'Could not load release-year metadata for this playlist.'; }
        } else if (!state.filtered.length) {
          if (status) { status.hidden = false; status.textContent = 'No matching tracks'; }
        }
        resetRenderedResults();
      }
      updatePlaybackUi();
    }

    function clearResultsUi() {
      document.getElementById(RESULTS_HOST_ID)?.remove();
      state.resultsHost = null; state.resultsList = null; state.resultsSentinel = null;
      try { state.resultsObserver?.disconnect(); } catch {}
      state.resultsObserver = null; state.renderedCount = 0;
    }
    return { ensureHost, updatePlayingRowStyles, updatePlaybackUi, renderSmartSearch, clearResultsUi };
  })();

  // src/search/matcher.js
  const __mod17 = (() => {
    function matchNode(track, node) {
      switch (node?.kind) {
        case 'true': return true;
        case 'invalid': return false;
        case 'not': return !matchNode(track, node.child);
        case 'and': return node.children.every((child) => matchNode(track, child));
        case 'or': return node.children.some((child) => matchNode(track, child));
        case 'text': return !node.value || track.searchText.includes(node.value);
        case 'field':
          if (!node.value) return true;
          if (node.field === 'artist') {
            return node.exact
              ? track.artistNorm.some((artist) => artist === node.value)
              : track.artistNorm.some((artist) => artist.includes(node.value));
          }
          return false;
        case 'year-eq': return track.year === node.a;
        case 'year-gt': return track.year !== null && track.year > node.a;
        case 'year-gte': return track.year !== null && track.year >= node.a;
        case 'year-lt': return track.year !== null && track.year < node.a;
        case 'year-lte': return track.year !== null && track.year <= node.a;
        case 'year-range': return track.year !== null && track.year >= node.a && track.year <= node.b;
        default: return false;
      }
    }

    function filterTracks(tracks, parseResult) {
      if (!parseResult || parseResult.errors?.length) return [];
      return tracks.filter((track) => matchNode(track, parseResult.ast));
    }
    return { matchNode, filterTracks };
  })();

  // src/ui/native-search.js
  const __mod18 = (() => {
    const { state } = __mod0;
    const { loadConfig } = __mod4;
    const { emit } = __mod7;
    const { smartSyntaxUsed } = __mod5;
    const { nativeSearchCandidates } = __mod8;
    const { primeNativeListTarget, suppressSpotifyNativeFilter, endNativeSmartMode } = __mod12;
    let nativeBlankConfirmTimer = null;

    function cancelBlankConfirmation() {
      if (nativeBlankConfirmTimer !== null) {
        clearTimeout(nativeBlankConfirmTimer);
        nativeBlankConfirmTimer = null;
      }
    }

    function confirmSearchWasCleared(candidate) {
      if (nativeBlankConfirmTimer !== null) return;
      const queryAtSchedule = state.query;
      nativeBlankConfirmTimer = setTimeout(() => {
        nativeBlankConfirmTimer = null;
        if (!queryAtSchedule || state.query !== queryAtSchedule) return;
        if (!candidate?.isConnected || String(candidate.value || '').trim()) return;
        state.smartRefreshPending = false;
        endNativeSmartMode();
        emit('advanced-cleared');
      }, 120);
    }

    function interceptAdvancedInput(input, event, value) {
      try {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
      } catch {}
      suppressSpotifyNativeFilter(input, value);
      emit('advanced-input', { input, value, event: event ?? null });
    }

    function syncNativeSearchValue(candidate, event = null) {
      const value = candidate.value || '';
      if (value.trim()) cancelBlankConfirmation();

      if (smartSyntaxUsed(value)) {
        if (event || value !== state.query) interceptAdvancedInput(candidate, event, value);
        return;
      }

      primeNativeListTarget();
      if (state.query) {
        if (!event && !value.trim() && (state.nativeAdapterMode === 'native' || state.nativeAdapterMode === 'attaching')) {
          confirmSearchWasCleared(candidate);
          return;
        }
        cancelBlankConfirmation();
        state.smartRefreshPending = false;
        endNativeSmartMode();
        emit('advanced-cleared');
      }
    }

    function detachNativeSearch() {
      cancelBlankConfirmation();
      if (state.nativeSearchInput && state.nativeSearchListener) {
        state.nativeSearchInput.removeEventListener('input', state.nativeSearchListener, true);
        state.nativeSearchInput.removeEventListener('change', state.nativeSearchListener, true);
      }
      state.nativeSearchInput?.classList.remove('smart-search-native-active');
      state.nativeSearchInput = null;
      state.nativeSearchListener = null;
    }

    function hookNativeSearch() {
      if (!loadConfig().enabled) { detachNativeSearch(); return; }
      const candidate = nativeSearchCandidates()[0] || null;
      if (!candidate) {
        if (!state.nativeSearchMissingSince) state.nativeSearchMissingSince = Date.now();
        if (state.query && Date.now() - state.nativeSearchMissingSince > 1000) {
          endNativeSmartMode();
          emit('advanced-cleared');
        }
        return;
      }
      state.nativeSearchMissingSince = 0;
      if (candidate === state.nativeSearchInput) {
        syncNativeSearchValue(candidate);
        return;
      }
      detachNativeSearch();
      const listener = (event) => syncNativeSearchValue(candidate, event);
      candidate.addEventListener('input', listener, true);
      candidate.addEventListener('change', listener, true);
      state.nativeSearchInput = candidate;
      state.nativeSearchListener = listener;
      syncNativeSearchValue(candidate);
    }
    return { detachNativeSearch, hookNativeSearch };
  })();

  // src/spotify/track-normalizer.js
  const __mod19 = (() => {
    const { firstDefined, normalizeText } = __mod1;
    function directTrackCandidate(item) {
      if (!item || typeof item !== 'object') return null;
      const wrappers = [item.track, item.itemV2, item.item, item.content, item.entity, item];
      for (const wrapper of wrappers) {
        if (!wrapper || typeof wrapper !== 'object') continue;
        const wrapperUri = wrapper.uri || wrapper._uri || wrapper.trackUri || wrapper.track_uri
          || wrapper.entity?.uri || wrapper.data?.uri || wrapper.data?._uri || wrapper.data?.entity?.uri;
        const data = wrapper.data && typeof wrapper.data === 'object' ? wrapper.data : wrapper;
        const dataUri = data.uri || data._uri || data.trackUri || data.track_uri || data.entity?.uri;
        const uri = wrapperUri || dataUri;
        if (typeof uri === 'string' && uri.startsWith('spotify:track:')) return { data, uri, wrapper };
      }
      const directData = item.data;
      if (directData && typeof directData === 'object') {
        const uri = directData.uri || directData._uri || directData.trackUri || directData.track_uri || directData.entity?.uri;
        if (typeof uri === 'string' && uri.startsWith('spotify:track:')) return { data: directData, uri, wrapper: item };
      }
      return null;
    }

    function extractArtistNames(candidate) {
      const buckets = [
        candidate.artists,
        candidate.artists?.items,
        candidate.artist,
        candidate.artist?.items,
        candidate.performers,
        candidate.entity?.artists,
        candidate.entity?.artist,
      ];
      const names = [];
      for (const bucket of buckets) {
        const items = Array.isArray(bucket) ? bucket : bucket ? [bucket] : [];
        for (const artist of items) {
          if (typeof artist === 'string') names.push(artist);
          else if (artist && typeof artist === 'object') {
            const name = artist.name ?? artist.profile?.name ?? artist.data?.profile?.name ?? artist.data?.name;
            if (name) names.push(String(name));
          }
        }
        if (names.length) break;
      }
      if (!names.length && candidate.metadata?.artist_name) names.push(String(candidate.metadata.artist_name));
      return [...new Set(names.filter(Boolean))];
    }

    function releaseYearFromValue(value) {
      if (value == null) return null;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 1000 && value <= 9999) return Math.trunc(value);
      if (typeof value === 'object') {
        for (const key of ['year', 'isoString', 'date', 'releaseDate', 'release_date', 'value']) {
          const nested = releaseYearFromValue(value?.[key]);
          if (nested) return nested;
        }
        return null;
      }
      const match = String(value).match(/\b(19|20)\d{2}\b/);
      return match ? Number(match[0]) : null;
    }

    function sanitizeImageUrl(value) {
      const text = String(value ?? '').trim();
      if (!text) return '';
      const spotifyImage = text.match(/^spotify:image:([A-Za-z0-9]+)$/i);
      if (spotifyImage) return `https://i.scdn.co/image/${spotifyImage[1]}`;
      try {
        const url = new URL(text);
        return url.protocol === 'https:' ? url.toString() : '';
      } catch {
        return '';
      }
    }

    function trackUriFromUnknown(item) {
      return directTrackCandidate(item)?.uri ?? null;
    }

    function normalizeTrackItem(item, playlistIndex) {
      const candidate = directTrackCandidate(item);
      if (!candidate) return null;
      const c = candidate.data;
      const title = String(firstDefined(c, [['name'], ['title'], ['entity', 'name'], ['entity', 'title'], ['metadata', 'title']]) ?? 'Unknown track');
      const artists = extractArtistNames(c);
      const albumObject = firstDefined(c, [['albumOfTrack'], ['album'], ['release'], ['entity', 'album']]);
      const album = typeof albumObject === 'string'
        ? albumObject
        : String(albumObject?.name ?? albumObject?.title ?? c.metadata?.album_title ?? '');
      const releaseValue = firstDefined(c, [
        ['albumOfTrack', 'date', 'isoString'],
        ['albumOfTrack', 'date', 'year'],
        ['albumOfTrack', 'date'],
        ['albumOfTrack', 'releaseDate', 'isoString'],
        ['albumOfTrack', 'releaseDate'],
        ['albumOfTrack', 'release_date'],
        ['album', 'release_date'],
        ['album', 'releaseDate'],
        ['album', 'date'],
        ['release_date'],
        ['releaseDate'],
        ['date'],
        ['metadata', 'album_release_date'],
        ['metadata', 'release_date'],
        ['metadata', 'releaseDate'],
        ['metadata', 'album_release_year'],
        ['metadata', 'release_year'],
      ]);
      const yearCandidate = releaseYearFromValue(releaseValue)
        ?? releaseYearFromValue(albumObject?.date)
        ?? releaseYearFromValue(albumObject?.release_date)
        ?? releaseYearFromValue(albumObject?.releaseDate);
      const durationCandidate = Number(firstDefined(c, [
        ['duration', 'totalMilliseconds'],
        ['duration', 'milliseconds'],
        ['trackDuration', 'totalMilliseconds'],
        ['duration_ms'],
        ['durationMs'],
        ['metadata', 'duration'],
      ]) ?? 0);
      const image = sanitizeImageUrl(firstDefined(c, [
        ['albumOfTrack', 'coverArt', 'sources', 0, 'url'],
        ['album', 'images', 0, 'url'],
        ['album', 'coverArt', 'sources', 0, 'url'],
        ['metadata', 'image_url'],
        ['metadata', 'image_large_url'],
      ]));
      const addedAt = String(firstDefined(item, [
        ['addedAt'], ['added_at'], ['itemV2', 'addedAt'], ['track', 'addedAt'], ['metadata', 'added_at'],
      ]) ?? '');
      const uid = item?.uid ?? item?.itemV2?.uid ?? item?.item?.uid ?? candidate.wrapper?.uid ?? c.uid ?? null;
      const isPlayable = firstDefined(item, [['isPlayable'], ['track', 'isPlayable'], ['itemV2', 'isPlayable']]) !== false;
      const titleNorm = normalizeText(title);
      const artistNorm = artists.map(normalizeText);
      const albumNorm = normalizeText(album);
      return {
        uri: candidate.uri,
        uid: uid ? String(uid) : null,
        title,
        artists,
        album,
        year: Number.isFinite(yearCandidate) ? yearCandidate : null,
        duration: Number.isFinite(durationCandidate) ? durationCandidate : 0,
        image,
        addedAt,
        playlistIndex,
        isPlayable,
        titleNorm,
        artistNorm,
        albumNorm,
        searchText: [titleNorm, albumNorm, ...artistNorm].join(' '),
        rawItem: item,
      };
    }

    function findBestTrackArray(root) {
      const direct = firstDefined(root, [
        ['data', 'playlistV2', 'content', 'items'],
        ['playlistV2', 'content', 'items'],
        ['data', 'playlist', 'content', 'items'],
      ]);
      if (Array.isArray(direct)) return direct;
      if (Array.isArray(direct?.items)) return direct.items;

      let best = null;
      const seen = new WeakSet();
      function walk(node, depth) {
        if (!node || typeof node !== 'object' || depth > 14 || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) {
          if (node.length) {
            let score = 0;
            for (const item of node.slice(0, 10)) if (directTrackCandidate(item)) score += 1;
            if (score && (!best || score > best.score || (score === best.score && node.length > best.array.length))) best = { score, array: node };
          }
          for (const item of node.slice(0, 12)) walk(item, depth + 1);
        } else {
          for (const value of Object.values(node)) walk(value, depth + 1);
        }
      }
      walk(root, 0);
      return best?.array ?? [];
    }

    function normalizeItems(items, baseIndex = 0) {
      const tracks = [];
      for (let index = 0; index < items.length; index += 1) {
        try {
          const track = normalizeTrackItem(items[index], baseIndex + index);
          if (track?.isPlayable) tracks.push(track);
        } catch {}
      }
      return tracks;
    }
    return { releaseYearFromValue, trackUriFromUnknown, normalizeTrackItem, findBestTrackArray, normalizeItems };
  })();

  // src/spotify/playlist-source.js
  const __mod20 = (() => {
    const { CACHE_TTL_MS, PAGE_SIZE } = __mod2;
    const { state } = __mod0;
    const { firstDefined, sleep, consoleWarn } = __mod1;
    const { detectCapabilities, playlistGraphQLDefinitions } = __mod6;
    const { findBestTrackArray, normalizeItems } = __mod19;
    const { recordDiagnostic } = __mod10;
    function namedGraphQLType(typeNode) {
      let node = typeNode;
      while (node?.type) node = node.type;
      return node?.name?.value ?? '';
    }

    function graphQLVariableNames(definition) {
      const operation = definition?.definitions?.find((item) => item?.kind === 'OperationDefinition');
      return (operation?.variableDefinitions ?? []).map((variable) => ({
        name: variable?.variable?.name?.value,
        type: namedGraphQLType(variable?.type),
        required: variable?.type?.kind === 'NonNullType',
        defaultValue: variable?.defaultValue?.value,
      })).filter((item) => item.name);
    }

    function buildGraphQLVariables(definition, playlistUri, playlistId, offset, limit) {
      const specs = graphQLVariableNames(definition);
      const context = state.S?.GraphQL?.Context ?? {};
      const variables = {};
      for (const spec of specs) {
        const lower = spec.name.toLowerCase();
        if (['uri', 'playlisturi', 'playlist_uri'].includes(lower)) variables[spec.name] = playlistUri;
        else if (['playlistid', 'playlist_id'].includes(lower)) variables[spec.name] = playlistId;
        else if (lower === 'offset') variables[spec.name] = offset;
        else if (lower === 'limit') variables[spec.name] = limit;
        else if (lower === 'enablewatchfeedentrypoint') variables[spec.name] = false;
        else if (lower === 'locale') variables[spec.name] = context.locale || state.S?.Platform?.Session?.locale || 'en';
        else if (lower === 'market') variables[spec.name] = context.market || state.S?.Platform?.Session?.country || 'from_token';
        else if (spec.defaultValue !== undefined) {
          if (spec.type === 'Boolean') variables[spec.name] = spec.defaultValue === true || spec.defaultValue === 'true';
          else if (spec.type === 'Int' || spec.type === 'Float') variables[spec.name] = Number(spec.defaultValue);
          else variables[spec.name] = spec.defaultValue;
        } else if (spec.required && spec.type === 'Boolean') variables[spec.name] = false;
      }
      return variables;
    }

    async function fetchPlaylistViaPlatformAPI(playlistId) {
      const api = state.S?.Platform?.PlaylistAPI;
      if (typeof api?.getContents !== 'function') throw new Error('PlaylistAPI.getContents is unavailable');
      const attempts = [`spotify:playlist:${playlistId}`, playlistId];
      const errors = [];
      for (const argument of attempts) {
        try {
          const response = await api.getContents.call(api, argument);
          const items = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : findBestTrackArray(response);
          const tracks = normalizeItems(items, 0);
          if (tracks.length || items.length === 0) return tracks;
          errors.push(`${String(argument).startsWith('spotify:') ? 'URI' : 'ID'} returned no playable tracks`);
        } catch (error) {
          errors.push(error?.message || String(error));
        }
      }
      throw new Error(`PlaylistAPI failed: ${errors.join(' | ')}`);
    }

    async function waitForPlaylistGraphQLDefinitions(timeoutMs = 3000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const c = detectCapabilities();
        if (c.graphqlRequest && c.graphqlPlaylistDefinition) return true;
        await sleep(100);
      }
      return false;
    }

    async function fetchPlaylistViaGraphQL(playlistId) {
      await waitForPlaylistGraphQLDefinitions();
      if (typeof state.S?.GraphQL?.Request !== 'function') throw new Error('GraphQL.Request is unavailable');
      const definitions = playlistGraphQLDefinitions(state.S);
      if (!definitions.length) throw new Error('No compatible playlist GraphQL definition is available');

      const playlistUri = `spotify:playlist:${playlistId}`;
      const failures = [];
      for (const [name, definition] of definitions) {
        try {
          const tracks = [];
          let offset = 0;
          for (let page = 0; page < 200; page += 1) {
            const variables = buildGraphQLVariables(definition, playlistUri, playlistId, offset, PAGE_SIZE);
            const response = await state.S.GraphQL.Request(definition, variables, { persistCache: true });
            const items = findBestTrackArray(response);
            tracks.push(...normalizeItems(items, offset));
            const total = Number(firstDefined(response, [
              ['data', 'playlistV2', 'content', 'totalCount'],
              ['playlistV2', 'content', 'totalCount'],
            ]) ?? NaN);
            if (!items.length || items.length < PAGE_SIZE || (Number.isFinite(total) && offset + items.length >= total)) break;
            offset += items.length;
          }
          if (tracks.length) return tracks;
          failures.push(`${name}: no playable tracks`);
        } catch (error) {
          failures.push(`${name}: ${error?.message || error}`);
        }
      }
      throw new Error(`GraphQL fallback failed: ${failures.join(' | ')}`);
    }

    function fingerprintTracks(tracks) {
      // Fast, stable enough to notice additions/removals/reordering without retaining raw objects.
      let hash = 2166136261;
      for (const track of tracks) {
        const token = `${track.uid ?? ''}|${track.uri}|${track.playlistIndex};`;
        for (let i = 0; i < token.length; i += 1) {
          hash ^= token.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
      }
      return `${tracks.length}:${(hash >>> 0).toString(16)}`;
    }

    function invalidatePlaylistCache(playlistId = state.playlistId, reason = 'unspecified') {
      if (!playlistId) return;
      state.cache.delete(playlistId);
      recordDiagnostic('cache-invalidated', reason);
    }

    function clearPlaylistCache(reason = 'clear-all') {
      state.cache.clear();
      recordDiagnostic('cache-cleared', reason);
    }

    async function getPlaylistTracks(playlistId, { force = false } = {}) {
      const cached = state.cache.get(playlistId);
      if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
        return { tracks: cached.tracks, source: cached.source, fingerprint: cached.fingerprint, changed: false, cached: true };
      }

      let tracks = [];
      let source = '';
      let platformError = null;
      const c = detectCapabilities();

      if (c.playlistGetContents) {
        try {
          tracks = await fetchPlaylistViaPlatformAPI(playlistId);
          source = 'PlaylistAPI';
        } catch (error) {
          platformError = error;
          consoleWarn('PlaylistAPI source failed; considering GraphQL fallback.', error);
        }
      }

      if (!source && c.graphqlRequest) {
        try {
          tracks = await fetchPlaylistViaGraphQL(playlistId);
          source = 'GraphQL';
        } catch (graphQLError) {
          const platformMessage = platformError?.message || String(platformError || 'unavailable');
          throw new Error(`Could not load playlist. PlaylistAPI: ${platformMessage}. GraphQL: ${graphQLError?.message || graphQLError}`);
        }
      }

      if (!source) {
        throw new Error('No compatible playlist data source is available in this Spotify/Spicetify build.');
      }

      const fingerprint = fingerprintTracks(tracks);
      const previous = cached?.fingerprint ?? state.lastPlaylistFingerprint;
      const changed = Boolean(previous && previous !== fingerprint);
      const entry = { tracks, loadedAt: Date.now(), source, fingerprint };
      state.cache.set(playlistId, entry);
      state.lastPlaylistFingerprint = fingerprint;
      recordDiagnostic('playlist-loaded', `${source}; ${tracks.length} tracks${changed ? '; changed' : ''}`);
      return { tracks, source, fingerprint, changed, cached: false };
    }
    return { getPlaylistTracks, fingerprintTracks, invalidatePlaylistCache, clearPlaylistCache };
  })();

  // src/spotify/year-metadata.js
  const __mod21 = (() => {
    const { state } = __mod0;
    const { recordDiagnostic } = __mod10;
    const { releaseYearFromValue } = __mod19;
    const yearCache = new Map();

    function trackIdFromUri(uri) {
      const match = String(uri ?? '').match(/^spotify:track:([A-Za-z0-9]+)$/);
      return match ? match[1] : null;
    }

    function astHasYearNode(node) {
      if (!node || typeof node !== 'object') return false;
      if (['year-eq', 'year-gt', 'year-gte', 'year-lt', 'year-lte', 'year-range'].includes(node.kind)) return true;
      if (node.kind === 'not') return astHasYearNode(node.child);
      if (node.kind === 'and' || node.kind === 'or') return node.children?.some(astHasYearNode) ?? false;
      return false;
    }

    function queryNeedsYearMetadata(parseResultOrAst) {
      return astHasYearNode(parseResultOrAst?.ast ?? parseResultOrAst);
    }

    function chunks(values, size) {
      const result = [];
      for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
      return result;
    }

    function applyCachedYears(tracks) {
      let updated = 0;
      for (const track of tracks) {
        if (track.year != null) continue;
        const id = trackIdFromUri(track.uri);
        if (!id || !yearCache.has(id)) continue;
        const year = yearCache.get(id);
        if (year != null) {
          track.year = year;
          updated += 1;
        }
      }
      return updated;
    }

    async function ensureReleaseYears(tracks) {
      const list = Array.isArray(tracks) ? tracks : [];
      let updated = applyCachedYears(list);
      const missing = [];
      const seen = new Set();
      for (const track of list) {
        if (track.year != null) continue;
        const id = trackIdFromUri(track.uri);
        if (!id || seen.has(id) || yearCache.has(id)) continue;
        seen.add(id);
        missing.push(id);
      }

      if (!missing.length) {
        return { requested: 0, updated, unresolved: list.filter((track) => track.year == null).length, failed: false };
      }

      const get = state.S?.CosmosAsync?.get;
      if (typeof get !== 'function') {
        recordDiagnostic('release-year-lookup', 'CosmosAsync unavailable');
        return { requested: missing.length, updated, unresolved: list.filter((track) => track.year == null).length, failed: true };
      }

      let failed = false;
      for (const batch of chunks(missing, 50)) {
        try {
          const response = await get.call(state.S.CosmosAsync, `https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`);
          const returned = Array.isArray(response?.tracks) ? response.tracks : [];
          const returnedIds = new Set();
          for (const item of returned) {
            const id = String(item?.id ?? '').trim();
            if (!id) continue;
            returnedIds.add(id);
            const year = releaseYearFromValue(item?.album?.release_date)
              ?? releaseYearFromValue(item?.album?.releaseDate)
              ?? releaseYearFromValue(item?.release_date);
            yearCache.set(id, year ?? null);
          }
          for (const id of batch) if (!returnedIds.has(id)) yearCache.set(id, null);
        } catch (error) {
          failed = true;
          recordDiagnostic('release-year-lookup-error', error?.message || String(error));
          break;
        }
      }

      updated += applyCachedYears(list);
      const unresolved = list.filter((track) => track.year == null).length;
      recordDiagnostic('release-year-lookup', `${missing.length} requested; ${updated} updated; ${unresolved} unresolved${failed ? '; failed' : ''}`);
      return { requested: missing.length, updated, unresolved, failed };
    }

    function clearReleaseYearCache() {
      yearCache.clear();
    }
    return { ensureReleaseYears, queryNeedsYearMetadata, clearReleaseYearCache };
  })();

  // src/controller.js
  const __mod22 = (() => {
    const { CACHE_TTL_MS } = __mod2;
    const { state } = __mod0;
    const { on, emit } = __mod7;
    const { loadConfig } = __mod4;
    const { parseQuery } = __mod5;
    const { filterTracks } = __mod17;
    const { playlistIdFromLocation, restoreNativeTracklist, setNativeSmartState } = __mod8;
    const { renderSmartSearch, clearResultsUi, updatePlaybackUi } = __mod16;
    const { hookNativeSearch, detachNativeSearch } = __mod18;
    const { beginNativeSmartMode, endNativeSmartMode, maintainNativeSmartMode, primeNativeListTarget } = __mod12;
    const { getPlaylistTracks, invalidatePlaylistCache } = __mod20;
    const { maintainMutationWatcher, stopMutationWatcher, suspendMutationWatcher } = __mod11;
    const { recordDiagnostic } = __mod10;
    const { consoleError, consoleWarn, safeErrorMessage } = __mod1;
    const { ensureReleaseYears, queryNeedsYearMetadata } = __mod21;
    let eventsInstalled = false;

    function setSmartQuery(query) {
      state.query = String(query ?? '');
      const parsed = parseQuery(state.query);
      state.queryAst = parsed.ast;
      state.queryErrors = parsed.errors;
      if (state.query.trim() && !parsed.errors.length) {
        state.filtered = filterTracks(state.tracks, parsed);
        if (!state.loading && state.tracks.length) state.lastError = null;
      } else {
        state.filtered = [];
      }
      renderSmartSearch();
      return parsed;
    }

    async function loadCurrentPlaylist(force = false, reason = 'load') {
      const playlistId = playlistIdFromLocation();
      if (!playlistId || !loadConfig().enabled) return null;
      if (state.loading && state.loadingPlaylistId === playlistId) return null;

      const generation = ++state.routeGeneration;
      if (force) suspendMutationWatcher(1200);
      state.loading = true;
      state.loadingPlaylistId = playlistId;
      state.lastError = null;
      renderSmartSearch();
      try {
        const result = await getPlaylistTracks(playlistId, { force });
        if (generation !== state.routeGeneration || playlistId !== playlistIdFromLocation()) return null;
        state.playlistId = playlistId;
        state.tracks = result.tracks;
        state.source = result.source;
        state.loading = false;
        state.loadingPlaylistId = null;
        setSmartQuery(state.query);
        recordDiagnostic('playlist-refresh', `${reason}${result.changed ? '; content changed' : ''}`);
        if (state.query && !state.queryErrors.length && !state.smartRefreshPending && !state.yearMetadataLoading) beginNativeSmartMode(state.query);
        return result;
      } catch (error) {
        if (generation !== state.routeGeneration) return null;
        state.loading = false;
        state.loadingPlaylistId = null;
        state.lastError = safeErrorMessage(error) || 'Could not load playlist.';
        consoleError('Could not load playlist.', error);
        renderSmartSearch();
        return null;
      }
    }

    async function handleAdvancedInput({ input, value }) {
      const previousQuery = state.query;
      const entering = !previousQuery.trim();
      let parsed = setSmartQuery(value);

      if (parsed.errors.length) {
        endNativeSmartMode();
        state.nativeAdapterMode = 'fallback';
        state.nativeAdapterError = null;
        renderSmartSearch();
        return;
      }

      if (entering && state.playlistId) {
        state.smartRefreshPending = true;
        state.nativeAdapterMode = 'attaching';
        try { await loadCurrentPlaylist(true, 'enter-smart-search'); }
        catch (error) { consoleWarn('Could not refresh playlist before Smart Search.', error); }
        finally { state.smartRefreshPending = false; }
        if (state.query !== value || !input?.isConnected) return;
        parsed = parseQuery(value);
      }

      if (queryNeedsYearMetadata(parsed) && state.tracks.some((track) => track.year == null)) {
        state.yearMetadataLoading = true;
        state.nativeAdapterMode = 'attaching';
        renderSmartSearch();
        try {
          state.lastYearMetadataSummary = await ensureReleaseYears(state.tracks);
        } catch (error) {
          state.lastYearMetadataSummary = { failed: true, message: safeErrorMessage(error) };
          consoleWarn('Could not load missing release years.', error);
        } finally {
          state.yearMetadataLoading = false;
        }
        if (state.query !== value || !input?.isConnected) return;
        parsed = setSmartQuery(value);
      }

      if (!state.smartRefreshPending && !state.yearMetadataLoading) beginNativeSmartMode(value);
    }

    function clearAdvancedQuery() {
      state.query = '';
      state.queryAst = { kind: 'true' };
      state.queryErrors = [];
      state.filtered = [];
      state.nativeAdapterError = null;
      renderSmartSearch();
    }

    async function refreshAfterMutation({ reason = 'mutation' } = {}) {
      if (!state.playlistId || !loadConfig().livePlaylistRefresh) {
        emit('playlist-refresh-status', { phase: 'unavailable', reason });
        return null;
      }
      emit('playlist-refresh-status', { phase: 'start', reason });
      suspendMutationWatcher(2200);
      invalidatePlaylistCache(state.playlistId, reason);
      const before = state.lastPlaylistFingerprint;
      try {
        const result = await loadCurrentPlaylist(true, reason);
        if (!result) {
          emit('playlist-refresh-status', { phase: 'error', reason, message: 'Playlist refresh did not complete.' });
          return null;
        }
        const changed = Boolean(result?.fingerprint && result.fingerprint !== before);
        emit('playlist-refresh-status', { phase: 'done', reason, changed, trackCount: result.tracks?.length ?? state.tracks.length });
        if (changed && reason !== 'manual-refresh') state.S?.showNotification?.('Smart Search updated after a playlist change.');
        return result;
      } catch (error) {
        const message = safeErrorMessage(error) || 'Playlist refresh failed.';
        emit('playlist-refresh-status', { phase: 'error', reason, message });
        return null;
      }
    }

    function installControllerEvents() {
      if (eventsInstalled) return;
      eventsInstalled = true;
      on('advanced-input', (payload) => void handleAdvancedInput(payload));
      on('advanced-cleared', clearAdvancedQuery);
      on('playlist-mutation-candidate', (payload) => void refreshAfterMutation(payload));
      on('manual-playlist-refresh', () => void refreshAfterMutation({ reason: 'manual-refresh' }));
      on('render', () => renderSmartSearch());
      on('playback-update', () => updatePlaybackUi());
      on('config-changed', () => applyConfiguration());
    }

    function maintainBindings() {
      hookNativeSearch();
      maintainNativeSmartMode();
      maintainMutationWatcher();
      if (!state.query) primeNativeListTarget();
    }

    async function handleRoute() {
      const config = loadConfig();
      const playlistId = playlistIdFromLocation();
      if (!config.enabled || !playlistId) {
        state.routeGeneration += 1;
        state.playlistId = null;
        state.tracks = [];
        state.filtered = [];
        state.query = '';
        state.queryErrors = [];
        state.loading = false;
        state.loadingPlaylistId = null;
        state.lastError = null;
        endNativeSmartMode();
        detachNativeSearch();
        restoreNativeTracklist();
        stopMutationWatcher();
        clearResultsUi();
        return;
      }

      const changed = playlistId !== state.playlistId;
      if (changed) {
        endNativeSmartMode();
        state.query = '';
        state.queryErrors = [];
        state.filtered = [];
        state.playlistId = playlistId;
        state.nativeSearchMissingSince = 0;
        renderSmartSearch(config);
        await loadCurrentPlaylist(false, 'route-change');
      }
      hookNativeSearch();
      maintainMutationWatcher();
      renderSmartSearch(config);
    }

    function applyConfiguration() {
      const config = loadConfig();
      if (!config.enabled) {
        endNativeSmartMode();
        detachNativeSearch();
        stopMutationWatcher();
        if (state.playbackSession) state.playbackSession.active = false;
        clearAdvancedQuery();
        restoreNativeTracklist();
        setNativeSmartState(false);
        renderSmartSearch(config);
        return;
      }
      if (!config.preferNativeRows && state.query) {
        endNativeSmartMode();
        state.nativeAdapterMode = 'fallback';
      } else if (config.preferNativeRows && state.query && !state.queryErrors.length) {
        beginNativeSmartMode(state.query);
      }
      hookNativeSearch();
      maintainMutationWatcher();
      renderSmartSearch(config);
      const playlistId = playlistIdFromLocation();
      if (playlistId && (!state.tracks.length || state.playlistId !== playlistId)) void loadCurrentPlaylist(false, 'config-change');
    }

    function maybeRefreshExpiredCache() {
      if (!state.playlistId || !state.query) return;
      const cached = state.cache.get(state.playlistId);
      if (cached && Date.now() - cached.loadedAt > CACHE_TTL_MS) void loadCurrentPlaylist(true, 'cache-ttl');
    }
    return { loadCurrentPlaylist, handleRoute, setSmartQuery, installControllerEvents, maintainBindings, applyConfiguration, maybeRefreshExpiredCache };
  })();

  // src/lifecycle.js
  const __mod23 = (() => {
    const { state } = __mod0;
    const { sleep, consoleWarn } = __mod1;
    const { injectStyles } = __mod3;
    const { registerSettingsMenuDeferred } = __mod14;
    const { updatePlayingRowStyles } = __mod16;
    const { installPlaybackBridge, maintainPlaybackSession } = __mod15;
    const { installNativeAdapterBridges } = __mod12;
    const { installControllerEvents, handleRoute, maintainBindings, maybeRefreshExpiredCache } = __mod22;
    const { playlistIdFromLocation } = __mod8;
    const { recordDiagnostic } = __mod10;
    const { VERSION } = __mod2;
    const { maybeShowReleaseNotes } = __mod13;
    async function bootstrap() {
      while (!globalThis.Spicetify?.Platform || !globalThis.Spicetify?.Player) await sleep(100);
      state.S = globalThis.Spicetify;
      injectStyles();
      installControllerEvents();
      installPlaybackBridge();
      installNativeAdapterBridges();
      registerSettingsMenuDeferred();
      recordDiagnostic('bootstrap', 'core ready');
      console.log(`[Smart Search] ${VERSION} core ready`);

      try {
        state.S?.Player?.addEventListener?.('songchange', () => {
          queueMicrotask(() => void maintainPlaybackSession('songchange'));
          setTimeout(updatePlayingRowStyles, 40);
        });
      } catch (error) { consoleWarn('Could not attach song-change listener.', error); }

      try {
        state.S?.Platform?.History?.listen?.(() => setTimeout(() => void handleRoute(), 80));
      } catch (error) { consoleWarn('Could not attach route listener.', error); }

      let lastPath = state.S?.Platform?.History?.location?.pathname || location.pathname;
      setInterval(() => {
        void maintainPlaybackSession('poll');
        maintainBindings();
        const currentPath = state.S?.Platform?.History?.location?.pathname || location.pathname;
        if (currentPath !== lastPath) {
          lastPath = currentPath;
          void handleRoute();
        }
        if (playlistIdFromLocation()) maybeRefreshExpiredCache();
      }, 750);

      await handleRoute();
      recordDiagnostic('bootstrap', 'loaded');
      console.log(`[Smart Search] ${VERSION} loaded`);
      setTimeout(() => {
        try { maybeShowReleaseNotes(); } catch (error) { consoleWarn('Could not show release notes.', error); }
      }, 350);
    }
    return { bootstrap };
  })();

  // src/index.js
  const __mod24 = (() => {
    const { bootstrap } = __mod23;
    void bootstrap();
    return {};
  })();

})();
