// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` answering like
// the Puget Sound OneBusAway server from the real responses of
// test/fixtures/oba (captured on 2026-11-20 around 14:08 in Seattle with the
// public TEST key), a manual clock, a temporary /data, and the integration
// wired on top through registerHandlers. Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'America/Los_Angeles';

export const fixtureJson = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/oba/${name}`, import.meta.url), 'utf8'));

// 2026-11-20 14:08:00 in Seattle: when the arrivals were captured.
export const FIXTURE_TIME = 1795212480000;
export const SERVER = 'api.pugetsound.onebusaway.org';

export const BENTON = '1_75403'; // King County Metro buses 67, 72, 77 (UW campus)
export const ROOSEVELT = '40_990003'; // Sound Transit light rail, southbound

/** The recorded arrivals of each stop, a deep copy the test may change. */
export function recordedStops() {
  return {
    [BENTON]: fixtureJson(`arrivals-${BENTON}.json`),
    [ROOSEVELT]: fixtureJson(`arrivals-${ROOSEVELT}.json`),
  };
}

/**
 * A fake `fetch` answering like a OneBusAway server. `stops` holds the
 * arrivals of each stop (change them to stage a delay, an alert); `fail`
 * makes every request fail with an Error or an HTTP status; a key other than
 * the accepted ones gets the server's 401. Every call is recorded in `calls`.
 */
export function createFetch({ keys = ['TEST', 'my-key'] } = {}) {
  const network = { stops: recordedStops(), calls: [], fail: null, keys };
  const json = (body, status = 200) =>
    new Response(body === null ? 'null' : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const error = (code, text) => json({ code, currentTime: FIXTURE_TIME, text, version: 1 }, code);
  network.fetch = async (url) => {
    network.calls.push({ url });
    if (network.fail instanceof Error) {
      throw network.fail;
    }
    if (typeof network.fail === 'number') {
      return error(network.fail, network.fail === 429 ? 'rate limit exceeded' : 'error');
    }
    const parsed = new URL(url);
    if (!network.keys.includes(parsed.searchParams.get('key'))) {
      return error(401, 'permission denied');
    }
    const path = decodeURIComponent(parsed.pathname);
    let match = path.match(/\/api\/where\/arrivals-and-departures-for-stop\/(.+)\.json$/);
    if (match) {
      const body = network.stops[match[1]];
      return body ? json(structuredClone(body)) : error(404, 'resource not found');
    }
    match = path.match(/\/api\/where\/stop\/(.+)\.json$/);
    if (match) {
      // An unknown stop: HTTP 200 and a `null` body, as the server answers.
      return [BENTON, ROOSEVELT].includes(match[1])
        ? json(fixtureJson(`stop-${match[1]}.json`))
        : json(null);
    }
    if (path.endsWith('/api/where/stops-for-location.json')) {
      return json(fixtureJson('stops-for-location.json'));
    }
    return error(404, 'resource not found');
  };
  network.arrivalRequests = () => network.calls.filter((call) => call.url.includes('/arrivals'));
  return network;
}

/** A manual clock. */
export function createClock(start = FIXTURE_TIME) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.saved] content of /data/watch.json before the start
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  config = {},
  network = createFetch(),
  devices = [],
  saved,
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-oba-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  if (saved) {
    await store.save(saved);
    await store.flush();
  }
  const app = registerHandlers(gladys, {
    store,
    fetch: network.fetch,
    timers,
    now: clock.now,
    // No real wait: the clock is manual.
    sleep: async () => {},
    dataDir,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    service: app.service,
    network,
    clock,
    store,
    dataDir,
  };
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`action ${key} failed: ${JSON.stringify(ack.error)}`);
  }
  return ack.data.message;
}

/** Run an action expected to fail: resolves with its error (multi-language). */
export async function failedAction(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (ack.success !== false || typeof ack.error?.fr !== 'string' || !ack.error.fr) {
    throw new Error(`action ${key} did not fail with a message: ${JSON.stringify(ack)}`);
  }
  return ack.error;
}

/** The discovered device whose name contains `name`. */
export function discovered(world, name) {
  const device = world.fake.discoveredDevices.find((d) => d.name.includes(name));
  if (!device) {
    throw new Error(`no discovered device named ${name}`);
  }
  return device;
}

/** "Add to Gladys" on the discovered device named `name`; resolves with it. */
export async function create(world, name) {
  const device = discovered(world, name);
  await world.fake.deviceCreated(device);
  return device;
}

/** The last state published on a feature of a device. */
export const lastState = (world, device, key) =>
  world.fake.lastState(`${device.external_id}:${key}`);

/** Captures the log lines of the integration at `level` and above. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
