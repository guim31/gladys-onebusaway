// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Brand, route and place names never translate; the service
// alerts come from the transit agency (in English) and are shown as they are.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Feature names (frozen when the device is created, in the configured language).
export const NAMES = {
  en: {
    next: 'Next departure',
    following: 'Following departure',
    delay: 'Delay',
    line: 'Route and destination',
    realtime: 'Real-time prediction',
    alert: 'Service alert',
  },
  fr: {
    next: 'Prochain passage',
    following: 'Passage suivant',
    delay: 'Retard',
    line: 'Ligne et destination',
    realtime: 'Prévision en temps réel',
    alert: 'Alerte de service',
  },
  de: {
    next: 'Nächste Abfahrt',
    following: 'Übernächste Abfahrt',
    delay: 'Verspätung',
    line: 'Linie und Ziel',
    realtime: 'Echtzeitprognose',
    alert: 'Störungsmeldung',
  },
  es: {
    next: 'Próxima salida',
    following: 'Salida siguiente',
    delay: 'Retraso',
    line: 'Línea y destino',
    realtime: 'Previsión en tiempo real',
    alert: 'Aviso de servicio',
  },
};

export const TEXT = {
  en: {
    searchNeedPoint: 'Give a latitude and a longitude, e.g. 47.6097 and -122.3331.',
    searchNone: 'No stop within 400 m of this point.',
    searchNoneNamed: ({ query }) => `No stop matching "${query}" within 400 m of this point.`,
    searchFound: ({ count }) => `${count} stop(s) found:`,
    searchHint: 'To watch one, copy its identifier (in brackets) into "Add a stop".',
    addNeedId: 'Give the stop identifier shown by "Find stops near a point", e.g. 1_75403.',
    addUnknown: ({ query }) => `This OneBusAway server knows no stop "${query}".`,
    addUnknownLines: ({ lines, available }) =>
      `Route(s) not serving this stop: ${lines}. Routes of the stop: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `No departure towards "${direction}" in the next 2 hours. Destinations: ${available}.`,
    added: ({ name }) => `${name} added.\nOpen the Discover tab to create its device.`,
    alreadyWatched: ({ name }) => `${name} is already watched with these filters.`,
    tooMany: ({ max }) => `You already watch ${max} stops, the maximum.`,
    removed: ({ name }) => `${name} is no longer watched. Delete its device in Gladys if you wish.`,
    removeUnknown: ({ query }) => `No watched stop matches "${query}".`,
    removeAmbiguous:
      'Several watched stops match: use the full name shown by "Show what is watched".',
    statusNone: 'No stop watched yet: use "Find stops near a point" then "Add a stop".',
    statusHeader: ({ count }) => `Watched stops: ${count}`,
    statusCreated: 'device created',
    statusNotCreated: 'device not created yet (Discover tab)',
    statusServer: ({ host }) => `Server: ${host}`,
    statusTestKey: 'Key: the public TEST key, heavily rate-limited. Ask for your own key.',
    statusOwnKey: 'Key: your own key.',
    statusRefreshed: ({ age }) => `Last read: ${age} s ago.`,
    statusNeverRefreshed: 'Not read yet (only the created devices are read).',
    statusError: ({ error }) => `Last error: ${error}`,
    noServer: 'The address of the OneBusAway server is missing or invalid (configuration).',
    keyRefused: 'The OneBusAway server refuses the API key: check it in the configuration.',
    serviceDown: ({ error }) =>
      `The OneBusAway server cannot be reached (${error}). Try again in a moment.`,
    now: 'now',
    in: ({ minutes }) => `in ${minutes} min`,
    inTwo: ({ first, second }) => `in ${first} and ${second} min`,
    nowThen: ({ second }) => `now, then in ${second} min`,
    noDeparture: 'No departure in the next 2 hours',
    cancelled: 'Cancelled',
    delayedNote: ({ delay }) => ` (${delay} min late)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} to ${destination} at ${stop}: ${when}`,
    nothingAt: ({ stop }) => `No departure from ${stop} in the next 2 hours.`,
    pickStop: 'Choose a stop in the widget settings.',
    loading: 'Arrivals are being read…',
    gone: 'This stop is no longer watched.',
    legend: 'Time · minutes · delay. Grey: timetable only.',
    unavailable: 'Arrivals not available yet, try again in a minute.',
  },
  fr: {
    searchNeedPoint: 'Indiquez une latitude et une longitude, par exemple 47.6097 et -122.3331.',
    searchNone: 'Aucun arrêt à moins de 400 m de ce point.',
    searchNoneNamed: ({ query }) =>
      `Aucun arrêt correspondant à « ${query} » à moins de 400 m de ce point.`,
    searchFound: ({ count }) => `${count} arrêt(s) trouvé(s) :`,
    searchHint:
      'Pour en suivre un, copiez son identifiant (entre crochets) dans « Ajouter un arrêt ».',
    addNeedId:
      "Indiquez l'identifiant de l'arrêt donné par « Chercher les arrêts autour d'un point », par exemple 1_75403.",
    addUnknown: ({ query }) => `Ce serveur OneBusAway ne connaît aucun arrêt « ${query} ».`,
    addUnknownLines: ({ lines, available }) =>
      `Ligne(s) absente(s) de cet arrêt : ${lines}. Lignes de l'arrêt : ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Aucun départ vers « ${direction} » dans les 2 heures. Destinations : ${available}.`,
    added: ({ name }) => `${name} ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.`,
    alreadyWatched: ({ name }) => `${name} est déjà suivi avec ces filtres.`,
    tooMany: ({ max }) => `Vous suivez déjà ${max} arrêts, le maximum.`,
    removed: ({ name }) =>
      `${name} n'est plus suivi. Supprimez son appareil dans Gladys si vous le souhaitez.`,
    removeUnknown: ({ query }) => `Aucun arrêt suivi ne correspond à « ${query} ».`,
    removeAmbiguous:
      'Plusieurs arrêts suivis correspondent : utilisez le nom complet affiché par « Voir ce qui est suivi ».',
    statusNone:
      "Aucun arrêt suivi : utilisez « Chercher les arrêts autour d'un point » puis « Ajouter un arrêt ».",
    statusHeader: ({ count }) => `Arrêts suivis : ${count}`,
    statusCreated: 'appareil créé',
    statusNotCreated: 'appareil pas encore créé (onglet Découverte)',
    statusServer: ({ host }) => `Serveur : ${host}`,
    statusTestKey: 'Clé : la clé publique TEST, très limitée. Demandez votre propre clé.',
    statusOwnKey: 'Clé : votre propre clé.',
    statusRefreshed: ({ age }) => `Dernière lecture : il y a ${age} s.`,
    statusNeverRefreshed: 'Pas encore lu (seuls les appareils créés sont lus).',
    statusError: ({ error }) => `Dernière erreur : ${error}`,
    noServer: "L'adresse du serveur OneBusAway manque ou est invalide (configuration).",
    keyRefused: 'Le serveur OneBusAway refuse la clé d’API : vérifiez-la dans la configuration.',
    serviceDown: ({ error }) =>
      `Le serveur OneBusAway est injoignable (${error}). Réessayez dans un instant.`,
    now: 'maintenant',
    in: ({ minutes }) => `dans ${minutes} min`,
    inTwo: ({ first, second }) => `dans ${first} et ${second} min`,
    nowThen: ({ second }) => `maintenant, puis dans ${second} min`,
    noDeparture: 'Aucun départ dans les 2 heures',
    cancelled: 'Supprimé',
    delayedNote: ({ delay }) => ` (${delay} min de retard)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} vers ${destination} à ${stop} : ${when}`,
    nothingAt: ({ stop }) => `Aucun départ de ${stop} dans les 2 heures.`,
    pickStop: 'Choisissez un arrêt dans les réglages du widget.',
    loading: 'Lecture des passages en cours…',
    gone: "Cet arrêt n'est plus suivi.",
    legend: 'Heure · minutes · retard. Gris : horaire théorique.',
    unavailable: 'Passages pas encore disponibles, réessayez dans une minute.',
  },
  de: {
    searchNeedPoint: 'Gib einen Breiten- und einen Längengrad an, z. B. 47.6097 und -122.3331.',
    searchNone: 'Keine Haltestelle im Umkreis von 400 m um diesen Punkt.',
    searchNoneNamed: ({ query }) =>
      `Keine Haltestelle passend zu „${query}“ im Umkreis von 400 m um diesen Punkt.`,
    searchFound: ({ count }) => `${count} Haltestelle(n) gefunden:`,
    searchHint:
      'Um eine zu verfolgen, kopiere ihre Kennung (in Klammern) in „Haltestelle hinzufügen“.',
    addNeedId:
      'Gib die Kennung der Haltestelle aus „Haltestellen um einen Punkt suchen“ an, z. B. 1_75403.',
    addUnknown: ({ query }) => `Dieser OneBusAway-Server kennt keine Haltestelle „${query}“.`,
    addUnknownLines: ({ lines, available }) =>
      `Linie(n) hier nicht bedient: ${lines}. Linien der Haltestelle: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Keine Abfahrt Richtung „${direction}“ in den nächsten 2 Stunden. Ziele: ${available}.`,
    added: ({ name }) => `${name} hinzugefügt.\nÖffne den Tab „Entdecken“, um das Gerät anzulegen.`,
    alreadyWatched: ({ name }) => `${name} wird mit diesen Filtern schon verfolgt.`,
    tooMany: ({ max }) => `Du verfolgst schon ${max} Haltestellen, das Maximum.`,
    removed: ({ name }) =>
      `${name} wird nicht mehr verfolgt. Lösche das Gerät in Gladys, wenn du willst.`,
    removeUnknown: ({ query }) => `Keine verfolgte Haltestelle passt zu „${query}“.`,
    removeAmbiguous:
      'Mehrere verfolgte Haltestellen passen: nimm den vollen Namen aus „Verfolgte anzeigen“.',
    statusNone:
      'Noch keine Haltestelle: nutze „Haltestellen um einen Punkt suchen“, dann „Haltestelle hinzufügen“.',
    statusHeader: ({ count }) => `Verfolgte Haltestellen: ${count}`,
    statusCreated: 'Gerät angelegt',
    statusNotCreated: 'Gerät noch nicht angelegt (Tab „Entdecken“)',
    statusServer: ({ host }) => `Server: ${host}`,
    statusTestKey:
      'Schlüssel: der öffentliche TEST-Schlüssel, stark begrenzt. Beantrage deinen eigenen.',
    statusOwnKey: 'Schlüssel: dein eigener Schlüssel.',
    statusRefreshed: ({ age }) => `Zuletzt gelesen: vor ${age} s.`,
    statusNeverRefreshed: 'Noch nicht gelesen (nur angelegte Geräte werden gelesen).',
    statusError: ({ error }) => `Letzter Fehler: ${error}`,
    noServer: 'Die Adresse des OneBusAway-Servers fehlt oder ist ungültig (Konfiguration).',
    keyRefused: 'Der OneBusAway-Server lehnt den API-Schlüssel ab: prüfe ihn in der Konfiguration.',
    serviceDown: ({ error }) =>
      `Der OneBusAway-Server ist nicht erreichbar (${error}). Versuch es gleich noch einmal.`,
    now: 'jetzt',
    in: ({ minutes }) => `in ${minutes} Min.`,
    inTwo: ({ first, second }) => `in ${first} und ${second} Min.`,
    nowThen: ({ second }) => `jetzt, dann in ${second} Min.`,
    noDeparture: 'Keine Abfahrt in den nächsten 2 Stunden',
    cancelled: 'Fällt aus',
    delayedNote: ({ delay }) => ` (${delay} Min. Verspätung)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} nach ${destination} ab ${stop}: ${when}`,
    nothingAt: ({ stop }) => `Keine Abfahrt ab ${stop} in den nächsten 2 Stunden.`,
    pickStop: 'Wähle eine Haltestelle in den Widget-Einstellungen.',
    loading: 'Abfahrten werden gelesen…',
    gone: 'Diese Haltestelle wird nicht mehr verfolgt.',
    legend: 'Uhrzeit · Minuten · Verspätung. Grau: nur Fahrplan.',
    unavailable: 'Abfahrten noch nicht verfügbar, versuch es in einer Minute.',
  },
  es: {
    searchNeedPoint: 'Indique una latitud y una longitud, por ejemplo 47.6097 y -122.3331.',
    searchNone: 'Ninguna parada a menos de 400 m de este punto.',
    searchNoneNamed: ({ query }) =>
      `Ninguna parada que coincida con «${query}» a menos de 400 m de este punto.`,
    searchFound: ({ count }) => `${count} parada(s) encontrada(s):`,
    searchHint: 'Para seguir una, copie su identificador (entre corchetes) en «Añadir una parada».',
    addNeedId:
      'Indique el identificador de la parada que da «Buscar paradas cerca de un punto», por ejemplo 1_75403.',
    addUnknown: ({ query }) => `Este servidor OneBusAway no conoce ninguna parada «${query}».`,
    addUnknownLines: ({ lines, available }) =>
      `Línea(s) sin servicio en esta parada: ${lines}. Líneas de la parada: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Ninguna salida hacia «${direction}» en las próximas 2 horas. Destinos: ${available}.`,
    added: ({ name }) => `${name} añadida.\nAbra la pestaña Descubrir para crear su dispositivo.`,
    alreadyWatched: ({ name }) => `${name} ya se sigue con estos filtros.`,
    tooMany: ({ max }) => `Ya sigue ${max} paradas, el máximo.`,
    removed: ({ name }) => `${name} ya no se sigue. Elimine su dispositivo en Gladys si lo desea.`,
    removeUnknown: ({ query }) => `Ninguna parada seguida coincide con «${query}».`,
    removeAmbiguous:
      'Varias paradas seguidas coinciden: use el nombre completo que muestra «Ver lo que se sigue».',
    statusNone:
      'Ninguna parada seguida: use «Buscar paradas cerca de un punto» y luego «Añadir una parada».',
    statusHeader: ({ count }) => `Paradas seguidas: ${count}`,
    statusCreated: 'dispositivo creado',
    statusNotCreated: 'dispositivo aún no creado (pestaña Descubrir)',
    statusServer: ({ host }) => `Servidor: ${host}`,
    statusTestKey: 'Clave: la clave pública TEST, muy limitada. Solicite su propia clave.',
    statusOwnKey: 'Clave: su propia clave.',
    statusRefreshed: ({ age }) => `Última lectura: hace ${age} s.`,
    statusNeverRefreshed: 'Aún no leído (solo se leen los dispositivos creados).',
    statusError: ({ error }) => `Último error: ${error}`,
    noServer: 'Falta la dirección del servidor OneBusAway o no es válida (configuración).',
    keyRefused: 'El servidor OneBusAway rechaza la clave de API: revísela en la configuración.',
    serviceDown: ({ error }) =>
      `No se puede contactar con el servidor OneBusAway (${error}). Vuelva a intentarlo en un momento.`,
    now: 'ahora',
    in: ({ minutes }) => `en ${minutes} min`,
    inTwo: ({ first, second }) => `en ${first} y ${second} min`,
    nowThen: ({ second }) => `ahora, y luego en ${second} min`,
    noDeparture: 'Ninguna salida en las próximas 2 horas',
    cancelled: 'Cancelado',
    delayedNote: ({ delay }) => ` (${delay} min de retraso)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} hacia ${destination} en ${stop}: ${when}`,
    nothingAt: ({ stop }) => `Ninguna salida de ${stop} en las próximas 2 horas.`,
    pickStop: 'Elija una parada en los ajustes del widget.',
    loading: 'Leyendo las llegadas…',
    gone: 'Esta parada ya no se sigue.',
    legend: 'Hora · minutos · retraso. Gris: solo horario teórico.',
    unavailable: 'Llegadas aún no disponibles, vuelva a intentarlo en un minuto.',
  },
};

/** A text of `table` in `language` (English when missing), rendered with `params`. */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** Every language of a text: a multi-language action message. */
export function sayAll(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((lang) => [lang, say(table, lang, key, params)]),
  );
}
