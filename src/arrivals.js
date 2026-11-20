// -----------------------------------------------------------------------------
// From a OneBusAway answer to what a watched stop shows: departures (times in
// epoch milliseconds, minutes to wait, delay, real time or timetable,
// cancellation) kept by the filters of the watch (routes, direction), and the
// service alerts in force that concern them. Pure functions: the clock is a
// parameter.
// -----------------------------------------------------------------------------

import { routeName } from './oba.js';

/** Lower case, without accents: "Peña" matches "pena". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const positive = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;

const isCancelled = (entry) =>
  [entry?.status, entry?.tripStatus?.status, entry?.scheduleRelationship].some((status) =>
    /cancel/i.test(String(status ?? '')),
  );

/**
 * One departure per trip and stop visit, soonest first. An entry that only
 * arrives (the end of the line: `departureEnabled: false`) is no departure;
 * the ones already gone (an answer a minute old) are dropped. The server can
 * list one trip twice, predicted from two vehicles (route 67 on 2026-11-20):
 * the soonest is kept.
 * @param {{ entry: object, references: object }} answer `Oba.arrivals`
 * @param {number} now ms
 */
export function parseDepartures(answer, now) {
  const routes = new Map((answer?.references?.routes ?? []).map((route) => [route.id, route]));
  const departures = [];
  for (const entry of answer?.entry?.arrivalsAndDepartures ?? []) {
    if (!entry || entry.departureEnabled === false) {
      continue;
    }
    const aimed = positive(entry.scheduledDepartureTime) || positive(entry.scheduledArrivalTime);
    // A prediction of 0 means none: the timetable time is shown.
    const predicted = entry.predicted === true ? positive(entry.predictedDepartureTime) : 0;
    const expected = predicted || aimed;
    if (!aimed || expected < now - 60000) {
      continue;
    }
    const route = routes.get(entry.routeId);
    departures.push({
      // A loop can serve the stop twice in one trip: the stop sequence too.
      key: `${entry.tripId}|${entry.serviceDate ?? ''}|${entry.stopSequence ?? ''}`,
      line:
        String(entry.routeShortName || routeName(route) || entry.routeLongName || '').trim() || '?',
      routeId: String(entry.routeId ?? ''),
      destination: String(entry.tripHeadsign ?? '').trim() || '?',
      aimed,
      expected,
      minutes: Math.max(0, Math.floor((expected - now) / 60000)),
      // Early departures are not a delay: 0.
      delay: predicted ? Math.max(0, Math.round((predicted - aimed) / 60000)) : 0,
      realtime: predicted > 0,
      cancelled: isCancelled(entry),
      situationIds: [
        ...new Set([...(entry.situationIds ?? []), ...(entry.tripStatus?.situationIds ?? [])]),
      ],
    });
  }
  const seen = new Set();
  return departures
    .sort((a, b) => a.expected - b.expected)
    .filter((departure) => !seen.has(departure.key) && seen.add(departure.key));
}

/**
 * The departures a watch keeps: its routes (as written on the vehicle, case
 * ignored), its direction (part of the headsign, accents and case ignored).
 * @param {object[]} departures from parseDepartures
 * @param {{ lines?: string[], direction?: string }} watch
 */
export function applyFilters(departures, watch) {
  const lines = new Set((watch.lines ?? []).map((line) => line.toUpperCase()));
  const direction = fold(watch.direction);
  return departures.filter(
    (departure) =>
      (lines.size === 0 || lines.has(departure.line.toUpperCase())) &&
      (!direction || fold(departure.destination).includes(direction)),
  );
}

/**
 * The departures of an earlier read, as of `now`: minutes counted again from
 * the expected time, the ones gone dropped. A board read a minute ago (or
 * before an outage) never shows a frozen countdown.
 */
export const aged = (departures, now) =>
  departures
    .filter((departure) => departure.expected >= now - 60000)
    .map((departure) => ({
      ...departure,
      minutes: Math.max(0, Math.floor((departure.expected - now) / 60000)),
    }));

/** The departures that will run: not cancelled. */
export const running = (departures) => departures.filter((departure) => !departure.cancelled);

/** In force at `now`: inside one of its active windows, or without any. */
export function inForce(situation, now) {
  const windows = (situation?.activeWindows ?? []).filter(
    (window) => positive(window?.from) || positive(window?.to),
  );
  return (
    windows.length === 0 ||
    windows.some(
      (window) =>
        (!positive(window.from) || positive(window.from) <= now) &&
        (!positive(window.to) || now <= positive(window.to)),
    )
  );
}

const text = (value) => String(value?.value ?? value ?? '').trim();

/**
 * The service alerts in force that concern a watch, each once: the ones the
 * stop carries, and the ones of the departures it keeps (so an alert on a
 * route the watch filters out does not count).
 * @param {{ entry: object, references: object }} answer
 * @param {object[]} departures the departures kept by the watch
 * @param {number} now ms
 */
export function alertsFor(answer, departures, now) {
  const wanted = new Set([
    ...(answer?.entry?.situationIds ?? []),
    ...departures.flatMap((departure) => departure.situationIds),
  ]);
  const routes = new Map((answer?.references?.routes ?? []).map((route) => [route.id, route]));
  const kept = new Set(departures.map((departure) => departure.line));
  const found = [];
  for (const situation of answer?.references?.situations ?? []) {
    if (!situation?.id || !wanted.has(situation.id) || !inForce(situation, now)) {
      continue;
    }
    const lines = [
      ...new Set(
        (situation.allAffects ?? [])
          .map((affect) => routeName(routes.get(affect?.routeId)))
          .filter((line) => line && kept.has(line)),
      ),
    ];
    found.push({
      id: String(situation.id),
      lines,
      summary: text(situation.summary),
      description: text(situation.description),
    });
  }
  return found;
}

const clockFormat = new Map();

/** "07:45" in the time zone of the container (TZ, set by Gladys). */
export function clockTime(ms) {
  const zone = process.env.TZ || undefined;
  if (!clockFormat.has(zone)) {
    clockFormat.set(
      zone,
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: zone,
      }),
    );
  }
  return clockFormat.get(zone).format(new Date(ms));
}
