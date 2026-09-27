// Playlist Smart Search 1.1
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
      sortState: { key: 'custom', direction: 'asc', source: 'default' },
      sortSignature: 'custom:asc',
      syntaxHelpHost: null,
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
    return { sleep, safeClone, normalizeText, safeErrorMessage, consoleWarn, consoleError, getPath, firstDefined };
  })();
  // src/constants.js
  const __mod2 = (() => {
    const VERSION = '1.1';
    const RELEASE_SEEN_KEY = 'smart-search:last-seen-release';
    const RELEASE_NOTES_REVISION = 3;
    const CONFIG_KEY = 'smart-search-config-v2';
    const PROJECT_URL = 'https://github.com/Yumppe/spicetify-playlist-smart-search';
    const CHANGELOG_URL = `${PROJECT_URL}/blob/main/CHANGELOG.md`;
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
    return { VERSION, RELEASE_SEEN_KEY, RELEASE_NOTES_REVISION, CONFIG_KEY, PROJECT_URL, CHANGELOG_URL, BUG_REPORT_URL, FEATURE_REQUEST_URL, STYLE_ID, RESULTS_HOST_ID, CACHE_TTL_MS, PAGE_SIZE, RENDER_CHUNK, PLAYBACK_BUFFER_TARGET, PLAYBACK_BUFFER_LOW_WATER, PLAYBACK_REFILL_CHUNK, MUTATION_DEBOUNCE_MS, MUTATION_REFRESH_COOLDOWN_MS };
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
    .smart-search-advanced-view [data-testid="playlist-tracklist"],.smart-search-advanced-view .main-trackList-trackList,.smart-search-advanced-view [role="grid"]{display:none!important}
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
    .ss1-row-number{position:relative;text-align:right;color:var(--spice-subtext,#b3b3b3);font-variant-numeric:tabular-nums;min-height:40px;display:flex;align-items:center;justify-content:flex-end}
    .ss1-row-play{position:absolute;right:-5px;top:50%;translate:0 -50%;display:none;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--spice-text,#fff);cursor:pointer;align-items:center;justify-content:center}.ss1-row-play svg{width:20px;height:20px;display:block;fill:currentColor}.ss1-row-play:hover{background:color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}
    .ss1-row:hover .ss1-row-index,.ss1-row:focus-within .ss1-row-index{visibility:hidden}.ss1-row:hover .ss1-row-play,.ss1-row:focus-within .ss1-row-play{display:flex}
    .ss1-title-cell{display:flex;align-items:center;gap:12px;min-width:0}.ss1-cover,.ss1-cover-placeholder{width:40px;height:40px;border-radius:4px;background:#282828;flex:0 0 auto}.ss1-cover{object-fit:cover}.ss1-title-stack,.ss1-title,.ss1-artists,.ss1-album,.ss1-added{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ss1-title{font-size:14px}.ss1-artists,.ss1-album,.ss1-added,.ss1-duration{font-size:12px;color:var(--spice-subtext,#b3b3b3)}.ss1-duration{text-align:right;font-variant-numeric:tabular-nums}.ss1-sentinel{height:1px}
    .ss1-collapsed-note{padding:14px 12px;color:var(--spice-subtext,#b3b3b3);font-size:12px}

    .ss1-syntax-assist{position:fixed;z-index:100000;max-height:min(360px,45vh);overflow:auto;border-radius:20px;background:color-mix(in srgb,var(--spice-main,#121212) 96%,#fff 4%);border:1px solid color-mix(in srgb,var(--spice-text,#fff) 11%,transparent);box-shadow:0 18px 54px rgba(0,0,0,.45);padding:8px;font-family:var(--encore-body-font-stack,inherit);color:var(--spice-text,#fff);box-sizing:border-box;backdrop-filter:blur(18px)}
    .ss1-syntax-assist[hidden]{display:none!important}.ss1-syntax-assist-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px 7px}.ss1-syntax-assist-head strong{font-size:12px}.ss1-syntax-assist-head span{font-size:11px;color:var(--spice-subtext,#b3b3b3)}
    .ss1-syntax-assist-list{display:grid;gap:4px}.ss1-syntax-assist-item{width:100%;min-height:42px;border:0;border-radius:14px;padding:8px 11px;background:transparent;color:var(--spice-text,#fff);display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:left;cursor:pointer;font:inherit}.ss1-syntax-assist-item:hover,.ss1-syntax-assist-item:focus-visible{background:color-mix(in srgb,var(--spice-text,#fff) 9%,transparent);outline:none}.ss1-syntax-assist-item code{font:600 12px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--spice-text,#fff)}.ss1-syntax-assist-item span{font-size:11px;color:var(--spice-subtext,#b3b3b3);white-space:nowrap}

    .ss1-settings{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow-x:hidden;color:var(--spice-text,#fff)}.ss1-settings-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}.ss1-settings-copy{min-width:0;overflow-wrap:anywhere}.ss1-settings-title{font-weight:700}.ss1-settings-desc{margin-top:3px;color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.4}
    .ss1-toggle{min-width:48px;height:28px;border:0;border-radius:999px;padding:3px;background:#535353;cursor:pointer;position:relative;flex:0 0 auto}.ss1-toggle::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform 120ms ease}.ss1-toggle[aria-pressed='true']{background:var(--spice-button,#1ed760)}.ss1-toggle[aria-pressed='true']::after{transform:translateX(20px)}
    .ss1-panel{margin-top:18px;padding:14px;border-radius:10px;background:color-mix(in srgb,var(--spice-text,#fff) 6%,transparent);border:1px solid color-mix(in srgb,var(--spice-text,#fff) 7%,transparent)}.ss1-panel-title{font-weight:700;margin-bottom:7px}.ss1-panel-desc,.ss1-muted{color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.5}.ss1-collapsible{padding:0}.ss1-panel-summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;padding:14px;user-select:none}.ss1-panel-summary::-webkit-details-marker{display:none}.ss1-panel-summary .ss1-panel-title{margin:0}.ss1-panel-chevron{color:var(--spice-subtext,#b3b3b3);font-size:18px;transition:transform 120ms ease}.ss1-collapsible[open] .ss1-panel-chevron{transform:rotate(180deg)}.ss1-panel-body{padding:0 14px 14px;border-top:1px solid color-mix(in srgb,var(--spice-text,#fff) 8%,transparent)}.ss1-tutorial-grid{display:grid;grid-template-columns:minmax(150px,auto) 1fr;gap:10px 18px;margin-top:14px;align-items:start;font-size:12px}.ss1-tutorial-grid>code{color:var(--spice-text,#fff);white-space:nowrap;font-weight:700}.ss1-tutorial-meaning{display:flex;gap:7px;min-width:0}.ss1-tutorial-meaning strong{min-width:96px}.ss1-tutorial-meaning span{color:var(--spice-subtext,#b3b3b3)}
    .ss1-diag-grid{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:7px 14px;font-size:12px;margin-top:12px}.ss1-diag-ok{color:var(--spice-button,#1ed760)}.ss1-diag-bad{color:#f6c453}.ss1-diag-neutral{color:var(--spice-subtext,#b3b3b3)}.ss1-panel-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ss1-action-feedback{margin-top:10px;padding:8px 10px;border-radius:7px;background:color-mix(in srgb,var(--spice-text,#fff) 6%,transparent);font-size:12px;line-height:1.4;color:var(--spice-subtext,#b3b3b3)}.ss1-feedback-ok{color:var(--spice-button,#1ed760)}.ss1-feedback-warn{color:#f6c453}.ss1-feedback-error{color:#f15e6c}.ss1-pre{margin-top:10px;padding:10px;border-radius:6px;background:rgba(0,0,0,.25);font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:220px;overflow:auto}.ss1-version{margin-top:16px;color:var(--spice-subtext,#b3b3b3);font-size:11px}

    .ss1-release-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:var(--ss1-release-overlay-pad,24px);background:rgba(0,0,0,.62);backdrop-filter:blur(3px);box-sizing:border-box}
.ss1-release-dialog{width:var(--ss1-release-dialog-width,min(68vw,1800px));max-width:100%;max-height:var(--ss1-release-dialog-max-height,calc(100vh - 48px));display:flex;flex-direction:column;min-width:0;margin:0;border-radius:32px;overflow:hidden;background:var(--spice-main,#121212);border:1px solid color-mix(in srgb,var(--spice-text,#fff) 8%,transparent);box-shadow:0 28px 96px rgba(0,0,0,.56);color:var(--spice-text,#fff);font-family:var(--encore-body-font-stack,inherit)}
.ss1-release-topbar{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 clamp(20px,2vw,30px);border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 9%,transparent);flex:0 0 auto}.ss1-release-topbar strong{font-size:17px;font-weight:800;letter-spacing:-.015em}.ss1-release-close{width:38px;height:38px;border:0;border-radius:50%;display:grid;place-items:center;background:transparent;color:var(--spice-subtext,#b3b3b3);font:300 28px/1 var(--encore-body-font-stack,inherit);cursor:pointer}.ss1-release-close:hover,.ss1-release-close:focus-visible{background:color-mix(in srgb,var(--spice-text,#fff) 9%,transparent);color:var(--spice-text,#fff);outline:none}
.ss1-release-notes{min-width:0;color:var(--spice-text,#fff);padding:clamp(20px,2vw,34px);background:var(--spice-main,#121212);font-family:var(--encore-body-font-stack,inherit);overflow:auto;overscroll-behavior:contain;flex:1 1 auto}
.ss1-release-hero{display:flex;align-items:center;gap:clamp(16px,1.8vw,24px);padding:0 2px clamp(18px,2vw,24px)}.ss1-release-app-icon{width:68px;height:68px;border-radius:23px;display:grid;place-items:center;flex:0 0 auto;background:color-mix(in srgb,var(--spice-button,#1ed760) 90%,#fff);color:#06240f;font-size:28px;font-weight:900;box-shadow:0 10px 34px rgba(0,0,0,.28)}.ss1-release-hero-copy{min-width:0;flex:1}.ss1-release-overline{font-size:10.5px;line-height:1.2;letter-spacing:.13em;font-weight:850;color:var(--spice-button,#1ed760)}.ss1-release-heading{margin-top:5px;font-size:clamp(26px,2.4vw,38px);line-height:1.05;font-weight:820;letter-spacing:-.04em}.ss1-release-subtitle{margin-top:8px;color:var(--spice-subtext,#b3b3b3);font-size:13px;line-height:1.45}.ss1-release-version-chip{display:inline-flex;align-items:center;margin-top:11px;min-height:28px;padding:0 11px;border-radius:999px;background:color-mix(in srgb,var(--spice-button,#1ed760) 14%,transparent);color:var(--spice-button,#1ed760);font-size:11px;font-weight:800}
.ss1-release-sections{display:grid;grid-template-columns:1fr;gap:11px}.ss1-release-section{padding:16px 20px;border-radius:22px;background:color-mix(in srgb,var(--spice-text,#fff) 5%,transparent);border:1px solid color-mix(in srgb,var(--spice-text,#fff) 7%,transparent)}.ss1-release-section-header{display:flex;align-items:center;gap:10px;font-size:14px}.ss1-release-section-icon{width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--spice-text,#fff) 8%,transparent);font-size:13px;font-weight:900}.ss1-release-section-fixed .ss1-release-section-icon{background:color-mix(in srgb,#78d993 16%,transparent);color:#78d993}.ss1-release-section-improved .ss1-release-section-icon{background:color-mix(in srgb,#8ab4f8 16%,transparent);color:#8ab4f8}.ss1-release-section-new .ss1-release-section-icon{background:color-mix(in srgb,#c6a7ff 16%,transparent);color:#c6a7ff}.ss1-release-section-list{margin:10px 0 0;padding-left:20px;color:var(--spice-subtext,#b3b3b3);font-size:13px;line-height:1.45;max-width:none}.ss1-release-section-list li+li{margin-top:4px}.ss1-release-section-list li::marker{color:color-mix(in srgb,var(--spice-text,#fff) 45%,transparent)}
.ss1-release-footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,180px);gap:12px;align-items:stretch;margin-top:16px}.ss1-release-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:0}.ss1-release-link{min-height:44px;padding:0 14px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;text-align:center;color:var(--spice-text,#fff);background:color-mix(in srgb,var(--spice-text,#fff) 8%,transparent);font-size:12.5px;font-weight:760;line-height:1;box-sizing:border-box;transition:background-color 120ms ease,transform 90ms ease}.ss1-release-link:hover{background:color-mix(in srgb,var(--spice-text,#fff) 13%,transparent);transform:translateY(-1px)}.ss1-release-link-icon{width:21px;height:21px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--spice-text,#fff) 8%,transparent);font-size:11px;font-weight:900}.ss1-release-done{width:100%;min-height:44px;margin:0;border:0;border-radius:999px;background:var(--spice-button,#1ed760);color:#071b0d!important;font:inherit;font-size:13.5px;font-weight:850;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:filter 120ms ease,transform 90ms ease}.ss1-release-done:hover{filter:brightness(1.06);transform:translateY(-1px)}.ss1-release-done:active{transform:scale(.99)}.ss1-release-link:focus-visible,.ss1-release-done:focus-visible{outline:2px solid var(--spice-text,#fff);outline-offset:2px}
@media(max-width:700px){.ss1-release-overlay{padding:12px}.ss1-release-dialog{border-radius:24px}.ss1-release-topbar{min-height:58px;padding:0 16px}.ss1-release-notes{padding:16px}.ss1-release-hero{align-items:flex-start;gap:13px}.ss1-release-app-icon{width:52px;height:52px;border-radius:17px}.ss1-release-heading{font-size:25px}.ss1-release-section{padding:15px;border-radius:20px}.ss1-release-footer{grid-template-columns:1fr}.ss1-release-links{grid-template-columns:1fr}.ss1-release-done{min-height:48px}}
@media(max-width:760px){.ss1-tutorial-grid{grid-template-columns:1fr}.ss1-tutorial-meaning{display:block}.ss1-tutorial-meaning strong{display:block;margin-bottom:2px}.ss1-syntax-assist{max-width:calc(100vw - 24px)}}
    @media(max-width:1000px){.ss1-column-header,.ss1-row{grid-template-columns:38px minmax(220px,2fr) minmax(150px,1fr) 60px}.ss1-date-column{display:none}}
    @media(max-width:760px){.ss1-toolbar{align-items:flex-start;flex-direction:column}.ss1-actions{width:100%;justify-content:flex-end}.ss1-column-header,.ss1-row{grid-template-columns:34px minmax(180px,1fr) 56px}.ss1-album-column,.ss1-date-column{display:none}.ss1-shell{padding-left:0;padding-right:0}}
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
    return { DEFAULT_CONFIG, loadConfig, saveConfig, updateConfig };
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
    return { SYNTAX_REFERENCE, parseQuery, smartSyntaxUsed, describeParseErrors };
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
      return [graphQL?.Definitions, graphQL?.QueryDefinitions]
        .filter((pool, index, all) => pool && typeof pool === 'object' && all.indexOf(pool) === index);
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
          if ((/playlist/i.test(key) && /contents/i.test(key)) || (/playlist/i.test(op) && /contents/i.test(op))) {
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
        nativeSetQueue: Boolean(queueClient?.setQueue && queueCore),
        queueState: Boolean(queueController?._queueState),
      };
    }

    function capabilityRows() {
      const c = detectCapabilities();
      const graphQLReady = c.graphqlRequest && c.graphqlPlaylistDefinition;
      const graphQLStatus = graphQLReady ? 'Ready' : c.graphqlRequest ? 'Not exposed' : 'Unavailable';
      const graphQLTone = graphQLReady ? 'ok' : c.playlistGetContents ? 'neutral' : 'warn';

      return [
        { name: 'Playlist API', status: c.playlistGetContents ? 'Available' : 'Unavailable', tone: c.playlistGetContents ? 'ok' : 'warn', note: 'Primary playlist source' },
        { name: 'GraphQL fallback', status: graphQLStatus, tone: graphQLTone, note: graphQLReady ? `Fallback definition: ${c.graphqlPlaylistDefinitionNames[0]}` : c.playlistGetContents ? 'Only needed if Playlist API fails' : 'No compatible playlist definition detected' },
        { name: 'Release-year lookup', status: c.cosmosAsync ? 'Available' : 'Unavailable', tone: c.cosmosAsync ? 'ok' : 'warn', note: 'Used when year metadata is missing' },
        { name: 'Smart Search result view', status: 'Built in', tone: 'ok', note: 'Advanced searches no longer patch Spotify React rows' },
        { name: 'Queue-first playback', status: c.nativeSetQueue && c.playerNext ? 'Available' : 'Fallback', tone: c.nativeSetQueue && c.playerNext ? 'ok' : 'warn', note: 'Starts filtered tracks with setQueue + Next to avoid false playback toasts' },
        { name: 'Private setQueue bridge', status: c.nativeSetQueue ? 'Available' : 'Unavailable', tone: c.nativeSetQueue ? 'ok' : 'neutral', note: 'Preferred filtered automatic queue' },
        { name: 'Manual queue readback', status: c.queueState ? 'Available' : 'Unavailable', tone: c.queueState ? 'ok' : 'warn', note: 'Preserves songs explicitly added by the user' },
        { name: 'Silent queue API', status: c.silentAddToQueue ? 'Available' : 'Unavailable', tone: c.silentAddToQueue ? 'ok' : 'neutral', note: 'Compatibility queue fallback' },
        { name: 'Platform queue API', status: c.platformAddToQueue ? 'Available' : 'Unavailable', tone: c.platformAddToQueue ? 'ok' : 'neutral', note: 'Secondary queue fallback' },
        { name: 'Settings modal', status: c.popupModal ? 'Available' : 'Unavailable', tone: c.popupModal ? 'ok' : 'warn', note: 'Settings and update UI' },
        { name: 'Settings menu', status: c.menuItem ? 'Available' : 'Unavailable', tone: c.menuItem ? 'ok' : 'neutral', note: 'Profile-menu entry' },
      ];
    }
    return { graphQLDefinitionPools, playlistGraphQLDefinitions, detectCapabilities, capabilityRows };
  })();
  // src/diagnostics.js
  const __mod7 = (() => {
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
        resultView: state.query ? 'smart-search-owned' : 'spotify-native',
        playbackMethod: session?.method ?? null,
        playbackStartMethod: session?.lastStartMethod ?? null,
        playbackActive: Boolean(session?.active),
        playbackIndex: session?.currentIndex ?? null,
        playbackSequenceLength: session?.sequence?.length ?? 0,
        playbackShuffle: session?.shuffle ?? null,
        spotifySort: state.sortState,
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
    return { recordDiagnostic, diagnosticsSnapshot, diagnosticsText, copyDiagnostics };
  })();
  // src/events.js
  const __mod8 = (() => {
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
  // src/release-notes.js
  const __mod9 = (() => {
    const { BUG_REPORT_URL, CHANGELOG_URL, FEATURE_REQUEST_URL, RELEASE_SEEN_KEY, RELEASE_NOTES_REVISION, VERSION } = __mod2;
    const { state } = __mod0;

    const displayVersion = VERSION;
    let activeOverlay = null;
    let activeResizeHandler = null;
    let activeViewportHandler = null;
    let activeKeyHandler = null;

    const RELEASE_NOTES = {
      version: VERSION,
      revision: RELEASE_NOTES_REVISION,
      title: `Smart Search ${displayVersion}`,
      sections: [
        {
          label: 'New',
          icon: '✦',
          tone: 'new',
          items: [
            'Compact advanced syntax with AND, OR, exclusions, exact artists, year filters, and escaping.',
            'Inline syntax help and artist suggestions under the playlist search box.',
            'Diagnostics, automated checks, and version-aware release notes in Settings.',
          ],
        },
        {
          label: 'Improved',
          icon: '↗',
          tone: 'improved',
          items: [
            'Advanced searches now use a stable Smart Search-owned result view instead of patching Spotify’s private playlist UI.',
            'Filtered playback follows the visible sort order, mirrors Spotify Shuffle, and preserves songs you manually add to the queue.',
            'Playlist refresh, release-year lookup, and Spotify API compatibility are more resilient.',
          ],
        },
        {
          label: 'Fixed',
          icon: '✓',
          tone: 'fixed',
          items: [
            'Malformed searches now explain what is wrong instead of looking like empty results.',
            'Removed native-list flicker and rerender conflicts during advanced searches.',
            'Fixed selected-song playback, queue ordering, result Play controls, syntax-help lifecycle, and several refresh/UI edge cases.',
          ],
        },
      ],
    };

    function releaseToken() {
      return `${VERSION}:${RELEASE_NOTES_REVISION}`;
    }

    function hasSeenCurrentRelease() {
      return readSeenRelease() === releaseToken();
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

    function makeExternalButton(label, url, iconText) {
      const link = document.createElement('a');
      link.className = 'ss1-release-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const icon = document.createElement('span');
      icon.className = 'ss1-release-link-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = iconText;
      const text = document.createElement('span');
      text.textContent = label;
      link.append(icon, text);
      return link;
    }

    function cleanupReleaseOverlay() {
      if (activeResizeHandler) {
        try { window.removeEventListener('resize', activeResizeHandler); } catch {}
        activeResizeHandler = null;
      }
      if (activeViewportHandler && window.visualViewport) {
        try { window.visualViewport.removeEventListener('resize', activeViewportHandler); } catch {}
        activeViewportHandler = null;
      }
      if (activeKeyHandler) {
        try { document.removeEventListener('keydown', activeKeyHandler, true); } catch {}
        activeKeyHandler = null;
      }
    }

    function closeReleaseNotes() {
      cleanupReleaseOverlay();
      try { activeOverlay?.remove?.(); } catch {}
      activeOverlay = null;
    }

    function buildReleaseNotesContent() {
      const content = document.createElement('div');
      content.className = 'ss1-release-notes';

      const hero = document.createElement('div');
      hero.className = 'ss1-release-hero';
      const appIcon = document.createElement('div');
      appIcon.className = 'ss1-release-app-icon';
      appIcon.setAttribute('aria-hidden', 'true');
      appIcon.textContent = 'S';
      const copy = document.createElement('div');
      copy.className = 'ss1-release-hero-copy';
      const label = document.createElement('div');
      label.className = 'ss1-release-overline';
      label.textContent = 'SMART SEARCH UPDATE';
      const heading = document.createElement('div');
      heading.className = 'ss1-release-heading';
      heading.textContent = `What's new in ${displayVersion}`;
      const sub = document.createElement('div');
      sub.className = 'ss1-release-subtitle';
      sub.textContent = 'Highlights since Smart Search 1.0. Full release notes are on GitHub.';
      const chip = document.createElement('span');
      chip.className = 'ss1-release-version-chip';
      chip.textContent = `Version ${displayVersion}`;
      copy.append(label, heading, sub, chip);
      hero.append(appIcon, copy);

      const sections = document.createElement('div');
      sections.className = 'ss1-release-sections';
      for (const section of RELEASE_NOTES.sections) {
        const card = document.createElement('section');
        card.className = `ss1-release-section ss1-release-section-${section.tone}`;
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'ss1-release-section-header';
        const sectionIcon = document.createElement('span');
        sectionIcon.className = 'ss1-release-section-icon';
        sectionIcon.setAttribute('aria-hidden', 'true');
        sectionIcon.textContent = section.icon;
        const sectionTitle = document.createElement('strong');
        sectionTitle.textContent = section.label;
        sectionHeader.append(sectionIcon, sectionTitle);
        const list = document.createElement('ul');
        list.className = 'ss1-release-section-list';
        for (const item of section.items) {
          const li = document.createElement('li');
          li.textContent = item;
          list.appendChild(li);
        }
        card.append(sectionHeader, list);
        sections.appendChild(card);
      }

      const footer = document.createElement('div');
      footer.className = 'ss1-release-footer';
      const links = document.createElement('div');
      links.className = 'ss1-release-links';
      links.append(
        makeExternalButton('Full changelog', CHANGELOG_URL, '↗'),
        makeExternalButton('Report bug', BUG_REPORT_URL, '!'),
        makeExternalButton('Request feature', FEATURE_REQUEST_URL, '+'),
      );

      const done = document.createElement('button');
      done.className = 'ss1-release-done';
      done.type = 'button';
      done.textContent = 'Done';
      done.addEventListener('click', closeReleaseNotes);

      footer.append(links, done);
      content.append(hero, sections, footer);
      return content;
    }

    function responsiveDialogWidth(viewportWidth, viewportHeight) {
      const horizontalGutter = viewportWidth < 700 ? 24 : viewportWidth < 1200 ? 48 : 72;
      const availableWidth = Math.max(300, viewportWidth - horizontalGutter);
      const aspect = viewportWidth / Math.max(1, viewportHeight);
      let preferredWidth;
      if (viewportWidth < 1200) {
        // Compact / portrait-ish Spotify windows, e.g. half of a vertical monitor.
        preferredWidth = viewportWidth * 0.54;
      } else if (aspect >= 2.15) {
        // Ultrawide: grow strongly with width, but stay proportional to height.
        preferredWidth = Math.min(viewportWidth * 0.55, viewportHeight * 1.55);
      } else {
        preferredWidth = Math.min(viewportWidth * 0.68, viewportHeight * 1.45);
      }
      const minimumWidth = viewportWidth < 700 ? availableWidth : viewportWidth < 1200 ? 520 : 680;
      return Math.min(1800, availableWidth, Math.max(minimumWidth, preferredWidth));
    }

    function mountReleaseNotes(content) {
      if (!document.body) return false;
      closeReleaseNotes();

      const overlay = document.createElement('div');
      overlay.className = 'ss1-release-overlay';
      overlay.setAttribute('data-smart-search-release', displayVersion);

      const dialog = document.createElement('section');
      dialog.className = 'ss1-release-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', `What's new in Smart Search ${displayVersion}`);

      const topbar = document.createElement('div');
      topbar.className = 'ss1-release-topbar';
      const topTitle = document.createElement('strong');
      topTitle.textContent = `Smart Search ${displayVersion}`;
      const close = document.createElement('button');
      close.className = 'ss1-release-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Close release notes');
      close.textContent = '×';
      close.addEventListener('click', closeReleaseNotes);
      topbar.append(topTitle, close);

      dialog.append(topbar, content);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      activeOverlay = overlay;

      const applyResponsiveSize = () => {
        if (!overlay.isConnected) return;
        const viewportWidth = Math.max(
          320,
          window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1280,
        );
        const viewportHeight = Math.max(
          320,
          window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720,
        );
        const width = responsiveDialogWidth(viewportWidth, viewportHeight);
        const verticalGutter = viewportHeight < 700 ? 24 : 48;
        const maxHeight = Math.max(300, viewportHeight - verticalGutter);
        dialog.style.setProperty('--ss1-release-dialog-width', `${Math.round(width)}px`);
        dialog.style.setProperty('--ss1-release-dialog-max-height', `${Math.round(maxHeight)}px`);
        overlay.style.setProperty('--ss1-release-overlay-pad', `${Math.max(12, Math.round(verticalGutter / 2))}px`);
      };

      activeResizeHandler = () => requestAnimationFrame(applyResponsiveSize);
      window.addEventListener('resize', activeResizeHandler, { passive: true });
      if (window.visualViewport) {
        activeViewportHandler = () => requestAnimationFrame(applyResponsiveSize);
        window.visualViewport.addEventListener('resize', activeViewportHandler, { passive: true });
      }
      activeKeyHandler = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeReleaseNotes();
        }
      };
      document.addEventListener('keydown', activeKeyHandler, true);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeReleaseNotes();
      });

      applyResponsiveSize();
      requestAnimationFrame(() => close.focus());
      return true;
    }

    function showReleaseNotes({ markSeen = false } = {}) {
      const content = buildReleaseNotesContent();
      const mounted = mountReleaseNotes(content);
      if (!mounted) return false;
      if (markSeen) writeSeenRelease(releaseToken());
      return true;
    }

    async function maybeShowReleaseNotes() {
      if (hasSeenCurrentRelease()) return false;
      const shown = showReleaseNotes({ markSeen: true });
      return shown;
    }
    return { RELEASE_NOTES, hasSeenCurrentRelease, closeReleaseNotes, showReleaseNotes, maybeShowReleaseNotes };
  })();
  // src/ui/settings.js
  const __mod10 = (() => {
    const { BUG_REPORT_URL, FEATURE_REQUEST_URL, PROJECT_URL, VERSION } = __mod2;
    const { state } = __mod0;
    const { loadConfig, updateConfig } = __mod4;
    const { SYNTAX_REFERENCE, parseQuery } = __mod5;
    const { capabilityRows } = __mod6;
    const { copyDiagnostics, diagnosticsText } = __mod7;
    const { emit, on } = __mod8;
    const { showReleaseNotes } = __mod9;
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
      body.append(grid, actions, feedback, pre);
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
      notes.addEventListener('click', () => {
        try { state.S?.PopupModal?.hide?.(); } catch {}
        setTimeout(() => showReleaseNotes({ markSeen: false }), 120);
      });
      actions.appendChild(notes);
      box.append(title, desc, actions);
      return box;
    }

    function showSettings() {
      const content = document.createElement('div');
      content.className = 'ss1-settings';
      createSettingsToggle(content, 'Enabled', 'Use Smart Search on playlist pages.', 'enabled');
      createSettingsToggle(content, 'Live playlist refresh', 'Update Smart Search after tracks are added or removed.', 'livePlaylistRefresh');
      createSettingsToggle(content, 'Collapse results by default', 'Keep Smart Search results compact until you expand them.', 'resultsCollapsed');
      createSettingsToggle(content, 'Show syntax help', 'Show contextual syntax tips and artist suggestions below the playlist search box. Validation errors are always shown.', 'showSyntaxHelp');
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
  // src/ui/dom.js
  const __mod11 = (() => {
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
      if (state.hiddenTracklist) {
        try { state.hiddenTracklist.style.display = state.hiddenTracklistDisplay; } catch {}
      }
      state.hiddenTracklist = null;
      state.hiddenTracklistDisplay = '';
    }

    function hideNativeTracklist() {
      const tracklist = findTracklistContainer();
      if (!tracklist) return;
      if (state.hiddenTracklist && state.hiddenTracklist !== tracklist) restoreNativeTracklist();
      if (state.hiddenTracklist !== tracklist) {
        state.hiddenTracklist = tracklist;
        state.hiddenTracklistDisplay = tracklist.style.display || '';
      }
      // CSS also hides every future Spotify remount while advanced mode is active;
      // this inline fallback covers clients where the page class lands one frame later.
      if (tracklist.style.display !== 'none') tracklist.style.display = 'none';
    }

    function setAdvancedViewState(active) {
      state.nativeSearchInput?.classList.toggle('smart-search-native-active', active);
      const page = findPlaylistPage();
      page?.classList.toggle('smart-search-advanced-view', active);
      if (!active) restoreNativeTracklist();
    }

    // Kept as a compatibility alias for older internal imports.
    const setNativeSmartState = setAdvancedViewState;
    return { findPlaylistPage, findTracklistContainer, playlistIdFromLocation, nativeSearchCandidates, restoreNativeTracklist, hideNativeTracklist, setAdvancedViewState, setNativeSmartState };
  })();
  // src/spotify/queue-model.js
  const __mod12 = (() => {
    function queueItemUri(item) {
      if (!item || typeof item !== 'object') return null;
      if (typeof item.uri === 'string' && item.uri.startsWith('spotify:track:')) return item.uri;
      if (typeof item.contextTrack?.uri === 'string' && item.contextTrack.uri.startsWith('spotify:track:')) return item.contextTrack.uri;
      return null;
    }

    function queueItemUid(item) {
      if (!item || typeof item !== 'object') return '';
      return String(item.uid ?? item.contextTrack?.uid ?? '');
    }

    function queueItemMetadata(item) {
      return item?.contextTrack?.metadata ?? item?.metadata ?? {};
    }

    function isExplicitQueueItem(item) {
      if (!item || typeof item !== 'object') return false;
      if (item.provider === 'queue') return true;
      const marker = queueItemMetadata(item)?.is_queued;
      return marker === true || marker === 'true';
    }

    function makeQueueItem(track, queued = false) {
      const uri = typeof track === 'string' ? track : track?.uri;
      const uid = typeof track === 'string' ? '' : String(track?.uid ?? '');
      return {
        contextTrack: {
          uri,
          uid,
          metadata: { is_queued: queued ? 'true' : 'false' },
        },
        removed: [],
        blocked: [],
        provider: queued ? 'queue' : 'context',
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

    function pushUniqueTrack(target, seen, item) {
      const uri = queueItemUri(item);
      if (!uri) return;
      const uid = queueItemUid(item);
      const key = `${uri}|${uid}`;
      if (seen.has(key)) return;
      seen.add(key);
      target.push({ uri, uid });
    }

    function manualQueueTracks(queueState, queueCore = null) {
      const tracks = [];
      const seen = new Set();

      // Lowest-level queue entries expose an explicit provider / is_queued marker.
      // Prefer these because queueState.queued can contain transitional entries while
      // Spotify is switching contexts.
      const lowLevel = Array.isArray(queueCore?.nextTracks) ? queueCore.nextTracks : [];
      for (const item of lowLevel) {
        if (isExplicitQueueItem(item)) pushUniqueTrack(tracks, seen, item);
      }

      const queued = Array.isArray(queueState?.queued) ? queueState.queued : [];
      const hasClassification = queued.some((item) => item?.provider != null || queueItemMetadata(item)?.is_queued != null);
      for (const item of queued) {
        // Modern clients classify explicit queue items. Older clients expose only the
        // `queued` bucket, where membership itself is the manual-queue signal.
        if (hasClassification && !isExplicitQueueItem(item)) continue;
        pushUniqueTrack(tracks, seen, item);
      }
      return tracks;
    }

    function buildNativeQueuePayload({
      queueCore,
      leadTrack = null,
      manualTracks = [],
      contextTracks = [],
    } = {}) {
      const nextTracks = [];
      if (leadTrack?.uri) nextTracks.push(makeQueueItem(leadTrack, false));
      for (const track of manualTracks) {
        if (track?.uri) nextTracks.push(makeQueueItem(track, true));
      }
      for (const track of contextTracks) {
        if (track?.uri) nextTracks.push(makeQueueItem(track, false));
      }
      nextTracks.push(makeDelimiterQueueItem());
      return {
        nextTracks,
        prevTracks: Array.isArray(queueCore?.prevTracks) ? queueCore.prevTracks : [],
        queueRevision: queueCore?.queueRevision,
      };
    }

    function fisherYates(input, random = Math.random) {
      const result = [...input];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
      }
      return result;
    }

    function playbackPlan(tracks, startIndex = 0, shuffle = false, random = Math.random) {
      const source = [...(tracks ?? [])];
      if (!source.length) return { cycle: [], startIndex: 0, selected: null };
      const safeIndex = Math.max(0, Math.min(Number(startIndex) || 0, source.length - 1));
      const selected = source[safeIndex];
      if (!shuffle) return { cycle: source, startIndex: safeIndex, selected };
      const remaining = source.filter((_, index) => index !== safeIndex);
      const cycle = [selected, ...fisherYates(remaining, random)];
      return { cycle, startIndex: 0, selected };
    }

    function randomStartIndex(length, random = Math.random) {
      const safeLength = Math.max(0, Number(length) || 0);
      if (!safeLength) return 0;
      return Math.min(safeLength - 1, Math.floor(random() * safeLength));
    }

    function contextTailForSession(session, repeatMode = 0, _minimum = 0) {
      const cycle = Array.isArray(session?.sequence) ? session.sequence : [];
      if (!cycle.length) return [];
      const index = Math.max(-1, Math.min(Number(session?.currentIndex ?? -1), cycle.length - 1));
      const tail = cycle.slice(index + 1);
      if (repeatMode === 1) tail.push(...cycle);
      return tail;
    }
    return { queueItemUri, isExplicitQueueItem, makeQueueItem, makeDelimiterQueueItem, manualQueueTracks, buildNativeQueuePayload, fisherYates, playbackPlan, randomStartIndex, contextTailForSession };
  })();
  // src/spotify/playback.js
  const __mod13 = (() => {
    const { PLAYBACK_BUFFER_TARGET, PLAYBACK_BUFFER_LOW_WATER, PLAYBACK_REFILL_CHUNK } = __mod2;
    const { state } = __mod0;
    const { detectCapabilities } = __mod6;
    const { findPlaylistPage, findTracklistContainer } = __mod11;
    const { consoleError, consoleWarn, sleep } = __mod1;
    const { emit } = __mod8;
    const { recordDiagnostic } = __mod7;
    const { buildNativeQueuePayload, contextTailForSession, manualQueueTracks, playbackPlan, queueItemUri, randomStartIndex } = __mod12;

    function playerQueueController() {
      return state.S?.Platform?.PlayerAPI?._queue ?? null;
    }

    function currentManualQueueTracks() {
      const controller = playerQueueController();
      return manualQueueTracks(controller?._queueState, controller?._queue);
    }

    function rememberManualQueue(session, tracks = currentManualQueueTracks()) {
      if (!session) return tracks;
      if (!(session.manualQueueUris instanceof Set)) session.manualQueueUris = new Set();
      for (const track of tracks) if (track?.uri) session.manualQueueUris.add(track.uri);
      return tracks;
    }

    function spotifyRepeatMode() {
      try {
        if (typeof state.S?.Player?.getRepeat === 'function') return Number(state.S.Player.getRepeat()) || 0;
      } catch {}
      const fallback = state.S?.Player?.data?.repeat ?? state.S?.Platform?.PlayerAPI?._state?.repeat;
      return Number(fallback) || 0;
    }

    function spotifyShuffleState() {
      try {
        if (typeof state.S?.Player?.getShuffle === 'function') return Boolean(state.S.Player.getShuffle());
      } catch {}
      return Boolean(state.S?.Player?.data?.shuffle);
    }

    function queueContextUpcomingCount() {
      const nextUp = playerQueueController()?._queueState?.nextUp;
      return Array.isArray(nextUp) ? nextUp.filter((item) => !item?.provider || item.provider === 'context').length : null;
    }

    function nativeContextUpcomingUris() {
      const nextUp = playerQueueController()?._queueState?.nextUp;
      if (!Array.isArray(nextUp)) return [];
      const result = [];
      for (const item of nextUp) {
        if (item?.provider && item.provider !== 'context') continue;
        const uri = queueItemUri(item);
        if (uri) result.push(uri);
      }
      return result;
    }

    function waitForQueueUpdate(timeoutMs = 360) {
      const playerApi = state.S?.Platform?.PlayerAPI;
      let events = null;
      try { events = playerApi?.getEvents?.() ?? playerApi?._events ?? null; } catch {}
      if (!events?.addListener) return sleep(55);
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimeout(timer);
          try { events.removeListener?.('queue_update', finish); } catch {}
          resolve();
        };
        try { events.addListener('queue_update', finish, { once: true }); }
        catch { resolve(); return; }
        timer = setTimeout(finish, timeoutMs);
      });
    }

    async function waitForCurrentUri(uri, timeoutMs = 700) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (state.S?.Player?.data?.item?.uri === uri) return true;
        await sleep(20);
      }
      return state.S?.Player?.data?.item?.uri === uri;
    }

    function expectedContextTail(session) {
      return contextTailForSession(session, spotifyRepeatMode());
    }

    function nativeQueueDiverged(session) {
      if (session.method !== 'native-setQueue' || session.currentIndex < 0) return false;
      const expected = expectedContextTail(session).slice(0, 8).map((track) => track.uri);
      const actual = nativeContextUpcomingUris().slice(0, 8);
      if (!expected.length) return actual.length > 0;
      if (!actual.length) return true;
      const comparable = Math.min(expected.length, actual.length);
      for (let index = 0; index < comparable; index += 1) {
        if (expected[index] !== actual[index]) return true;
      }
      if (spotifyRepeatMode() !== 1 && expected.length < 8 && actual.length > expected.length) return true;
      return false;
    }

    async function setNativeUpcoming({ leadTrack = null, contextTracks = [], session = null, manualTracks = null } = {}) {
      const controller = playerQueueController();
      const queueCore = controller?._queue;
      const client = controller?._client;
      if (!client?.setQueue || !queueCore) throw new Error('Native Spotify queue API is unavailable');
      const preservedManual = manualTracks === null ? rememberManualQueue(session) : rememberManualQueue(session, manualTracks);
      const queueUpdate = waitForQueueUpdate();
      await client.setQueue(buildNativeQueuePayload({
        queueCore,
        leadTrack,
        manualTracks: preservedManual,
        contextTracks,
      }));
      await queueUpdate;
      return preservedManual;
    }

    async function reseedNativeQueueTail(session, { allowEmpty = false } = {}) {
      if (!session?.active) return;
      const remaining = expectedContextTail(session);
      if (!remaining.length && spotifyRepeatMode() !== 1 && !allowEmpty) return;
      await setNativeUpcoming({ contextTracks: remaining, session });
      session.refillCount += 1;
      session.lastNativeReseedAt = Date.now();
      recordDiagnostic('queue-reseed', `context=${remaining.length}; manual=${currentManualQueueTracks().length}; repeat=${spotifyRepeatMode()}; shuffle=${session.shuffle}`);
    }

    async function advancePlayerToLead(selected) {
      // Prefer the lower-level PlayerAPI transition. In current Spotify builds the
      // public Player.next() path can briefly surface the generic “can't play this
      // right now” toast even though the queued track starts successfully.
      const skip = state.S?.Platform?.PlayerAPI?.skipToNext;
      if (typeof skip === 'function') {
        await skip.call(state.S.Platform.PlayerAPI);
        await waitForCurrentUri(selected.uri);
        return 'setQueue-skipToNext';
      }
      const next = state.S?.Player?.next;
      if (typeof next === 'function') {
        const result = next.call(state.S.Player);
        if (result && typeof result.then === 'function') await result;
        await waitForCurrentUri(selected.uri);
        return 'setQueue-next';
      }
      throw new Error('Spotify next-track API is unavailable');
    }

    async function playWithNativeSetQueue(plan, shuffle) {
      const { cycle, startIndex, selected } = plan;
      if (!selected) return;

      const preservedManual = currentManualQueueTracks();
      const session = {
        active: true,
        method: 'native-setQueue',
        sequence: cycle,
        currentIndex: startIndex,
        nextEnqueueIndex: cycle.length,
        startedAt: Date.now(),
        shuffle,
        query: state.query,
        lastCurrentUri: selected.uri,
        lastContextUri: selected.uri,
        refillCount: 0,
        manualQueueUris: new Set(preservedManual.map((track) => track.uri)),
      };
      state.playbackSession = session;

      // Do not use Player.playUri here. On some Spotify builds it starts the track
      // correctly but still emits the misleading “Spotify can't play this right now”
      // toast. Seed the selected result as the next context track and advance instead.
      await setNativeUpcoming({
        leadTrack: selected,
        contextTracks: expectedContextTail(session),
        session,
        manualTracks: [],
      });
      session.lastStartMethod = await advancePlayerToLead(selected);

      // Restore explicit user queue entries after the selected result has started.
      // They keep Spotify's normal priority ahead of the automatic Smart Search tail.
      await setNativeUpcoming({
        contextTracks: expectedContextTail(session),
        session,
        manualTracks: preservedManual,
      });

      for (const delay of [80, 260]) {
        await sleep(delay);
        if (!session.active) break;
        if (nativeQueueDiverged(session)) await reseedNativeQueueTail(session, { allowEmpty: true });
      }
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
      const repeatMode = spotifyRepeatMode();
      const remainingBuffered = Math.max(0, session.nextEnqueueIndex - session.currentIndex - 1);
      if (!force && remainingBuffered > PLAYBACK_BUFFER_LOW_WATER) return;

      let slice = [];
      if (session.nextEnqueueIndex < session.sequence.length) {
        const desiredEnd = Math.min(
          session.sequence.length,
          Math.max(session.nextEnqueueIndex + PLAYBACK_REFILL_CHUNK, session.currentIndex + 1 + PLAYBACK_BUFFER_TARGET),
        );
        slice = session.sequence.slice(session.nextEnqueueIndex, desiredEnd);
        session.nextEnqueueIndex = desiredEnd;
      } else if (repeatMode === 1 && session.sequence.length) {
        slice = session.sequence.slice(0, Math.min(session.sequence.length, PLAYBACK_BUFFER_TARGET));
        session.nextEnqueueIndex = slice.length;
      }
      if (!slice.length) return;
      await enqueueTracks(slice);
      session.refillCount += 1;
    }

    async function playWithSlidingQueue(plan, shuffle) {
      const { cycle, startIndex, selected } = plan;
      if (!selected) return;
      const manualTracks = currentManualQueueTracks();
      if (typeof state.S?.Player?.playUri !== 'function') throw new Error('No compatible playback API is available');
      await state.S.Player.playUri(selected.uri);
      if (typeof state.S?.Platform?.PlayerAPI?.clearQueue === 'function') {
        try { await state.S.Platform.PlayerAPI.clearQueue(); } catch {}
      }
      const session = {
        active: true,
        method: 'sliding-addToQueue',
        sequence: cycle,
        currentIndex: startIndex,
        nextEnqueueIndex: startIndex + 1,
        startedAt: Date.now(),
        shuffle,
        query: state.query,
        lastCurrentUri: selected.uri,
        lastContextUri: selected.uri,
        refillCount: 0,
        manualQueueUris: new Set(manualTracks.map((track) => track.uri)),
      };
      state.playbackSession = session;
      if (manualTracks.length) await enqueueTracks(manualTracks);
      await refillSlidingQueue(true);
    }

    function findSessionIndexForUri(session, uri, preferNextDuplicate = false) {
      let start = Math.max(0, session.currentIndex);
      if (preferNextDuplicate && session.lastCurrentUri === uri && start < session.sequence.length - 1) start += 1;
      for (let index = start; index < session.sequence.length; index += 1) if (session.sequence[index]?.uri === uri) return index;
      for (let index = 0; index < start; index += 1) if (session.sequence[index]?.uri === uri) return index;
      return -1;
    }

    function currentTrackMarkedQueued() {
      const metadata = state.S?.Player?.data?.item?.metadata ?? state.S?.Player?.data?.contextTrack?.metadata;
      return metadata?.is_queued === 'true' || metadata?.is_queued === true;
    }

    function currentTrackIsManualQueue(session, uri, resolvedIndex) {
      if (currentTrackMarkedQueued()) return true;
      return resolvedIndex < 0 && session?.manualQueueUris instanceof Set && session.manualQueueUris.has(uri);
    }

    function currentResultIndexInFiltered(uri) {
      if (!uri) return -1;
      return state.filtered.findIndex((track) => track.uri === uri);
    }

    function rebuildSessionForShuffle(session, shuffle, currentUri, currentIsManual) {
      if (!state.filtered.length) return false;
      const anchorUri = currentIsManual ? session.lastContextUri : currentUri;
      const sourceIndex = currentResultIndexInFiltered(anchorUri);
      if (sourceIndex < 0) return false;
      const plan = playbackPlan(state.filtered, sourceIndex, shuffle);
      session.sequence = plan.cycle;
      session.currentIndex = plan.startIndex;
      session.nextEnqueueIndex = plan.cycle.length;
      session.shuffle = shuffle;
      session.lastCurrentUri = currentUri;
      session.lastContextUri = anchorUri;
      recordDiagnostic('shuffle-sync', shuffle ? 'enabled; new randomized Smart Search order' : 'disabled; restored visible Smart Search order');
      return true;
    }

    async function maintainPlaybackSession(reason = 'poll') {
      const session = state.playbackSession;
      if (!session?.active || state.playbackMaintenanceInFlight) return;
      state.playbackMaintenanceInFlight = true;
      try {
        rememberManualQueue(session);
        const currentUri = state.S?.Player?.data?.item?.uri || null;
        if (!currentUri) return;
        let index = findSessionIndexForUri(session, currentUri, reason === 'songchange');
        const manualCurrent = currentTrackIsManualQueue(session, currentUri, index);

        const shuffleNow = spotifyShuffleState();
        if (shuffleNow !== Boolean(session.shuffle)) {
          if (rebuildSessionForShuffle(session, shuffleNow, currentUri, manualCurrent)) {
            index = findSessionIndexForUri(session, manualCurrent ? session.lastContextUri : currentUri, false);
            if (session.method === 'native-setQueue') await reseedNativeQueueTail(session, { allowEmpty: true });
            else if (session.method === 'sliding-addToQueue') {
              session.nextEnqueueIndex = Math.max(0, session.currentIndex + 1);
              await refillSlidingQueue(true);
            }
          }
        }

        if (manualCurrent) {
          session.lastCurrentUri = currentUri;
          emit('playback-update');
          return;
        }

        if (index < 0) {
          if (Date.now() - session.startedAt > 4000) session.active = false;
          return;
        }
        session.currentIndex = index;
        session.lastCurrentUri = currentUri;
        session.lastContextUri = currentUri;

        if (session.method === 'sliding-addToQueue') await refillSlidingQueue(false);
        if (session.method === 'native-setQueue') {
          const repeatMode = spotifyRepeatMode();
          const logicalRemaining = Math.max(0, session.sequence.length - index - 1);
          const upcoming = queueContextUpcomingCount();
          const cooldownDone = !session.lastNativeReseedAt || Date.now() - session.lastNativeReseedAt > 500;
          const repeatNeedsWrap = repeatMode === 1 && logicalRemaining <= PLAYBACK_BUFFER_LOW_WATER;
          const needsRefill = upcoming !== null
            && logicalRemaining > PLAYBACK_BUFFER_LOW_WATER
            && upcoming <= PLAYBACK_BUFFER_LOW_WATER;
          const contextWasRegenerated = nativeQueueDiverged(session);
          if (cooldownDone && (repeatNeedsWrap || needsRefill || contextWasRegenerated)) {
            await reseedNativeQueueTail(session, { allowEmpty: contextWasRegenerated });
          }
        }
        emit('playback-update');
      } catch (error) {
        consoleWarn('Playback maintenance failed.', error);
      } finally {
        state.playbackMaintenanceInFlight = false;
      }
    }

    async function startFilteredPlayback(startIndex, shuffle) {
      const plan = playbackPlan(state.filtered, startIndex, shuffle);
      if (!plan.selected) return;
      if (detectCapabilities().nativeSetQueue) {
        try {
          await playWithNativeSetQueue(plan, shuffle);
          return;
        } catch (error) {
          consoleWarn('Native Smart Search playback bridge failed; using compatibility queue.', error);
        }
      }
      await playWithSlidingQueue(plan, shuffle);
    }

    async function playFilteredRespectingSpotify(startIndex = null) {
      if (!state.filtered.length || state.playbackBusy) return;
      const shuffle = spotifyShuffleState();
      const explicitIndex = Number.isInteger(startIndex);
      const resolvedStart = explicitIndex ? startIndex : (shuffle ? randomStartIndex(state.filtered.length) : 0);
      state.playbackBusy = true;
      emit('playback-update');
      try {
        await startFilteredPlayback(resolvedStart, shuffle);
        recordDiagnostic('playback-start', `${state.playbackSession?.method ?? 'unknown'}; result=${resolvedStart + 1}; shuffle=${shuffle}; manual-preserved`);
      } catch (error) {
        state.playbackSession = null;
        consoleError('Could not start Smart Search playback.', error);
        state.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
      } finally {
        state.playbackBusy = false;
        emit('playback-update');
      }
    }

    // Kept for internal/tests compatibility. Production UI follows Spotify's shuffle state.
    async function playFiltered(startIndex = 0, shuffle = false) {
      if (!state.filtered.length || state.playbackBusy) return;
      state.playbackBusy = true;
      emit('playback-update');
      try {
        await startFilteredPlayback(startIndex, shuffle);
      } catch (error) {
        state.playbackSession = null;
        consoleError('Could not start filtered playback.', error);
        state.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
      } finally {
        state.playbackBusy = false;
        emit('playback-update');
      }
    }

    function isSmartSearchPlaybackControl(target) {
      return Boolean(target?.closest?.('#smart-search-results-root'));
    }

    function isPlaylistMainPlayButton(target) {
      // The document-level listener runs in capture phase, before result-row click
      // handlers. Never treat Smart Search's own Play buttons as Spotify's main
      // playlist Play button, otherwise a row click gets converted into “Play
      // results” and loses the clicked index.
      if (isSmartSearchPlaybackControl(target)) return false;
      const button = target.closest?.('button');
      if (!button || findTracklistContainer()?.contains(button)) return false;
      const page = findPlaylistPage();
      if (!page?.contains(button)) return false;
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();
      const cls = button.className?.toString?.().toLowerCase?.() || '';
      return /(^|\s)play(\s|$)|play playlist/.test(label) || /playbutton/.test(cls);
    }

    function interceptPlaylistPlay(event) {
      if (!state.query || state.queryErrors.length) return;
      const target = event.target;
      if (!target?.closest || event.type !== 'click' || !isPlaylistMainPlayButton(target)) return;
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      } catch {}
      void playFilteredRespectingSpotify();
    }

    function installPlaybackBridge() {
      document.addEventListener('click', interceptPlaylistPlay, true);
    }
    return { spotifyShuffleState, maintainPlaybackSession, playFilteredRespectingSpotify, playFiltered, isSmartSearchPlaybackControl, installPlaybackBridge };
  })();
  // src/ui/results.js
  const __mod14 = (() => {
    const { RESULTS_HOST_ID, RENDER_CHUNK } = __mod2;
    const { state } = __mod0;
    const { loadConfig, updateConfig } = __mod4;
    const { findPlaylistPage, findTracklistContainer, hideNativeTracklist, restoreNativeTracklist, setAdvancedViewState } = __mod11;
    const { playFilteredRespectingSpotify } = __mod13;

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

    function playIconSvg() {
      return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.4v13.2c0 .72.79 1.15 1.4.76l10.15-6.6a.9.9 0 0 0 0-1.52L9.4 4.64A.9.9 0 0 0 8 5.4Z"></path></svg>`;
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
            <div class="ss1-actions"><button class="ss1-button primary" data-action="play" type="button">▶ Play results</button><button class="ss1-button icon" data-action="collapse" type="button" aria-label="Collapse results">⌃</button></div>
          </div>
          <div class="ss1-body" hidden>
            <div class="ss1-column-header"><span>#</span><span>Title</span><span class="ss1-album-column">Album</span><span class="ss1-date-column">Date added</span><span style="text-align:right">Time</span></div>
            <div class="ss1-status" role="status" aria-live="polite" hidden></div>
            <div class="ss1-results"></div><div class="ss1-sentinel"></div>
          </div>
          <div class="ss1-collapsed-note" hidden>Results are collapsed. Playback still uses the complete filtered result set.</div>
        </div>`;
        anchorParent.insertBefore(host, tracklist || null);
        state.resultsHost = host;
        state.resultsList = host.querySelector('.ss1-results');
        state.resultsSentinel = host.querySelector('.ss1-sentinel');
        host.querySelector('[data-action="play"]')?.addEventListener('click', () => void playFilteredRespectingSpotify());
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
      row.dataset.resultIndex = String(resultIndex);
      row.setAttribute('aria-label', `${track.title} — ${track.artists.join(', ')}`);
      const number = document.createElement('div'); number.className = 'ss1-row-number';
      const index = document.createElement('span'); index.className = 'ss1-row-index'; index.textContent = String(resultIndex + 1);
      const play = document.createElement('button');
      play.className = 'ss1-row-play';
      play.type = 'button';
      play.innerHTML = playIconSvg();
      play.setAttribute('aria-label', `Play ${track.title}`);
      play.addEventListener('click', (event) => { event.stopPropagation(); void playFilteredRespectingSpotify(resultIndex); });
      number.append(index, play);
      const titleCell = document.createElement('div'); titleCell.className = 'ss1-title-cell';
      if (track.image) {
        const image = document.createElement('img'); image.className = 'ss1-cover'; image.src = track.image; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; titleCell.appendChild(image);
      } else {
        const placeholder = document.createElement('div'); placeholder.className = 'ss1-cover-placeholder'; titleCell.appendChild(placeholder);
      }
      const stack = document.createElement('div'); stack.className = 'ss1-title-stack';
      const title = document.createElement('div'); title.className = 'ss1-title'; title.textContent = track.title;
      const artists = document.createElement('div'); artists.className = 'ss1-artists'; artists.textContent = track.artists.join(', '); stack.append(title, artists); titleCell.appendChild(stack);
      const album = document.createElement('div'); album.className = 'ss1-album ss1-album-column'; album.textContent = track.album;
      const added = document.createElement('div'); added.className = 'ss1-added ss1-date-column'; added.textContent = formatAddedDate(track.addedAt);
      const duration = document.createElement('div'); duration.className = 'ss1-duration'; duration.textContent = formatDuration(track.duration);
      row.append(number, titleCell, album, added, duration);
      row.addEventListener('dblclick', () => void playFilteredRespectingSpotify(resultIndex));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void playFilteredRespectingSpotify(resultIndex);
        }
      });
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
      const progress = host.querySelector('.ss1-progress');
      const disabled = state.playbackBusy || !state.filtered.length || state.queryErrors.length > 0;
      if (play) { play.disabled = disabled; play.textContent = state.playbackBusy ? 'Starting…' : '▶ Play results'; }
      if (progress) {
        const session = state.playbackSession;
        const belongs = session?.active && session.query === state.query && session.sequence.length > 0 && state.filtered.length > 0;
        progress.textContent = belongs && session.currentIndex >= 0 ? `· Playing ${Math.min(session.currentIndex + 1, session.sequence.length)}/${session.sequence.length}` : '';
      }
      updatePlayingRowStyles();
    }

    function maintainSmartSearchView() {
      const config = loadConfig();
      const active = config.enabled && Boolean(state.query.trim());
      if (!active) return;
      setAdvancedViewState(true);
      hideNativeTracklist();
      ensureHost();
    }

    function renderSmartSearch(config = loadConfig()) {
      const active = config.enabled && Boolean(state.query.trim());
      const host = ensureHost();
      if (!host) return;
      const toolbar = host.querySelector('.ss1-toolbar');
      const body = host.querySelector('.ss1-body');
      const status = host.querySelector('.ss1-status');
      const count = host.querySelector('.ss1-count');
      const collapsedNote = host.querySelector('.ss1-collapsed-note');
      const collapse = host.querySelector('[data-action="collapse"]');
      host.hidden = !active;
      if (!active) {
        if (toolbar) toolbar.hidden = true;
        if (body) body.hidden = true;
        if (collapsedNote) collapsedNote.hidden = true;
        setAdvancedViewState(false);
        restoreNativeTracklist();
        return;
      }

      setAdvancedViewState(true);
      hideNativeTracklist();
      if (toolbar) toolbar.hidden = false;
      if (count) count.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? '' : 's'}`;
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
        if (status) { status.hidden = true; status.className = 'ss1-status'; }
        if (state.queryErrors.length) {
          if (status) { status.hidden = false; status.className = 'ss1-status query-error'; status.textContent = state.queryErrors.join(' '); }
        } else if (state.yearMetadataLoading) {
          if (status) { status.hidden = false; status.textContent = 'Loading release years…'; }
        } else if (state.loading) {
          if (status) { status.hidden = false; status.textContent = 'Loading playlist…'; }
        } else if (state.lastError) {
          if (status) { status.hidden = false; status.className = 'ss1-status error'; status.textContent = state.lastError; }
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
      setAdvancedViewState(false);
    }
    return { ensureHost, updatePlayingRowStyles, updatePlaybackUi, maintainSmartSearchView, renderSmartSearch, clearResultsUi };
  })();
  // src/search/matcher.js
  const __mod15 = (() => {
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
  // src/spotify/react-internals.js
  const __mod16 = (() => {
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
  // src/spotify/search-control.js
  const __mod17 = (() => {
    const { fiberChainFrom, propsForFiber } = __mod16;
    const { consoleWarn } = __mod1;

    let nativeFilterSuppressed = false;

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
        try { controller?.props?.onClear?.(); }
        catch (error) { consoleWarn('Could not clear Spotify native playlist filter.', error); }
      }
      queueMicrotask(() => {
        try { controller?.textHook?.queue?.dispatch?.(value); }
        catch (error) { consoleWarn('Could not synchronize Spotify search text state.', error); }
      });
    }

    function releaseSpotifyNativeFilterSuppression() {
      nativeFilterSuppressed = false;
    }
    return { suppressSpotifyNativeFilter, releaseSpotifyNativeFilterSuppression };
  })();
  // src/ui/native-search.js
  const __mod18 = (() => {
    const { state } = __mod0;
    const { loadConfig } = __mod4;
    const { emit } = __mod8;
    const { smartSyntaxUsed } = __mod5;
    const { nativeSearchCandidates } = __mod11;
    const { suppressSpotifyNativeFilter, releaseSpotifyNativeFilterSuppression } = __mod17;

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
        releaseSpotifyNativeFilterSuppression();
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

      if (state.query) {
        if (!event && !value.trim()) {
          confirmSearchWasCleared(candidate);
          return;
        }
        cancelBlankConfirmation();
        state.smartRefreshPending = false;
        releaseSpotifyNativeFilterSuppression();
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
      releaseSpotifyNativeFilterSuppression();
    }

    function hookNativeSearch() {
      if (!loadConfig().enabled) { detachNativeSearch(); return; }
      const candidate = nativeSearchCandidates()[0] || null;
      if (!candidate) {
        if (!state.nativeSearchMissingSince) state.nativeSearchMissingSince = Date.now();
        if (state.query && Date.now() - state.nativeSearchMissingSince > 1000) emit('advanced-cleared');
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
    const { recordDiagnostic } = __mod7;

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
    return { fingerprintTracks, invalidatePlaylistCache, clearPlaylistCache, getPlaylistTracks };
  })();
  // src/spotify/mutation-watcher.js
  const __mod21 = (() => {
    const { MUTATION_DEBOUNCE_MS, MUTATION_REFRESH_COOLDOWN_MS, RESULTS_HOST_ID } = __mod2;
    const { state } = __mod0;
    const { loadConfig } = __mod4;
    const { emit } = __mod8;
    const { findPlaylistPage, findTracklistContainer } = __mod11;
    const { recordDiagnostic } = __mod7;

    let observer = null;
    let root = null;
    let debounceTimer = null;
    let lastRefreshAt = 0;
    let suspendedUntil = 0;

    function suspendMutationWatcher(ms = 300) {
      suspendedUntil = Math.max(suspendedUntil, Date.now() + ms);
    }

    function elementForMutation(mutation) {
      const target = mutation.target;
      if (!target) return null;
      return target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    }

    function isOwnMutation(mutation) {
      const target = elementForMutation(mutation);
      return Boolean(target?.closest?.(`#${RESULTS_HOST_ID}`));
    }

    function isInsideNativeTracklist(mutation) {
      const target = elementForMutation(mutation);
      const tracklist = findTracklistContainer();
      return Boolean(target && tracklist && (target === tracklist || tracklist.contains(target)));
    }

    function mentionsPlaylistCount(mutation) {
      const target = elementForMutation(mutation);
      const candidates = [
        target?.textContent || '',
        ...[...(mutation.addedNodes ?? [])].map((node) => node.textContent || ''),
        ...[...(mutation.removedNodes ?? [])].map((node) => node.textContent || ''),
      ];
      return candidates.some((text) => /\b\d[\d,.\s]*\s+(?:songs?|tracks?)\b/i.test(String(text).slice(0, 300)));
    }

    function scheduleCandidateRefresh(reason = 'dom-mutation') {
      if (!loadConfig().livePlaylistRefresh || Date.now() < suspendedUntil) return;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const now = Date.now();
        if (now - lastRefreshAt < MUTATION_REFRESH_COOLDOWN_MS) return;
        lastRefreshAt = now;
        recordDiagnostic('playlist-mutation-candidate', reason);
        emit('playlist-mutation-candidate', { reason });
      }, MUTATION_DEBOUNCE_MS);
    }

    function maintainMutationWatcher() {
      if (!loadConfig().livePlaylistRefresh || !state.playlistId) {
        stopMutationWatcher();
        return;
      }

      // Observe the playlist page, not the virtualized track rows themselves. Spotify
      // constantly mounts/unmounts rows while scrolling; treating those operations as
      // playlist edits caused unnecessary reloads and visible UI fights in 1.1.1.
      const nextRoot = findPlaylistPage();
      if (!nextRoot) return;
      if (observer && root === nextRoot) return;
      stopMutationWatcher();
      root = nextRoot;
      observer = new MutationObserver((mutations) => {
        if (Date.now() < suspendedUntil) return;
        for (const mutation of mutations) {
          if (isOwnMutation(mutation)) continue;
          if (isInsideNativeTracklist(mutation)) continue;
          if (mentionsPlaylistCount(mutation)) {
            scheduleCandidateRefresh('playlist-count-change');
            return;
          }
        }
      });
      observer.observe(root, { childList: true, characterData: true, subtree: true });
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
  // src/spotify/year-metadata.js
  const __mod22 = (() => {
    const { state } = __mod0;
    const { recordDiagnostic } = __mod7;
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
    return { queryNeedsYearMetadata, ensureReleaseYears, clearReleaseYearCache };
  })();
  // src/spotify/sort-bridge.js
  const __mod23 = (() => {
    const { state } = __mod0;
    const { findPlaylistPage } = __mod11;

    const SORT_KEYS = {
      custom: ['custom order', 'playlist order'],
      title: ['title', 'track title'],
      artist: ['artist'],
      album: ['album'],
      added: ['recently added', 'date added', 'added'],
      duration: ['duration', 'time'],
    };

    function normalizeLabel(value) {
      return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    }

    function keyFromLabel(value) {
      const text = normalizeLabel(value);
      if (!text) return null;
      for (const [key, aliases] of Object.entries(SORT_KEYS)) {
        if (aliases.some((alias) => text === alias || text.includes(alias))) return key;
      }
      return null;
    }

    function directionFromAria(value) {
      const text = normalizeLabel(value);
      if (text === 'descending') return 'desc';
      if (text === 'ascending') return 'asc';
      return null;
    }

    function readAriaSort(page) {
      for (const element of page?.querySelectorAll?.('[aria-sort]') ?? []) {
        const direction = directionFromAria(element.getAttribute('aria-sort'));
        if (!direction) continue;
        const key = keyFromLabel(`${element.textContent || ''} ${element.getAttribute('aria-label') || ''}`);
        if (key) return { key, direction, source: 'aria-sort' };
      }
      return null;
    }

    function sortControlCandidates(page) {
      if (!page) return [];
      return [...page.querySelectorAll('button[role="combobox"], [role="combobox"], button[aria-label*="sort" i], button[title*="sort" i], [class*="sort" i] button')].filter((element) => {
        const text = `${element.textContent || ''} ${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`;
        return Boolean(keyFromLabel(text));
      });
    }

    function readSortControl(page) {
      for (const element of sortControlCandidates(page)) {
        const combined = `${element.textContent || ''} ${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`;
        const key = keyFromLabel(combined);
        if (!key) continue;
        const lower = normalizeLabel(combined);
        let direction = null;
        if (/descending|newest|latest/.test(lower)) direction = 'desc';
        else if (/ascending|oldest/.test(lower)) direction = 'asc';
        // Spotify's visible "Recently added" control is newest-first by default.
        if (!direction) direction = key === 'added' ? 'desc' : 'asc';
        return { key, direction, source: 'sort-control' };
      }
      return null;
    }

    function readSpotifySortState() {
      const page = findPlaylistPage();
      return readAriaSort(page) ?? readSortControl(page) ?? { key: 'custom', direction: 'asc', source: 'default' };
    }

    function sortSignature(sortState = readSpotifySortState()) {
      return `${sortState?.key || 'custom'}:${sortState?.direction || 'asc'}`;
    }

    function compareText(a, b) {
      return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true });
    }

    function selectorForKey(key) {
      if (key === 'title') return (track) => track.titleNorm ?? track.title ?? '';
      if (key === 'artist') return (track) => track.artistNorm?.[0] ?? track.artists?.[0] ?? '';
      if (key === 'album') return (track) => track.albumNorm ?? track.album ?? '';
      if (key === 'added') return (track) => Date.parse(track.addedAt || '') || 0;
      if (key === 'duration') return (track) => Number(track.duration || 0);
      return (track) => Number(track.playlistIndex || 0);
    }

    function sortTracks(tracks, sortState = state.sortState) {
      const source = [...(tracks ?? [])];
      const key = sortState?.key || 'custom';
      const direction = sortState?.direction === 'desc' ? -1 : 1;
      const selector = selectorForKey(key);
      return source.map((track, index) => ({ track, index, value: selector(track) }))
        .sort((a, b) => {
          const cmp = typeof a.value === 'number' && typeof b.value === 'number'
            ? a.value - b.value
            : compareText(a.value, b.value);
          return cmp ? cmp * direction : a.index - b.index;
        })
        .map((entry) => entry.track);
    }

    function syncSpotifySortState() {
      const next = readSpotifySortState();
      const signature = sortSignature(next);
      if (signature === state.sortSignature) return false;
      state.sortState = next;
      state.sortSignature = signature;
      return true;
    }
    return { readSpotifySortState, sortSignature, sortTracks, syncSpotifySortState };
  })();
  // src/ui/syntax-help.js
  const __mod24 = (() => {
    const { state } = __mod0;
    const { loadConfig } = __mod4;
    const { normalizeText } = __mod1;

    const boundInputs = new WeakSet();


    function bindInputLifecycle(input) {
      if (!input || boundInputs.has(input)) return;
      boundInputs.add(input);
      input.addEventListener('focus', () => {
        queueMicrotask(() => maintainSyntaxHelp());
      });
      input.addEventListener('blur', () => {
        // Suggestion buttons prevent mousedown's default action, so selecting a
        // suggestion keeps the input focused. Any real focus departure should hide
        // the helper immediately instead of leaving it floating over the playlist.
        setTimeout(() => {
          if (document.activeElement !== input) clearSyntaxHelp();
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
      host.setAttribute('role', 'listbox');
      host.setAttribute('aria-label', 'Smart Search suggestions');
      document.body.appendChild(host);
      state.syntaxHelpHost = host;
      return host;
    }

    function replaceActiveSegment(input, replacement) {
      const value = String(input.value || '');
      const lastSemicolon = value.lastIndexOf(';');
      const lastAmp = value.lastIndexOf('&');
      const separatorIndex = Math.max(lastSemicolon, lastAmp);
      const prefix = separatorIndex >= 0 ? value.slice(0, separatorIndex + 1) : '';
      const whitespace = value.slice(separatorIndex + 1).match(/^\s*/)?.[0] ?? '';
      input.value = `${prefix}${whitespace}${replacement}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }

    function artistSuggestions(query) {
      const lastSemicolon = query.lastIndexOf(';');
      const lastAmp = query.lastIndexOf('&');
      const segment = query.slice(Math.max(lastSemicolon, lastAmp) + 1).trimStart();
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
      const query = String(state.query || input.value || '');
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
        button.setAttribute('role', 'option');
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

    function maintainSyntaxHelp() {
      const host = ensureHost();
      const input = currentInput();
      const config = loadConfig();
      if (input) bindInputLifecycle(input);
      if (!config.enabled || !config.showSyntaxHelp || !input || !state.query.trim() || document.activeElement !== input) {
        host.hidden = true;
        return;
      }
      render(host, input);
    }

    function clearSyntaxHelp() {
      if (state.syntaxHelpHost) state.syntaxHelpHost.hidden = true;
    }
    return { maintainSyntaxHelp, clearSyntaxHelp };
  })();
  // src/controller.js
  const __mod25 = (() => {
    const { CACHE_TTL_MS } = __mod2;
    const { state } = __mod0;
    const { on, emit } = __mod8;
    const { loadConfig } = __mod4;
    const { parseQuery } = __mod5;
    const { filterTracks } = __mod15;
    const { playlistIdFromLocation, restoreNativeTracklist, setAdvancedViewState } = __mod11;
    const { renderSmartSearch, clearResultsUi, updatePlaybackUi, maintainSmartSearchView } = __mod14;
    const { hookNativeSearch, detachNativeSearch } = __mod18;
    const { releaseSpotifyNativeFilterSuppression } = __mod17;
    const { getPlaylistTracks, invalidatePlaylistCache } = __mod20;
    const { maintainMutationWatcher, stopMutationWatcher, suspendMutationWatcher } = __mod21;
    const { recordDiagnostic } = __mod7;
    const { consoleError, consoleWarn, safeErrorMessage } = __mod1;
    const { ensureReleaseYears, queryNeedsYearMetadata } = __mod22;
    const { sortTracks, syncSpotifySortState } = __mod23;
    const { maintainSyntaxHelp, clearSyntaxHelp } = __mod24;

    let eventsInstalled = false;

    function setSmartQuery(query) {
      state.query = String(query ?? '');
      const parsed = parseQuery(state.query);
      state.queryAst = parsed.ast;
      state.queryErrors = parsed.errors;
      if (state.query.trim() && !parsed.errors.length) {
        state.filtered = sortTracks(filterTracks(state.tracks, parsed));
        if (!state.loading && state.tracks.length) state.lastError = null;
      } else {
        state.filtered = [];
      }
      renderSmartSearch();
      maintainSyntaxHelp();
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
      syncSpotifySortState();
      const previousQuery = state.query;
      const entering = !previousQuery.trim();
      let parsed = setSmartQuery(value);

      setAdvancedViewState(true);
      maintainSmartSearchView();

      if (parsed.errors.length) return;

      if (entering && state.playlistId) {
        state.smartRefreshPending = true;
        try { await loadCurrentPlaylist(true, 'enter-smart-search'); }
        catch (error) { consoleWarn('Could not refresh playlist before Smart Search.', error); }
        finally { state.smartRefreshPending = false; }
        if (state.query !== value || !input?.isConnected) return;
        parsed = parseQuery(value);
      }

      if (queryNeedsYearMetadata(parsed) && state.tracks.some((track) => track.year == null)) {
        state.yearMetadataLoading = true;
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

      maintainSmartSearchView();
    }

    function clearAdvancedQuery() {
      state.query = '';
      state.queryAst = { kind: 'true' };
      state.queryErrors = [];
      state.filtered = [];
      state.smartRefreshPending = false;
      releaseSpotifyNativeFilterSuppression();
      setAdvancedViewState(false);
      renderSmartSearch();
      clearSyntaxHelp();
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
      maintainMutationWatcher();
      if (syncSpotifySortState() && state.query) setSmartQuery(state.query);
      maintainSmartSearchView();
      maintainSyntaxHelp();
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
        detachNativeSearch();
        releaseSpotifyNativeFilterSuppression();
        setAdvancedViewState(false);
        restoreNativeTracklist();
        stopMutationWatcher();
        clearResultsUi();
        clearSyntaxHelp();
        return;
      }

      const changed = playlistId !== state.playlistId;
      if (changed) {
        state.query = '';
        state.queryErrors = [];
        state.filtered = [];
        state.playlistId = playlistId;
        state.nativeSearchMissingSince = 0;
        setAdvancedViewState(false);
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
        detachNativeSearch();
        stopMutationWatcher();
        if (state.playbackSession) state.playbackSession.active = false;
        clearAdvancedQuery();
        restoreNativeTracklist();
        setAdvancedViewState(false);
        renderSmartSearch(config);
        return;
      }
      hookNativeSearch();
      maintainMutationWatcher();
      maintainSmartSearchView();
      renderSmartSearch(config);
      const playlistId = playlistIdFromLocation();
      if (playlistId && (!state.tracks.length || state.playlistId !== playlistId)) void loadCurrentPlaylist(false, 'config-change');
    }

    function maybeRefreshExpiredCache() {
      if (!state.playlistId || !state.query) return;
      const cached = state.cache.get(state.playlistId);
      if (cached && Date.now() - cached.loadedAt > CACHE_TTL_MS) void loadCurrentPlaylist(true, 'cache-ttl');
    }
    return { setSmartQuery, loadCurrentPlaylist, installControllerEvents, maintainBindings, handleRoute, applyConfiguration, maybeRefreshExpiredCache };
  })();
  // src/lifecycle.js
  const __mod26 = (() => {
    const { state } = __mod0;
    const { sleep, consoleWarn } = __mod1;
    const { injectStyles } = __mod3;
    const { registerSettingsMenuDeferred } = __mod10;
    const { updatePlayingRowStyles } = __mod14;
    const { installPlaybackBridge, maintainPlaybackSession } = __mod13;
    const { installControllerEvents, handleRoute, maintainBindings, maybeRefreshExpiredCache } = __mod25;
    const { playlistIdFromLocation } = __mod11;
    const { recordDiagnostic } = __mod7;
    const { VERSION } = __mod2;
    const { hasSeenCurrentRelease, maybeShowReleaseNotes } = __mod9;

    async function bootstrap() {
      while (!globalThis.Spicetify?.Platform || !globalThis.Spicetify?.Player) await sleep(100);
      state.S = globalThis.Spicetify;
      injectStyles();
      installControllerEvents();
      installPlaybackBridge();
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
      }, 500);

      await handleRoute();
      recordDiagnostic('bootstrap', 'loaded');
      console.log(`[Smart Search] ${VERSION} loaded`);
      const releaseAttempts = [700, 1800, 3600, 6500];
      const tryReleaseNotes = (attempt = 0) => {
        if (hasSeenCurrentRelease() || attempt >= releaseAttempts.length) return;
        setTimeout(async () => {
          try {
            const shown = await maybeShowReleaseNotes();
            if (!shown && !hasSeenCurrentRelease()) tryReleaseNotes(attempt + 1);
          } catch (error) {
            consoleWarn('Could not show release notes.', error);
            tryReleaseNotes(attempt + 1);
          }
        }, releaseAttempts[attempt]);
      };
      tryReleaseNotes();
    }
    return { bootstrap };
  })();
  // src/index.js
  const __mod27 = (() => {
    const { bootstrap } = __mod26;
    void bootstrap();
    return {};
  })();
})();
