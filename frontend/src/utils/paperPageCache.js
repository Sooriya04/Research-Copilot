/**
 * Decoupled High-Performance Dual-Layer Converted HTML Page Cache
 *
 * Layer 1: Browser IndexedDB (Instantaneous sub-millisecond local retrieval)
 * Layer 2: Redis Backend DB 1 (Persistent cross-session and cross-device document cache)
 *
 * Eliminates repeated WebAssembly PDF-to-HTML conversion on page reloads.
 */

const DB_NAME = 'rc_paper_reader_cache';
const DB_VERSION = 1;
const STORE_NAME = 'html_pages';

function extractArxivId(str) {
  if (!str) return null;
  const s = String(str).trim();
  const urlMatch = s.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})(?:v[0-9]+)?(?:\.pdf)?/i);
  if (urlMatch) return urlMatch[1];
  const oldUrlMatch = s.match(/arxiv\.org\/(?:abs|pdf)\/([a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})(?:v[0-9]+)?(?:\.pdf)?/i);
  if (oldUrlMatch) return oldUrlMatch[1];
  const prefixMatch = s.match(/^arxiv:\s*([0-9]{4}\.[0-9]{4,5})(?:v[0-9]+)?$/i);
  if (prefixMatch) return prefixMatch[1];
  const exactMatch = s.match(/^([0-9]{4}\.[0-9]{4,5})(?:v[0-9]+)?$/i);
  if (exactMatch) return exactMatch[1];
  const oldExact = s.match(/^([a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})(?:v[0-9]+)?$/i);
  if (oldExact) return oldExact[1];
  return null;
}

export function getPaperCacheKey(paper) {
  if (!paper) return null;
  if (typeof paper === 'string') {
    const aid = extractArxivId(paper);
    if (aid) return `arxiv_${aid}`;
    return paper.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  const aid =
    extractArxivId(paper.arxiv_id) ||
    extractArxivId(paper.id) ||
    extractArxivId(paper.url) ||
    extractArxivId(paper.canonical_id);
  if (aid) return `arxiv_${aid}`;

  if (paper.doi) {
    return `doi_${paper.doi.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  }
  if (paper.id && !paper.id.startsWith('raw:')) {
    return `id_${paper.id.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  }
  if (paper.title) {
    return `title_${paper.title.slice(0, 40).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  }
  return null;
}

function openDatabase() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getLocalPageCache(key) {
  if (!key) return null;
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.pages && req.result.pages.length > 0) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveLocalPageCache(key, data) {
  if (!key || !data) return false;
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      const store = tx.objectStore(STORE_NAME);
      const record = {
        key,
        numPages: data.numPages || (data.pages ? data.pages.length : 0),
        pages: data.pages || [],
        docTitle: data.docTitle || '',
        cachedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function deleteLocalPageCache(key) {
  if (!key) return false;
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getRedisPageCache(key, signal) {
  if (!key) return null;
  try {
    const res = await fetch(`/api/v1/pdf/html-cache/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.status === 'hit' && Array.isArray(data.pages) && data.pages.length > 0) {
      return {
        key,
        numPages: data.numPages || data.pages.length,
        pages: data.pages,
        docTitle: data.docTitle,
        cachedAt: data.cached_at,
      };
    }
    return null;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return null;
  }
}

export async function saveRedisPageCache(key, pages, numPages, docTitle) {
  if (!key || !pages || pages.length === 0) return false;
  try {
    const res = await fetch(`/api/v1/pdf/html-cache/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numPages: numPages || pages.length,
        pages,
        docTitle: docTitle || '',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteRedisPageCache(key) {
  if (!key) return false;
  try {
    const res = await fetch(`/api/v1/pdf/html-cache/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Loads converted pages from IndexedDB or Redis cache.
 * Returns { source: 'indexeddb' | 'redis', data } or null if uncached.
 */
export async function loadCachedPaperPages(paper, signal) {
  const key = getPaperCacheKey(paper);
  if (!key) return null;

  // 1. Try local IndexedDB (instantaneous 0-2ms)
  try {
    const local = await getLocalPageCache(key);
    if (local && local.pages && local.pages.length > 0) {
      return { source: 'indexeddb', data: local, key };
    }
  } catch {
    // Continue to Redis check
  }

  // 2. Try Redis backend cache (fast 10-40ms over network/loopback)
  try {
    const redisData = await getRedisPageCache(key, signal);
    if (redisData && redisData.pages && redisData.pages.length > 0) {
      // Warm local IndexedDB cache in background
      saveLocalPageCache(key, redisData).catch(() => {});
      return { source: 'redis', data: redisData, key };
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  return null;
}

/**
 * Persists converted pages to both IndexedDB and Redis.
 */
export async function cacheConvertedPaperPages(paper, pages, numPages, docTitle) {
  const key = getPaperCacheKey(paper);
  if (!key || !pages || pages.length === 0) return false;

  const data = {
    key,
    numPages: numPages || pages.length,
    pages,
    docTitle: docTitle || '',
  };

  // Save to IndexedDB immediately
  saveLocalPageCache(key, data).catch(() => {});

  // Persist to Redis backend asynchronously
  saveRedisPageCache(key, pages, numPages, docTitle).catch(() => {});

  return true;
}

/**
 * Invalidates cache from both local IndexedDB and Redis.
 */
export async function clearPaperPagesCache(paper) {
  const key = getPaperCacheKey(paper);
  if (!key) return false;

  await Promise.allSettled([
    deleteLocalPageCache(key),
    deleteRedisPageCache(key),
  ]);
  return true;
}
