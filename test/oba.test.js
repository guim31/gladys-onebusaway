// -----------------------------------------------------------------------------
// The OneBusAway client and the parsing of its answers, on the real responses
// of test/fixtures/oba and on the error answers the Puget Sound server gave on
// 2026-11-20 (unknown stop, refused key, rate limit).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertsFor, applyFilters, inForce, parseDepartures } from '../src/arrivals.js';
import { normalizeConfig } from '../src/config.js';
import { Oba, ObaError, normalizeBaseUrl, parseStopId } from '../src/oba.js';
import { parseCoordinate, parseLines } from '../src/service.js';
import { BENTON, FIXTURE_TIME, ROOSEVELT, createFetch, fixtureJson } from './helpers/world.js';

const answer = (name) => {
  const body = fixtureJson(name);
  return { entry: body.data.entry, references: body.data.references };
};

const client = (network, options = {}) =>
  new Oba({ fetch: network.fetch, now: () => FIXTURE_TIME, sleep: async () => {}, ...options });

test('stop ids, coordinates, route lists and server addresses', () => {
  assert.equal(parseStopId(' 1_75403 '), '1_75403');
  assert.equal(parseStopId('40_N23-T2'), '40_N23-T2');
  assert.equal(parseStopId('75403'), null);
  assert.equal(parseStopId('1_75403/../x'), null);
  assert.equal(parseCoordinate('47,6097', 90), 47.6097);
  assert.equal(parseCoordinate('-122.3331', 180), -122.3331);
  assert.equal(parseCoordinate('91', 90), null);
  assert.equal(parseCoordinate('47.6N', 90), null);
  assert.deepEqual(parseLines('77, 67 ; 1  line'), ['1 LINE', '67', '77']);
  assert.equal(
    normalizeBaseUrl('https://realtime.sdmts.com/api/'),
    'https://realtime.sdmts.com/api',
  );
  assert.equal(normalizeBaseUrl('ftp://x.org'), null);
  assert.equal(normalizeBaseUrl('not a url'), null);
  assert.equal(normalizeConfig({}).baseUrl, 'https://api.pugetsound.onebusaway.org');
  assert.equal(normalizeConfig({ region: 'nowhere' }).region, 'puget_sound');
  assert.equal(normalizeConfig({ region: 'custom', server_url: '' }).baseUrl, null);
});

test('the departures of a stop: predicted, delay, soonest first, a trip once', () => {
  const departures = parseDepartures(answer(`arrivals-${BENTON}.json`), FIXTURE_TIME);
  // 16 entries, two trips of route 67 listed twice.
  assert.equal(departures.length, 14);
  assert.deepEqual(departures[0], {
    key: '1_848534471|1795161600000|25',
    line: '72',
    routeId: '1_102768',
    destination: 'University District',
    aimed: 1795212600000,
    expected: 1795212488000,
    minutes: 0,
    delay: 0,
    realtime: true,
    cancelled: false,
    situationIds: ['1_99085'],
  });
  assert.equal(departures[1].delay, 3);
  // Sorted, and every trip once.
  assert.equal(new Set(departures.map((d) => d.key)).size, departures.length);
  assert.ok(departures.every((d, i) => i === 0 || departures[i - 1].expected <= d.expected));
});

test('an unpredicted, ended or cancelled trip', () => {
  const raw = answer(`arrivals-${ROOSEVELT}.json`);
  const entries = raw.entry.arrivalsAndDepartures;
  // The sixth one of the fixture has no prediction (predictedDepartureTime 0).
  const unpredicted = parseDepartures(raw, FIXTURE_TIME).find(
    (d) => d.aimed === entries[5].scheduledDepartureTime,
  );
  assert.equal(unpredicted.realtime, false);
  assert.equal(unpredicted.expected, unpredicted.aimed);
  entries[0].departureEnabled = false;
  entries[1].tripStatus.status = 'CANCELED';
  const departures = parseDepartures(raw, FIXTURE_TIME);
  assert.ok(!departures.some((d) => d.expected === entries[0].predictedDepartureTime));
  assert.equal(departures[0].cancelled, true);
  // Gone more than a minute ago: dropped.
  assert.equal(parseDepartures(raw, FIXTURE_TIME + 3 * 3600000).length, 0);
});

test('filters: routes as written, direction without case or accents', () => {
  const departures = parseDepartures(answer(`arrivals-${ROOSEVELT}.json`), FIXTURE_TIME);
  assert.ok(applyFilters(departures, { lines: ['1 LINE'] }).every((d) => d.line === '1 Line'));
  const redmond = applyFilters(departures, { direction: 'redmond' });
  assert.ok(redmond.length > 0);
  assert.ok(redmond.every((d) => d.destination === 'Downtown Redmond'));
});

test('alerts: only the ones in force, of the stop or of the kept departures', () => {
  const raw = answer(`arrivals-${BENTON}.json`);
  const departures = parseDepartures(raw, FIXTURE_TIME);
  // The three alerts of the fixture are for a football game the next day.
  assert.deepEqual(alertsFor(raw, departures, FIXTURE_TIME), []);
  const during = raw.references.situations[0].activeWindows[0].from + 60000;
  const alerts = alertsFor(raw, parseDepartures(raw, FIXTURE_TIME), during);
  assert.deepEqual(
    alerts.map((alert) => [alert.id, alert.lines]),
    [
      ['1_99085', ['72']],
      ['1_99087', ['67']],
      ['1_99082', ['77']],
    ],
  );
  assert.match(alerts[0].summary, /^Route 72 will be rerouted/);
  const only77 = applyFilters(departures, { lines: ['77'] });
  assert.deepEqual(
    alertsFor(raw, only77, during).map((alert) => alert.id),
    ['1_99082'],
  );
  assert.equal(inForce({ activeWindows: [] }, FIXTURE_TIME), true);
  assert.equal(inForce({ activeWindows: [{ from: 0, to: 0 }] }, FIXTURE_TIME), true);
});

test('client: the stop, the stops near a point, the routes by name', async () => {
  const network = createFetch();
  const oba = client(network);
  assert.deepEqual(await oba.stop(BENTON), {
    id: BENTON,
    code: '75403',
    name: 'East Stevens Way NE & Benton Ln',
    direction: 'SW',
    routes: ['67', '72', '77'],
  });
  assert.deepEqual((await oba.stop(ROOSEVELT)).routes, ['1 Line', '2 Line']);
  const near = await oba.stopsNear(47.6097, -122.3331);
  assert.equal(near.length, 22);
  assert.equal(near[0].id, '1_1260');
  const url = new URL(network.calls[0].url);
  assert.equal(
    url.origin + url.pathname,
    `https://api.pugetsound.onebusaway.org/api/where/stop/${BENTON}.json`,
  );
  assert.equal(url.searchParams.get('key'), 'TEST');
});

test('client: unknown stop (404 or a null body), refused key, rate limit, cut', async () => {
  const network = createFetch();
  const oba = client(network, { key: 'wrong-key-42' });
  await assert.rejects(oba.arrivals(BENTON), (err) => {
    assert.ok(err instanceof ObaError);
    assert.equal(err.status, 401);
    assert.equal(err.message, 'api.pugetsound.onebusaway.org: API key refused');
    return true;
  });
  oba.configure({ baseUrl: 'https://api.pugetsound.onebusaway.org', key: '' });
  await assert.rejects(oba.arrivals('1_99999999'), { status: 404 });
  await assert.rejects(oba.stop('1_99999999'), { status: 404 });
  network.fail = 429;
  await assert.rejects(oba.arrivals(BENTON), {
    status: 429,
    message: 'api.pugetsound.onebusaway.org: rate limit exceeded',
  });
  // The first request and two retries.
  assert.equal(network.calls.filter((c) => c.url.includes('arrivals')).length, 2 + 3);
  network.fail = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  await assert.rejects(oba.arrivals(BENTON), {
    message: 'api.pugetsound.onebusaway.org: ECONNREFUSED',
  });
  network.fail = null;
  const ok = await oba.arrivals(BENTON);
  assert.equal(ok.entry.stopId, BENTON);
});

test('client: requests are spaced, one at a time', async () => {
  const network = createFetch();
  let time = FIXTURE_TIME;
  const waits = [];
  const oba = new Oba({
    fetch: network.fetch,
    now: () => time,
    sleep: async (ms) => {
      waits.push(ms);
      time += ms;
    },
  });
  await Promise.all([oba.stop(BENTON), oba.stop(ROOSEVELT), oba.arrivals(BENTON)]);
  assert.deepEqual(waits, [1000, 1000]);
});
