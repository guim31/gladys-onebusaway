# OneBusAway

Real-time arrivals of your bus, light rail and ferry stops in Gladys, for the transit networks that
publish the **OneBusAway** API: Puget Sound (Seattle: King County Metro, Sound Transit, Community
Transit, Pierce Transit…), Tampa Bay, San Diego, Washington D.C., Adelaide, Davis, or any other
OneBusAway server.

OneBusAway is an open-source project of the Open Transit Software Foundation. This integration is
not affiliated with OneBusAway, the foundation or any transit agency.

> Developed without living in a OneBusAway region, against the real Puget Sound API: feedback
> welcome.

## What you get

- **A device per watched stop** (optionally filtered by routes or direction): next departure and
  following departure (minutes), delay of the next departure (minutes), its route and destination
  (text), whether it is predicted in real time (yes/no), and whether a service alert of the agency
  concerns the stop or its routes (yes/no).
- **A dashboard widget** with the next departures of a stop: time, minutes, delay, real time or
  timetable, the service alerts on top.
- **Three scene triggers**: time to leave, departure delayed, new service alert.
- **A scene action** that reads the next departures of a stop, with a sentence ready to send by
  message or speaker.

## Requirements

- Gladys Assistant 5.3.0 or later.
- Internet access from the Gladys host (the integration calls the OneBusAway server of your
  region, for example `api.pugetsound.onebusaway.org`).
- An **API key** for your region. It is free: for Puget Sound, ask for one by email at
  `oba_api_key@soundtransit.org`; for the other regions, see the developer page of the agency. The
  public key `TEST` of Puget Sound works for a quick try, but it is shared by everyone and refuses
  requests as soon as two come within a second or so.

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-onebusaway` and install.
3. Open the integration's **Configuration** tab.

## Configuration

### Settings

- **Region**: the OneBusAway server of your network (Puget Sound by default), or **Other server**.
- **Server address (other server)**: only for "Other server", the root of the API without
  `/api/where`, as listed in the official [region list](https://regions.onebusaway.org/regions-v3.json)
  (`obaBaseUrl`).
- **API key**: your key. Empty, the public `TEST` key is used (Puget Sound only).
- **Language of the texts**: language of the feature names (set when a device is created) and of
  the scene sentences. Service alerts are shown as the agency writes them, in English.
- **Refresh interval**: 1 minute (default) or 2 minutes. One request per created device.

### Adding a stop

1. **Find stops near a point**: type a latitude and a longitude (from any map: a right click on
   Google Maps or OpenStreetMap shows them), and optionally part of a name. The answer lists the
   stops within 400 m, nearest first, with their identifier and routes:
   `Pike St & 4th Ave (E) [1_1180] — 10, 11, 12, 49`.
2. **Add a stop**: type its identifier (`1_75403`: agency `1`, King County Metro, stop `75403`).
   Optional filters:
   - **Routes**: `67, 77` keeps only these routes (as written on the vehicle: `1 Line`, `E Line`…).
     They are checked against the routes of the stop.
   - **Direction**: `Northgate` keeps only the departures whose destination contains this text
     (accents and case ignored), checked against the departures of the next two hours.
3. Open the **Discover** tab and add the device to Gladys.

The same stop with other filters makes another device. Up to 10 stops can be watched.

### Removing a stop, checking the state

- **Remove a stop**: type its name as shown by the status (`Roosevelt (1 Line)`) or its identifier.
  Its device stays in Gladys until you delete it.
- **Show what is watched**: the server, the key used, the stops, whether their device exists, the
  last read and the last error.

## Devices

| Feature               | Type            | Content                                                        |
| --------------------- | --------------- | -------------------------------------------------------------- |
| Next departure        | duration (min)  | minutes before the next departure that runs (0 = leaving now)  |
| Following departure   | duration (min)  | minutes before the one after                                   |
| Delay                 | duration (min)  | delay of the next departure (0 when on time, early or unknown) |
| Route and destination | text            | `67 → Northgate Station`                                       |
| Real-time prediction  | binary (yes/no) | the next departure is predicted from the vehicle's position    |
| Service alert         | binary (yes/no) | a service alert in force concerns the stop or its routes       |

With no departure in the next two hours, the countdowns show 1440 minutes. Only the departures kept
by the filters count. Cancelled trips are skipped by the countdowns. A trip listed twice by the
server (two vehicles) counts once. A service alert counts while it is in force (an alert published
for tomorrow does not).

## Dashboard widget

**Next arrivals**: choose a stop. The widget shows its next eight departures (route, destination,
expected time, minutes, delay): green when predicted in real time, orange when two minutes late or
more, red when cancelled, grey for a timetable time. The caption shows the service alerts in force,
unless you turn off **Show service alerts**. The heading is the name you gave the device in Gladys.

## Scene triggers

Each trigger can be limited to a stop and to a route (as written on the vehicle). Without a stop, two devices of the same stop (other filters) each fire their own event.

- **Time to leave**: a departure leaves in the chosen number of minutes (1 to 20). Fires once per
  trip, when its countdown reaches the number. A trip first seen inside the window does not fire.
- **Departure delayed**: a departure is late by the chosen number of minutes or more (1 to 60).
  Once per trip and threshold.
- **New service alert**: a service alert of the agency comes into force at the stop or on one of
  its routes. Once per alert and route, when it has come into force within the last 30 minutes (an alert in force since the morning, first seen with a later trip, is not announced).

Variables passed to the scene: stop, route, destination, scheduled and expected times, minutes,
delay, real time (1/0); for an alert, its summary and details. What is already there when the
integration starts is not announced; alerts already announced are not announced again after a
restart.

## Scene actions

**Read the next arrivals**: choose a stop, optionally a route. Outputs: a sentence
(`67 to Northgate Station at East Stevens Way NE & Benton Ln: in 7 and 19 min (3 min late)`), the
stop, route, destination, minutes to wait, minutes to the following one, delay, expected time,
real time (1/0), service alert (1/0). The sentence follows the language of the configuration.

## Scene examples

- **Leave for the bus**: trigger "Time to leave", stop Benton Ln (67), 7 min → send "Your bus
  leaves in {{minutes}} min" and blink the hall light.
- **Morning briefing**: at 7:00 on weekdays, action "Read the next arrivals" → send its sentence to
  the kitchen speaker.
- **Snow routing**: trigger "New service alert", stop Benton Ln → send the summary by message.

## Data, refresh and quotas

The OneBusAway servers are run by the transit agencies; their API is free with a key. Each key has
its own rate limit (the `TEST` key, shared, refuses a second request within about a second). The
integration reads the stops one after the other, spaced by a second, at most once a minute, only
for the devices created in Gladys, and tries a refused request again twice. It asks for the next
two hours of each stop. Times are the agency's real-time predictions when the vehicle is tracked,
else the timetable. Follow the terms of use of your agency (Puget Sound: those of Sound Transit's
OneBusAway API).

## Troubleshooting

- **No device in Discover**: add the stop first, with "Add a stop".
- **"The OneBusAway server refuses the API key"**: check the key and the region (a key works only
  on its region's server).
- **"Rate limit exceeded"**: the `TEST` key is shared by everyone: ask for your own key, or choose
  a 2-minute refresh.
- **"This OneBusAway server knows no stop"**: the identifier is the agency number, an underscore and
  the stop number (`1_75403`), not the number on the stop sign alone; use "Find stops near a point".
- **A trigger does not fire**: check the route (as written on the vehicle) and that the device
  exists in Gladys: only created devices are read.

## Limits

- Developed without the transit network at hand, against the real Puget Sound API: feedback
  welcome, especially from the other regions.
- Feature names are set when the device is created.
- Service alerts are shown in the agency's language, never translated.
- The search needs a point: OneBusAway has no search by stop name.
- MTA New York (Bus Time) is not supported: it does not serve this API.

## Credits

Data: the transit agencies of each region, through [OneBusAway](https://onebusaway.org) (Apache 2.0,
Open Transit Software Foundation). Structure shared with the `gladys-sl-stockholm` integration.
