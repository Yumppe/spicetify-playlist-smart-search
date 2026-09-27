export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function safeClone(value) {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function safeErrorMessage(error) {
  if (!error) return '';
  const raw = String(error?.message ?? error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/spotify:(playlist|track|album|artist):[A-Za-z0-9]+/gi, 'spotify:$1:[redacted]')
    .slice(0, 500);
}

export function consoleWarn(message, error) {
  const detail = safeErrorMessage(error);
  console.warn(`[Smart Search] ${message}${detail ? ` ${detail}` : ''}`);
}

export function consoleError(message, error) {
  const detail = safeErrorMessage(error);
  console.error(`[Smart Search] ${message}${detail ? ` ${detail}` : ''}`);
}

export function getPath(object, path) {
  let current = object;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

export function firstDefined(object, paths) {
  for (const path of paths) {
    const value = getPath(object, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}
