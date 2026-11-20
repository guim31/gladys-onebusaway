# OneBusAway

Die Echtzeitabfahrten deiner Bus-, Stadtbahn- und Fährhaltestellen in Gladys, für die Verkehrsnetze,
die die **OneBusAway**-API anbieten: Puget Sound (Seattle: King County Metro, Sound Transit,
Community Transit, Pierce Transit…), Tampa Bay, San Diego, Washington D.C., Adelaide, Davis oder
jeder andere OneBusAway-Server.

OneBusAway ist ein Open-Source-Projekt der Open Transit Software Foundation. Diese Integration steht
in keiner Verbindung zu OneBusAway, der Stiftung oder einem Verkehrsunternehmen.

> Entwickelt, ohne in einer OneBusAway-Region zu wohnen, gegen die echte API von Puget Sound:
> Rückmeldungen sind willkommen.

## Was du bekommst

- **Ein Gerät pro verfolgter Haltestelle** (optional nach Linien oder Richtung gefiltert): nächste
  und übernächste Abfahrt (Minuten), Verspätung der nächsten Abfahrt (Minuten), ihre Linie und ihr
  Ziel (Text), ob sie in Echtzeit prognostiziert wird (ja/nein) und ob eine Störungsmeldung des
  Verkehrsunternehmens die Haltestelle oder ihre Linien betrifft (ja/nein).
- **Ein Dashboard-Widget** mit den nächsten Abfahrten einer Haltestelle: Uhrzeit, Minuten,
  Verspätung, Echtzeit oder Fahrplan, die Störungsmeldungen oben.
- **Drei Szenen-Auslöser**: Zeit zu gehen, Abfahrt verspätet, neue Störungsmeldung.
- **Eine Szenen-Aktion**, die die nächsten Abfahrten einer Haltestelle liest, mit einem fertigen Satz
  für eine Nachricht oder einen Lautsprecher.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Internetzugang vom Gladys-Rechner aus (die Integration ruft den OneBusAway-Server deiner Region
  auf, zum Beispiel `api.pugetsound.onebusaway.org`).
- Ein **API-Schlüssel** für deine Region. Er ist kostenlos: für Puget Sound per E-Mail an
  `oba_api_key@soundtransit.org` beantragen; für die anderen Regionen siehe die Entwicklerseite des
  Verkehrsunternehmens. Der öffentliche Schlüssel `TEST` von Puget Sound reicht zum Ausprobieren, wird
  aber von allen geteilt und lehnt Anfragen ab, sobald zwei innerhalb etwa einer Sekunde kommen.

## Installation

1. Öffne in Gladys **Integrationen → Von GitHub installieren**.
2. Füge `https://github.com/guim31/gladys-onebusaway` ein und installiere.
3. Öffne den Tab **Konfiguration** der Integration.

## Konfiguration

### Einstellungen

- **Region**: der OneBusAway-Server deines Netzes (standardmäßig Puget Sound) oder **Anderer
  Server**.
- **Serveradresse (anderer Server)**: nur für „Anderer Server“, die Wurzel der API ohne
  `/api/where`, wie in der offiziellen
  [Regionenliste](https://regions.onebusaway.org/regions-v3.json) angegeben (`obaBaseUrl`).
- **API-Schlüssel**: dein Schlüssel. Leer wird der öffentliche Schlüssel `TEST` verwendet (nur Puget
  Sound).
- **Sprache der Texte**: Sprache der Funktionsnamen (beim Anlegen eines Geräts festgelegt) und der
  Szenensätze. Störungsmeldungen erscheinen so, wie das Verkehrsunternehmen sie schreibt, auf
  Englisch.
- **Aktualisierungsintervall**: 1 Minute (Standard) oder 2 Minuten. Eine Anfrage pro angelegtem
  Gerät.

### Eine Haltestelle hinzufügen

1. **Haltestellen um einen Punkt suchen**: gib einen Breiten- und einen Längengrad ein (von einer
   beliebigen Karte: ein Rechtsklick in Google Maps oder OpenStreetMap zeigt sie an) und optional
   einen Teil des Namens. Die Antwort listet die Haltestellen im Umkreis von 400 m, die nächste
   zuerst, mit Kennung und Linien: `Pike St & 4th Ave (E) [1_1180] — 10, 11, 12, 49`.
2. **Haltestelle hinzufügen**: gib ihre Kennung ein (`1_75403`: Unternehmen `1`, King County Metro,
   Haltestelle `75403`). Optionale Filter:
   - **Linien**: `67, 77` behält nur diese Linien (wie auf dem Fahrzeug: `1 Line`, `E Line`…), abgeglichen
     mit den Linien der Haltestelle.
   - **Richtung**: `Northgate` behält nur die Abfahrten, deren Ziel diesen Text enthält (Akzente und
     Groß-/Kleinschreibung egal), abgeglichen mit den Abfahrten der nächsten zwei Stunden.
3. Öffne den Tab **Entdecken** und füge das Gerät zu Gladys hinzu.

Dieselbe Haltestelle mit anderen Filtern ergibt ein weiteres Gerät. Bis zu 10 Haltestellen lassen
sich verfolgen.

### Eine Haltestelle entfernen, den Zustand prüfen

- **Haltestelle entfernen**: gib ihren Namen so ein, wie der Status ihn zeigt (`Roosevelt (1 Line)`),
  oder ihre Kennung. Das Gerät bleibt in Gladys, bis du es löschst.
- **Verfolgte anzeigen**: der Server, der verwendete Schlüssel, die Haltestellen, ob ihr Gerät
  existiert, der letzte Abruf und der letzte Fehler.

## Geräte

| Funktion            | Typ             | Inhalt                                                                 |
| ------------------- | --------------- | ---------------------------------------------------------------------- |
| Nächste Abfahrt     | Dauer (Min.)    | Minuten bis zur nächsten Abfahrt, die fährt (0 = fährt jetzt)          |
| Übernächste Abfahrt | Dauer (Min.)    | Minuten bis zur folgenden                                              |
| Verspätung          | Dauer (Min.)    | Verspätung der nächsten Abfahrt (0 pünktlich, zu früh oder unbekannt)  |
| Linie und Ziel      | Text            | `67 → Northgate Station`                                               |
| Echtzeitprognose    | binär (ja/nein) | die nächste Abfahrt wird aus der Fahrzeugposition prognostiziert       |
| Störungsmeldung     | binär (ja/nein) | eine gültige Störungsmeldung betrifft die Haltestelle oder ihre Linien |

Ohne Abfahrt in den nächsten zwei Stunden zeigen die Countdowns 1440 Minuten. Nur die von den
Filtern behaltenen Abfahrten zählen. Ausgefallene Fahrten werden von den Countdowns übersprungen.
Eine vom Server doppelt gelistete Fahrt (zwei Fahrzeuge) zählt einmal. Eine Störungsmeldung zählt,
solange sie gilt (eine für morgen veröffentlichte nicht).

## Dashboard-Widget

**Nächste Abfahrten**: wähle eine Haltestelle. Das Widget zeigt ihre nächsten acht Abfahrten (Linie,
Ziel, erwartete Zeit, Minuten, Verspätung): grün bei Echtzeitprognose, orange ab zwei Minuten
Verspätung, rot bei Ausfall, grau für eine Fahrplanzeit. Die Bildunterschrift zeigt die gültigen
Störungsmeldungen, außer du schaltest **Störungsmeldungen anzeigen** aus. Die Überschrift ist der
Name, den du dem Gerät in Gladys gegeben hast.

## Szenen-Auslöser

Jeder Auslöser lässt sich auf eine Haltestelle und eine Linie (wie auf dem Fahrzeug) beschränken.

- **Zeit zu gehen**: eine Abfahrt fährt in der gewählten Zahl Minuten (1 bis 20). Einmal pro Fahrt,
  wenn ihr Countdown die Zahl erreicht. Eine Fahrt, die zum ersten Mal schon im Fenster gesehen wird,
  löst nichts aus.
- **Abfahrt verspätet**: eine Abfahrt hat mindestens die gewählte Verspätung (1 bis 60 Minuten).
  Einmal pro Fahrt und Schwelle.
- **Neue Störungsmeldung**: eine Störungsmeldung des Verkehrsunternehmens tritt an der Haltestelle
  oder auf einer ihrer Linien in Kraft. Einmal pro Meldung und Linie.

An die Szene übergebene Variablen: Haltestelle, Linie, Ziel, planmäßige und erwartete Zeit, Minuten,
Verspätung, Echtzeit (1/0); bei einer Meldung ihre Zusammenfassung und Details. Was beim Start der
Integration schon da ist, wird nicht gemeldet; schon gemeldete Störungen werden nach einem Neustart
nicht erneut gemeldet.

## Szenen-Aktionen

**Nächste Abfahrten lesen**: wähle eine Haltestelle, optional eine Linie. Ausgaben: ein Satz
(`67 nach Northgate Station ab East Stevens Way NE & Benton Ln: in 7 und 19 Min. (3 Min. Verspätung)`),
die Haltestelle, Linie, Ziel, Wartezeit in Minuten, Minuten bis zur folgenden, Verspätung, erwartete
Zeit, Echtzeit (1/0), Störungsmeldung (1/0). Der Satz folgt der Sprache der Konfiguration.

## Szenenbeispiele

- **Zum Bus aufbrechen**: Auslöser „Zeit zu gehen“, Haltestelle Benton Ln (67), 7 Min. → „Dein Bus
  fährt in {{minutes}} Min.“ senden und das Flurlicht blinken lassen.
- **Morgenüberblick**: werktags um 7:00 Aktion „Nächste Abfahrten lesen“ → ihren Satz an den
  Küchenlautsprecher senden.
- **Schnee-Umleitung**: Auslöser „Neue Störungsmeldung“, Haltestelle Benton Ln → die Zusammenfassung
  per Nachricht senden.

## Daten, Aktualisierung und Kontingente

Die OneBusAway-Server werden von den Verkehrsunternehmen betrieben; ihre API ist mit Schlüssel
kostenlos. Jeder Schlüssel hat sein eigenes Ratenlimit (der geteilte Schlüssel `TEST` lehnt eine
zweite Anfrage innerhalb etwa einer Sekunde ab). Die Integration liest die Haltestellen nacheinander,
im Abstand von einer Sekunde, höchstens einmal pro Minute, nur für die in Gladys angelegten Geräte,
und versucht eine abgelehnte Anfrage zweimal erneut. Abgefragt werden die nächsten zwei Stunden jeder
Haltestelle. Die Zeiten sind die Echtzeitprognosen des Unternehmens, wenn das Fahrzeug verfolgt
wird, sonst der Fahrplan. Halte dich an die Nutzungsbedingungen deines Unternehmens (Puget Sound:
die der OneBusAway-API von Sound Transit).

## Fehlerbehebung

- **Kein Gerät in Entdecken**: füge zuerst die Haltestelle mit „Haltestelle hinzufügen“ hinzu.
- **„Der OneBusAway-Server lehnt den API-Schlüssel ab“**: prüfe Schlüssel und Region (ein Schlüssel
  funktioniert nur auf dem Server seiner Region).
- **„rate limit exceeded“**: der Schlüssel `TEST` wird von allen geteilt: beantrage deinen eigenen
  oder wähle eine Aktualisierung alle 2 Minuten.
- **„Dieser OneBusAway-Server kennt keine Haltestelle“**: die Kennung ist die Nummer des
  Unternehmens, ein Unterstrich und die Haltestellennummer (`1_75403`), nicht nur die Nummer am
  Haltestellenschild; nutze „Haltestellen um einen Punkt suchen“.
- **Ein Auslöser löst nicht aus**: prüfe die Linie (wie auf dem Fahrzeug) und dass das Gerät in
  Gladys existiert: nur angelegte Geräte werden gelesen.

## Grenzen

- Entwickelt ohne das Verkehrsnetz vor Ort, gegen die echte API von Puget Sound: Rückmeldungen sind
  willkommen, vor allem aus den anderen Regionen.
- Funktionsnamen werden beim Anlegen des Geräts festgelegt.
- Störungsmeldungen erscheinen in der Sprache des Unternehmens, nie übersetzt.
- Die Suche braucht einen Punkt: OneBusAway hat keine Suche nach Haltestellennamen.
- MTA New York (Bus Time) wird nicht unterstützt: sie bietet diese API nicht an.

## Danksagung

Daten: die Verkehrsunternehmen jeder Region, über [OneBusAway](https://onebusaway.org) (Apache 2.0,
Open Transit Software Foundation). Aufbau geteilt mit der Integration `gladys-sl-stockholm`.
