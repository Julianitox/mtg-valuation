import { jsonCache } from './jsonCache.js';

const LOCAL_BASE_URL = '/mtgjson';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const buildLocalUrl = (path) => `${LOCAL_BASE_URL}/${path.replace(/^\//, '')}`;

export async function fetchLocalJson(path, { ttlMs = ONE_DAY_MS } = {}) {
  const url = buildLocalUrl(path);
  const cacheKey = `mtgjson-local:${url}`;
  const cached = jsonCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to read local file (${response.status}): ${path}`);
  }
  const payload = await response.json();
  jsonCache.set(cacheKey, payload, ttlMs);
  return payload;
}

export async function fetchLocalSet(code, options) {
  const normalized = code.toUpperCase();
  return fetchLocalJson(`sets/${normalized}.json`, options);
}

