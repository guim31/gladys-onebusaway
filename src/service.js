// -----------------------------------------------------------------------------
// The OneBusAway service: the watched stops (configuration actions, /data),
// their devices, the refresh timer (one arrivals request per created device),
// the states and the scene triggers.
//
// Triggers fire once per trip (and per threshold), never at the first read of
// a stop: what was already there when the integration started is not news.
// Service alerts already announced are kept in /data, so a restart does not
// announce them again; the "time to leave" and delay thresholds are kept in
// memory only (a trip lives an hour or two, and /data is often an SD card).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { aged, alertsFor, applyFilters, clockTime, fold, parseDepartures } from './arrivals.js';
import { buildStopDevice, clip, stopStates, watchKey, watchName, STOP_TYPE } from './devices.js';
import { ActionFailure } from './errors.js';
import { TEXT, say, sayAll } from './messages.js';
import { Oba, parseStopId } from './oba.js';

const logger = createLogger({ name: 'oba' });

export const TRIGGERS = {
  SOON: 'departure_soon',
  DELAYED: 'departure_delayed',
  ALERT: 'new_service_alert',
};
// Options of the threshold filters of the triggers (manifest `scene_triggers`).
// Few values: every one reached is an event, and the core takes 300 a minute.
export const SOON_MINUTES = [1, 2, 3, 5, 7, 10, 12, 15, 20];
export const DELAY_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 60];
// One request per watched stop and refresh: kept low, the keys are rate-limited.
export const MAX_WATCHES = 10;
const SEARCH_RESULTS = 10;
// A value that does not change is published again this often, so that Gladys
// does not show it as stale ("no recent value" after 48 h).
const HEARTBEAT_MS = 6 * 3600 * 1000;
// Announced alerts are forgotten two days after they were last seen; their
// "last seen" is written at most hourly.
const MEMORY_MS = 48 * 3600 * 1000;
const SEEN_WRITE_MS = 3600 * 1000;
// "Time to leave" and delay thresholds of a trip, kept in memory this long
// after its scheduled time.
const TRIP_MEMORY_MS = 2 * 3600 * 1000;
// Scene events sent per minute at most: the core refuses more than 300.
const EVENTS_PER_MINUTE = 200;

/** "77, 67 ; 1 line" → ["1 LINE", "67", "77"]: sorted, so the order typed does not matter. */
export function parseLines(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[,;]+/)
        .map((line) => line.trim().replace(/\s+/g, ' ').toUpperCase())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** "47,6097" or "47.6097" → 47.6097, within `limit`; null otherwise. */
export function parseCoordinate(text, limit) {
  const value = String(text ?? '')
    .trim()
    .replace(',', '.');
  if (!/^-?\d{1,3}(\.\d+)?$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return Math.abs(number) <= limit ? number : null;
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '—';
  }
};

export class ObaService {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the fake one)
   * @param {object} options.store Store (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   * @param {boolean} [options.timers] false in the tests: refresh by hand
   */
  constructor({ gladys, store, fetch, now = Date.now, sleep, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.oba = new Oba({ fetch, now, sleep });
    this.now = now;
    this.timers = timers;
    this.config = { language: 'fr', refreshSeconds: 60, baseUrl: null, key: '' };
    this.watches = [];
    this.removed = [];
    this.memory = { announced: {}, checked: [] };
    // watchKey → { departures, alerts, at }
    this.boards = new Map();
    // watchKey → Map(trip key → { aimed, handled }), in memory only.
    this.soonDone = new Map();
    this.delayDone = new Map();
    this.checkedNow = new Set();
    this.refreshedAt = 0;
    this.lastError = null;
    this.inflight = null;
    this.timer = null;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    this.applyConfig(config);
    const saved = await this.store.load();
    this.watches = Array.isArray(saved.watches)
      ? saved.watches.filter((w) => parseStopId(w?.id) && typeof w.name === 'string')
      : [];
    this.memory = {
      announced: saved.announced && typeof saved.announced === 'object' ? saved.announced : {},
      // Watches whose alerts in force were read once (not news).
      checked: Array.isArray(saved.checked) ? saved.checked : [],
    };
    this.removed = Array.isArray(saved.removed) ? saved.removed : [];
    await this.restoreFromDevices();
    await this.publishDiscovered();
    await this.setStatus();
    this.startTimer();
    // A failure here is not an initialization failure: the timer goes on.
    await this.refresh().catch((err) => logger.error('First refresh failed', err));
  }

  applyConfig(config) {
    this.config = config;
    this.oba.configure({ baseUrl: config.baseUrl, key: config.key });
  }

  /** Online unless the server address is missing or every read failed. */
  async setStatus() {
    if (!this.config.baseUrl) {
      await this.gladys.setConnectionStatus(false, sayAll(TEXT, 'noServer')).catch(() => {});
      return;
    }
    await this.gladys.setConnectionStatus(true).catch(() => {});
  }

  async resync(config) {
    await this.reconfigure(config, { force: true });
  }

  async reconfigure(config, { force = false } = {}) {
    const previous = this.config;
    this.applyConfig(config);
    if (previous.refreshSeconds !== config.refreshSeconds) {
      this.startTimer();
    }
    const serverChanged = previous.baseUrl !== config.baseUrl || previous.key !== config.key;
    if (serverChanged) {
      // Another server or key: the last error and boards belong to the old one.
      this.lastError = null;
      this.boards.clear();
      await this.setStatus();
    }
    if (force || serverChanged || previous.language !== config.language) {
      // The texts follow the language; the feature names stay as they were
      // created (frozen by the core).
      await this.publishDiscovered();
      await this.refresh({ republish: true });
    }
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.timers) {
      this.timer = setInterval(() => {
        // A read still running (server slow, 429 retries): this tick is
        // skipped, never queued behind it.
        if (this.inflight) {
          return;
        }
        this.refresh().catch((err) => logger.error('Refresh failed', err));
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.inflight?.catch(() => {});
    await this.store.flush();
  }

  save() {
    return this.store.save({
      watches: this.watches,
      announced: this.memory.announced,
      checked: this.memory.checked,
      removed: this.removed,
    });
  }

  // --- Devices ----------------------------------------------------------------

  deviceId(watch) {
    return this.gladys.externalIds(STOP_TYPE, watchKey(watch)).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  watchOfDevice(externalId) {
    return this.watches.find((watch) => this.deviceId(watch) === externalId) ?? null;
  }

  createdWatches() {
    return this.watches.filter((watch) => this.isCreated(this.deviceId(watch)));
  }

  /** The watches of the devices created in Gladys but missing from /data. */
  async restoreFromDevices() {
    let devices;
    try {
      devices = await this.gladys.getDevices();
    } catch (err) {
      logger.warn(`Cannot read the devices of the integration: ${err.message}`);
      return;
    }
    const param = (device, name) => device.params?.find((p) => p.name === name)?.value ?? '';
    let changed = false;
    for (const device of devices ?? []) {
      const id = parseStopId(param(device, 'stop_id'));
      if (!id) {
        continue;
      }
      const watch = {
        id,
        name: param(device, 'stop_name') || id,
        code: param(device, 'stop_code'),
        lines: parseLines(param(device, 'lines')),
        direction: param(device, 'direction'),
      };
      // A stop removed by the user keeps its device until deleted: not restored.
      if (
        !this.removed.includes(watchKey(watch)) &&
        !this.watches.some((known) => watchKey(known) === watchKey(watch))
      ) {
        this.watches.push(watch);
        changed = true;
      }
    }
    if (changed) {
      logger.info(`${this.watches.length} stop(s) restored from the Gladys devices`);
      await this.save();
    }
  }

  async publishDiscovered() {
    try {
      await this.gladys.publishDiscoveredDevices(
        this.watches.map((watch) => buildStopDevice(this.gladys, watch, this.config.language)),
      );
    } catch (err) {
      logger.warn(`Cannot publish the discovered devices: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    if (!this.watchOfDevice(device?.external_id)) {
      return;
    }
    // A state published before the device existed was dropped by the core:
    // everything again, then the widgets showing it.
    await this.refresh({ republish: true });
    this.gladys.requestWidgetRefresh?.('arrivals');
  }

  // --- Refresh ----------------------------------------------------------------

  /** Polling fallback: Gladys does not poll these devices, but if it did. */
  async poll() {
    if (this.now() - this.refreshedAt >= (this.config.refreshSeconds * 1000) / 2) {
      await this.refresh();
    }
  }

  refresh(options = {}) {
    if (this.inflight) {
      // A read in progress may predate a device just created: read again after it.
      return this.inflight.then(() => this.refresh(options));
    }
    this.inflight = this.doRefresh(options).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async doRefresh({ republish = false } = {}) {
    const watches = this.createdWatches();
    if (watches.length === 0 || !this.config.baseUrl) {
      return;
    }
    this.attemptedAt = this.now();
    // One request per watch, one after the other: never a burst on the API.
    const results = [];
    let lastError = null;
    for (const watch of watches) {
      try {
        results.push(await this.oba.arrivals(watch.id));
      } catch (err) {
        lastError = err;
        results.push(null);
        logger.debug(`Cannot read the arrivals of ${watch.id}: ${err.message}`);
        // A refused key fails every stop: no request more.
        if (err.status === 401) {
          break;
        }
      }
    }
    if (results.every((result) => result === null)) {
      if (this.lastError !== lastError.message) {
        logger.warn(`Cannot read the arrivals: ${lastError.message}`);
        await this.gladys
          .setConnectionStatus(
            false,
            lastError.status === 401
              ? sayAll(TEXT, 'keyRefused')
              : sayAll(TEXT, 'serviceDown', { error: lastError.message }),
          )
          .catch(() => {});
      }
      this.lastError = lastError.message;
      // The countdowns go on from the last expected times.
      await this.publishAll();
      return;
    }
    if (this.lastError) {
      logger.info('OneBusAway reachable again');
      this.lastError = null;
      await this.gladys.setConnectionStatus(true).catch(() => {});
    }
    const now = this.now();
    this.refreshedAt = now;
    const events = [];
    let memoryChanged = false;
    for (const [index, watch] of watches.entries()) {
      const answer = results[index];
      if (!answer) {
        // This stop only failed: its last board ages on.
        continue;
      }
      const departures = applyFilters(parseDepartures(answer, now), watch);
      const alerts = alertsFor(answer, departures, now);
      this.boards.set(watchKey(watch), { departures, alerts, at: now });
      const found = this.detect(watch, departures, alerts, now);
      events.push(...found.events);
      memoryChanged ||= found.memoryChanged;
    }
    memoryChanged = this.pruneMemory(now) || memoryChanged;
    if (memoryChanged) {
      await this.save();
    }
    await this.publishAll({ force: republish });
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  async publishAll({ force = false } = {}) {
    const states = [];
    for (const watch of this.createdWatches()) {
      const board = this.boards.get(watchKey(watch));
      if (board) {
        states.push(
          ...stopStates(
            this.gladys,
            watch,
            aged(board.departures, this.now()),
            board.alerts,
            this.config.language,
          ),
        );
      }
    }
    if (states.length === 0) {
      return;
    }
    if (force) {
      this.gladys.forgetPublishedStates?.();
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  // --- Scene triggers ----------------------------------------------------------

  /** The scene events of a fresh read of a watch. */
  detect(watch, departures, alerts, now) {
    const key = watchKey(watch);
    const deviceId = this.deviceId(watch);
    const events = [];
    let memoryChanged = false;
    // First read in this process: what is there is not news (RAM memories).
    const firstNow = !this.checkedNow.has(key);
    this.checkedNow.add(key);
    const base = (departure) => ({
      stop: deviceId,
      stop_name: watch.name,
      line: departure.line,
      destination: departure.destination,
      scheduled_time: clockTime(departure.aimed),
      expected_time: clockTime(departure.expected),
      minutes: departure.minutes,
      delay_minutes: departure.delay,
      realtime: departure.realtime ? 1 : 0,
    });

    const soon = this.soonDone.get(key) ?? new Map();
    const delays = this.delayDone.get(key) ?? new Map();
    // A threshold crossed long before this read (server down, a 2-minute
    // interval) is too late to announce: marked, not fired.
    const slack = Math.ceil(this.config.refreshSeconds / 60);
    for (const departure of departures) {
      if (departure.cancelled) {
        continue;
      }
      // Time to leave: each threshold once, when the countdown reaches it. A
      // trip first seen inside a threshold does not fire it.
      const seen = soon.get(departure.key);
      if (!seen) {
        soon.set(departure.key, {
          aimed: departure.aimed,
          handled: new Set(SOON_MINUTES.filter((minutes) => departure.minutes <= minutes)),
        });
      } else {
        for (const threshold of SOON_MINUTES) {
          if (departure.minutes <= threshold && !seen.handled.has(threshold)) {
            seen.handled.add(threshold);
            if (departure.minutes >= threshold - slack) {
              events.push({
                key: TRIGGERS.SOON,
                data: { ...base(departure), threshold: String(threshold) },
              });
            }
          }
        }
      }
      // Delay: each threshold once per trip.
      const reached = delays.get(departure.key) ?? { aimed: departure.aimed, handled: new Set() };
      for (const threshold of DELAY_MINUTES) {
        if (departure.delay >= threshold && !reached.handled.has(threshold)) {
          reached.handled.add(threshold);
          if (!firstNow) {
            events.push({
              key: TRIGGERS.DELAYED,
              data: { ...base(departure), threshold: String(threshold) },
            });
          }
        }
      }
      delays.set(departure.key, reached);
    }
    for (const map of [soon, delays]) {
      for (const [trip, entry] of map) {
        if (now - entry.aimed > TRIP_MEMORY_MS) {
          map.delete(trip);
        }
      }
    }
    this.soonDone.set(key, soon);
    this.delayDone.set(key, delays);

    // One event per alert and route: a scene filtered on either route hears it.
    // The alerts in force at the first read ever of the stop are not news.
    const first = !this.memory.checked.includes(key);
    if (first) {
      this.memory.checked.push(key);
      memoryChanged = true;
    }
    for (const alert of alerts) {
      const memo = this.remember(`${key}|alert|${alert.id}`, now);
      memoryChanged ||= memo.changed;
      if (!memo.fresh || first) {
        continue;
      }
      for (const line of alert.lines.length > 0 ? alert.lines : ['']) {
        events.push({
          key: TRIGGERS.ALERT,
          data: {
            stop: deviceId,
            stop_name: watch.name,
            line,
            summary: clip(alert.summary || alert.description, 1000),
            description: clip(alert.description, 1000),
          },
        });
      }
    }
    return { events, memoryChanged };
  }

  /** Records a persisted memory key: `fresh` when new, `changed` when /data must be written. */
  remember(memoryKey, now) {
    const seen = this.memory.announced[memoryKey];
    if (seen === undefined || now - seen > SEEN_WRITE_MS) {
      this.memory.announced[memoryKey] = now;
      return { fresh: seen === undefined, changed: true };
    }
    return { fresh: false, changed: false };
  }

  pruneMemory(now) {
    let changed = false;
    for (const [memoryKey, seen] of Object.entries(this.memory.announced)) {
      if (now - seen > MEMORY_MS) {
        delete this.memory.announced[memoryKey];
        changed = true;
      }
    }
    return changed;
  }

  async fire(key, data) {
    const minute = Math.floor(this.now() / 60000);
    if (this.eventMinute !== minute) {
      this.eventMinute = minute;
      this.eventCount = 0;
    }
    this.eventCount += 1;
    if (this.eventCount > EVENTS_PER_MINUTE) {
      logger.debug(`Too many scene events this minute, ${key} dropped`);
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.fireFailed = false;
    } catch (err) {
      // A 429 or Gladys restarting: said once per streak.
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- Readings for the widget and the scene action ----------------------------

  /**
   * The watch and departures of a device; read again when older than two
   * refresh intervals (a scene action right after the start).
   */
  async boardOf(externalId) {
    const watch = this.watchOfDevice(externalId);
    if (!watch) {
      return null;
    }
    let board = this.boards.get(watchKey(watch));
    // Read again when stale, unless a read was just tried (server down: the
    // aged board is served at once instead of a read per widget or scene).
    if (
      this.isCreated(externalId) &&
      (!board || this.now() - board.at > this.config.refreshSeconds * 2000) &&
      !(this.now() - (this.attemptedAt ?? 0) < this.config.refreshSeconds * 1000)
    ) {
      await this.refresh();
      board = this.boards.get(watchKey(watch));
    }
    return {
      watch,
      departures: board ? aged(board.departures, this.now()) : null,
      alerts: board?.alerts ?? [],
    };
  }

  // --- Configuration actions -------------------------------------------------
  //
  // Gladys shows in green what an action returns and in red what it throws:
  // every failure throws an ActionFailure with the four-language message.

  fail(key, params) {
    return new ActionFailure(sayAll(TEXT, key, params));
  }

  /** Runs a request for an action; its failures become red messages. */
  async call(fn, notFound = null) {
    if (!this.config.baseUrl) {
      throw this.fail('noServer');
    }
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ActionFailure) {
        throw err;
      }
      if (err.status === 404 && notFound) {
        throw this.fail(notFound.key, notFound.params);
      }
      if (err.status === 401) {
        throw this.fail('keyRefused');
      }
      throw this.fail('serviceDown', { error: err.message });
    }
  }

  stopLabel(stop) {
    const where = stop.direction ? ` (${stop.direction})` : '';
    const routes = stop.routes.length > 0 ? ` — ${clip(stop.routes.join(', '), 60)}` : '';
    return `${stop.name}${where} [${stop.id}]${routes}`;
  }

  async searchStops({ latitude, longitude, name } = {}) {
    const lat = parseCoordinate(latitude, 90);
    const lon = parseCoordinate(longitude, 180);
    if (lat === null || lon === null) {
      throw this.fail('searchNeedPoint');
    }
    const query = clip(String(name ?? '').trim(), 40);
    const wanted = fold(query);
    const stops = (await this.call(() => this.oba.stopsNear(lat, lon))).filter(
      (stop) => !wanted || fold(stop.name).includes(wanted) || fold(stop.code) === wanted,
    );
    if (stops.length === 0) {
      throw query ? this.fail('searchNoneNamed', { query }) : this.fail('searchNone');
    }
    const list = stops
      .slice(0, SEARCH_RESULTS)
      .map((stop) => `• ${this.stopLabel(stop)}`)
      .join('\n');
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => [
        lang,
        `${say(TEXT, lang, 'searchFound', { count: stops.length })}\n${list}\n${say(TEXT, lang, 'searchHint')}`,
      ]),
    );
  }

  async addStop({ stop: query, lines: lineText, direction } = {}) {
    const text = String(query ?? '').trim();
    const id = parseStopId(text);
    if (!id) {
      throw this.fail(text ? 'addUnknown' : 'addNeedId', { query: clip(text, 40) });
    }
    const stop = await this.call(() => this.oba.stop(id), {
      key: 'addUnknown',
      params: { query: id },
    });
    const lines = parseLines(lineText);
    const served = new Map(stop.routes.map((route) => [route.toUpperCase(), route]));
    const missing = lines.filter((line) => !served.has(line));
    if (missing.length > 0) {
      throw this.fail('addUnknownLines', {
        lines: missing.join(', '),
        available: clip(stop.routes.join(', '), 120) || '—',
      });
    }
    const wantedDirection = clip(String(direction ?? '').trim(), 40);
    if (wantedDirection) {
      // Checked on the next two hours: a typo would give a device that never
      // counts down. A stop without any departure now (night) is let through.
      const answer = await this.call(() => this.oba.arrivals(id));
      const kept = applyFilters(parseDepartures(answer, this.now()), {
        lines: lines.map((line) => served.get(line)),
      });
      if (kept.length > 0 && applyFilters(kept, { direction: wantedDirection }).length === 0) {
        throw this.fail('addUnknownDirection', {
          direction: wantedDirection,
          available:
            clip(
              [...new Set(kept.map((departure) => departure.destination))]
                .sort((x, y) => x.localeCompare(y, 'en'))
                .join(', '),
              160,
            ) || '—',
        });
      }
    }
    const watch = {
      id: stop.id,
      name: stop.name,
      code: stop.code,
      // As the agency writes them ("67", "1 Line").
      lines: lines.map((line) => served.get(line)),
      direction: wantedDirection,
    };
    const key = watchKey(watch);
    if (this.watches.some((known) => watchKey(known) === key)) {
      throw this.fail('alreadyWatched', { name: watchName(watch) });
    }
    if (this.watches.length >= MAX_WATCHES) {
      throw this.fail('tooMany', { max: MAX_WATCHES });
    }
    this.watches.push(watch);
    this.removed = this.removed.filter((removed) => removed !== key);
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop added: ${watchName(watch)} (${stop.id})`);
    return sayAll(TEXT, 'added', { name: watchName(watch) });
  }

  async remove({ name } = {}) {
    const text = fold(name);
    const matches = this.watches.filter(
      (watch) => fold(watchName(watch)) === text || fold(watchKey(watch)) === text,
    );
    const found =
      matches.length > 0
        ? matches
        : this.watches.filter((w) => fold(w.name) === text || fold(w.id) === text);
    if (found.length === 0) {
      throw this.fail('removeUnknown', { query: clip(String(name ?? '').trim(), 60) });
    }
    if (found.length > 1) {
      throw this.fail('removeAmbiguous');
    }
    const [watch] = found;
    this.watches = this.watches.filter((known) => known !== watch);
    const key = watchKey(watch);
    this.boards.delete(key);
    // Added again later, the stop starts afresh: nothing it held is news.
    this.soonDone.delete(key);
    this.delayDone.delete(key);
    this.checkedNow.delete(key);
    this.memory.checked = this.memory.checked.filter((checked) => checked !== key);
    for (const memoryKey of Object.keys(this.memory.announced)) {
      if (memoryKey.startsWith(`${key}|`)) {
        delete this.memory.announced[memoryKey];
      }
    }
    if (!this.removed.includes(key)) {
      this.removed.push(key);
    }
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop removed: ${watchName(watch)}`);
    return sayAll(TEXT, 'removed', { name: watchName(watch) });
  }

  status() {
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => {
        const lines = [
          this.config.baseUrl
            ? say(TEXT, lang, 'statusServer', { host: hostOf(this.config.baseUrl) })
            : say(TEXT, lang, 'noServer'),
          say(TEXT, lang, this.config.key ? 'statusOwnKey' : 'statusTestKey'),
        ];
        if (this.watches.length === 0) {
          lines.push(say(TEXT, lang, 'statusNone'));
        } else {
          lines.push(say(TEXT, lang, 'statusHeader', { count: this.watches.length }));
          for (const watch of this.watches) {
            const created = this.isCreated(this.deviceId(watch));
            lines.push(
              `• ${watchName(watch)} [${watch.id}] — ${say(TEXT, lang, created ? 'statusCreated' : 'statusNotCreated')}`,
            );
          }
          lines.push(
            this.refreshedAt
              ? say(TEXT, lang, 'statusRefreshed', {
                  age: Math.round((this.now() - this.refreshedAt) / 1000),
                })
              : say(TEXT, lang, 'statusNeverRefreshed'),
          );
        }
        if (this.lastError) {
          lines.push(say(TEXT, lang, 'statusError', { error: this.lastError }));
        }
        return [lang, lines.join('\n')];
      }),
    );
  }

  /** "67 to Northgate Station at East Stevens Way NE & Benton Ln: in 3 and 12 min (2 min late)". */
  sentence(watch, group, language) {
    const [first, second] = group;
    let when;
    if (!second) {
      when = first.minutes === 0 ? say(TEXT, language, 'now') : say(TEXT, language, 'in', first);
    } else {
      when =
        first.minutes === 0
          ? say(TEXT, language, 'nowThen', { second: second.minutes })
          : say(TEXT, language, 'inTwo', { first: first.minutes, second: second.minutes });
    }
    const late = first.delay > 0 ? say(TEXT, language, 'delayedNote', first) : '';
    return (
      say(TEXT, language, 'sentence', {
        line: first.line,
        destination: first.destination,
        stop: watch.name,
        when,
      }) + late
    );
  }
}
