import type { ChoiceStep } from './choices.js';

export const kindStep: ChoiceStep = {
  topic: 'Veranstaltung',
  title: 'Was veranstaltet ihr?',
  lead: 'Danach schlägt NENNBOX Klassen, Formularfelder, Unterlagen und Startnummern vor. Alles bleibt änderbar.',
  field: 'kind',
  columns: 3,
  options: [
    {
      value: 'hillclimb',
      sketch: 'hillclimb',
      title: 'Bergrennen',
      description:
        'Einzelstarts auf gesperrter Bergstrecke, die schnellste Zeit gewinnt.',
      example:
        'Historischer Bergpreis: zwei Wertungsläufe an einem Wochenende, Klassen nach Hubraum.',
    },
    {
      value: 'rally',
      sketch: 'rally',
      title: 'Rallye',
      description:
        'Wertungsprüfungen und Etappen, Fahrer und Beifahrer als Team.',
      example:
        'Stadtrallye mit sechs Wertungsprüfungen; der Beifahrer liest die Streckennotizen.',
    },
    {
      value: 'slalom',
      sketch: 'slalom',
      title: 'Slalom',
      description:
        'Pylonenparcours auf einem Platz. Leichter Einstieg für Gäste.',
      example:
        'Vereinsslalom auf dem Messeparkplatz: zwei Läufe pro Fahrer, Wertung nach Klassen.',
    },
    {
      value: 'regularity',
      sketch: 'regularity',
      title: 'Gleichmäßigkeit / Oldtimer',
      description:
        'Gewonnen wird mit der gleichmäßigsten Zeit, nicht der schnellsten.',
      example:
        'Oldtimer-Ausfahrt mit zwölf Zeitkontrollen über 120 km, Fahrzeuge bis Baujahr 1990.',
    },
    {
      value: 'kart',
      sketch: 'kart',
      title: 'Kart',
      description: 'Rennen auf der Kartbahn, oft mit Nachwuchsklassen.',
      example:
        'Clubmeisterschaft mit vier Läufen: Bambini, Junioren und Senioren starten getrennt.',
    },
    {
      value: 'circuit',
      sketch: 'circuit',
      title: 'Rundstrecke / Trackday',
      description: 'Freies Fahren oder Rennen auf der Rundstrecke in Gruppen.',
      example:
        'Trackday mit drei Gruppen nach Erfahrung, jede Gruppe fährt vier Turns à 20 Minuten.',
    },
    {
      value: 'other',
      sketch: 'other',
      title: 'Sonstiges',
      description: 'Ihr startet mit einer neutralen Vorlage.',
      example: 'Clubtreffen mit Anmeldung, Sichtungstag oder eine Mischform.',
    },
  ],
};
