import { eventTemplate, formatEuro } from '@nennbox/contracts';
import type { EventKind } from '@nennbox/contracts';
import type { ChoiceStep } from './choices.js';

/** What a template brings, read from the real template so the card never promises more. */
export function kindConsequence(kind: EventKind): string {
  const template = eventTemplate(kind);
  const fees = template.classes.map((item) => item.feeCents);
  const parts = [
    `${template.classes.length} Klassen${template.displacementClasses ? ' nach Hubraum' : ''}`,
    `ab ${formatEuro(Math.min(...fees))}`,
    ...(template.defaults.coDriver ? ['Beifahrer im Formular'] : []),
    `Nummern ${template.startNumberRange.from} bis ${template.startNumberRange.to}`,
  ];
  return parts.join(', ');
}

export const kindStep: ChoiceStep = {
  topic: 'Veranstaltung',
  title: 'Was veranstaltet ihr?',
  lead: 'Danach schlägt NENNBOX Klassen, Formularfelder, Unterlagen und Startnummern vor. Alles bleibt änderbar.',
  field: 'kind',
  columns: 3,
  options: [
    {
      value: 'hillclimb',
      icon: 'hillclimb',
      consequence: kindConsequence('hillclimb'),
      title: 'Bergrennen',
      description:
        'Einzelstarts auf gesperrter Bergstrecke, die schnellste Zeit gewinnt.',
      example:
        'Historischer Bergpreis: zwei Wertungsläufe an einem Wochenende, Klassen nach Hubraum.',
    },
    {
      value: 'rally',
      icon: 'rally',
      consequence: kindConsequence('rally'),
      title: 'Rallye',
      description:
        'Wertungsprüfungen und Etappen, Fahrer und Beifahrer als Team.',
      example:
        'Stadtrallye mit sechs Wertungsprüfungen; der Beifahrer liest die Streckennotizen.',
    },
    {
      value: 'slalom',
      icon: 'slalom',
      consequence: kindConsequence('slalom'),
      title: 'Slalom',
      description:
        'Pylonenparcours auf einem Platz. Leichter Einstieg für Gäste.',
      example:
        'Vereinsslalom auf dem Messeparkplatz: zwei Läufe pro Fahrer, Wertung nach Klassen.',
    },
    {
      value: 'regularity',
      icon: 'regularity',
      consequence: kindConsequence('regularity'),
      title: 'Gleichmäßigkeit / Oldtimer',
      description:
        'Gewonnen wird mit der gleichmäßigsten Zeit, nicht der schnellsten.',
      example:
        'Oldtimer-Ausfahrt mit zwölf Zeitkontrollen über 120 km, Fahrzeuge bis Baujahr 1990.',
    },
    {
      value: 'kart',
      icon: 'kart',
      consequence: kindConsequence('kart'),
      title: 'Kart',
      description: 'Rennen auf der Kartbahn, oft mit Nachwuchsklassen.',
      example:
        'Clubmeisterschaft mit vier Läufen: Bambini, Junioren und Senioren starten getrennt.',
    },
    {
      value: 'circuit',
      icon: 'circuit',
      consequence: kindConsequence('circuit'),
      title: 'Rundstrecke / Trackday',
      description: 'Freies Fahren oder Rennen auf der Rundstrecke in Gruppen.',
      example:
        'Trackday mit drei Gruppen nach Erfahrung, jede Gruppe fährt vier Turns à 20 Minuten.',
    },
    {
      value: 'other',
      icon: 'other',
      consequence: kindConsequence('other'),
      title: 'Sonstiges',
      description: 'Ihr startet mit einer neutralen Vorlage.',
      example: 'Clubtreffen mit Anmeldung, Sichtungstag oder eine Mischform.',
    },
  ],
};
