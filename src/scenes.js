// -----------------------------------------------------------------------------
// Scene action (manifest `scene_actions`, Gladys 5.1+).
//
// - get_next_arrivals: the next departures of a watched stop, as numbers for
//   a "Continue only if" step and as a sentence ready for a message or a
//   speaker ("67 to Northgate Station at Benton Ln: in 3 and 12 min").
//
// A scene action does not receive the user's language: the sentence follows
// the `language` of the configuration. Outputs are numbers, never booleans:
// the core's "Continue only if" compares with ===, and its value field only
// produces numbers and strings (Gladys 5.2.0).
// -----------------------------------------------------------------------------

import { clockTime, running } from './arrivals.js';
import { NO_DEPARTURE_MINUTES } from './devices.js';
import { TEXT, say, sayAll } from './messages.js';
import { ActionFailure } from './errors.js';

// Route and destination groups in the sentence.
export const MAX_SENTENCE_GROUPS = 3;

/** The running departures grouped by route and destination, soonest first. */
export function groupDepartures(departures) {
  const groups = new Map();
  for (const departure of running(departures)) {
    const key = `${departure.line}|${departure.destination}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(departure);
  }
  return [...groups.values()];
}

/** 1 when a service alert concerns the watch (and this route, when given). */
const alerted = (alerts, line) =>
  alerts.some(
    (alert) =>
      !line || alert.lines.length === 0 || alert.lines.some((name) => name.toUpperCase() === line),
  )
    ? 1
    : 0;

export const SCENE_ACTIONS = {
  async get_next_arrivals(service, { fields }) {
    const language = service.config.language;
    const found = await service.boardOf(fields.stop);
    if (!found) {
      throw new ActionFailure(sayAll(TEXT, 'gone'));
    }
    if (!found.departures) {
      throw new ActionFailure(sayAll(TEXT, 'unavailable'));
    }
    const { watch } = found;
    const line = String(fields.line ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
    const departures = found.departures.filter(
      (departure) => !line || departure.line.toUpperCase() === line,
    );
    const groups = groupDepartures(departures);
    const first = groups[0];
    if (!first) {
      return {
        sentence: say(TEXT, language, 'nothingAt', { stop: watch.name }),
        stop_name: watch.name,
        line,
        destination: '',
        minutes: NO_DEPARTURE_MINUTES,
        following_minutes: NO_DEPARTURE_MINUTES,
        delay_minutes: 0,
        expected_time: '',
        realtime: 0,
        alert: alerted(found.alerts, line),
      };
    }
    const [next, following] = first;
    return {
      sentence: groups
        .slice(0, MAX_SENTENCE_GROUPS)
        .map((group) => service.sentence(watch, group, language))
        .join('. '),
      stop_name: watch.name,
      line: next.line,
      destination: next.destination,
      minutes: next.minutes,
      following_minutes: following ? following.minutes : NO_DEPARTURE_MINUTES,
      delay_minutes: next.delay,
      expected_time: clockTime(next.expected),
      realtime: next.realtime ? 1 : 0,
      alert: alerted(found.alerts, line),
    };
  },
};
