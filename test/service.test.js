// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real
// OneBusAway answers: configuration actions, discovered devices, states, scene
// triggers, widget, scene action, persistence, failures, logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NO_DEPARTURE_MINUTES } from '../src/devices.js';
import { MAX_WATCHES, TRIGGERS } from '../src/service.js';
import {
  BENTON,
  FIXTURE_TIME,
  ROOSEVELT,
  action,
  captureLogs,
  create,
  createFetch,
  createWorld,
  discovered,
  failedAction,
  lastState,
} from './helpers/world.js';
import { arrivalsOf, situation, stageEverything } from './helpers/scenario.js';

const fr = (message) => message.fr;

test('nothing watched: no request at all, the status says so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.service.refresh();
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(world.fake.discoveredDevices, []);
  const status = fr(await action(world, 'status'));
  assert.match(status, /Serveur : api\.pugetsound\.onebusaway\.org/);
  assert.match(status, /clé publique TEST/);
  assert.match(status, /Aucun arrêt suivi/);
});

test('search: stops near a point, nearest first, a name filter; failures in red', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const found = await action(world, 'search_stops', {
    latitude: '47,6097',
    longitude: ' -122.3331',
  });
  assert.match(
    fr(found),
    /^22 arrêt\(s\) trouvé\(s\) :\n• Seneca St & 6th Ave \(SW\) \[1_1260\] — 2, 13\n/,
  );
  assert.equal(
    fr(found)
      .split('\n')
      .filter((line) => line.startsWith('•')).length,
    10,
  );
  assert.match(found.de, /Haltestelle hinzufügen/);
  const url = new URL(world.network.calls[0].url);
  assert.equal(url.searchParams.get('lat'), '47.6097');
  assert.equal(url.searchParams.get('radius'), '400');
  const named = await action(world, 'search_stops', {
    latitude: '47.6097',
    longitude: '-122.3331',
    name: 'westlake',
  });
  assert.match(
    fr(named),
    /^2 arrêt\(s\)[^\n]*\n• Westlake \(NE\) \[40_1121\] — 1 Line, 2 Line\n• Westlake Center \[96_WL\] — Monorail\n/,
  );
  assert.equal(
    fr(
      await failedAction(world, 'search_stops', {
        latitude: '47.6',
        longitude: '-122.3',
        name: 'Zzyzx',
      }),
    ),
    'Aucun arrêt correspondant à « Zzyzx » à moins de 400 m de ce point.',
  );
  assert.match(
    fr(await failedAction(world, 'search_stops', { latitude: '147', longitude: '2' })),
    /Indiquez une latitude/,
  );
  world.network.fail = 503;
  assert.equal(
    fr(await failedAction(world, 'search_stops', { latitude: '47.6', longitude: '-122.3' })),
    'Le serveur OneBusAway est injoignable (api.pugetsound.onebusaway.org: HTTP 503). Réessayez dans un instant.',
  );
});

test('add a stop: unknown stop or route, filters in the name, duplicates', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.match(fr(await failedAction(world, 'add_stop', { stop: ' ' })), /par exemple 1_75403/);
  assert.equal(
    fr(await failedAction(world, 'add_stop', { stop: '75403' })),
    'Ce serveur OneBusAway ne connaît aucun arrêt « 75403 ».',
  );
  assert.equal(
    fr(await failedAction(world, 'add_stop', { stop: '1_99999999' })),
    'Ce serveur OneBusAway ne connaît aucun arrêt « 1_99999999 ».',
  );
  assert.equal(
    fr(await failedAction(world, 'add_stop', { stop: BENTON, lines: '67, 99' })),
    "Ligne(s) absente(s) de cet arrêt : 99. Lignes de l'arrêt : 67, 72, 77.",
  );
  assert.deepEqual(world.fake.discoveredDevices, []);

  const added = await action(world, 'add_stop', {
    stop: BENTON,
    lines: '77; 67',
    direction: 'Northgate',
  });
  assert.equal(
    fr(added),
    "East Stevens Way NE & Benton Ln (67, 77 · → Northgate) ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.",
  );
  assert.match(
    fr(await action(world, 'add_stop', { stop: ROOSEVELT, lines: '1 line' })),
    /^Roosevelt \(1 Line\) ajouté/,
  );
  assert.match(
    fr(await failedAction(world, 'add_stop', { stop: ROOSEVELT, lines: '1 LINE' })),
    /déjà suivi avec ces filtres/,
  );
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      [
        'OBA · East Stevens Way NE & Benton Ln (67, 77 · → Northgate)',
        'ext:test-integration:stop:1_75403-67-77-to-northgate',
      ],
      ['OBA · Roosevelt (1 Line)', 'ext:test-integration:stop:40_990003-1-line'],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    [
      'Prochain passage',
      'Passage suivant',
      'Retard',
      'Ligne et destination',
      'Prévision en temps réel',
      'Alerte de service',
    ],
  );
  const saved = JSON.parse(await readFile(join(world.dataDir, 'watch.json'), 'utf8'));
  assert.deepEqual(saved.watches[1], {
    id: ROOSEVELT,
    name: 'Roosevelt',
    code: '990003',
    lines: ['1 Line'],
    direction: '',
  });
  // Nothing is read before a device is created.
  const before = world.network.arrivalRequests().length;
  await world.service.refresh();
  assert.equal(world.network.arrivalRequests().length, before);
});

test('a direction no departure goes to is refused, with the destinations', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(
    fr(await failedAction(world, 'add_stop', { stop: ROOSEVELT, direction: 'Tacoma' })),
    'Aucun départ vers « Tacoma » dans les 2 heures. Destinations : Downtown Redmond, Federal Way Downtown.',
  );
  // At night (no departure at all), the direction cannot be checked: accepted.
  world.network.stops[ROOSEVELT].data.entry.arrivalsAndDepartures = [];
  assert.match(
    fr(await action(world, 'add_stop', { stop: ROOSEVELT, direction: 'Tacoma' })),
    /ajouté/,
  );
});

test('at most MAX_WATCHES stops', async (t) => {
  const watches = Array.from({ length: MAX_WATCHES }, (_, i) => ({
    id: BENTON,
    name: 'Benton',
    lines: [],
    direction: `D${i}`,
  }));
  const world = await createWorld({ saved: { watches } });
  t.after(() => world.app.stop());
  assert.match(fr(await failedAction(world, 'add_stop', { stop: ROOSEVELT })), /déjà 10 arrêts/);
});

test('two stops: states at creation, one request per stop', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON, lines: '77' });
  await action(world, 'add_stop', { stop: ROOSEVELT, lines: '2 Line' });
  const benton = await create(world, 'Benton');
  assert.equal(lastState(world, benton, 'line'), '77 → Bitter Lake Pinehurst Station');
  assert.equal(lastState(world, benton, 'next'), 14);
  assert.equal(lastState(world, benton, 'following'), 26);
  assert.equal(lastState(world, benton, 'delay'), 5);
  assert.equal(lastState(world, benton, 'realtime'), 1);
  // The alerts of the fixture (a football game tomorrow) are not in force.
  assert.equal(lastState(world, benton, 'alert'), 0);
  assert.ok(world.fake.widgetRefreshes.includes('arrivals'));
  const roosevelt = await create(world, 'Roosevelt');
  assert.equal(lastState(world, roosevelt, 'line'), '2 Line → Downtown Redmond');
  assert.equal(lastState(world, roosevelt, 'next'), 7);
  assert.equal(lastState(world, roosevelt, 'delay'), 1);
  const url = new URL(world.network.arrivalRequests().at(-1).url);
  assert.equal(url.pathname, `/api/where/arrivals-and-departures-for-stop/${ROOSEVELT}.json`);
  assert.equal(url.searchParams.get('key'), 'TEST');
  assert.equal(url.searchParams.get('minutesAfter'), '120');
  const requests = world.network.arrivalRequests().length;
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.network.arrivalRequests().length, requests + 2);
  assert.equal(lastState(world, roosevelt, 'next'), 6);
});

test('a trip listed twice (two vehicles) counts once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON, lines: '67' });
  const benton = await create(world, 'Benton');
  // 67 at 14:15 twice in the answer, then 14:26.
  assert.equal(lastState(world, benton, 'next'), 7);
  assert.equal(lastState(world, benton, 'following'), 19);
});

test('a timetable departure: no real time, no delay', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const [first] = arrivalsOf(world.network.stops[BENTON], '72');
  first.predicted = false;
  first.predictedDepartureTime = 0;
  await action(world, 'add_stop', { stop: BENTON, lines: '72' });
  const benton = await create(world, 'Benton');
  assert.equal(lastState(world, benton, 'realtime'), 0);
  assert.equal(lastState(world, benton, 'delay'), 0);
  // Its timetable time (14:10), not the prediction it no longer has (14:08).
  assert.equal(lastState(world, benton, 'next'), 2);
});

test('nothing announced (a stop at night): countdowns at their maximum', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.network.stops[BENTON].data.entry.arrivalsAndDepartures = [];
  await action(world, 'add_stop', { stop: BENTON });
  const benton = await create(world, 'Benton');
  assert.equal(lastState(world, benton, 'next'), NO_DEPARTURE_MINUTES);
  assert.equal(lastState(world, benton, 'following'), NO_DEPARTURE_MINUTES);
  assert.equal(lastState(world, benton, 'delay'), 0);
  assert.equal(lastState(world, benton, 'line'), 'Aucun départ dans les 2 heures');
  assert.equal(lastState(world, benton, 'realtime'), 0);
});

test('triggers: silent first read, then once per trip and threshold', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { device, events } = await stageEverything(world);
  const of = (key) => events.filter((event) => event.key === key);

  const delayed = of(TRIGGERS.DELAYED);
  assert.deepEqual(
    delayed.map((event) => event.data.threshold),
    ['5', '10'],
  );
  assert.deepEqual(delayed[0].data, {
    stop: device.external_id,
    stop_name: 'East Stevens Way NE & Benton Ln',
    line: '72',
    destination: 'University District',
    scheduled_time: '14:20',
    expected_time: '14:32',
    minutes: 21,
    delay_minutes: 12,
    realtime: 1,
    threshold: '5',
  });

  assert.deepEqual(
    of(TRIGGERS.SOON).map((event) => [event.data.line, event.data.threshold, event.data.minutes]),
    [
      ['67', '5', 4],
      ['77', '12', 11],
      ['72', '20', 19],
    ],
  );

  assert.deepEqual(
    of(TRIGGERS.ALERT).map((event) => event.data),
    [
      {
        stop: device.external_id,
        stop_name: 'East Stevens Way NE & Benton Ln',
        line: '67',
        summary: 'Route 67 snow routing',
        description: 'Route 67 is on its snow route.',
      },
    ],
  );
  assert.equal(lastState(world, device, 'alert'), 1);

  // Nothing again on the next read.
  const count = world.fake.sceneEvents.length;
  await world.service.refresh();
  assert.equal(world.fake.sceneEvents.length, count);
});

test('an alert on a route the watch filters out does not count', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON, lines: '77' });
  const benton = await create(world, 'Benton');
  const body = world.network.stops[BENTON];
  body.data.references.situations.push(situation({ id: '1_990002', summary: '67 detour' }));
  for (const entry of arrivalsOf(body, '67')) {
    entry.situationIds.push('1_990002');
  }
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(lastState(world, benton, 'alert'), 0);
  // One on the stop itself counts, whatever the route.
  body.data.references.situations.push(situation({ id: '1_990003', summary: 'Stop closed' }));
  body.data.entry.situationIds.push('1_990003');
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(lastState(world, benton, 'alert'), 1);
  assert.deepEqual(
    world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.ALERT).map((e) => e.data.summary),
    ['Stop closed'],
  );
});

test('an alert in force for long, first seen with a trip entering the window, is no news', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON, lines: '77' });
  const benton = await create(world, 'Benton');
  const body = world.network.stops[BENTON];
  body.data.references.situations.push(
    situation({ id: '1_990004', summary: 'Since this morning', from: FIXTURE_TIME - 3 * 3600000 }),
  );
  for (const entry of arrivalsOf(body, '77')) {
    entry.situationIds.push('1_990004');
  }
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(lastState(world, benton, 'alert'), 1);
  assert.ok(!world.fake.sceneEvents.some((event) => event.key === TRIGGERS.ALERT));
});

test('a device deleted from Gladys: the widget says the stop is gone', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON });
  const benton = await create(world, 'Benton');
  world.gladys.devices.splice(0, world.gladys.devices.length);
  const ack = await world.fake.widgetGet('arrivals', {
    settings: { stop: benton.external_id },
    language: 'en',
  });
  assert.equal(ack.data.content.components[0].text, 'This stop is no longer watched.');
});

test('a restart does not announce the same alert again', async (t) => {
  const world = await createWorld();
  await stageEverything(world);
  await world.app.stop();
  const network = createFetch();
  network.stops = world.network.stops;
  const again = await createWorld({
    network,
    dataDir: world.dataDir,
    devices: world.fake.devices,
    clock: world.clock,
  });
  t.after(() => again.app.stop());
  world.clock.advance(60000);
  await again.service.refresh();
  assert.ok(!again.fake.sceneEvents.some((event) => event.key === TRIGGERS.ALERT));
});

test('the container reads the arrivals on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ timers: true, config: { refresh_interval: '60' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON });
  await create(world, 'Benton');
  const before = world.network.arrivalRequests().length;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  assert.equal(world.network.arrivalRequests().length, before + 2);
  // A poll right after a read does not read again.
  await world.fake.poll(discovered(world, 'Benton'));
  assert.equal(world.network.arrivalRequests().length, before + 2);
});

test('network cut: one warning, the status, countdowns go on, then back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON, lines: '77' });
  const benton = await create(world, 'Benton');
  assert.equal(lastState(world, benton, 'next'), 14);
  const logs = captureLogs(t);
  world.network.fail = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'EAI_AGAIN' },
  });
  world.clock.advance(3 * 60000);
  await world.service.refresh();
  await world.service.refresh();
  assert.equal(logs.filter((line) => line.level === 'warn').length, 1);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Le serveur OneBusAway est injoignable/);
  assert.equal(lastState(world, benton, 'next'), 11);
  assert.match(
    fr(await action(world, 'status')),
    /Dernière erreur : api\.pugetsound\.onebusaway\.org: EAI_AGAIN/,
  );
  world.network.fail = null;
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.ok(logs.some((line) => line.level === 'info' && /reachable again/.test(line.text)));
});

test('a refused key: said in the status, one request only, never logged', async (t) => {
  const world = await createWorld({ config: { api_key: 'secret-key-123' } });
  t.after(() => world.app.stop());
  world.network.keys = ['secret-key-123'];
  await action(world, 'add_stop', { stop: BENTON });
  await action(world, 'add_stop', { stop: ROOSEVELT });
  await create(world, 'Benton');
  await create(world, 'Roosevelt');
  assert.match(fr(await action(world, 'status')), /Clé : votre propre clé/);
  const logs = captureLogs(t, 'debug');
  world.network.keys = [];
  const before = world.network.arrivalRequests().length;
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.network.arrivalRequests().length, before + 1);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /refuse la clé/);
  assert.ok(logs.length > 0);
  assert.ok(logs.every((line) => !line.text.includes('secret-key-123')));
  assert.match(
    fr(await failedAction(world, 'search_stops', { latitude: '47.6', longitude: '-122.3' })),
    /refuse la clé/,
  );
});

test('rate limit: a 429 is tried again, then said', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON });
  await create(world, 'Benton');
  const fetch = world.network.fetch;
  let refusals = 2;
  world.service.oba.fetch = async (url) => {
    if (refusals > 0) {
      refusals -= 1;
      return new Response('{"code":429,"text":"rate limit exceeded","version":1}', {
        status: 429,
      });
    }
    return fetch(url);
  };
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  refusals = 3;
  world.clock.advance(60000);
  await world.service.refresh();
  assert.match(world.fake.connectionStatus.message.en, /rate limit exceeded/);
});

test('a normal read writes nothing at info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON });
  await create(world, 'Benton');
  const logs = captureLogs(t);
  world.clock.advance(60000);
  await world.service.refresh();
  assert.deepEqual(logs, []);
});

test('/data lost: the stops come back from the Gladys devices', async (t) => {
  const first = await createWorld();
  await action(first, 'add_stop', { stop: BENTON, lines: '77, 67', direction: 'Northgate' });
  await create(first, 'Benton');
  await first.app.stop();
  const world = await createWorld({ devices: first.fake.devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.watches, [
    {
      id: BENTON,
      name: 'East Stevens Way NE & Benton Ln',
      code: '75403',
      lines: ['67', '77'],
      direction: 'Northgate',
    },
  ]);
  assert.equal(world.fake.discoveredDevices[0].external_id, first.fake.devices[0].external_id);
  assert.equal(world.network.arrivalRequests().length, 1);
});

test('remove a stop by its name or identifier', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON });
  await action(world, 'add_stop', { stop: ROOSEVELT, lines: '1 Line' });
  assert.match(
    fr(await action(world, 'remove_stop', { name: 'east stevens way ne & benton ln' })),
    /n'est plus suivi/,
  );
  assert.match(
    fr(await action(world, 'remove_stop', { name: 'Roosevelt (1 Line)' })),
    /^Roosevelt \(1 Line\) n'est plus/,
  );
  assert.match(
    fr(await failedAction(world, 'remove_stop', { name: BENTON })),
    /Aucun arrêt suivi ne correspond/,
  );
  assert.deepEqual(world.fake.discoveredDevices, []);
});

test('the status lists the stops and their devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON });
  await action(world, 'add_stop', { stop: ROOSEVELT });
  await create(world, 'Benton');
  world.clock.advance(12000);
  const status = fr(await action(world, 'status'));
  assert.match(status, /Arrêts suivis : 2/);
  assert.match(status, /• East Stevens Way NE & Benton Ln \[1_75403\] — appareil créé/);
  assert.match(status, /• Roosevelt \[40_990003\] — appareil pas encore créé/);
  assert.match(status, /il y a 12 s/);
});

test('the widget: Gladys name, late rows, alert caption that can be hidden', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { device } = await stageEverything(world);
  world.gladys.devices.find((d) => d.external_id === device.external_id).name = 'UW bus';
  const get = (settings, language = 'en') =>
    world.fake.widgetGet('arrivals', {
      settings: { stop: device.external_id, ...settings },
      language,
    });
  const ack = await get({});
  const [heading, caption, status] = ack.data.content.components;
  assert.equal(heading.text, 'UW bus');
  assert.equal(caption.text, '⚠ Route 67 snow routing');
  assert.equal(status.items.length, 8);
  assert.deepEqual(status.items[0], {
    label: '67 → Northgate Station Roosevelt Station',
    value: '14:15 · 4 min · +3',
    color: 'warning',
  });
  const hidden = await get({ show_alerts: false }, 'fr');
  assert.equal(
    hidden.data.content.components[1].text,
    'Heure · minutes · retard. Gris : horaire théorique.',
  );
  const none = await world.fake.widgetGet('arrivals', { settings: {}, language: 'de' });
  assert.equal(
    none.data.content.components[0].text,
    'Wähle eine Haltestelle in den Widget-Einstellungen.',
  );
  const gone = await world.fake.widgetGet('arrivals', {
    settings: { stop: 'ext:x' },
    language: 'es',
  });
  assert.equal(gone.data.content.components[0].text, 'Esta parada ya no se sigue.');
});

test('the scene action: sentence, route filter, nothing found, unknown stop', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: ROOSEVELT });
  const device = await create(world, 'Roosevelt');
  const all = await world.fake.sceneAction('get_next_arrivals', { stop: device.external_id });
  assert.equal(
    all.data.outputs.sentence,
    '1 Line to Federal Way Downtown at Roosevelt: in 1 and 11 min. 2 Line to Downtown Redmond at Roosevelt: in 7 and 18 min (1 min late)',
  );
  const line2 = await world.fake.sceneAction('get_next_arrivals', {
    stop: device.external_id,
    line: '2 line',
  });
  assert.equal(line2.data.outputs.destination, 'Downtown Redmond');
  assert.equal(line2.data.outputs.expected_time, '14:15');
  assert.equal(line2.data.outputs.realtime, 1);
  assert.equal(line2.data.outputs.alert, 0);
  const none = await world.fake.sceneAction('get_next_arrivals', {
    stop: device.external_id,
    line: '99',
  });
  assert.equal(none.data.outputs.minutes, NO_DEPARTURE_MINUTES);
  assert.equal(none.data.outputs.sentence, 'No departure from Roosevelt in the next 2 hours.');
  const unknown = await world.fake.sceneAction('get_next_arrivals', { stop: 'ext:x' });
  assert.equal(unknown.success, false);
  assert.equal(unknown.error.fr, "Cet arrêt n'est plus suivi.");
});

test('another server: custom address, invalid address said in red', async (t) => {
  const world = await createWorld({ config: { region: 'custom', server_url: 'not a url' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /adresse du serveur OneBusAway/);
  assert.match(fr(await failedAction(world, 'add_stop', { stop: BENTON })), /adresse du serveur/);
  await world.fake.configUpdated({
    region: 'custom',
    server_url: 'https://oba.example.org/api/',
  });
  assert.equal(world.fake.connectionStatus.connected, true);
  await action(world, 'add_stop', { stop: BENTON });
  assert.equal(
    new URL(world.network.calls.at(-1).url).origin +
      new URL(world.network.calls.at(-1).url).pathname,
    `https://oba.example.org/api/api/where/stop/${BENTON}.json`,
  );
  await world.fake.configUpdated({ region: 'san_diego' });
  await action(world, 'search_stops', { latitude: '32.7', longitude: '-117.1' });
  assert.ok(world.network.calls.at(-1).url.startsWith('https://realtime.sdmts.com/api/api/where/'));
});

test('a removed stop does not come back at the restart, even with its device', async (t) => {
  const first = await createWorld();
  await action(first, 'add_stop', { stop: BENTON });
  await create(first, 'Benton');
  await action(first, 'remove_stop', { name: BENTON });
  await first.app.stop();
  const world = await createWorld({ dataDir: first.dataDir, devices: first.fake.devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.watches, []);
  await action(world, 'add_stop', { stop: BENTON });
  assert.equal(world.service.watches.length, 1);
});

test('one stop failing keeps the others', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON, lines: '77' });
  await action(world, 'add_stop', { stop: ROOSEVELT });
  const benton = await create(world, 'Benton');
  await create(world, 'Roosevelt');
  const fetch = world.network.fetch;
  world.service.oba.fetch = async (url) =>
    url.includes(BENTON) ? new Response('oops', { status: 500 }) : fetch(url);
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(lastState(world, benton, 'next'), 13);
});

test('server down: the widget serves the aged board instead of reading again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON, lines: '77' });
  const benton = await create(world, 'Benton');
  world.network.fail = 503;
  world.clock.advance(3 * 60000);
  await world.service.refresh();
  const before = world.network.calls.length;
  const ack = await world.fake.widgetGet('arrivals', {
    settings: { stop: benton.external_id },
    language: 'en',
  });
  assert.equal(ack.data.content.components[2].items[0].value, '14:22 · 11 min · +5');
  assert.equal(world.network.calls.length, before);
});

test('a timer tick during a slow read is skipped, not queued', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BENTON });
  await create(world, 'Benton');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const fetch = world.network.fetch;
  world.service.oba.fetch = async (url) => {
    await gate;
    return fetch(url);
  };
  const before = world.network.arrivalRequests().length;
  t.mock.timers.tick(60000);
  t.mock.timers.tick(60000);
  t.mock.timers.tick(60000);
  release();
  await world.service.inflight;
  await world.service.inflight;
  assert.equal(world.network.arrivalRequests().length, before + 1);
});
