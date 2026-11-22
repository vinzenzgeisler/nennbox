# Kleine Verwaltungsansichten

Übersicht, Exporte und Nennungsunterlagen verwenden die App-Tokens aus
`packages/ui/src/app-tokens.css`. Der Pfad und der Seitentitel kommen aus dem
bestehenden `AppShell`-Seitenkopf; Unteransichten duplizieren diesen Kopf nicht.

## Bausteine

Alle Gestaltung liegt in `packages/ui`, nicht in ansichtsspezifischen App-Styles:

- `AppView`, `AppGrid`, `AppSection`: Seitenrhythmus und ruhige Abschnitte.
- `MetricGrid`, `Metric`, `OccupancyBar`: direkt modernisierte, bestehende APIs;
  ihre alten Styles wurden ersetzt, ihre Funktion und Tests bleiben bestehen.
- `AppValueRow`, `AppTable`: Label/Wert-Zeilen und Exportverlauf.
- `AppTextInput`, `AppSelect`, `AppTextarea`: beschriftete native Eingaben auf
  Basis von `AppField` und den N4-Feldmaßen, einschließlich nativer Zustände.
- `AppSettingsGroup`, `AppChoiceGroup`: benannte Formulargruppen ohne Rahmen.
- `AppNotice`, `AppEmptyState`: Fehler, Hinweise und Leerzustände nach N5.

Die ComponentGallery zeigt diese Muster unter „App-Design · Übersicht und
Einstellungen“, einschließlich bearbeitbarer Eingaben und einer Speicheraktion.
Die Formulare behalten bestehende Hooks, API-Aufrufe, Validierung, Filter,
Download-Prüfungen und Abbruchsteuerung. Zeiten im Exportverlauf nutzen denselben
relativen Formatierer wie die Nennungsdetailseite.

## Öffentliche Grenzen und verbliebene Altgestaltung

`/passenger` wird in `App.tsx` außerhalb der Verwaltungs-App gerendert, nutzt
`registration-shell`, persönliche Tokens und `/public/passenger-links/*`.
Das Beifahrerportal ist eine öffentliche Teilnehmerseite ohne Konto; seine
Gestaltung und die öffentlichen Nennformulare bleiben unverändert.

Weiterhin vorhanden, außerhalb dieser Umstellung:

- `features/event-setup/EventSetup.css`: alte Mono-Labels und Navigation.
- `features/registration/RegistrationFormSettings.css`: Einstellungen des
  öffentlichen Formulars innerhalb der Verwaltung, alte Labels und Überschrift.
- Legacy-UI-Felder, Tabs und Tabellen in noch nicht migrierten Bereichen
  (z. B. Nachrichten und Nennungsablauf) verwenden weiterhin die alten Tokens.
- `features/onboarding/preview/preview.css` zeigt absichtlich die öffentliche
  Gestaltung in der Vorschau; `features/driver-portal` ist ebenfalls öffentlich.
- Archivo bleibt für Marke und öffentliche Oberflächen sowie alte
  Überschriften-Tokens verfügbar. Globale `--text-label`/`--tracking-label`-
  Tokens dürfen deshalb nicht pauschal gelöscht werden.

Die ungenutzten Übersichts-/Export-Styles und die nur dort benötigten alten
Kennzahlen-/Belegungsmaß-Tokens wurden entfernt.

## Prüfung

Unit-Tests prüfen Semantik, Formularzustände, Auswahl-/Aktion-Callbacks und die
Veranstaltungsbindung von Warnungsfiltern. Bestehende Kennzahlen-/Belegungs- und
AppShell-Tests bleiben unverändert. Der Pre-push-Hook läuft ohne Umgehung;
Community-Smoke und Dokumentenabläufe werden ausschließlich in GitHub geprüft.
Keine Screenshots, Pixeldiffs oder lokalen Browser-/Smoke-Läufe verwenden.

Bewusst angepasste E2E-Selektoren beschränken sich auf die verkürzten Knopftexte:
`CSV-Export erstellen` → `Erstellen` und `Unterlagen speichern` → `Speichern`.
Die Assertions auf Download, Persistenz, Aktivierung und Dokumentstatus bleiben
unverändert.
