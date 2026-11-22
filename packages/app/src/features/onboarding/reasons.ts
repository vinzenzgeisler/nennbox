import type { ProposedSetting, ReasonCode } from '@nennbox/contracts';

const texts: Record<ReasonCode, string> = {
  'license-required':
    'Lizenzfahrer: Die Lizenznummer wird Pflicht und eine Lizenzkopie wird als Unterlage verlangt.',
  'license-optional':
    'Clubsport: Die Lizenznummer bleibt freiwillig, ein Clubausweis kann hochgeladen werden.',
  'license-hidden':
    'Gäste ohne Lizenz: Das Lizenzfeld wird ausgeblendet, Lizenzunterlagen sind nicht nötig.',
  'vehicle-pass-historic':
    'Historische Fahrzeuge: Baujahr und Fahrzeugpass werden Pflicht, damit ihr die Zulassung zur Klasse prüfen könnt.',
  'vehicle-pass-mixed':
    'Gemischtes Feld: Der Fahrzeugpass ist freiwillig und nur für Fahrzeuge bis zur Baujahrgrenze gedacht.',
  'displacement-classes':
    'Eure Klassen richten sich nach dem Hubraum, deshalb ist er ein Pflichtfeld.',
  'start-number-wish':
    'Das Formular bekommt ein Feld „Wunschnummer“, die Freigabe bleibt bei euch.',
  'start-number-assigned':
    'Das Wunschfeld entfällt, ihr vergebt die Nummern im Bereich der Vorlage.',
  'start-number-automatic':
    'Das Wunschfeld entfällt, NENNBOX zählt im Nummernbereich der Vorlage hoch.',
  'capacity-from-expected':
    'Die Kapazität ist die erwartete Starterzahl, aufgerundet auf volle Zehner.',
  'waitlist-on':
    'Ab 30 Startern empfehlen wir eine Warteliste: Absagen werden ohne Aufwand nachbesetzt.',
  'waitlist-off':
    'Bei kleinen Feldern ist eine Warteliste selten nötig. Ihr könnt sie jederzeit einschalten.',
  'co-driver-on': 'Das Formular erfasst einen Beifahrer mit eigenen Daten.',
  'co-driver-off': 'Das Formular fragt nur den Fahrer ab.',
  'double-start-on':
    'Ein Fahrer kann mehrere Startmeldungen anlegen, jede mit eigenem Fahrzeug und eigener Klasse.',
  'double-start-off': 'Jeder Fahrer hat genau eine Startmeldung.',
  'payment-online':
    'Teilnehmer zahlen direkt bei der Nennung. Der Zahlungseingang wird automatisch zugeordnet.',
  'payment-transfer':
    'Teilnehmer erhalten Bankdaten und Verwendungszweck. Ihr ordnet Eingänge zu.',
  'payment-both':
    'Teilnehmer wählen selbst zwischen Online-Zahlung und Überweisung.',
  'deadline-14-days':
    'Vorschlag: 14 Tage vor der Veranstaltung bleibt Zeit für Prüfung, Startliste und Rückfragen.',
  'timing-transponder':
    'Bei Zeitnahme ist die Transpondernummer ein freiwilliges Feld.',
  'safety-emergency-contact':
    'Aus Sicherheitsgründen wird ein Notfallkontakt abgefragt.',
  'template-classes':
    'Diese Klassen sind der Standard der Vorlage. Ihr könnt sie umbenennen, löschen und ergänzen.',
  'template-terms':
    'Mustertext für diesen Veranstaltungstyp. Bitte vor Veröffentlichung prüfen oder anpassen.',
  'brand-from-logo': 'Die Farben stammen aus eurem Logo.',
  'brand-default': 'Ohne Logo verwenden wir die NENNBOX-Farben.',
};

export const reasonText = (code: ReasonCode) => texts[code];

export function reasonFor(
  reasons: ProposedSetting[],
  ...settings: string[]
): string | undefined {
  const found = reasons.find((entry) => settings.includes(entry.setting));
  return found ? texts[found.reason] : undefined;
}
