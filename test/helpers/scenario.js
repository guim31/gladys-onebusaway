// -----------------------------------------------------------------------------
// A scenario staging every trigger on the real arrivals of East Stevens Way NE
// & Benton Ln (UW campus): the first read is silent, then, three minutes
// later, bus 72 is 12 minutes late, a new service alert concerning route 67
// comes into force, and the countdown of bus 77 reaches 12 minutes. The
// changes are made on the recorded answer, as the server would send them.
// -----------------------------------------------------------------------------

import { BENTON, FIXTURE_TIME, action, create } from './world.js';

/**
 * A service alert as the OneBusAway API writes it, coming into force a minute
 * after the fixture time (`from`), for six hours.
 */
export function situation({
  id,
  summary,
  description = '',
  routeIds = [],
  stopIds = [],
  from = FIXTURE_TIME + 60000,
}) {
  return {
    activeWindows: [{ from, to: from + 6 * 3600000 }],
    allAffects: [
      ...routeIds.map((routeId) => ({ agencyId: '1', routeId, stopId: '', tripId: '' })),
      ...stopIds.map((stopId) => ({ agencyId: '1', routeId: '', stopId, tripId: '' })),
    ],
    consequences: [],
    creationTime: FIXTURE_TIME,
    description: { lang: 'en', value: description },
    id,
    publicationWindows: [],
    reason: 'CONSTRUCTION',
    severity: 'unknown',
    summary: { lang: 'en', value: summary },
  };
}

/** The recorded arrivals of `route` at a stop (to change them). */
export const arrivalsOf = (body, route) =>
  body.data.entry.arrivalsAndDepartures.filter((entry) => entry.routeShortName === route);

/** Resolves with the scene events fired after the first read. */
export async function stageEverything(world) {
  await action(world, 'add_stop', { stop: BENTON });
  const device = await create(world, 'Benton');
  const before = world.fake.sceneEvents.length;
  const body = world.network.stops[BENTON];
  // Bus 72 to University District (scheduled 14:20): 12 minutes late.
  const late = arrivalsOf(body, '72')[1];
  late.predictedDepartureTime = late.scheduledDepartureTime + 12 * 60000;
  late.predictedArrivalTime = late.predictedDepartureTime;
  // A new alert on route 67, attached to its trips.
  body.data.references.situations.push(
    situation({
      id: '1_990001',
      summary: 'Route 67 snow routing',
      description: 'Route 67 is on its snow route.',
      routeIds: ['1_100259'],
    }),
  );
  for (const entry of arrivalsOf(body, '67')) {
    entry.situationIds.push('1_990001');
  }
  world.clock.advance(3 * 60000);
  await world.service.refresh();
  return { device, events: world.fake.sceneEvents.slice(before) };
}
