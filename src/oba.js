// -----------------------------------------------------------------------------
// OneBusAway REST API client (`/api/where/...`, JSON, a key in the query):
// - arrivals-and-departures-for-stop/<id>.json: the next arrivals and
//   departures of a stop, with the routes, trips and service alerts
//   (`situations`) they reference, one request per watched stop and refresh;
// - stop/<id>.json: one stop (name, code, direction, routes), when it is added;
// - stops-for-location.json: the stops around a point, for the stop search.
//
// The public key `TEST` of the Puget Sound server answers 429 "rate limit
// exceeded" to two requests within a second or so (seen on 2026-11-20):
// requests are serialized, spaced, and a 429 is tried again twice. A personal
// key, free from each region, has a far higher quota.
// -----------------------------------------------------------------------------

export const TIMEOUT_MS = 15000;
// Between two requests, and after a 429 before trying again.
export const REQUEST_GAP_MS = 1000;
export const RETRY_DELAYS_MS = [3000, 10000];
// Minutes of arrivals asked for: enough for a quiet line, small enough to keep
// the answer light (40 kB for an hour at a busy light rail station).
export const MINUTES_AFTER = 120;
export const SEARCH_RADIUS_M = 400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ObaError extends Error {
  /**
   * @param {string} message never holds the key
   * @param {number} [status] HTTP status or `code` of the answer
   */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** "1_75403", "40_N23-T2" → the same; anything else → null. */
export function parseStopId(text) {
  const value = String(text ?? '').trim();
  return /^[A-Za-z0-9.-]{1,40}_[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : null;
}

/** "https://api.example.org/" → "https://api.example.org"; null when not http(s). */
export function normalizeBaseUrl(text) {
  const value = String(text ?? '').trim();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export class Oba {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl] the server root ("https://api.pugetsound.onebusaway.org")
   * @param {string} [options.key] API key (TEST when empty)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep] instant in the tests
   */
  constructor({
    baseUrl = 'https://api.pugetsound.onebusaway.org',
    key = 'TEST',
    fetch: fetchImpl = globalThis.fetch,
    now = Date.now,
    sleep = wait,
  } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.sleep = sleep;
    this.configure({ baseUrl, key });
    this.queue = Promise.resolve();
    this.lastRequestAt = 0;
  }

  configure({ baseUrl, key }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.key = String(key ?? '').trim() || 'TEST';
  }

  /** One request at a time, spaced, a 429 tried again (RETRY_DELAYS_MS). */
  request(path, params = {}) {
    const run = this.queue.then(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const gap = this.lastRequestAt + REQUEST_GAP_MS - this.now();
        if (gap > 0) {
          await this.sleep(gap);
        }
        let error;
        try {
          return await this.requestOnce(path, params);
        } catch (err) {
          error = err;
        } finally {
          this.lastRequestAt = this.now();
        }
        if (error.status !== 429 || attempt >= RETRY_DELAYS_MS.length) {
          throw error;
        }
        await this.sleep(RETRY_DELAYS_MS[attempt]);
        this.lastRequestAt = 0;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async requestOnce(path, params) {
    if (!this.baseUrl) {
      throw new ObaError('OneBusAway: invalid server address');
    }
    const url = new URL(`${this.baseUrl}/api/where/${path}`);
    url.searchParams.set('key', this.key);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    // Errors name the host only: the URL holds the key.
    const host = url.host;
    let response;
    try {
      response = await this.fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new ObaError(
        `${host}: ${err.name === 'TimeoutError' ? 'timeout' : (err.cause?.code ?? err.message)}`,
      );
    }
    let body;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    // The status is in the HTTP code and again in the body's `code`.
    const status = response.ok ? (body?.code ?? 200) : response.status;
    if (status === 401 || status === 403) {
      throw new ObaError(`${host}: API key refused`, 401);
    }
    if (status === 429) {
      throw new ObaError(`${host}: rate limit exceeded`, 429);
    }
    // An unknown stop is a 404, or a 200 whose body is `null` (stop/<id>).
    if (status === 404 || body === null) {
      throw new ObaError(`${host}: not found`, 404);
    }
    if (status !== 200 || body === undefined || !body.data) {
      throw new ObaError(`${host}: HTTP ${status}`, status);
    }
    return body;
  }

  /**
   * The arrivals and departures of a stop.
   * @param {string} stopId
   * @returns {Promise<{ entry: object, references: object, currentTime: number }>}
   */
  async arrivals(stopId) {
    const id = parseStopId(stopId);
    if (!id) {
      throw new ObaError(`OneBusAway: invalid stop ${String(stopId).slice(0, 40)}`);
    }
    const body = await this.request(
      `arrivals-and-departures-for-stop/${encodeURIComponent(id)}.json`,
      {
        minutesBefore: 0,
        minutesAfter: MINUTES_AFTER,
      },
    );
    return {
      entry: body.data.entry ?? {},
      references: body.data.references ?? {},
      currentTime: Number(body.currentTime) || null,
    };
  }

  /**
   * One stop and the short names of its routes.
   * @returns {Promise<{ id: string, code: string, name: string, direction: string, routes: string[] }>}
   */
  async stop(stopId) {
    const id = parseStopId(stopId);
    if (!id) {
      throw new ObaError('OneBusAway: invalid stop', 404);
    }
    const body = await this.request(`stop/${encodeURIComponent(id)}.json`);
    return toStop(body.data.entry, body.data.references);
  }

  /** The stops within SEARCH_RADIUS_M of a point, nearest first. */
  async stopsNear(lat, lon) {
    const body = await this.request('stops-for-location.json', {
      lat,
      lon,
      radius: SEARCH_RADIUS_M,
    });
    const list = Array.isArray(body.data.list) ? body.data.list : [];
    const distance = (stop) =>
      Math.hypot(stop.lat - lat, (stop.lon - lon) * Math.cos((lat * Math.PI) / 180));
    return list
      .filter((stop) => parseStopId(stop?.id))
      .sort((a, b) => distance(a) - distance(b))
      .map((stop) => toStop(stop, body.data.references));
  }
}

/** A stop of the API → what the integration keeps. */
export function toStop(raw, references = {}) {
  if (!raw || !parseStopId(raw.id)) {
    throw new ObaError('OneBusAway: not found', 404);
  }
  const routes = new Map((references.routes ?? []).map((route) => [route.id, route]));
  return {
    id: raw.id,
    code: String(raw.code ?? ''),
    name: String(raw.name ?? '').trim() || raw.id,
    direction: String(raw.direction ?? ''),
    routes: [
      ...new Set((raw.routeIds ?? []).map((id) => routeName(routes.get(id))).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
  };
}

/** The name a rider reads on the vehicle: "77", "1 Line", else the long name. */
export function routeName(route) {
  if (!route) {
    return '';
  }
  return String(route.shortName || route.nullSafeShortName || route.longName || '').trim();
}
