// Smart Search 1.0.0-rc.11
// Release-candidate extension with Spotify-native playlist list integration and compatibility fallback. No telemetry; no remote logging.
(() => {
'use strict';
if (window.__smartSearchExtensionLoaded) return;
window.__smartSearchExtensionLoaded = '1.0.0-rc.11';
var SmartSearch;
(function (SmartSearch) {
    SmartSearch.VERSION = '1.0.0-rc.11';
    SmartSearch.CONFIG_KEY = 'smart-search-config-v1';
    SmartSearch.PROJECT_URL = 'https://github.com/Yumppe/spicetify-playlist-smart-search';
    SmartSearch.BUG_REPORT_URL = `${SmartSearch.PROJECT_URL}/issues/new?template=bug_report.md`;
    SmartSearch.FEATURE_REQUEST_URL = `${SmartSearch.PROJECT_URL}/issues/new?template=feature_request.md`;
    SmartSearch.STYLE_ID = 'smart-search-production-style';
    SmartSearch.RESULTS_HOST_ID = 'smart-search-results-root';
    SmartSearch.CACHE_TTL_MS = 5 * 60 * 1000;
    SmartSearch.PAGE_SIZE = 50;
    SmartSearch.RENDER_CHUNK = 80;
    SmartSearch.PLAYBACK_BUFFER_TARGET = 24;
    SmartSearch.PLAYBACK_BUFFER_LOW_WATER = 8;
    SmartSearch.PLAYBACK_REFILL_CHUNK = 16;
    SmartSearch.DEFAULT_CONFIG = {
        enabled: true,
        resultsCollapsed: false,
        showSyntaxHelp: true,
    };
    SmartSearch.S = null;
    SmartSearch.state = {
        playlistId: null,
        tracks: [],
        filtered: [],
        query: '',
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
    };
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    SmartSearch.sleep = sleep;
    function safeClone(value) {
        try {
            return structuredClone(value);
        }
        catch {
            return JSON.parse(JSON.stringify(value));
        }
    }
    SmartSearch.safeClone = safeClone;
    function loadConfig() {
        try {
            const raw = SmartSearch.S?.LocalStorage?.get(SmartSearch.CONFIG_KEY) ?? localStorage.getItem(SmartSearch.CONFIG_KEY);
            if (!raw)
                return safeClone(SmartSearch.DEFAULT_CONFIG);
            const parsed = JSON.parse(raw);
            return {
                enabled: parsed?.enabled !== false,
                resultsCollapsed: Boolean(parsed?.resultsCollapsed),
                showSyntaxHelp: parsed?.showSyntaxHelp !== false,
            };
        }
        catch {
            return safeClone(SmartSearch.DEFAULT_CONFIG);
        }
    }
    SmartSearch.loadConfig = loadConfig;
    function saveConfig(config) {
        const raw = JSON.stringify(config);
        try {
            SmartSearch.S?.LocalStorage?.set(SmartSearch.CONFIG_KEY, raw);
        }
        catch { }
        try {
            localStorage.setItem(SmartSearch.CONFIG_KEY, raw);
        }
        catch { }
    }
    SmartSearch.saveConfig = saveConfig;
    function updateConfig(patch) {
        const next = { ...loadConfig(), ...patch };
        saveConfig(next);
        return next;
    }
    SmartSearch.updateConfig = updateConfig;
    function safeErrorMessage(error) {
        if (!error)
            return '';
        const raw = String(error?.message ?? error);
        return raw
            .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
            .replace(/spotify:(playlist|track|album|artist):[A-Za-z0-9]+/gi, 'spotify:$1:[redacted]')
            .slice(0, 500);
    }
    SmartSearch.safeErrorMessage = safeErrorMessage;
    function consoleWarn(message, error) {
        const detail = safeErrorMessage(error);
        console.warn(`[Smart Search] ${message}${detail ? ` ${detail}` : ''}`);
    }
    SmartSearch.consoleWarn = consoleWarn;
    function consoleError(message, error) {
        const detail = safeErrorMessage(error);
        console.error(`[Smart Search] ${message}${detail ? ` ${detail}` : ''}`);
    }
    SmartSearch.consoleError = consoleError;
})(SmartSearch || (SmartSearch = {}));
var SmartSearch;
(function (SmartSearch) {
    function normalizeText(value) {
        return String(value ?? '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase()
            .replace(/[’‘`´]/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
    SmartSearch.normalizeText = normalizeText;
    function unquote(value) {
        const text = String(value ?? '').trim();
        if (text.length >= 2) {
            const first = text[0];
            const last = text[text.length - 1];
            if ((first === '"' && last === '"') || (first === "'" && last === "'"))
                return text.slice(1, -1).trim();
        }
        return text;
    }
    function splitOutsideQuotes(input, delimiter) {
        const parts = [];
        let buffer = '';
        let quote = null;
        let escaped = false;
        for (const ch of String(input ?? '')) {
            if (escaped) {
                buffer += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                buffer += ch;
                continue;
            }
            if (quote) {
                if (ch === quote)
                    quote = null;
                buffer += ch;
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                buffer += ch;
                continue;
            }
            if (ch === delimiter) {
                parts.push(buffer.trim());
                buffer = '';
            }
            else {
                buffer += ch;
            }
        }
        parts.push(buffer.trim());
        return parts.filter(Boolean);
    }
    function parseYearExpression(raw) {
        const value = unquote(raw).trim();
        let match;
        if ((match = value.match(/^(\d{4})$/)))
            return { kind: 'year-eq', a: Number(match[1]) };
        if ((match = value.match(/^>(\d{4})$/)))
            return { kind: 'year-gt', a: Number(match[1]) };
        if ((match = value.match(/^>=(\d{4})$/)))
            return { kind: 'year-gte', a: Number(match[1]) };
        if ((match = value.match(/^<(\d{4})$/)))
            return { kind: 'year-lt', a: Number(match[1]) };
        if ((match = value.match(/^<=(\d{4})$/)))
            return { kind: 'year-lte', a: Number(match[1]) };
        if ((match = value.match(/^(\d{4})\s*-\s*(\d{4})$/))) {
            const a = Number(match[1]);
            const b = Number(match[2]);
            return { kind: 'year-range', a: Math.min(a, b), b: Math.max(a, b) };
        }
        return { kind: 'invalid', raw: value };
    }
    function parseAtom(raw, implicitArtist = false) {
        let text = String(raw ?? '').trim();
        if (!text)
            return { kind: 'true' };
        if (text.startsWith('-') && text.length > 1)
            return { kind: 'not', child: parseAtom(text.slice(1), false) };
        if (/^year\s*:/i.test(text))
            return parseYearExpression(text.replace(/^year\s*:/i, ''));
        const prefixMatch = text.match(/^(title|track|album|artist)\s*:(.*)$/i);
        if (prefixMatch) {
            const field = (prefixMatch[1].toLowerCase() === 'track' ? 'title' : prefixMatch[1].toLowerCase());
            let value = unquote(prefixMatch[2]);
            let exact = false;
            if (field === 'artist' && value.startsWith('@')) {
                exact = true;
                value = value.slice(1).trim();
            }
            return { kind: 'field', field, value: normalizeText(value), exact };
        }
        if (text.startsWith('@'))
            return { kind: 'field', field: 'artist', value: normalizeText(unquote(text.slice(1))), exact: true };
        if (implicitArtist)
            return { kind: 'field', field: 'artist', value: normalizeText(unquote(text)), exact: false };
        return { kind: 'text', value: normalizeText(unquote(text)) };
    }
    function parseQuery(query) {
        const raw = String(query ?? '').trim();
        if (!raw)
            return { kind: 'true', raw };
        const orParts = splitOutsideQuotes(raw, ';');
        const implicitArtist = orParts.length > 1;
        const groups = orParts.map((groupRaw) => {
            const andParts = splitOutsideQuotes(groupRaw, '&');
            const children = andParts.map((part) => parseAtom(part, implicitArtist));
            return children.length === 1 ? children[0] : { kind: 'and', children };
        });
        return groups.length === 1 ? { ...groups[0], raw } : { kind: 'or', children: groups, raw };
    }
    SmartSearch.parseQuery = parseQuery;
    function matchNode(track, node) {
        switch (node.kind) {
            case 'true': return true;
            case 'invalid': return false;
            case 'not': return !matchNode(track, node.child);
            case 'and': return node.children.every((child) => matchNode(track, child));
            case 'or': return node.children.some((child) => matchNode(track, child));
            case 'text': return !node.value || track.searchText.includes(node.value);
            case 'field':
                if (!node.value)
                    return true;
                if (node.field === 'artist') {
                    return node.exact
                        ? track.artistNorm.some((artist) => artist === node.value)
                        : track.artistNorm.some((artist) => artist.includes(node.value));
                }
                if (node.field === 'title')
                    return track.titleNorm.includes(node.value);
                return track.albumNorm.includes(node.value);
            case 'year-eq': return track.year === node.a;
            case 'year-gt': return track.year !== null && track.year > node.a;
            case 'year-gte': return track.year !== null && track.year >= node.a;
            case 'year-lt': return track.year !== null && track.year < node.a;
            case 'year-lte': return track.year !== null && track.year <= node.a;
            case 'year-range': return track.year !== null && track.year >= node.a && track.year <= node.b;
        }
    }
    SmartSearch.matchNode = matchNode;
    function smartSyntaxUsed(query) {
        const value = String(query ?? '');
        return /[;&]/.test(value)
            || /(^|\s)@\S/.test(value)
            || /(^|\s)-(?!\s)/.test(value)
            || /\b(?:artist|title|track|album|year)\s*:/i.test(value);
    }
    SmartSearch.smartSyntaxUsed = smartSyntaxUsed;
})(SmartSearch || (SmartSearch = {}));
var SmartSearch;
(function (SmartSearch) {
    function getPath(object, path) {
        let current = object;
        for (const key of path) {
            if (current == null)
                return undefined;
            current = current[key];
        }
        return current;
    }
    function firstDefined(object, paths) {
        for (const path of paths) {
            const value = getPath(object, path);
            if (value !== undefined && value !== null)
                return value;
        }
        return undefined;
    }
    function getDirectTrackCandidate(item) {
        if (!item || typeof item !== 'object')
            return null;
        const wrappers = [item.track, item.itemV2, item.item, item.content, item.entity, item];
        for (const wrapper of wrappers) {
            if (!wrapper || typeof wrapper !== 'object')
                continue;
            const wrapperUri = wrapper.uri || wrapper._uri || wrapper.trackUri || wrapper.track_uri
                || wrapper.entity?.uri || wrapper.data?.uri || wrapper.data?._uri || wrapper.data?.entity?.uri;
            const data = wrapper.data && typeof wrapper.data === 'object' ? wrapper.data : wrapper;
            const dataUri = data.uri || data._uri || data.trackUri || data.track_uri || data.entity?.uri;
            const uri = wrapperUri || dataUri;
            if (typeof uri === 'string' && uri.startsWith('spotify:track:'))
                return { data, uri, wrapper };
        }
        const directData = item.data;
        if (directData && typeof directData === 'object') {
            const uri = directData.uri || directData._uri || directData.trackUri || directData.track_uri || directData.entity?.uri;
            if (typeof uri === 'string' && uri.startsWith('spotify:track:'))
                return { data: directData, uri, wrapper: item };
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
                if (typeof artist === 'string')
                    names.push(artist);
                else if (artist && typeof artist === 'object') {
                    const name = artist.name ?? artist.profile?.name ?? artist.data?.profile?.name ?? artist.data?.name;
                    if (name)
                        names.push(String(name));
                }
            }
            if (names.length)
                break;
        }
        if (!names.length && candidate.metadata?.artist_name)
            names.push(String(candidate.metadata.artist_name));
        return [...new Set(names.filter(Boolean))];
    }
    function sanitizeImageUrl(value) {
        const text = String(value ?? '').trim();
        if (!text)
            return '';
        const spotifyImage = text.match(/^spotify:image:([A-Za-z0-9]+)$/i);
        if (spotifyImage)
            return `https://i.scdn.co/image/${spotifyImage[1]}`;
        try {
            const url = new URL(text);
            return url.protocol === 'https:' ? url.toString() : '';
        }
        catch {
            return '';
        }
    }
    function trackUriFromUnknown(item) {
        const candidate = getDirectTrackCandidate(item);
        return candidate?.uri ?? null;
    }
    SmartSearch.trackUriFromUnknown = trackUriFromUnknown;
    function normalizeTrackItem(item, playlistIndex) {
        const candidate = getDirectTrackCandidate(item);
        if (!candidate)
            return null;
        const c = candidate.data;
        const title = String(firstDefined(c, [['name'], ['title'], ['entity', 'name'], ['entity', 'title'], ['metadata', 'title']]) ?? 'Unknown track');
        const artists = extractArtistNames(c);
        const albumObject = firstDefined(c, [['albumOfTrack'], ['album'], ['release'], ['entity', 'album']]);
        const album = typeof albumObject === 'string'
            ? albumObject
            : String(albumObject?.name ?? albumObject?.title ?? c.metadata?.album_title ?? '');
        const releaseDate = String(firstDefined(c, [
            ['albumOfTrack', 'date', 'isoString'],
            ['albumOfTrack', 'date', 'year'],
            ['albumOfTrack', 'releaseDate', 'isoString'],
            ['album', 'release_date'],
            ['album', 'releaseDate'],
            ['release_date'],
        ]) ?? '');
        const yearMatch = releaseDate.match(/\b(19|20)\d{2}\b/);
        const yearCandidate = yearMatch ? Number(yearMatch[0]) : Number(albumObject?.date?.year ?? NaN);
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
        const titleNorm = SmartSearch.normalizeText(title);
        const artistNorm = artists.map(SmartSearch.normalizeText);
        const albumNorm = SmartSearch.normalizeText(album);
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
    SmartSearch.normalizeTrackItem = normalizeTrackItem;
    function findBestTrackArray(root) {
        const direct = firstDefined(root, [
            ['data', 'playlistV2', 'content', 'items'],
            ['playlistV2', 'content', 'items'],
            ['data', 'playlist', 'content', 'items'],
        ]);
        if (Array.isArray(direct))
            return direct;
        if (Array.isArray(direct?.items))
            return direct.items;
        let best = null;
        const seen = new WeakSet();
        function walk(node, depth) {
            if (!node || typeof node !== 'object' || depth > 14)
                return;
            if (seen.has(node))
                return;
            seen.add(node);
            if (Array.isArray(node)) {
                if (node.length) {
                    let score = 0;
                    for (const item of node.slice(0, 10))
                        if (getDirectTrackCandidate(item))
                            score += 1;
                    if (score && (!best || score > best.score || (score === best.score && node.length > best.array.length)))
                        best = { score, array: node };
                }
                for (const item of node.slice(0, 12))
                    walk(item, depth + 1);
            }
            else {
                for (const value of Object.values(node))
                    walk(value, depth + 1);
            }
        }
        walk(root, 0);
        return best?.array ?? [];
    }
    function namedGraphQLType(typeNode) {
        let node = typeNode;
        while (node?.type)
            node = node.type;
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
        const context = SmartSearch.S?.GraphQL?.Context ?? {};
        const variables = {};
        for (const spec of specs) {
            const lower = spec.name.toLowerCase();
            if (['uri', 'playlisturi', 'playlist_uri'].includes(lower))
                variables[spec.name] = playlistUri;
            else if (['playlistid', 'playlist_id'].includes(lower))
                variables[spec.name] = playlistId;
            else if (lower === 'offset')
                variables[spec.name] = offset;
            else if (lower === 'limit')
                variables[spec.name] = limit;
            else if (lower === 'enablewatchfeedentrypoint')
                variables[spec.name] = false;
            else if (lower === 'locale')
                variables[spec.name] = context.locale || SmartSearch.S?.Platform?.Session?.locale || 'en';
            else if (lower === 'market')
                variables[spec.name] = context.market || SmartSearch.S?.Platform?.Session?.country || 'from_token';
            else if (spec.defaultValue !== undefined) {
                if (spec.type === 'Boolean')
                    variables[spec.name] = spec.defaultValue === true || spec.defaultValue === 'true';
                else if (spec.type === 'Int' || spec.type === 'Float')
                    variables[spec.name] = Number(spec.defaultValue);
                else
                    variables[spec.name] = spec.defaultValue;
            }
            else if (spec.required && spec.type === 'Boolean')
                variables[spec.name] = false;
        }
        return variables;
    }
    function normalizeItems(items, baseIndex = 0) {
        const tracks = [];
        for (let index = 0; index < items.length; index += 1) {
            try {
                const track = normalizeTrackItem(items[index], baseIndex + index);
                if (track?.isPlayable)
                    tracks.push(track);
            }
            catch (error) {
                SmartSearch.consoleWarn('Skipped a playlist item that could not be normalized.', error);
            }
        }
        return tracks;
    }
    async function fetchPlaylistViaPlatformAPI(playlistId) {
        const api = SmartSearch.S?.Platform?.PlaylistAPI;
        if (typeof api?.getContents !== 'function')
            throw new Error('PlaylistAPI.getContents is unavailable');
        const attempts = [`spotify:playlist:${playlistId}`, playlistId];
        const errors = [];
        for (const argument of attempts) {
            try {
                const response = await api.getContents.call(api, argument);
                const items = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : findBestTrackArray(response);
                const tracks = normalizeItems(items, 0);
                if (tracks.length)
                    return tracks;
                errors.push(`${String(argument).startsWith('spotify:') ? 'URI' : 'ID'} returned no playable tracks`);
            }
            catch (error) {
                errors.push(error?.message || String(error));
            }
        }
        throw new Error(`PlaylistAPI failed: ${errors.join(' | ')}`);
    }
    async function waitForPlaylistGraphQLDefinitions(timeoutMs = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const definitions = SmartSearch.S?.GraphQL?.Definitions;
            if (SmartSearch.S?.GraphQL?.Request && definitions && (definitions.FetchPlaylistContents || definitions.fetchPlaylist || definitions.fetchPlaylistContents || definitions.fetchPlaylistContentsWithGatedEntityRelations))
                return;
            await SmartSearch.sleep(100);
        }
    }
    async function fetchPlaylistViaGraphQL(playlistId) {
        await waitForPlaylistGraphQLDefinitions();
        if (!SmartSearch.S?.GraphQL?.Request)
            throw new Error('GraphQL.Request is unavailable');
        const definitions = [
            ['FetchPlaylistContents', SmartSearch.S?.GraphQL?.Definitions?.FetchPlaylistContents],
            ['fetchPlaylist', SmartSearch.S?.GraphQL?.Definitions?.fetchPlaylist],
            ['fetchPlaylistContents', SmartSearch.S?.GraphQL?.Definitions?.fetchPlaylistContents],
            ['fetchPlaylistContentsWithGatedEntityRelations', SmartSearch.S?.GraphQL?.Definitions?.fetchPlaylistContentsWithGatedEntityRelations],
        ].filter(([, definition], index, all) => definition && all.findIndex(([, existing]) => existing === definition) === index);
        if (!definitions.length)
            throw new Error('No compatible playlist GraphQL definition is available');
        const playlistUri = `spotify:playlist:${playlistId}`;
        const failures = [];
        for (const [name, definition] of definitions) {
            try {
                const tracks = [];
                let offset = 0;
                for (let page = 0; page < 200; page += 1) {
                    const variables = buildGraphQLVariables(definition, playlistUri, playlistId, offset, SmartSearch.PAGE_SIZE);
                    const response = await SmartSearch.S.GraphQL.Request(definition, variables, { persistCache: true });
                    const items = findBestTrackArray(response);
                    tracks.push(...normalizeItems(items, offset));
                    const total = Number(firstDefined(response, [['data', 'playlistV2', 'content', 'totalCount'], ['playlistV2', 'content', 'totalCount']]) ?? NaN);
                    if (!items.length || items.length < SmartSearch.PAGE_SIZE || (Number.isFinite(total) && offset + items.length >= total))
                        break;
                    offset += items.length;
                }
                if (tracks.length)
                    return tracks;
                failures.push(`${name}: no playable tracks`);
            }
            catch (error) {
                failures.push(`${name}: ${error?.message || error}`);
            }
        }
        throw new Error(`GraphQL fallback failed: ${failures.join(' | ')}`);
    }
    async function getPlaylistTracks(playlistId, force = false) {
        const cached = SmartSearch.state.cache.get(playlistId);
        if (!force && cached && Date.now() - cached.loadedAt < SmartSearch.CACHE_TTL_MS)
            return { tracks: cached.tracks, source: cached.source };
        let tracks = [];
        let source = '';
        let platformError = null;
        try {
            tracks = await fetchPlaylistViaPlatformAPI(playlistId);
            source = 'PlaylistAPI';
        }
        catch (error) {
            platformError = error;
        }
        if (!tracks.length) {
            try {
                tracks = await fetchPlaylistViaGraphQL(playlistId);
                source = 'GraphQL';
            }
            catch (graphQLError) {
                const platformMessage = platformError?.message || String(platformError || 'unknown error');
                throw new Error(`Could not load playlist. PlaylistAPI: ${platformMessage}. GraphQL: ${graphQLError?.message || graphQLError}`);
            }
        }
        SmartSearch.state.cache.set(playlistId, { tracks, loadedAt: Date.now(), source });
        return { tracks, source };
    }
    SmartSearch.getPlaylistTracks = getPlaylistTracks;
    function playlistIdFromLocation() {
        const path = SmartSearch.S?.Platform?.History?.location?.pathname || location.pathname || '';
        const match = path.match(/\/playlist\/([A-Za-z0-9]+)/);
        return match ? match[1] : null;
    }
    SmartSearch.playlistIdFromLocation = playlistIdFromLocation;
})(SmartSearch || (SmartSearch = {}));
var SmartSearch;
(function (SmartSearch) {
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
    function canUseNativeSetQueue() {
        const controller = SmartSearch.S?.Platform?.PlayerAPI?._queue;
        return Boolean(controller?._client?.setQueue && controller?._queue);
    }
    function queueUpcomingCount() {
        const controller = SmartSearch.S?.Platform?.PlayerAPI?._queue;
        const queueState = controller?._queueState;
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
        if (!contextUri || typeof SmartSearch.S?.Platform?.PlayerAPI?.updateContext !== 'function')
            return;
        try {
            const playerState = SmartSearch.S.Platform.PlayerAPI.getState?.();
            const sessionId = playerState?.sessionId;
            if (!sessionId)
                return;
            await SmartSearch.S.Platform.PlayerAPI.updateContext(sessionId, {
                uri: contextUri,
                url: `context://${contextUri}`,
            });
        }
        catch (error) {
            // Queue setup is still valid if Spotify declines the optional context sync.
            SmartSearch.consoleWarn('Could not synchronize the Spotify playback context.', error);
        }
    }
    async function playWithNativeSetQueue(sequence, shuffle, smartShuffle = false) {
        const controller = SmartSearch.S?.Platform?.PlayerAPI?._queue;
        const queueCore = controller?._queue;
        const client = controller?._client;
        if (!client?.setQueue || !queueCore)
            throw new Error('Native Spotify queue API is unavailable');
        await client.setQueue(buildNativeQueuePayload(sequence, queueCore));
        const contextUri = SmartSearch.state.playlistId ? `spotify:playlist:${SmartSearch.state.playlistId}` : null;
        await syncSpotifyPlaybackContext(contextUri);
        SmartSearch.state.playbackSession = {
            active: true,
            method: 'native-setQueue',
            sequence,
            currentIndex: -1,
            nextEnqueueIndex: sequence.length,
            startedAt: Date.now(),
            shuffle,
            smartShuffle,
            contextUri,
            query: SmartSearch.state.query,
            lastCurrentUri: null,
            refillCount: 0,
        };
        const nextResult = SmartSearch.S?.Player?.next?.();
        if (nextResult && typeof nextResult.then === 'function')
            await nextResult;
    }
    async function reseedNativeQueueTail(session) {
        const controller = SmartSearch.S?.Platform?.PlayerAPI?._queue;
        const queueCore = controller?._queue;
        const client = controller?._client;
        if (!client?.setQueue || !queueCore)
            return;
        const remaining = session.sequence.slice(Math.max(0, session.currentIndex + 1));
        if (!remaining.length)
            return;
        await client.setQueue(buildNativeQueuePayload(remaining, queueCore));
        await syncSpotifyPlaybackContext(session.contextUri ?? null);
        session.refillCount += 1;
        session.lastNativeReseedAt = Date.now();
    }
    async function enqueueTracks(tracks) {
        if (!tracks.length)
            return;
        const contexts = tracks.map((track) => ({ uri: track.uri, uid: track.uid || undefined }));
        if (typeof SmartSearch.S?.addToQueue === 'function') {
            await SmartSearch.S.addToQueue(contexts);
            return;
        }
        if (SmartSearch.S?.Platform?.PlayerAPI?.addToQueue) {
            await SmartSearch.S.Platform.PlayerAPI.addToQueue(contexts);
            return;
        }
        throw new Error('No compatible queue API is available');
    }
    async function refillSlidingQueue(force = false) {
        const session = SmartSearch.state.playbackSession;
        if (!session?.active || session.method !== 'sliding-addToQueue')
            return;
        const remainingBuffered = Math.max(0, session.nextEnqueueIndex - session.currentIndex - 1);
        if (!force && remainingBuffered > SmartSearch.PLAYBACK_BUFFER_LOW_WATER)
            return;
        if (session.nextEnqueueIndex >= session.sequence.length)
            return;
        const desiredEnd = Math.min(session.sequence.length, Math.max(session.nextEnqueueIndex + SmartSearch.PLAYBACK_REFILL_CHUNK, session.currentIndex + 1 + SmartSearch.PLAYBACK_BUFFER_TARGET));
        const slice = session.sequence.slice(session.nextEnqueueIndex, desiredEnd);
        await enqueueTracks(slice);
        session.nextEnqueueIndex = desiredEnd;
        session.refillCount += 1;
    }
    async function playWithSlidingQueue(sequence, shuffle) {
        const first = sequence[0];
        if (!first)
            return;
        if (SmartSearch.S?.Platform?.PlayerAPI?.clearQueue)
            await SmartSearch.S.Platform.PlayerAPI.clearQueue();
        await SmartSearch.S.Player.playUri(first.uri);
        SmartSearch.state.playbackSession = {
            active: true,
            method: 'sliding-addToQueue',
            sequence,
            currentIndex: 0,
            nextEnqueueIndex: 1,
            startedAt: Date.now(),
            shuffle,
            query: SmartSearch.state.query,
            lastCurrentUri: first.uri,
            refillCount: 0,
        };
        await refillSlidingQueue(true);
    }
    function findSessionIndexForUri(session, uri, preferNextDuplicate = false) {
        let start = Math.max(0, session.currentIndex);
        if (preferNextDuplicate && session.lastCurrentUri === uri && start < session.sequence.length - 1)
            start += 1;
        for (let index = start; index < session.sequence.length; index += 1)
            if (session.sequence[index]?.uri === uri)
                return index;
        for (let index = 0; index < start; index += 1)
            if (session.sequence[index]?.uri === uri)
                return index;
        return -1;
    }
    function queueItemUri(item) {
        if (!item || typeof item !== 'object')
            return null;
        if (typeof item.uri === 'string' && item.uri.startsWith('spotify:track:'))
            return item.uri;
        if (typeof item.contextTrack?.uri === 'string' && item.contextTrack.uri.startsWith('spotify:track:'))
            return item.contextTrack.uri;
        return null;
    }
    function nativeContextUpcomingUris() {
        const queueState = SmartSearch.S?.Platform?.PlayerAPI?._queue?._queueState;
        const nextUp = Array.isArray(queueState?.nextUp) ? queueState.nextUp : [];
        const result = [];
        for (const item of nextUp) {
            if (item?.provider && item.provider !== 'context')
                continue;
            const uri = queueItemUri(item);
            if (uri)
                result.push(uri);
        }
        return result;
    }
    function nativeQueueDiverged(session) {
        if (session.method !== 'native-setQueue' || session.currentIndex < 0)
            return false;
        const expected = session.sequence
            .slice(session.currentIndex + 1, session.currentIndex + 9)
            .map((track) => track.uri);
        if (!expected.length)
            return false;
        const actual = nativeContextUpcomingUris().slice(0, expected.length);
        if (!actual.length)
            return false;
        const comparable = Math.min(expected.length, actual.length);
        for (let index = 0; index < comparable; index += 1) {
            if (expected[index] !== actual[index])
                return true;
        }
        return false;
    }
    async function maintainPlaybackSession(reason = 'poll') {
        const session = SmartSearch.state.playbackSession;
        if (!session?.active || SmartSearch.state.playbackMaintenanceInFlight)
            return;
        SmartSearch.state.playbackMaintenanceInFlight = true;
        try {
            const currentUri = SmartSearch.S?.Player?.data?.item?.uri || null;
            if (!currentUri)
                return;
            const index = findSessionIndexForUri(session, currentUri, reason === 'songchange');
            if (index < 0) {
                if (Date.now() - session.startedAt > 4000)
                    session.active = false;
                return;
            }
            session.currentIndex = index;
            session.lastCurrentUri = currentUri;
            if (session.method === 'sliding-addToQueue')
                await refillSlidingQueue(false);
            if (session.method === 'native-setQueue') {
                const upcoming = queueUpcomingCount();
                const remaining = Math.max(0, session.sequence.length - index - 1);
                const cooldownDone = !session.lastNativeReseedAt || Date.now() - session.lastNativeReseedAt > 500;
                const needsRefill = upcoming !== null
                    && remaining > SmartSearch.PLAYBACK_BUFFER_LOW_WATER
                    && upcoming <= SmartSearch.PLAYBACK_BUFFER_LOW_WATER;
                // Spotify may rebuild the context when the user selects another item in
                // the Queue panel. Current Spotify behavior preserves the shuffle order
                // for another song in the same playlist, so restore our already-created
                // Smart Search sequence instead of generating a new one.
                const contextWasRegenerated = reason === 'songchange' && nativeQueueDiverged(session);
                if (cooldownDone && (needsRefill || contextWasRegenerated))
                    await reseedNativeQueueTail(session);
            }
            SmartSearch.updatePlaybackUi();
        }
        catch (error) {
            SmartSearch.consoleWarn('Playback maintenance failed.', error);
        }
        finally {
            SmartSearch.state.playbackMaintenanceInFlight = false;
        }
    }
    SmartSearch.maintainPlaybackSession = maintainPlaybackSession;
    function spotifyShuffleState() {
        try {
            if (typeof SmartSearch.S?.Player?.getShuffle === 'function')
                return Boolean(SmartSearch.S.Player.getShuffle());
        }
        catch { }
        return Boolean(SmartSearch.S?.Player?.data?.shuffle);
    }
    function spotifySmartShuffleState() {
        return Boolean(SmartSearch.S?.Player?.data?.smartShuffle ?? SmartSearch.S?.Platform?.PlayerAPI?._state?.smartShuffle);
    }
    function sequenceFromSelected(startIndex, shuffle) {
        const source = [...SmartSearch.state.filtered];
        if (!source.length)
            return [];
        const index = Math.max(0, Math.min(startIndex, source.length - 1));
        const selected = source[index];
        if (!shuffle)
            return source.slice(index);
        const remaining = source.filter((_, itemIndex) => itemIndex !== index);
        return [selected, ...fisherYates(remaining)];
    }
    async function playFilteredRespectingSpotify(startIndex = 0) {
        if (!SmartSearch.state.filtered.length || SmartSearch.state.playbackBusy)
            return;
        const shuffle = spotifyShuffleState();
        const smartShuffle = spotifySmartShuffleState();
        const sequence = sequenceFromSelected(startIndex, shuffle || smartShuffle);
        if (!sequence.length)
            return;
        SmartSearch.state.playbackBusy = true;
        SmartSearch.updatePlaybackUi();
        try {
            if (canUseNativeSetQueue()) {
                try {
                    await playWithNativeSetQueue(sequence, shuffle || smartShuffle, smartShuffle);
                }
                catch (error) {
                    SmartSearch.consoleWarn('Native Smart Search playback bridge failed; using compatibility queue.', error);
                    await playWithSlidingQueue(sequence, shuffle || smartShuffle);
                }
            }
            else {
                await playWithSlidingQueue(sequence, shuffle || smartShuffle);
            }
            // Do not mutate Spotify's shuffle/repeat controls. The queue sequence was
            // constructed to respect the current shuffle state, while Repeat One/All
            // remain owned by the player.
        }
        catch (error) {
            SmartSearch.state.playbackSession = null;
            SmartSearch.consoleError('Could not start Smart Search playback.', error);
            SmartSearch.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
        }
        finally {
            SmartSearch.state.playbackBusy = false;
            SmartSearch.updatePlaybackUi();
        }
    }
    SmartSearch.playFilteredRespectingSpotify = playFilteredRespectingSpotify;
    async function playFiltered(startIndex = 0, shuffle = false) {
        if (!SmartSearch.state.filtered.length || SmartSearch.state.playbackBusy)
            return;
        SmartSearch.state.playbackBusy = true;
        SmartSearch.updatePlaybackUi();
        let sequence = [...SmartSearch.state.filtered];
        if (shuffle)
            sequence = fisherYates(sequence);
        else {
            const index = Math.max(0, Math.min(startIndex, sequence.length - 1));
            sequence = [...sequence.slice(index), ...sequence.slice(0, index)];
        }
        try {
            if (canUseNativeSetQueue()) {
                try {
                    await playWithNativeSetQueue(sequence, shuffle);
                }
                catch (error) {
                    SmartSearch.consoleWarn('Native queue setup failed; using compatibility queue.', error);
                    await playWithSlidingQueue(sequence, shuffle);
                }
            }
            else {
                await playWithSlidingQueue(sequence, shuffle);
            }
        }
        catch (error) {
            SmartSearch.state.playbackSession = null;
            SmartSearch.consoleError('Could not start filtered playback.', error);
            SmartSearch.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
        }
        finally {
            SmartSearch.state.playbackBusy = false;
            SmartSearch.updatePlaybackUi();
        }
    }
    SmartSearch.playFiltered = playFiltered;
})(SmartSearch || (SmartSearch = {}));
var SmartSearch;
(function (SmartSearch) {
    let nativePatch = null;
    let attachGeneration = 0;
    let lastKnownTarget = null;
    let sortRefreshTimer = null;
    let structuralScanAt = 0;
    let nativeFilterSuppressed = false;
    let headerCountElement = null;
    let headerCountOriginalText = '';
    let nativeListObserver = null;
    let nativeListObserverRoot = null;
    let nativeListObserverPlaylistId = null;
    let nativeListMaintenanceQueued = false;
    function reactFiberFor(element) {
        if (!element)
            return null;
        for (const key of Object.getOwnPropertyNames(element)) {
            if (!key.startsWith('__reactFiber$') && !key.startsWith('__reactInternalInstance$'))
                continue;
            try {
                return element[key] ?? null;
            }
            catch {
                return null;
            }
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
    function searchControllerFor(input) {
        if (!input)
            return null;
        for (const fiber of fiberChainFrom(input, 32)) {
            const props = propsForFiber(fiber);
            if (!props || (typeof props.onFilter !== 'function' && typeof props.onClear !== 'function'))
                continue;
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
            return { fiber, props, textHook };
        }
        return null;
    }
    function dispatchControlledSearchText(controller, value) {
        try {
            if (controller?.textHook?.queue?.dispatch)
                controller.textHook.queue.dispatch(value);
        }
        catch (error) {
            SmartSearch.consoleWarn('Could not synchronize Spotify search text state.', error);
        }
    }
    function suppressSpotifyNativeFilter(input, value) {
        const controller = searchControllerFor(input);
        if (!nativeFilterSuppressed) {
            nativeFilterSuppressed = true;
            // Clear Spotify's own single-query predicate once, then keep its controlled
            // search text in sync ourselves. This prevents the transient AND result set
            // from ever becoming Smart Search's playback/list context.
            try {
                controller?.props?.onClear?.();
            }
            catch (error) {
                SmartSearch.consoleWarn('Could not clear Spotify native playlist filter.', error);
            }
        }
        queueMicrotask(() => dispatchControlledSearchText(controller, value));
    }
    function releaseSpotifyNativeFilterSuppression() {
        nativeFilterSuppressed = false;
    }
    function propsForFiber(fiber) {
        return fiber?.memoizedProps && typeof fiber.memoizedProps === 'object'
            ? fiber.memoizedProps
            : fiber?.pendingProps && typeof fiber.pendingProps === 'object'
                ? fiber.pendingProps
                : null;
    }
    function nativeTargetScore(fiber) {
        const props = propsForFiber(fiber);
        const cache = props?.itemsCache;
        if (!cache || typeof cache !== 'object')
            return -1;
        if (typeof cache.getItem !== 'function' && typeof cache.getItems !== 'function')
            return -1;
        let score = 20;
        if (typeof cache.getItem === 'function')
            score += 3;
        if (typeof cache.getItems === 'function')
            score += 4;
        if (typeof cache.invalidateCache === 'function')
            score += 1;
        if (props.sortState && typeof props.sortState === 'object')
            score += 6;
        if (typeof props.onSort === 'function')
            score += 4;
        if (typeof props.resolveItem === 'function')
            score += 3;
        if (typeof props.renderRow === 'function' || typeof props.renderRows === 'function')
            score += 2;
        if (typeof props.nrTracks === 'number')
            score += 2;
        if (typeof props.rowCount === 'number')
            score += 1;
        if (props.canFetchAllTracks === true)
            score += 1;
        return score;
    }
    function sortStateForFiber(fiber) {
        const chain = fiberChainFromFiber(fiber, 18);
        for (const item of chain) {
            const sort = propsForFiber(item)?.sortState;
            if (sort && typeof sort === 'object')
                return sort;
        }
        return null;
    }
    function primitiveSortKey(value) {
        if (value == null)
            return '';
        if (typeof value === 'string' || typeof value === 'number')
            return String(value);
        if (typeof value === 'symbol')
            return value.description || String(value);
        if (typeof value === 'object') {
            for (const key of ['id', 'key', 'name', 'type', 'columnType', 'value']) {
                try {
                    const nested = value[key];
                    if (nested != null && nested !== value) {
                        const result = primitiveSortKey(nested);
                        if (result)
                            return result;
                    }
                }
                catch { }
            }
        }
        try {
            return String(value);
        }
        catch {
            return '';
        }
    }
    function sortSignatureFromState(sortState) {
        if (!sortState || typeof sortState !== 'object')
            return '';
        const column = primitiveSortKey(sortState.column ?? sortState.field ?? sortState.key ?? '');
        const order = primitiveSortKey(sortState.order ?? sortState.direction ?? '');
        return `${column}|${order}`;
    }
    function targetFromFiber(fiber) {
        const score = nativeTargetScore(fiber);
        if (score < 0)
            return null;
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
        if (!target?.cache || typeof target.cache !== 'object')
            return false;
        return typeof target.cache.getItem === 'function' || typeof target.cache.getItems === 'function';
    }
    function nativeAnchorElements() {
        const page = SmartSearch.findPlaylistPage();
        if (!page)
            return [];
        const result = [];
        const add = (element) => {
            if (element && !result.includes(element))
                result.push(element);
        };
        add(SmartSearch.findTracklistContainer());
        add(SmartSearch.state.nativeSearchInput);
        add(page);
        for (const element of [...page.querySelectorAll('.main-trackList-trackListRow,[role="row"],[role="columnheader"],[aria-sort],button[role="combobox"],.x-filterBox-filterInput')].slice(0, 18))
            add(element);
        return result;
    }
    function bestTargetFromAncestorChains() {
        let best = null;
        for (const element of nativeAnchorElements()) {
            for (const fiber of fiberChainFrom(element, 56)) {
                const target = targetFromFiber(fiber);
                if (!target)
                    continue;
                if (!best || target.score > best.score)
                    best = target;
            }
        }
        return best;
    }
    function bestTargetFromFiberNeighborhood() {
        const starts = nativeAnchorElements().map(reactFiberFor).filter(Boolean);
        if (!starts.length)
            return null;
        const queue = [...starts];
        const seen = new Set();
        let best = null;
        const maxNodes = 9000;
        while (queue.length && seen.size < maxNodes) {
            const fiber = queue.shift();
            if (!fiber || seen.has(fiber))
                continue;
            seen.add(fiber);
            const target = targetFromFiber(fiber);
            if (target && (!best || target.score > best.score)) {
                best = target;
                // The probe's list component has itemsCache + sortState + onSort + resolveItem.
                // A score in this range is already the exact structural signature we need.
                if (best.score >= 38)
                    break;
            }
            for (const next of [fiber.return, fiber.child, fiber.sibling, fiber.alternate]) {
                if (next && !seen.has(next))
                    queue.push(next);
            }
        }
        return best;
    }
    function discoverNativeTarget(forceStructuralScan = false) {
        if (nativePatch?.active && nativePatch.cache) {
            const current = targetFromFiber(nativePatch.targetFiber);
            if (current && current.cache === nativePatch.cache)
                return current;
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
        if (!forceStructuralScan && now - structuralScanAt < 120)
            return null;
        structuralScanAt = now;
        const structural = bestTargetFromFiberNeighborhood();
        if (structural)
            lastKnownTarget = structural;
        return structural;
    }
    function primeNativeListTarget() {
        if (!SmartSearch.playlistIdFromLocation())
            return;
        discoverNativeTarget(false);
    }
    SmartSearch.primeNativeListTarget = primeNativeListTarget;
    function compareText(a, b) {
        return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    }
    function sortDirection(sortState) {
        const raw = sortState?.order ?? sortState?.direction;
        if (typeof raw === 'number') {
            if (raw === 2 || raw < 0)
                return -1;
            if (raw === 1 || raw > 0)
                return 1;
            return 0;
        }
        const text = primitiveSortKey(raw).toLowerCase();
        if (/desc|reverse|down/.test(text))
            return -1;
        if (/asc|forward|up/.test(text))
            return 1;
        return 0;
    }
    function sortColumn(sortState) {
        return primitiveSortKey(sortState?.column ?? sortState?.field ?? sortState?.key).toLowerCase();
    }
    function sortedTracksForNative(target) {
        const base = [...SmartSearch.state.filtered];
        const column = sortColumn(target.sortState);
        const direction = sortDirection(target.sortState);
        if (!direction || !column)
            return base;
        let selector = null;
        if (/album/.test(column))
            selector = (track) => track.albumNorm;
        else if (/date|added|recent/.test(column))
            selector = (track) => Date.parse(track.addedAt || '') || 0;
        else if (/duration|time|length/.test(column))
            selector = (track) => track.duration;
        else if (/artist/.test(column))
            selector = (track) => track.artistNorm[0] || '';
        else if (/title|name|track/.test(column))
            selector = (track) => track.titleNorm;
        else if (/custom|order|index|position/.test(column))
            selector = (track) => track.playlistIndex;
        if (!selector)
            return base;
        return base
            .map((track, index) => ({ track, index, value: selector(track) }))
            .sort((a, b) => {
            let cmp = 0;
            if (typeof a.value === 'number' && typeof b.value === 'number')
                cmp = a.value - b.value;
            else
                cmp = compareText(String(a.value), String(b.value));
            return cmp ? cmp * direction : a.index - b.index;
        })
            .map((entry) => entry.track);
    }
    function replaceFirstArray(value, replacement, total) {
        if (Array.isArray(value))
            return replacement;
        if (!value || typeof value !== 'object')
            return value;
        const candidateKeys = ['items', 'tracks', 'rows', 'entries', 'values'];
        for (const key of candidateKeys) {
            if (!Array.isArray(value[key]))
                continue;
            const clone = { ...value, [key]: replacement };
            for (const totalKey of ['total', 'totalCount', 'count', 'length']) {
                if (typeof clone[totalKey] === 'number')
                    clone[totalKey] = total;
            }
            return clone;
        }
        return value;
    }
    function numericRange(args, fallbackCount) {
        const nums = args.filter((value) => Number.isInteger(value) && value >= 0).map(Number);
        const start = nums[0] ?? 0;
        let count = nums[1] ?? fallbackCount;
        if (nums.length >= 2 && start > 0 && nums[1] > start && nums[1] - start <= 500)
            count = nums[1] - start;
        if (!Number.isFinite(count) || count <= 0)
            count = fallbackCount;
        return { start, count: Math.min(Math.max(1, count), 1000) };
    }
    function forceTracklistUpdate(chain) {
        for (const fiber of chain) {
            const stateNode = fiber?.stateNode;
            if (stateNode && typeof stateNode.forceUpdate === 'function') {
                try {
                    stateNode.forceUpdate();
                    return;
                }
                catch { }
            }
            let hook = fiber?.memoizedState;
            let guard = 0;
            while (hook && guard++ < 28) {
                if (typeof hook.memoizedState === 'number' && typeof hook.queue?.dispatch === 'function') {
                    try {
                        hook.queue.dispatch((value) => Number(value || 0) + 1);
                        return;
                    }
                    catch { }
                }
                hook = hook.next;
            }
        }
        try {
            SmartSearch.findTracklistContainer()?.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        catch { }
    }
    function mutateFiberCounts(chain, patch) {
        const count = patch.orderedRawItems.length;
        for (const fiber of chain) {
            for (const key of ['memoizedProps', 'pendingProps']) {
                const props = fiber?.[key];
                if (!props || typeof props !== 'object')
                    continue;
                try {
                    if ('nrTracks' in props)
                        props.nrTracks = count;
                    if ('rowCount' in props && typeof props.rowCount === 'number')
                        props.rowCount = count;
                    if ('itemsCache' in props && props.itemsCache !== patch.cache && nativeTargetScore(fiber) >= 0)
                        props.itemsCache = patch.cache;
                    if ('getItems' in props && typeof patch.cache.getItems === 'function')
                        props.getItems = patch.cache.getItems;
                }
                catch { }
            }
        }
    }
    function patchNativeCache(patch, chain) {
        const cache = patch.cache;
        const originalGetItem = patch.originalGetItem;
        const originalGetItems = patch.originalGetItems;
        if (originalGetItem) {
            try {
                const wrappedGetItem = function smartSearchGetItem(index, ...rest) {
                    if (!patch.active)
                        return originalGetItem.call(cache, index, ...rest);
                    const value = patch.orderedRawItems[Number(index) || 0];
                    return patch.originalGetItemWasPromise ? Promise.resolve(value) : value;
                };
                patch.wrappedGetItem = wrappedGetItem;
                cache.getItem = wrappedGetItem;
            }
            catch { }
        }
        if (originalGetItems) {
            try {
                const wrappedGetItems = function smartSearchGetItems(...args) {
                    const originalResult = originalGetItems.apply(cache, args);
                    if (!patch.active)
                        return originalResult;
                    const adapt = (result) => {
                        let fallbackCount = 50;
                        if (Array.isArray(result))
                            fallbackCount = Math.max(1, result.length || 50);
                        else if (Array.isArray(result?.items))
                            fallbackCount = Math.max(1, result.items.length || 50);
                        else if (Array.isArray(result?.tracks))
                            fallbackCount = Math.max(1, result.tracks.length || 50);
                        const { start, count } = numericRange(args, fallbackCount);
                        const replacement = patch.orderedRawItems.slice(start, start + count);
                        // If Spotify returns an unfamiliar wrapper, returning the replacement
                        // directly is safer than leaving its incompatible native filter intact.
                        const adapted = replaceFirstArray(result, replacement, patch.orderedRawItems.length);
                        return adapted === result && !Array.isArray(result) ? replacement : adapted;
                    };
                    return originalResult && typeof originalResult.then === 'function'
                        ? Promise.resolve(originalResult).then(adapt)
                        : adapt(originalResult);
                };
                patch.wrappedGetItems = wrappedGetItems;
                cache.getItems = wrappedGetItems;
            }
            catch { }
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
            }
            else if (descriptor.writable) {
                cache.nrValidItems = patch.orderedRawItems.length;
            }
        }
        catch {
            try {
                cache.nrValidItems = patch.orderedRawItems.length;
            }
            catch { }
        }
        mutateFiberCounts(chain, patch);
        forceTracklistUpdate(chain);
    }
    function nativePatchNeedsRepair(patch) {
        if (!patch.active)
            return false;
        if (patch.originalGetItem && patch.wrappedGetItem && patch.cache.getItem !== patch.wrappedGetItem)
            return true;
        if (patch.originalGetItems && patch.wrappedGetItems && patch.cache.getItems !== patch.wrappedGetItems)
            return true;
        return false;
    }
    function refreshActivePatchForTarget(target) {
        const patch = nativePatch;
        if (!patch || patch.cache !== target.cache)
            return;
        const ordered = orderedRawItemsForTarget(target);
        patch.orderedRawItems = ordered.raw;
        patch.orderedTracks = ordered.tracks;
        patch.sortSignature = target.sortSignature;
        patch.targetFiber = target.fiber;
        patch.targetChain = target.chain;
        patch.active = true;
        SmartSearch.state.filtered = ordered.tracks;
        SmartSearch.state.nativeAdapterResultCount = ordered.raw.length;
        patchNativeCache(patch, target.chain);
        updateHeaderResultCount();
    }
    function disconnectNativeListObserver() {
        try {
            nativeListObserver?.disconnect();
        }
        catch { }
        nativeListObserver = null;
        nativeListObserverRoot = null;
        nativeListObserverPlaylistId = null;
        nativeListMaintenanceQueued = false;
    }
    function ensureNativeListObserver() {
        if (!SmartSearch.smartSyntaxUsed(SmartSearch.state.query) || SmartSearch.state.nativeAdapterMode === 'idle') {
            disconnectNativeListObserver();
            return;
        }
        const playlistId = SmartSearch.playlistIdFromLocation();
        if (!playlistId || playlistId !== SmartSearch.state.playlistId) {
            disconnectNativeListObserver();
            return;
        }
        const root = SmartSearch.findPlaylistPage();
        if (!root)
            return;
        if (nativeListObserver && nativeListObserverRoot === root && nativeListObserverPlaylistId === playlistId)
            return;
        disconnectNativeListObserver();
        nativeListObserverRoot = root;
        nativeListObserverPlaylistId = playlistId;
        nativeListObserver = new MutationObserver(() => {
            if (nativeListMaintenanceQueued || !nativeAdapterIsActive())
                return;
            nativeListMaintenanceQueued = true;
            queueMicrotask(() => {
                nativeListMaintenanceQueued = false;
                if (!nativeAdapterIsActive() || !SmartSearch.smartSyntaxUsed(SmartSearch.state.query))
                    return;
                if (SmartSearch.playlistIdFromLocation() !== nativeListObserverPlaylistId || SmartSearch.state.playlistId !== nativeListObserverPlaylistId)
                    return;
                maintainNativeSmartMode();
            });
        });
        nativeListObserver.observe(root, { childList: true, subtree: true });
    }
    function restoreFiberCounts(chain, patch) {
        const fullCount = Number(patch.originalNrValue) || SmartSearch.state.tracks.length;
        for (const fiber of chain) {
            for (const key of ['memoizedProps', 'pendingProps']) {
                const props = fiber?.[key];
                if (!props || typeof props !== 'object')
                    continue;
                try {
                    if ('nrTracks' in props)
                        props.nrTracks = fullCount;
                    if ('rowCount' in props && typeof props.rowCount === 'number')
                        props.rowCount = fullCount;
                    if ('getItems' in props && patch.originalGetItems)
                        props.getItems = patch.originalGetItems;
                }
                catch { }
            }
        }
    }
    function restoreNativePatch(forceUpdate = true) {
        const patch = nativePatch;
        nativePatch = null;
        if (!patch)
            return;
        patch.active = false;
        const cache = patch.cache;
        try {
            if (patch.originalGetItem)
                cache.getItem = patch.originalGetItem;
        }
        catch { }
        try {
            if (patch.originalGetItems)
                cache.getItems = patch.originalGetItems;
        }
        catch { }
        try {
            if (patch.originalNrDescriptor)
                Object.defineProperty(cache, 'nrValidItems', patch.originalNrDescriptor);
            else
                cache.nrValidItems = patch.originalNrValue;
        }
        catch { }
        restoreFiberCounts(patch.targetChain, patch);
        if (forceUpdate)
            forceTracklistUpdate(patch.targetChain);
    }
    function orderedRawItemsForTarget(target) {
        const tracks = sortedTracksForNative(target);
        const raw = [];
        const accepted = [];
        for (const track of tracks) {
            if (!track.rawItem)
                continue;
            raw.push(track.rawItem);
            accepted.push(track);
        }
        return { raw, tracks: accepted };
    }
    async function attachNativeAdapter(query, generation) {
        SmartSearch.state.nativeAdapterMode = 'attaching';
        SmartSearch.state.nativeAdapterError = null;
        const deadline = Date.now() + 120;
        let lastReason = 'native list model not found';
        while (Date.now() < deadline) {
            if (generation !== attachGeneration || SmartSearch.state.query !== query || !SmartSearch.smartSyntaxUsed(query))
                return false;
            const target = discoverNativeTarget(true);
            if (!target) {
                lastReason = 'native list model not found from current Spotify React tree';
                await SmartSearch.sleep(8);
                continue;
            }
            try {
                if (nativePatch?.cache !== target.cache)
                    restoreNativePatch(false);
                const ordered = orderedRawItemsForTarget(target);
                if (!ordered.raw.length && SmartSearch.state.filtered.length)
                    throw new Error('native list raw playlist items are unavailable');
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
                    }
                    catch {
                        patch.originalGetItemWasPromise = false;
                    }
                }
                nativePatch = patch;
                patch.orderedRawItems = ordered.raw;
                patch.orderedTracks = ordered.tracks;
                patch.query = query;
                patch.sortSignature = target.sortSignature;
                patch.targetFiber = target.fiber;
                patch.targetChain = target.chain;
                patch.active = true;
                SmartSearch.state.filtered = ordered.tracks;
                patchNativeCache(patch, target.chain);
                SmartSearch.state.nativeAdapterMode = 'native';
                SmartSearch.state.nativeAdapterResultCount = patch.orderedRawItems.length;
                SmartSearch.state.nativeAdapterError = null;
                SmartSearch.setNativeSmartState(true);
                restoreNativeTracklistForAdapter();
                updateHeaderResultCount();
                ensureNativeListObserver();
                SmartSearch.renderSmartSearch();
                return true;
            }
            catch (error) {
                lastReason = error?.message || String(error);
                restoreNativePatch(false);
                await SmartSearch.sleep(8);
            }
        }
        SmartSearch.state.nativeAdapterMode = 'fallback';
        SmartSearch.state.nativeAdapterResultCount = SmartSearch.state.filtered.length;
        SmartSearch.state.nativeAdapterError = lastReason;
        SmartSearch.consoleWarn('Spotify native playlist list adapter was unavailable; using compatibility view.', lastReason);
        SmartSearch.renderSmartSearch();
        return false;
    }
    function nativeAdapterIsActive() {
        return SmartSearch.state.nativeAdapterMode === 'native' && Boolean(nativePatch?.active);
    }
    SmartSearch.nativeAdapterIsActive = nativeAdapterIsActive;
    function nativeAdapterStatusText() {
        if (SmartSearch.state.nativeAdapterMode === 'native')
            return `Native Spotify list · ${SmartSearch.state.nativeAdapterResultCount} results`;
        if (SmartSearch.state.nativeAdapterMode === 'attaching')
            return 'Connecting to Spotify playlist list…';
        if (SmartSearch.state.nativeAdapterMode === 'fallback')
            return `Compatibility result view${SmartSearch.state.nativeAdapterError ? ` · ${SmartSearch.state.nativeAdapterError}` : ''}`;
        return 'Idle';
    }
    SmartSearch.nativeAdapterStatusText = nativeAdapterStatusText;
    function restoreNativeTracklistForAdapter() {
        const element = SmartSearch.state.hiddenTracklist;
        if (element) {
            element.style.display = SmartSearch.state.hiddenTracklistDisplay;
            SmartSearch.state.hiddenTracklist = null;
            SmartSearch.state.hiddenTracklistDisplay = '';
        }
    }
    SmartSearch.restoreNativeTracklistForAdapter = restoreNativeTracklistForAdapter;
    async function beginNativeSmartMode(_input, query) {
        const generation = ++attachGeneration;
        SmartSearch.state.nativeAdapterMode = 'attaching';
        SmartSearch.state.nativeAdapterResultCount = SmartSearch.state.filtered.length;
        // rc.6 intercepts advanced syntax before Spotify's vanilla filter runs.
        // The input remains Spotify-controlled, but its filtering predicate is cleared
        // and Smart Search supplies the native list model directly.
        await Promise.resolve();
        if (generation !== attachGeneration || SmartSearch.state.query !== query)
            return;
        await attachNativeAdapter(query, generation);
    }
    SmartSearch.beginNativeSmartMode = beginNativeSmartMode;
    function endNativeSmartMode() {
        attachGeneration += 1;
        disconnectNativeListObserver();
        restoreNativePatch(true);
        releaseSpotifyNativeFilterSuppression();
        restoreHeaderResultCount();
        SmartSearch.state.nativeAdapterMode = 'idle';
        SmartSearch.state.nativeAdapterError = null;
        SmartSearch.state.nativeAdapterResultCount = 0;
        restoreNativeTracklistForAdapter();
        SmartSearch.setNativeSmartState(false);
    }
    SmartSearch.endNativeSmartMode = endNativeSmartMode;
    function refreshNativeForCurrentQuery(delay = 0) {
        if (!SmartSearch.smartSyntaxUsed(SmartSearch.state.query) || !SmartSearch.state.query.trim())
            return;
        const query = SmartSearch.state.query;
        const generation = ++attachGeneration;
        SmartSearch.state.nativeAdapterMode = 'attaching';
        const run = () => {
            if (generation !== attachGeneration || SmartSearch.state.query !== query)
                return;
            attachNativeAdapter(query, generation);
        };
        if (delay)
            window.setTimeout(run, delay);
        else
            queueMicrotask(run);
    }
    function maintainNativeSmartMode() {
        if (!SmartSearch.smartSyntaxUsed(SmartSearch.state.query) || !SmartSearch.state.query.trim()) {
            if (SmartSearch.state.nativeAdapterMode !== 'idle')
                endNativeSmartMode();
            primeNativeListTarget();
            return;
        }
        ensureNativeListObserver();
        if (SmartSearch.state.nativeAdapterMode === 'native' && nativePatch) {
            const target = discoverNativeTarget(false);
            if (!target)
                return;
            if (target.cache !== nativePatch.cache) {
                // Spotify occasionally remounts the native list/cache. Keep the old
                // Smart Search patch alive until the replacement is attached; do not
                // deliberately expose the vanilla single-query result for 16 ms.
                lastKnownTarget = target;
                refreshNativeForCurrentQuery(0);
                return;
            }
            if (target.sortSignature !== nativePatch.sortSignature) {
                // Reorder the already-patched cache in place. Restoring Spotify's
                // vanilla cache first is what caused the visible result flash in rc.6.
                lastKnownTarget = target;
                refreshActivePatchForTarget(target);
                return;
            }
            if (nativePatchNeedsRepair(nativePatch)) {
                // Spotify can refresh methods on the same cache object. Reinstall the
                // wrappers immediately instead of waiting for a later full reattach.
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
    SmartSearch.maintainNativeSmartMode = maintainNativeSmartMode;
    function interceptSmartInputEvent(input, event) {
        const value = input.value || '';
        if (!SmartSearch.smartSyntaxUsed(value))
            return false;
        // Advanced syntax must not reach Spotify's vanilla playlist matcher. Doing so
        // creates the brief AND-filter flash and, more importantly, a mismatched
        // playback context. Stop the native filter event while updating React's text
        // hook directly so Spotify still owns/render the input value.
        try {
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
        }
        catch { }
        suppressSpotifyNativeFilter(input, value);
        if (value !== SmartSearch.state.query)
            SmartSearch.setSmartQuery(value);
        const query = value;
        // The matcher is local/synchronous; start patching immediately and re-check on
        // the following microtask in case onClear caused Spotify to remount the list.
        beginNativeSmartMode(input, query);
        queueMicrotask(() => {
            if (SmartSearch.state.query !== query || !SmartSearch.smartSyntaxUsed(query))
                return;
            maintainNativeSmartMode();
            updateHeaderResultCount();
        });
        return true;
    }
    SmartSearch.interceptSmartInputEvent = interceptSmartInputEvent;
    function ownText(element) {
        return Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || '')
            .join('')
            .trim();
    }
    function findPlaylistSongCountElement() {
        const page = SmartSearch.findPlaylistPage();
        const tracklist = SmartSearch.findTracklistContainer();
        if (!page)
            return null;
        const trackTop = tracklist?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
        let best = null;
        let bestScore = -1;
        for (const element of [...page.querySelectorAll('span,div,p')]) {
            const text = ownText(element);
            if (!text || text.length > 120 || !/\b\d[\d,.\s]*\s+(songs?|tracks?)\b/i.test(text))
                continue;
            const rect = element.getBoundingClientRect();
            if (rect.top > trackTop)
                continue;
            let score = 10;
            if (/saves?|followers?/i.test(text))
                score += 3;
            if (/min|hr|sec/i.test(text))
                score += 2;
            if (element.children.length === 0)
                score += 1;
            if (score > bestScore) {
                best = element;
                bestScore = score;
            }
        }
        return best;
    }
    function updateHeaderResultCount() {
        if (!SmartSearch.smartSyntaxUsed(SmartSearch.state.query) || SmartSearch.state.nativeAdapterMode !== 'native')
            return;
        const count = SmartSearch.state.nativeAdapterResultCount || SmartSearch.state.filtered.length;
        const element = headerCountElement && document.contains(headerCountElement)
            ? headerCountElement
            : findPlaylistSongCountElement();
        if (!element)
            return;
        if (element !== headerCountElement) {
            headerCountElement = element;
            headerCountOriginalText = ownText(element) || element.textContent || '';
        }
        const current = ownText(element) || element.textContent || '';
        const source = headerCountOriginalText || current;
        const next = source.replace(/\b\d[\d,.\s]*(?=\s+(?:songs?|tracks?)\b)/i, String(count));
        if (next && element.textContent !== next)
            element.textContent = next;
    }
    SmartSearch.updateHeaderResultCount = updateHeaderResultCount;
    function restoreHeaderResultCount() {
        if (headerCountElement && document.contains(headerCountElement) && headerCountOriginalText) {
            try {
                headerCountElement.textContent = headerCountOriginalText;
            }
            catch { }
        }
        headerCountElement = null;
        headerCountOriginalText = '';
    }
    function smartResultIndexForRow(row) {
        // Spotify's aria-rowindex is the authoritative position in the currently
        // rendered (and already Smart-Search-patched) native list. Prefer it over
        // URI discovery: React ancestors can contain the currently playing track
        // or other shared context URIs, and duplicate playlist entries may share
        // the same track URI. Spotify reserves row 1 for the column header, so the
        // first track row is aria-rowindex=2.
        const rowIndex = Number(row.getAttribute('aria-rowindex'));
        if (Number.isInteger(rowIndex)) {
            const filteredIndex = rowIndex - 2;
            if (filteredIndex >= 0 && filteredIndex < SmartSearch.state.filtered.length)
                return filteredIndex;
        }
        // Fallback only to a URI physically contained in this row. Do not walk
        // ancestors/siblings here because their React props include player/context
        // state and can resolve every row to the same currently-playing track.
        const href = row.querySelector('a[href*="/track/"]')?.getAttribute('href') || '';
        const match = href.match(/\/track\/([A-Za-z0-9]+)/);
        if (match) {
            const uri = `spotify:track:${match[1]}`;
            const index = SmartSearch.state.filtered.findIndex((track) => track.uri === uri);
            if (index >= 0)
                return index;
        }
        return null;
    }
    function isRowPlayButton(target, row) {
        const button = target.closest('button');
        if (!button || !row.contains(button))
            return false;
        const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();
        if (/play|pause/.test(label))
            return true;
        return Boolean(button.closest('.main-trackList-rowImagePlayButton,.main-trackList-rowPlayPauseButton'));
    }
    function isPlaylistMainPlayButton(target) {
        const button = target.closest('button');
        if (!button || SmartSearch.findTracklistContainer()?.contains(button))
            return false;
        const page = SmartSearch.findPlaylistPage();
        if (!page?.contains(button))
            return false;
        const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();
        const cls = button.className?.toString?.().toLowerCase?.() || '';
        return /(^|\s)play(\s|$)|play playlist/.test(label) || /playbutton/.test(cls);
    }
    function interceptNativePlayback(event) {
        if (!nativeAdapterIsActive() || !SmartSearch.state.query || !SmartSearch.smartSyntaxUsed(SmartSearch.state.query))
            return;
        const target = event.target;
        if (!target)
            return;
        const row = target.closest('[role="row"],.main-trackList-trackListRow');
        let shouldPlay = false;
        let index = 0;
        if (row) {
            if (event.type === 'dblclick')
                shouldPlay = true;
            else if (event.type === 'click' && isRowPlayButton(target, row))
                shouldPlay = true;
            else if (event.type === 'keydown' && event.key === 'Enter')
                shouldPlay = true;
            if (shouldPlay) {
                const resolvedIndex = smartResultIndexForRow(row);
                if (resolvedIndex === null)
                    return;
                index = resolvedIndex;
            }
        }
        else if (event.type === 'click' && isPlaylistMainPlayButton(target)) {
            shouldPlay = true;
            index = 0;
        }
        if (!shouldPlay)
            return;
        try {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        }
        catch { }
        void SmartSearch.playFilteredRespectingSpotify(index);
    }
    function installNativePlaybackBridge() {
        document.addEventListener('click', interceptNativePlayback, true);
        document.addEventListener('dblclick', interceptNativePlayback, true);
        document.addEventListener('keydown', interceptNativePlayback, true);
    }
    function installNativeSortRefresh() {
        document.addEventListener('click', (event) => {
            if (!nativeAdapterIsActive() || !SmartSearch.state.query)
                return;
            const target = event.target;
            const control = target?.closest?.('[role="columnheader"], [aria-sort], button[role="combobox"]');
            if (!control || !SmartSearch.findPlaylistPage()?.contains(control))
                return;
            if (sortRefreshTimer !== null)
                window.clearTimeout(sortRefreshTimer);
            // Let Spotify update sortState, but keep the Smart Search cache patched
            // during that transition so the vanilla filter never flashes on screen.
            sortRefreshTimer = window.setTimeout(() => {
                sortRefreshTimer = null;
                const latest = discoverNativeTarget(true);
                if (latest)
                    lastKnownTarget = latest;
                maintainNativeSmartMode();
            }, 0);
        }, true);
    }
    installNativeSortRefresh();
    installNativePlaybackBridge();
})(SmartSearch || (SmartSearch = {}));
var SmartSearch;
(function (SmartSearch) {
    let settingsMenuItem = null;
    function formatDuration(ms) {
        const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }
    function formatAddedDate(value) {
        if (!value)
            return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            return '';
        try {
            return new Intl.DateTimeFormat(navigator.language || 'en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
        }
        catch {
            return date.toLocaleDateString();
        }
    }
    function injectStyles() {
        if (document.getElementById(SmartSearch.STYLE_ID))
            return;
        const style = document.createElement('style');
        style.id = SmartSearch.STYLE_ID;
        style.textContent = `
#${SmartSearch.RESULTS_HOST_ID}{display:block;width:100%;color:var(--spice-text,#fff);font-family:var(--encore-body-font-stack,inherit);contain:layout style}
#${SmartSearch.RESULTS_HOST_ID}[hidden]{display:none!important}
#${SmartSearch.RESULTS_HOST_ID} *{box-sizing:border-box}
.smart-search-native-active{box-shadow:0 0 0 1px var(--spice-button,#1ed760)!important}
.ss1-shell{width:100%;padding:0 8px 18px}
.ss1-toolbar{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 8px 8px 12px;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}
.ss1-summary{display:flex;align-items:center;gap:9px;min-width:0;color:var(--spice-subtext,#b3b3b3);font-size:13px}
.ss1-summary strong{color:var(--spice-text,#fff);font-size:14px}
.ss1-smart-dot{width:8px;height:8px;border-radius:50%;background:var(--spice-button,#1ed760);box-shadow:0 0 0 3px color-mix(in srgb,var(--spice-button,#1ed760) 18%,transparent)}
.ss1-progress{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss1-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.ss1-button{min-height:32px;border:0;border-radius:999px;padding:0 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:transform 80ms ease,background-color 120ms ease,opacity 120ms ease;color:var(--spice-text,#fff);background:color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}
.ss1-button:hover:not(:disabled){background:color-mix(in srgb,var(--spice-text,#fff) 17%,transparent);transform:scale(1.02)}
.ss1-button:active:not(:disabled){transform:scale(.98)}
.ss1-button:focus-visible{outline:2px solid var(--spice-text,#fff);outline-offset:2px}
.ss1-button.primary{background:var(--spice-button,#1ed760);color:var(--spice-button-active,#000)}
.ss1-button.primary:hover:not(:disabled){background:var(--spice-button,#1ed760);filter:brightness(1.08)}
.ss1-button.icon{width:32px;padding:0;display:grid;place-items:center;font-size:18px;line-height:1}
.ss1-button:disabled{opacity:.45;cursor:default;transform:none}
.ss1-status{padding:18px 12px;color:var(--spice-subtext,#b3b3b3);font-size:14px}
.ss1-status.error{color:#f15e6c;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ss1-column-header,.ss1-row{display:grid;grid-template-columns:42px minmax(240px,2fr) minmax(170px,1fr) minmax(135px,.8fr) 64px;align-items:center;column-gap:12px}
.ss1-column-header{position:sticky;top:0;z-index:2;min-height:36px;padding:0 12px;color:var(--spice-subtext,#b3b3b3);font-size:12px;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent);background:var(--spice-main,#121212)}
.ss1-row{position:relative;min-height:56px;padding:4px 12px;border-radius:4px;color:var(--spice-text,#fff)}
.ss1-row:hover,.ss1-row:focus-within{background:color-mix(in srgb,var(--spice-text,#fff) 9%,transparent)}
.ss1-row.is-playing .ss1-title{color:var(--spice-button,#1ed760)}
.ss1-row-number{position:relative;text-align:right;color:var(--spice-subtext,#b3b3b3);font-variant-numeric:tabular-nums}
.ss1-row-play{position:absolute;right:-2px;top:50%;translate:0 -50%;display:none;width:28px;height:28px;border:0;background:transparent;color:var(--spice-text,#fff);cursor:pointer;font-size:15px}
.ss1-row:hover .ss1-row-index,.ss1-row:focus-within .ss1-row-index{visibility:hidden}
.ss1-row:hover .ss1-row-play,.ss1-row:focus-within .ss1-row-play{display:block}
.ss1-title-cell{display:flex;align-items:center;gap:12px;min-width:0}
.ss1-cover{width:40px;height:40px;border-radius:4px;object-fit:cover;background:#282828;flex:0 0 auto}
.ss1-cover-placeholder{width:40px;height:40px;border-radius:4px;background:#282828;flex:0 0 auto}
.ss1-title-stack,.ss1-title,.ss1-artists,.ss1-album,.ss1-added{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss1-title{font-size:14px}
.ss1-artists,.ss1-album,.ss1-added,.ss1-duration{font-size:12px;color:var(--spice-subtext,#b3b3b3)}
.ss1-duration{text-align:right;font-variant-numeric:tabular-nums}
.ss1-sentinel{height:1px}
.ss1-help{padding:12px;color:var(--spice-subtext,#b3b3b3);font-size:11px;line-height:1.5;border-top:1px solid color-mix(in srgb,var(--spice-text,#fff) 8%,transparent)}
.ss1-help code{color:var(--spice-text,#fff)}
.ss1-collapsed-note{padding:14px 12px;color:var(--spice-subtext,#b3b3b3);font-size:12px}
.ss1-settings{min-width:min(520px,76vw);color:var(--spice-text,#fff)}
.ss1-settings-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}
.ss1-settings-copy{min-width:0}.ss1-settings-title{font-weight:700}.ss1-settings-desc{margin-top:3px;color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.4}
.ss1-toggle{min-width:48px;height:28px;border:0;border-radius:999px;padding:3px;background:#535353;cursor:pointer;position:relative;flex:0 0 auto}
.ss1-toggle::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform 120ms ease}
.ss1-toggle[aria-pressed='true']{background:var(--spice-button,#1ed760)}.ss1-toggle[aria-pressed='true']::after{transform:translateX(20px)}
.ss1-settings-syntax{padding-top:16px;color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.7}.ss1-settings-syntax code{color:var(--spice-text,#fff)}
.ss1-probe-box{margin-top:18px;padding:14px;border-radius:8px;background:color-mix(in srgb,var(--spice-text,#fff) 6%,transparent)}
.ss1-probe-title{font-weight:700;margin-bottom:5px}.ss1-probe-desc,.ss1-probe-status{color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.5}
.ss1-probe-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ss1-version{margin-top:16px;color:var(--spice-subtext,#b3b3b3);font-size:11px}
.ss1-support{margin-top:16px;padding-top:16px;border-top:1px solid color-mix(in srgb,var(--spice-text,#fff) 10%,transparent)}
.ss1-support-title{font-weight:700}.ss1-support-desc{margin-top:4px;color:var(--spice-subtext,#b3b3b3);font-size:12px;line-height:1.5}
.ss1-support-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ss1-support-link{text-decoration:none}
@media(max-width:1000px){.ss1-column-header,.ss1-row{grid-template-columns:38px minmax(220px,2fr) minmax(150px,1fr) 60px}.ss1-date-column{display:none}}
@media(max-width:760px){.ss1-toolbar{align-items:flex-start;flex-direction:column}.ss1-actions{width:100%}.ss1-column-header,.ss1-row{grid-template-columns:34px minmax(180px,1fr) 56px}.ss1-album-column,.ss1-date-column{display:none}.ss1-shell{padding-left:0;padding-right:0}}
`;
        document.head.appendChild(style);
    }
    SmartSearch.injectStyles = injectStyles;
    function findPlaylistPage() {
        return document.querySelector('[data-testid="playlist-page"]') || document.querySelector('main');
    }
    SmartSearch.findPlaylistPage = findPlaylistPage;
    function findTracklistContainer() {
        const page = findPlaylistPage();
        if (!page)
            return null;
        return page.querySelector('[data-testid="playlist-tracklist"]')
            || page.querySelector('.main-trackList-trackList')
            || page.querySelector('[role="grid"]');
    }
    SmartSearch.findTracklistContainer = findTracklistContainer;
    function restoreNativeTracklist() {
        if (!SmartSearch.state.hiddenTracklist)
            return;
        SmartSearch.state.hiddenTracklist.style.display = SmartSearch.state.hiddenTracklistDisplay;
        SmartSearch.state.hiddenTracklist = null;
        SmartSearch.state.hiddenTracklistDisplay = '';
    }
    SmartSearch.restoreNativeTracklist = restoreNativeTracklist;
    function hideNativeTracklist() {
        const tracklist = findTracklistContainer();
        if (!tracklist)
            return;
        if (SmartSearch.state.hiddenTracklist && SmartSearch.state.hiddenTracklist !== tracklist)
            restoreNativeTracklist();
        if (SmartSearch.state.hiddenTracklist === tracklist) {
            if (tracklist.style.display !== 'none')
                tracklist.style.display = 'none';
            return;
        }
        SmartSearch.state.hiddenTracklist = tracklist;
        SmartSearch.state.hiddenTracklistDisplay = tracklist.style.display || '';
        tracklist.style.display = 'none';
    }
    function setNativeSmartState(active) {
        SmartSearch.state.nativeSearchInput?.classList.toggle('smart-search-native-active', active);
    }
    SmartSearch.setNativeSmartState = setNativeSmartState;
    function ensureHost() {
        let host = document.getElementById(SmartSearch.RESULTS_HOST_ID);
        const tracklist = findTracklistContainer();
        const page = findPlaylistPage();
        const anchorParent = tracklist?.parentElement || page;
        if (!anchorParent)
            return null;
        if (!host) {
            host = document.createElement('div');
            host.id = SmartSearch.RESULTS_HOST_ID;
            host.setAttribute('role', 'region');
            host.setAttribute('aria-label', 'Smart Search results');
            host.innerHTML = `<div class="ss1-shell">
        <div class="ss1-toolbar" hidden>
          <div class="ss1-summary"><span class="ss1-smart-dot" aria-hidden="true"></span><strong>Smart Search</strong><span class="ss1-count"></span><span class="ss1-progress"></span></div>
          <div class="ss1-actions">
            <button class="ss1-button primary" data-action="play" type="button">▶ Play results</button>
            <button class="ss1-button" data-action="shuffle" type="button">⇄ Shuffle</button>
            <button class="ss1-button icon" data-action="collapse" type="button" aria-label="Collapse results" title="Collapse results">⌃</button>
          </div>
        </div>
        <div class="ss1-body" hidden>
          <div class="ss1-column-header"><span>#</span><span>Title</span><span class="ss1-album-column">Album</span><span class="ss1-date-column">Date added</span><span style="text-align:right">Time</span></div>
          <div class="ss1-status" hidden></div>
          <div class="ss1-results"></div>
          <div class="ss1-sentinel"></div>
          <div class="ss1-help" hidden>Advanced syntax: <code>Artist A;Artist B</code> either artist · <code>@Artist</code> exact artist · <code>@A & @B</code> both artists · <code>-term</code> exclude · <code>artist:</code> / <code>title:</code> / <code>album:</code> / <code>year:</code></div>
        </div>
        <div class="ss1-collapsed-note" hidden>Results are collapsed. Playback still uses the full Smart Search result set.</div>
      </div>`;
            anchorParent.insertBefore(host, tracklist || null);
            SmartSearch.state.resultsHost = host;
            SmartSearch.state.resultsList = host.querySelector('.ss1-results');
            SmartSearch.state.resultsSentinel = host.querySelector('.ss1-sentinel');
            try {
                SmartSearch.state.resultsObserver?.disconnect();
            }
            catch { }
            SmartSearch.state.resultsObserver = null;
            host.querySelector('[data-action="play"]')?.addEventListener('click', () => SmartSearch.playFiltered(0, false));
            host.querySelector('[data-action="shuffle"]')?.addEventListener('click', () => SmartSearch.playFiltered(0, true));
            host.querySelector('[data-action="collapse"]')?.addEventListener('click', () => {
                const config = SmartSearch.updateConfig({ resultsCollapsed: !SmartSearch.loadConfig().resultsCollapsed });
                renderSmartSearch(config);
            });
            SmartSearch.state.resultsObserver = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting))
                    appendResultChunk();
            }, { root: null, rootMargin: '500px 0px' });
            if (SmartSearch.state.resultsSentinel)
                SmartSearch.state.resultsObserver.observe(SmartSearch.state.resultsSentinel);
        }
        else if (host.parentElement !== anchorParent || (tracklist && host.nextSibling !== tracklist)) {
            anchorParent.insertBefore(host, tracklist || null);
        }
        SmartSearch.state.resultsHost = host;
        return host;
    }
    function createResultRow(track, resultIndex) {
        const row = document.createElement('div');
        row.className = 'ss1-row';
        row.tabIndex = 0;
        row.dataset.uri = track.uri;
        row.setAttribute('aria-label', `${track.title} — ${track.artists.join(', ')}`);
        const number = document.createElement('div');
        number.className = 'ss1-row-number';
        const index = document.createElement('span');
        index.className = 'ss1-row-index';
        index.textContent = String(resultIndex + 1);
        const playButton = document.createElement('button');
        playButton.className = 'ss1-row-play';
        playButton.type = 'button';
        playButton.textContent = '▶';
        playButton.title = `Play ${track.title}`;
        playButton.setAttribute('aria-label', `Play ${track.title}`);
        playButton.addEventListener('click', (event) => {
            event.stopPropagation();
            SmartSearch.playFiltered(resultIndex, false);
        });
        number.append(index, playButton);
        const titleCell = document.createElement('div');
        titleCell.className = 'ss1-title-cell';
        if (track.image) {
            const image = document.createElement('img');
            image.className = 'ss1-cover';
            image.src = track.image;
            image.alt = '';
            image.loading = 'lazy';
            image.referrerPolicy = 'no-referrer';
            titleCell.appendChild(image);
        }
        else {
            const placeholder = document.createElement('div');
            placeholder.className = 'ss1-cover-placeholder';
            titleCell.appendChild(placeholder);
        }
        const titleStack = document.createElement('div');
        titleStack.className = 'ss1-title-stack';
        const title = document.createElement('div');
        title.className = 'ss1-title';
        title.textContent = track.title;
        const artists = document.createElement('div');
        artists.className = 'ss1-artists';
        artists.textContent = track.artists.join(', ');
        titleStack.append(title, artists);
        titleCell.appendChild(titleStack);
        const album = document.createElement('div');
        album.className = 'ss1-album ss1-album-column';
        album.textContent = track.album;
        const added = document.createElement('div');
        added.className = 'ss1-added ss1-date-column';
        added.textContent = formatAddedDate(track.addedAt);
        const duration = document.createElement('div');
        duration.className = 'ss1-duration';
        duration.textContent = formatDuration(track.duration);
        row.append(number, titleCell, album, added, duration);
        row.addEventListener('dblclick', () => SmartSearch.playFiltered(resultIndex, false));
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                SmartSearch.playFiltered(resultIndex, false);
            }
        });
        return row;
    }
    function appendResultChunk() {
        const list = SmartSearch.state.resultsList;
        if (!list || SmartSearch.loadConfig().resultsCollapsed || !SmartSearch.state.query)
            return;
        const end = Math.min(SmartSearch.state.filtered.length, SmartSearch.state.renderedCount + SmartSearch.RENDER_CHUNK);
        if (end <= SmartSearch.state.renderedCount)
            return;
        const fragment = document.createDocumentFragment();
        for (let index = SmartSearch.state.renderedCount; index < end; index += 1)
            fragment.appendChild(createResultRow(SmartSearch.state.filtered[index], index));
        list.appendChild(fragment);
        SmartSearch.state.renderedCount = end;
        updatePlayingRowStyles();
    }
    function resetRenderedResults() {
        SmartSearch.state.renderedCount = 0;
        SmartSearch.state.resultsList?.replaceChildren();
        appendResultChunk();
    }
    function updatePlayingRowStyles() {
        const currentUri = SmartSearch.S?.Player?.data?.item?.uri || '';
        SmartSearch.state.resultsHost?.querySelectorAll('.ss1-row').forEach((row) => row.classList.toggle('is-playing', Boolean(currentUri && row.dataset.uri === currentUri)));
    }
    SmartSearch.updatePlayingRowStyles = updatePlayingRowStyles;
    function updatePlaybackUi() {
        const host = SmartSearch.state.resultsHost;
        if (!host)
            return;
        const play = host.querySelector('[data-action="play"]');
        const shuffle = host.querySelector('[data-action="shuffle"]');
        const progress = host.querySelector('.ss1-progress');
        const disabled = SmartSearch.state.playbackBusy || !SmartSearch.state.filtered.length;
        if (play) {
            play.disabled = disabled;
            play.textContent = SmartSearch.state.playbackBusy ? 'Starting…' : '▶ Play results';
        }
        if (shuffle)
            shuffle.disabled = disabled;
        if (progress) {
            const session = SmartSearch.state.playbackSession;
            const belongsToCurrentResults = session?.active && session.query === SmartSearch.state.query && session.sequence.length > 0 && SmartSearch.state.filtered.length > 0;
            progress.textContent = belongsToCurrentResults && session.currentIndex >= 0 ? `· Playing ${Math.min(session.currentIndex + 1, session.sequence.length)}/${session.sequence.length}` : '';
        }
        updatePlayingRowStyles();
    }
    SmartSearch.updatePlaybackUi = updatePlaybackUi;
    function renderSmartSearch(config = SmartSearch.loadConfig()) {
        const active = config.enabled && Boolean(SmartSearch.state.query.trim()) && SmartSearch.smartSyntaxUsed(SmartSearch.state.query);
        // Native mode owns Spotify's original tracklist. Do not add a parallel result
        // surface when the private native adapter is healthy.
        if (active && (SmartSearch.state.nativeAdapterMode === 'native' || SmartSearch.state.nativeAdapterMode === 'attaching')) {
            restoreNativeTracklist();
            const existing = document.getElementById(SmartSearch.RESULTS_HOST_ID);
            if (existing)
                existing.hidden = true;
            setNativeSmartState(true);
            return;
        }
        const host = ensureHost();
        if (!host)
            return;
        const toolbar = host.querySelector('.ss1-toolbar');
        const body = host.querySelector('.ss1-body');
        const status = host.querySelector('.ss1-status');
        const count = host.querySelector('.ss1-count');
        const help = host.querySelector('.ss1-help');
        const collapsedNote = host.querySelector('.ss1-collapsed-note');
        const collapse = host.querySelector('[data-action="collapse"]');
        host.hidden = !active;
        if (!active) {
            if (toolbar)
                toolbar.hidden = true;
            if (body)
                body.hidden = true;
            if (collapsedNote)
                collapsedNote.hidden = true;
            setNativeSmartState(false);
            restoreNativeTracklist();
            return;
        }
        // Compatibility mode is deliberately secondary. It keeps rc.3's proven
        // renderer/playback available when a Spotify update changes the private
        // native list contract.
        setNativeSmartState(true);
        hideNativeTracklist();
        if (toolbar)
            toolbar.hidden = false;
        if (count)
            count.textContent = `${SmartSearch.state.filtered.length} result${SmartSearch.state.filtered.length === 1 ? '' : 's'} · compatibility mode`;
        if (collapse) {
            collapse.textContent = config.resultsCollapsed ? '⌄' : '⌃';
            collapse.title = config.resultsCollapsed ? 'Expand results' : 'Collapse results';
            collapse.setAttribute('aria-label', collapse.title);
        }
        if (config.resultsCollapsed) {
            if (body)
                body.hidden = true;
            if (collapsedNote)
                collapsedNote.hidden = false;
        }
        else {
            if (body)
                body.hidden = false;
            if (collapsedNote)
                collapsedNote.hidden = true;
            if (help)
                help.hidden = !config.showSyntaxHelp;
            if (status) {
                status.hidden = true;
                status.className = 'ss1-status';
            }
            if (SmartSearch.state.loading) {
                if (status) {
                    status.hidden = false;
                    status.textContent = 'Loading playlist…';
                }
            }
            else if (SmartSearch.state.lastError || SmartSearch.state.nativeAdapterError) {
                if (status) {
                    status.hidden = false;
                    status.className = 'ss1-status error';
                    status.replaceChildren();
                    const text = document.createElement('span');
                    text.textContent = 'Spotify native list integration was unavailable, so Smart Search is using its compatibility view.';
                    const retry = document.createElement('button');
                    retry.className = 'ss1-button';
                    retry.type = 'button';
                    retry.textContent = 'Retry native mode';
                    retry.addEventListener('click', () => {
                        const input = SmartSearch.state.nativeSearchInput;
                        if (input && SmartSearch.state.query)
                            SmartSearch.beginNativeSmartMode(input, SmartSearch.state.query);
                    });
                    status.append(text, retry);
                }
            }
            else if (!SmartSearch.state.filtered.length) {
                if (status) {
                    status.hidden = false;
                    status.textContent = 'No matching tracks';
                }
            }
            resetRenderedResults();
        }
        updatePlaybackUi();
    }
    SmartSearch.renderSmartSearch = renderSmartSearch;
    function setSmartQuery(query) {
        SmartSearch.state.query = String(query ?? '');
        try {
            const ast = SmartSearch.parseQuery(SmartSearch.state.query);
            SmartSearch.state.filtered = SmartSearch.state.query.trim() && SmartSearch.smartSyntaxUsed(SmartSearch.state.query) ? SmartSearch.state.tracks.filter((track) => SmartSearch.matchNode(track, ast)) : [];
            if (!SmartSearch.state.loading && SmartSearch.state.tracks.length)
                SmartSearch.state.lastError = null;
        }
        catch (error) {
            SmartSearch.state.filtered = [];
            SmartSearch.state.lastError = `Invalid query: ${error?.message || error}`;
        }
        renderSmartSearch();
    }
    SmartSearch.setSmartQuery = setSmartQuery;
    function nativeSearchCandidates() {
        const page = findPlaylistPage();
        if (!page)
            return [];
        return [...page.querySelectorAll('input')].filter((input) => {
            const hint = `${input.getAttribute('placeholder') || ''} ${input.getAttribute('aria-label') || ''}`.toLocaleLowerCase();
            return input.getAttribute('role') === 'searchbox' || hint.includes('playlist') || input.classList.contains('x-filterBox-filterInput');
        });
    }
    function detachNativeSearch() {
        if (SmartSearch.state.nativeSearchInput && SmartSearch.state.nativeSearchListener) {
            SmartSearch.state.nativeSearchInput.removeEventListener('input', SmartSearch.state.nativeSearchListener, true);
            SmartSearch.state.nativeSearchInput.removeEventListener('change', SmartSearch.state.nativeSearchListener, true);
        }
        SmartSearch.state.nativeSearchInput?.classList.remove('smart-search-native-active');
        SmartSearch.state.nativeSearchInput = null;
        SmartSearch.state.nativeSearchListener = null;
    }
    function syncNativeSearchValue(candidate, event) {
        const value = candidate.value || '';
        if (event && SmartSearch.smartSyntaxUsed(value) && SmartSearch.interceptSmartInputEvent(candidate, event))
            return;
        if (SmartSearch.smartSyntaxUsed(value)) {
            if (value !== SmartSearch.state.query) {
                setSmartQuery(value);
                SmartSearch.beginNativeSmartMode(candidate, value);
            }
            return;
        }
        // Keep a warm reference to Spotify's real list model while the native
        // search is still ordinary/empty. This makes the advanced-query handoff
        // effectively immediate even when Spotify remounts the filtered grid.
        SmartSearch.primeNativeListTarget();
        if (SmartSearch.state.query) {
            // A React remount can momentarily recreate the controlled input with the
            // native (blank) filter state while Smart mode is active. Real user edits
            // arrive as input/change events; polling must not mistake a remount for a
            // clear action.
            if (!event && (SmartSearch.state.nativeAdapterMode === 'native' || SmartSearch.state.nativeAdapterMode === 'attaching'))
                return;
            SmartSearch.endNativeSmartMode();
            setSmartQuery('');
        }
    }
    function hookNativeSearch() {
        const config = SmartSearch.loadConfig();
        if (!config.enabled) {
            detachNativeSearch();
            return;
        }
        const candidate = nativeSearchCandidates()[0] || null;
        if (!candidate) {
            if (!SmartSearch.state.nativeSearchMissingSince)
                SmartSearch.state.nativeSearchMissingSince = Date.now();
            if (SmartSearch.state.query && Date.now() - SmartSearch.state.nativeSearchMissingSince > 1000) {
                SmartSearch.endNativeSmartMode();
                setSmartQuery('');
            }
            return;
        }
        SmartSearch.state.nativeSearchMissingSince = 0;
        if (candidate === SmartSearch.state.nativeSearchInput) {
            syncNativeSearchValue(candidate);
            return;
        }
        detachNativeSearch();
        const listener = (event) => syncNativeSearchValue(candidate, event);
        candidate.addEventListener('input', listener, true);
        candidate.addEventListener('change', listener, true);
        SmartSearch.state.nativeSearchInput = candidate;
        SmartSearch.state.nativeSearchListener = listener;
        syncNativeSearchValue(candidate);
    }
    SmartSearch.hookNativeSearch = hookNativeSearch;
    function maintainUiBindings() {
        const hadHost = Boolean(document.getElementById(SmartSearch.RESULTS_HOST_ID));
        hookNativeSearch();
        SmartSearch.maintainNativeSmartMode();
        const active = SmartSearch.loadConfig().enabled && Boolean(SmartSearch.state.query.trim()) && SmartSearch.smartSyntaxUsed(SmartSearch.state.query);
        if (active && SmartSearch.state.nativeAdapterMode === 'fallback') {
            ensureHost();
            hideNativeTracklist();
            setNativeSmartState(true);
        }
        else if (active) {
            restoreNativeTracklist();
            setNativeSmartState(true);
        }
        if (!hadHost && SmartSearch.state.resultsHost)
            renderSmartSearch();
    }
    SmartSearch.maintainUiBindings = maintainUiBindings;
    function clearUiForNonPlaylist() {
        SmartSearch.endNativeSmartMode();
        detachNativeSearch();
        restoreNativeTracklist();
        SmartSearch.state.query = '';
        SmartSearch.state.filtered = [];
        SmartSearch.state.nativeSearchMissingSince = 0;
        document.getElementById(SmartSearch.RESULTS_HOST_ID)?.remove();
        SmartSearch.state.resultsHost = null;
        SmartSearch.state.resultsList = null;
        SmartSearch.state.resultsSentinel = null;
        try {
            SmartSearch.state.resultsObserver?.disconnect();
        }
        catch { }
        SmartSearch.state.resultsObserver = null;
        SmartSearch.state.renderedCount = 0;
    }
    SmartSearch.clearUiForNonPlaylist = clearUiForNonPlaylist;
    function createSettingsToggle(parent, title, description, key) {
        const row = document.createElement('div');
        row.className = 'ss1-settings-row';
        const copy = document.createElement('div');
        copy.className = 'ss1-settings-copy';
        const heading = document.createElement('div');
        heading.className = 'ss1-settings-title';
        heading.textContent = title;
        const detail = document.createElement('div');
        detail.className = 'ss1-settings-desc';
        detail.textContent = description;
        copy.append(heading, detail);
        const toggle = document.createElement('button');
        toggle.className = 'ss1-toggle';
        toggle.type = 'button';
        toggle.setAttribute('role', 'switch');
        const refresh = () => {
            const value = Boolean(SmartSearch.loadConfig()[key]);
            toggle.setAttribute('aria-pressed', String(value));
            toggle.setAttribute('aria-checked', String(value));
            toggle.setAttribute('aria-label', `${title}: ${value ? 'on' : 'off'}`);
        };
        refresh();
        toggle.addEventListener('click', () => {
            const current = SmartSearch.loadConfig();
            SmartSearch.updateConfig({ [key]: !current[key] });
            refresh();
            applyConfiguration();
        });
        row.append(copy, toggle);
        parent.appendChild(row);
    }
    function showSettings() {
        const content = document.createElement('div');
        content.className = 'ss1-settings';
        createSettingsToggle(content, 'Enabled', 'Use Smart Search on playlist pages.', 'enabled');
        createSettingsToggle(content, 'Collapse results by default', 'Keep the result list compact while preserving filtered playback.', 'resultsCollapsed');
        createSettingsToggle(content, 'Show syntax help', 'Show a small advanced-query reminder below results.', 'showSyntaxHelp');
        const syntax = document.createElement('div');
        syntax.className = 'ss1-settings-syntax';
        syntax.innerHTML = '<strong>Advanced syntax</strong><br><code>Quevedo;Mora</code> — either artist<br><code>@Mora</code> — exact artist<br><code>@Quevedo & @Mora</code> — both credited artists<br><code>-live</code> — exclude a term<br><code>artist:</code> / <code>title:</code> / <code>album:</code> / <code>year:</code> — field filters';
        content.appendChild(syntax);
        const nativeBox = document.createElement('div');
        nativeBox.className = 'ss1-probe-box';
        const nativeTitle = document.createElement('div');
        nativeTitle.className = 'ss1-probe-title';
        nativeTitle.textContent = 'Spotify integration';
        const nativeDesc = document.createElement('div');
        nativeDesc.className = 'ss1-probe-desc';
        nativeDesc.textContent = 'Smart Search uses Spotify’s native playlist rows, sorting and playback context when the current client exposes the compatible list model. A compatibility result view is used automatically if that private API changes.';
        const nativeStatus = document.createElement('div');
        nativeStatus.className = 'ss1-probe-status';
        nativeStatus.style.marginTop = '7px';
        nativeStatus.textContent = SmartSearch.nativeAdapterStatusText();
        nativeBox.append(nativeTitle, nativeDesc, nativeStatus);
        content.appendChild(nativeBox);
        const support = document.createElement('div');
        support.className = 'ss1-support';
        const supportTitle = document.createElement('div');
        supportTitle.className = 'ss1-support-title';
        supportTitle.textContent = 'Support & feedback';
        const supportDesc = document.createElement('div');
        supportDesc.className = 'ss1-support-desc';
        supportDesc.textContent = 'Found a bug or have an idea? Use GitHub Issues so reports and suggestions can be tracked publicly.';
        const supportActions = document.createElement('div');
        supportActions.className = 'ss1-support-actions';
        const makeSupportLink = (label, url) => {
            const link = document.createElement('a');
            link.className = 'ss1-button ss1-support-link';
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = label;
            return link;
        };
        supportActions.append(
            makeSupportLink('Report a bug', SmartSearch.BUG_REPORT_URL),
            makeSupportLink('Suggest a feature', SmartSearch.FEATURE_REQUEST_URL),
            makeSupportLink('View on GitHub', SmartSearch.PROJECT_URL),
        );
        support.append(supportTitle, supportDesc, supportActions);
        content.appendChild(support);

        const version = document.createElement('div');
        version.className = 'ss1-version';
        version.textContent = `Smart Search ${SmartSearch.VERSION} · native-list release candidate · local-only, no telemetry.`;
        content.appendChild(version);
        SmartSearch.S?.PopupModal?.display?.({ title: 'Smart Search', content, isLarge: false });
    }
    SmartSearch.showSettings = showSettings;
    function registerSettingsMenu() {
        if (settingsMenuItem)
            return true;
        if (!SmartSearch.S?.Menu?.Item)
            return false;
        try {
            settingsMenuItem = new SmartSearch.S.Menu.Item('Smart Search settings', false, () => showSettings(), 'search');
            settingsMenuItem.register();
            return true;
        }
        catch (error) {
            // Profile-menu registration is optional and must never prevent the
            // search engine from starting if Spotify is still initializing it.
            settingsMenuItem = null;
            SmartSearch.consoleWarn('Settings menu is not ready yet; Smart Search will retry later.', error);
            return false;
        }
    }
    SmartSearch.registerSettingsMenu = registerSettingsMenu;
    function registerSettingsMenuDeferred() {
        let attempts = 0;
        const maxAttempts = 40;
        const attempt = () => {
            if (settingsMenuItem)
                return;
            attempts += 1;
            let wrapperReady = false;
            try {
                wrapperReady = Boolean(SmartSearch.S?.Menu?.Item);
            }
            catch {
                wrapperReady = false;
            }
            if (wrapperReady && registerSettingsMenu())
                return;
            if (attempts < maxAttempts)
                window.setTimeout(attempt, 500);
            else
                SmartSearch.consoleWarn('Settings menu could not be registered; core Smart Search remains available.');
        };
        // Do not compete with Spotify/Spicetify's own startup React module loading.
        window.setTimeout(attempt, 1000);
    }
    SmartSearch.registerSettingsMenuDeferred = registerSettingsMenuDeferred;
    function applyConfiguration() {
        const config = SmartSearch.loadConfig();
        if (!config.enabled) {
            SmartSearch.endNativeSmartMode();
            detachNativeSearch();
            if (SmartSearch.state.playbackSession)
                SmartSearch.state.playbackSession.active = false;
            SmartSearch.state.query = '';
            SmartSearch.state.filtered = [];
            SmartSearch.state.nativeSearchMissingSince = 0;
            restoreNativeTracklist();
            setNativeSmartState(false);
            renderSmartSearch(config);
            return;
        }
        hookNativeSearch();
        renderSmartSearch(config);
        const playlistId = SmartSearch.playlistIdFromLocation();
        if (playlistId && (!SmartSearch.state.tracks.length || SmartSearch.state.playlistId !== playlistId))
            SmartSearch.loadCurrentPlaylist(false);
    }
    SmartSearch.applyConfiguration = applyConfiguration;
})(SmartSearch || (SmartSearch = {}));
var SmartSearch;
(function (SmartSearch) {
    async function loadCurrentPlaylist(force = false) {
        const playlistId = SmartSearch.playlistIdFromLocation();
        if (!playlistId || !SmartSearch.loadConfig().enabled)
            return;
        if (SmartSearch.state.loading && SmartSearch.state.loadingPlaylistId === playlistId)
            return;
        const generation = ++SmartSearch.state.routeGeneration;
        SmartSearch.state.loading = true;
        SmartSearch.state.loadingPlaylistId = playlistId;
        SmartSearch.state.lastError = null;
        SmartSearch.renderSmartSearch();
        try {
            const result = await SmartSearch.getPlaylistTracks(playlistId, force);
            if (generation !== SmartSearch.state.routeGeneration || playlistId !== SmartSearch.playlistIdFromLocation())
                return;
            SmartSearch.state.playlistId = playlistId;
            SmartSearch.state.tracks = result.tracks;
            SmartSearch.state.source = result.source;
            SmartSearch.state.loading = false;
            SmartSearch.state.loadingPlaylistId = null;
            SmartSearch.setSmartQuery(SmartSearch.state.query);
            if (SmartSearch.state.query && SmartSearch.smartSyntaxUsed(SmartSearch.state.query) && SmartSearch.state.nativeSearchInput)
                SmartSearch.beginNativeSmartMode(SmartSearch.state.nativeSearchInput, SmartSearch.state.query);
        }
        catch (error) {
            if (generation !== SmartSearch.state.routeGeneration)
                return;
            SmartSearch.state.loading = false;
            SmartSearch.state.loadingPlaylistId = null;
            SmartSearch.state.lastError = SmartSearch.safeErrorMessage(error) || 'Could not load playlist.';
            SmartSearch.consoleError('Could not load playlist.', error);
            SmartSearch.renderSmartSearch();
        }
    }
    SmartSearch.loadCurrentPlaylist = loadCurrentPlaylist;
    async function handleRoute() {
        const config = SmartSearch.loadConfig();
        const playlistId = SmartSearch.playlistIdFromLocation();
        if (!config.enabled || !playlistId) {
            SmartSearch.state.routeGeneration += 1;
            SmartSearch.state.playlistId = null;
            SmartSearch.state.tracks = [];
            SmartSearch.state.filtered = [];
            SmartSearch.state.loading = false;
            SmartSearch.state.loadingPlaylistId = null;
            SmartSearch.state.lastError = null;
            SmartSearch.clearUiForNonPlaylist();
            return;
        }
        const changed = playlistId !== SmartSearch.state.playlistId;
        if (changed) {
            SmartSearch.endNativeSmartMode();
            SmartSearch.state.query = '';
            SmartSearch.state.filtered = [];
            SmartSearch.state.playlistId = playlistId;
            SmartSearch.state.nativeSearchMissingSince = 0;
            SmartSearch.renderSmartSearch(config);
            await loadCurrentPlaylist(false);
        }
        SmartSearch.hookNativeSearch();
        SmartSearch.renderSmartSearch(config);
    }
    async function bootstrap() {
        while (!window.Spicetify?.Platform || !window.Spicetify?.Player)
            await SmartSearch.sleep(100);
        SmartSearch.S = window.Spicetify;
        SmartSearch.injectStyles();
        // Settings are optional; register them asynchronously so they never block startup.
        SmartSearch.registerSettingsMenuDeferred();
        console.log(`[Smart Search] ${SmartSearch.VERSION} core ready`);
        try {
            SmartSearch.S?.Player?.addEventListener?.('songchange', () => {
                queueMicrotask(() => SmartSearch.maintainPlaybackSession('songchange'));
                setTimeout(SmartSearch.updatePlayingRowStyles, 40);
            });
        }
        catch (error) {
            SmartSearch.consoleWarn('Could not attach song-change listener.', error);
        }
        try {
            SmartSearch.S?.Platform?.History?.listen?.(() => setTimeout(() => handleRoute(), 80));
        }
        catch (error) {
            SmartSearch.consoleWarn('Could not attach route listener.', error);
        }
        let lastPath = SmartSearch.S?.Platform?.History?.location?.pathname || location.pathname;
        window.setInterval(() => {
            SmartSearch.maintainPlaybackSession('poll');
            SmartSearch.maintainUiBindings();
            const currentPath = SmartSearch.S?.Platform?.History?.location?.pathname || location.pathname;
            if (currentPath !== lastPath) {
                lastPath = currentPath;
                handleRoute();
            }
            if (SmartSearch.state.playlistId) {
                const cached = SmartSearch.state.cache.get(SmartSearch.state.playlistId);
                if (cached && Date.now() - cached.loadedAt > SmartSearch.CACHE_TTL_MS && SmartSearch.state.query)
                    loadCurrentPlaylist(true);
            }
        }, 750);
        await handleRoute();
        console.log(`[Smart Search] ${SmartSearch.VERSION} loaded`);
    }
    SmartSearch.bootstrap = bootstrap;
})(SmartSearch || (SmartSearch = {}));
SmartSearch.bootstrap();

})();
