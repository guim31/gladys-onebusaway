# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A device per watched OneBusAway stop (optionally filtered by routes or
  direction): next and following departure, delay, route and destination,
  real-time prediction and service alert indicators.
- Regions Puget Sound (Seattle), Tampa Bay, San Diego, Washington D.C.,
  Adelaide and Davis, or any other OneBusAway server, with your API key (the
  public TEST key when empty).
- Configuration actions to find the stops near a point, add and remove stops,
  and show what is watched.
- A "Next arrivals" dashboard widget, with delays, real time or timetable, and
  the service alerts in force.
- Scene triggers: time to leave, departure delayed, new service alert.
- A scene action reading the next arrivals, with a sentence ready to send.
- Texts and documentation in English, French, German and Spanish.
