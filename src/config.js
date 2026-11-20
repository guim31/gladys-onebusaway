// -----------------------------------------------------------------------------
// Integration configuration: the defaults (they mirror the `default` values of
// the manifest `config_schema`, test/manifest.test.js checks it) and the
// normalization of what Gladys sends (strings from the form).
// -----------------------------------------------------------------------------

import { normalizeBaseUrl } from './oba.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two reads of the arrivals. One minute is the floor: one
// request per watched stop, on a key shared by nobody else but rate-limited,
// and a countdown in minutes gains nothing from more.
export const REFRESH_INTERVALS = [60, 120];

// The OneBusAway servers of the official region list
// (https://regions.onebusaway.org/regions-v3.json, 2026-11-20) that serve the
// real-time REST API. Keys of the manifest `region` select: stable.
export const REGIONS = {
  puget_sound: 'https://api.pugetsound.onebusaway.org',
  tampa: 'https://api.tampa.onebusawaycloud.com',
  san_diego: 'https://realtime.sdmts.com/api',
  washington_dc: 'https://buseta.wmata.com/onebusaway-api-webapp',
  adelaide: 'https://transit.nautilus-tech.com.au/onebusaway-api-webapp',
  davis: 'https://api.unitrans.onebusawaycloud.com',
};
export const CUSTOM_REGION = 'custom';

export const DEFAULT_CONFIG = {
  language: 'fr',
  region: 'puget_sound',
  server_url: '',
  api_key: '',
  refresh_interval: '60',
};

/**
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 * @returns {{ language: string, refreshSeconds: number, region: string, baseUrl: string|null, key: string }}
 */
export function normalizeConfig(raw = {}) {
  const language = LANGUAGES.includes(raw?.language) ? raw.language : DEFAULT_CONFIG.language;
  const seconds = Number(raw?.refresh_interval ?? DEFAULT_CONFIG.refresh_interval);
  const region =
    raw?.region === CUSTOM_REGION || Object.hasOwn(REGIONS, raw?.region ?? '')
      ? raw.region
      : DEFAULT_CONFIG.region;
  return {
    language,
    refreshSeconds: REFRESH_INTERVALS.includes(seconds)
      ? seconds
      : Number(DEFAULT_CONFIG.refresh_interval),
    region,
    // null: a custom server without a valid address (said by the status).
    baseUrl: region === CUSTOM_REGION ? normalizeBaseUrl(raw?.server_url) : REGIONS[region],
    key: String(raw?.api_key ?? '').trim(),
  };
}
