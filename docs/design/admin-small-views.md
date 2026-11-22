# Kleine Verwaltungsansichten

Übersicht, Exporte und Nennungsunterlagen verwenden die App-Tokens aus
`packages/ui/src/app-tokens.css`. Der Pfad und der Seitentitel kommen aus dem
bestehenden `AppShell`-Seitenkopf; Unteransichten duplizieren diesen Kopf nicht.

## Bausteine

Alle Gestaltung liegt in `packages/ui`, nicht in ansichtsspezifischen App-Styles:

- `AppView`, `AppGrid`, `AppSection`: Seitenrhythmus und ruhige Abschnitte.
- `MetricGrid`, `Metric`, `OccupancyBar`, `FormItem`: direkt modernisierte, bestehende APIs;
  ihre alten Styles wurden ersetzt, ihre Funktion und Tests bleiben bestehen.
- `AppValueRow`, `AppTable`: Label/Wert-Zeilen und Exportverlauf.
- `AppTextInput`, `AppSelect`, `AppTextarea`: beschriftete native Eingaben auf
  Basis von `AppField` und den N4-Feldmaßen, einschließlich nativer Zustände.
- `FormItem`, `AppChoiceGroup`: benannte Formulargruppen ohne Rahmen.
- `AppNotice`, `AppEmptyState`: Fehler, Hinweise und Leerzustände nach N5.

Die ComponentGallery zeigt diese Muster unter „App-Design · Übersicht und
Einstellungen“, einschließlich bearbeitbarer Eingaben und einer Speicheraktion.
Die Formulare behalten bestehende Hooks, API-Aufrufe, Validierung, Filter,
Download-Prüfungen und Abbruchsteuerung. Zeiten im Exportverlauf nutzen denselben
relativen Formatierer wie die Nennungsdetailseite.

## Seitenrand, Felder und Statuszeilen

`AppView` ergänzt den vorhandenen Workspace-Inset bis zum gemeinsamen Seitenrand
`--nb-page-gutter` (`--nb-space-7`, mobil `--nb-space-4`). Der Seitenkopf nutzt
denselben Wert; verschachtelte `AppView`-Gruppen erhalten keinen zweiten Rand.
`AppGrid` und `AppSection` richten ihre Inhalte oben aus, damit eine längere
Nachbarspalte keine leeren Flächen zwischen Abschnittstitel und Status erzeugt.
Statuszeilen behalten auch Nullwerte und eigene Kategorien mit sichtbarem Label;
ein leerer Kategoriename erscheint als „Unbekannter Status“.

`AppSelect` verwendet das gemeinsame 32-px-Feld mit eigenem, nicht interaktivem
Pfeil. `AppCheckbox` aus der Nennungsliste wird mit seinem Stylesheet ausgeliefert:
16-px-Kästchen, 5-px-Ecke, grüner Auswahlzustand und Label rechts daneben.
Die Galerie zeigt ausgewählte, leere und deaktivierte Formular-Checkboxen.

## Nennungsunterlagen öffnen

In der laufenden Verwaltungs-App (`/app` bzw. `/admin`) zuerst eine Veranstaltung
wählen, dann **Konto → Einstellungen** öffnen. Dort steht „Unterlagentypen“ vor
den Nennformular-Einstellungen. Alternativ über **⌘K → Nennungsunterlagen
bearbeiten** springen. Die Ansicht ist intern `account`; es gibt keine eigene
Unterlagen-URL und sie liegt nicht unter „Einrichten“.

## Öffentliche Grenzen und verbliebene Altgestaltung

`/passenger` wird in `App.tsx` außerhalb der Verwaltungs-App gerendert, nutzt
`registration-shell`, persönliche Tokens und `/public/passenger-links/*`.
Das Beifahrerportal ist eine öffentliche Teilnehmerseite ohne Konto; seine
Gestaltung und die öffentlichen Nennformulare bleiben unverändert.

Einrichten und die Formular-Einstellungen sind auf App-Muster umgestellt.
`EventSetup.css`, `NumberAndWaitlistSettings.css` und
`RegistrationFormSettings.css` sind entfernt. Auch die ausschließlich im alten
Zahlungseditor verwendete `.registration-payment-config`-Gestaltung ist entfernt.

Öffentliche Seiten, Markenkomponenten und die Review-Galerie benötigen weiterhin
Legacy-UI-Felder und Tokens. `--text-label`, `--tracking-label`, Archivo und
`--registration-*` bleiben deshalb erhalten. Die öffentliche Formularvorschau
in Einrichten und Onboarding zeigt absichtlich diese Optik; ihre App-Hülle nutzt
App-Tokens. Fahrer- und Beifahrerportal sind unverändert.

## Prüfung

Unit-Tests prüfen Semantik, Formularzustände, Auswahl-/Aktion-Callbacks und die
Veranstaltungsbindung von Warnungsfiltern. Bestehende Kennzahlen-/Belegungs- und
AppShell-Tests bleiben unverändert. Der Pre-push-Hook läuft ohne Umgehung;
Community-Smoke und Dokumentenabläufe werden ausschließlich in GitHub geprüft.
Keine Screenshots, Pixeldiffs oder lokalen Browser-/Smoke-Läufe verwenden.

Knopftexte benennen Aktion und Objekt, etwa „Nennungen anzeigen“,
„CSV-Export erstellen“, „CSV herunterladen“, „Unterlage hinzufügen“ und
„Unterlagen speichern“. Ein Verb im Knopf schließt ein beschreibendes Objekt
nicht aus. Bestehende E2E-Selektoren und Verhaltenserwartungen bleiben unverändert.

## Nachrichten, Nennungsablauf und Module

Diese Ansichten verwenden ebenfalls `AppView`, `AppSection` und die nativen
App-Feldmuster. Die Nachrichtenansicht behält den flexiblen `MessageLayout` mit
begrenzter Composer-Breite und danebenliegender Vorschau; schmale Ansichten
stapeln beide Bereiche. Die Empfängerauswahl bleibt eine benannte Gruppe, damit
bestehende Bedien- und E2E-Verträge unverändert bleiben. Der Postausgang verwendet
`AppTable`, Status-Pills und den relativen Zeitformatierer der Nennungsdetailseite.

Neue gemeinsame Muster (N4-Felder und N5-Abschnitte):

- `AppDialog`: explizite optische Variante des vorhandenen nativen Dialogs,
  mit 12-px-Ecke, `--nb-shadow-dialog` und `--nb-overlay`. Öffnen, Escape,
  Schließen und Aktionen verwenden weiterhin den bestehenden Dialogvertrag.
  Die explizite Variante lässt Einrichten und Formular-Einstellungen unverändert.
- `AppActions`: umbrechende Aktionsgruppe.
- `AppSelectionList`: benannte, scrollbar begrenzte Auswahlgruppe.
- `AppFileInput`: native Dateiauswahl im beschrifteten App-Feldmuster, mit
  eigener deutscher Oberfläche („Datei auswählen“, „Keine Datei ausgewählt“)
  statt sprachabhängiger Browser-Beschriftung.
- `AppConfirmAction`: bestehende begründungspflichtige destruktive Aktionen mit
  zurückgesetzter Begründung beim Schließen; Gefahraktionen nutzen den roten
  `danger`-Ton des `AppButton` statt einer weiteren grünen Hauptaktion.

Die ComponentGallery zeigt diese Muster interaktiv unter „App-Design · Nachrichten
und Verwaltungsdialoge“. Unit-Tests prüfen Auswahl-/Vorlagen-Callbacks,
Upload-Beschränkungen, Postausgang-Neuversand, Aktivierungsbedingungen und
Begründungspflicht. Bestehende Testerwartungen und Knopftexte bleiben unverändert.
Die Export-Snapshot-Liste erweitert lediglich die absichtlich neue öffentliche
UI-API; sie ist keine Änderung an Verhaltenserwartungen.

### Grenze der Konto-Verwaltung

`AdminApplication` zeigt unter `account` ausschließlich die bereits modernisierten
Unterlagentypen (`EventDocumentSettings`) und die modernisierten
`RegistrationFormSettings`. Es gibt keine zusätzliche Konto-, Organisations-
oder Rollenverwaltungsseite. Veranstalter-/Bankdaten liegen in `event-setup`;
Rollen werden innerhalb des hier modernisierten Übergangseditors ausgewählt.
Eine zusätzliche Einstellungsoberfläche wird nicht erfunden.

### Verbliebene alte Schriftgestaltung nach diesem Schritt

Die Verwaltungsansichten verwenden Inter und App-Felder. Direkte
`--text-label`-/`--tracking-label`-Verwendungen unter `packages/app/src` liegen
nur noch im öffentlichen Fahrerportal, der öffentlichen Onboarding-Vorschau
und öffentlichen Zahlungs-Badges. Es gibt keine direkten Archivo-Verwendungen
in den Verwaltungsansichten. Legacy-Komponenten in `packages/ui` bleiben für
öffentliche Seiten und die ComponentGallery verfügbar; ihre Existenz bedeutet
nicht, dass eine Verwaltungsansicht noch das alte Design nutzt.

Die vorgeschaltete Anmeldemaske (`AuthenticatedAdmin`, außerhalb der App-Shell)
verwendet weiterhin das bestehende Legacy-`shell`-/Button-Muster. Innerhalb der
hier umgestellten Einrichten-/Formular-Einstellungsansichten gibt es keine
verbliebene Altgestaltung außer der ausdrücklich öffentlichen Vorschau.

### Kompakte Verwaltungslisten

Die Empfängervorschau zeigt höchstens acht leise Einträge ohne Aufzählungszeichen
und danach die verbleibende Anzahl. Die Empfängerauswahl und der Versand bleiben
vollständig; nur die Vorschau ist gekürzt.

Status und Übergänge verwenden das gemeinsame, typisierte Muster `AppEditorRow`:
Eine kompakte, tastaturbedienbare Zeile zeigt Pill-Vorschau und Kurzinfos. Der
vollständige Editor klappt inline mit `--nb-duration-menu` (160 ms) auf;
reduzierte Bewegung folgt den bestehenden Tokens. Geschlossene Editoren sind
inert und bewahren ihre Feldwerte. Neue Einträge öffnen direkt. `AppWorkflowPill`
zeigt die konfigurierte Statusfarbe als kleinen Punkt statt eines großen Balkens.
Beide Muster sind in der ComponentGallery und durch Unit-Tests abgedeckt.

Die Modulverwaltung hatte bislang keinen Einstieg in der App-Shell. Für eine vom
Server bestätigte Admin-Sitzung führt jetzt ⌘K → Einstellungen → „Module verwalten“
zur vorhandenen `AdminModules`-Ansicht mit den bestehenden Organisations-/Event-APIs.
Es wird keine öffentliche Route oder zusätzliche Seitenleistenposition eingeführt;
die API-Berechtigungsprüfung bleibt unverändert.

Das Suchfeld der Nennungsliste verwendet dieselbe `Icon name="search"`-Lupe wie
die Seitenleiste, mit 16 px und Strichstärke 1,6.

Die Dateifeld-Testerwartung wurde bewusst von der gesamten Label-Textkette auf
den expliziten zugänglichen Namen und die zwei deutschen Oberflächentexte geändert.
Die bisherigen Funktionsassertionen bleiben erhalten; Workflow-Tests öffnen nun
den jeweiligen Editor vor der Interaktion. Neue Tests prüfen außerdem die gekürzte
Empfängervorschau, Disclosure/Feldwerterhalt, neue geöffnete Zeilen und den
berechtigungsabhängigen Moduleinstieg. Die Export-Snapshot-Liste ergänzt nur
`AppEditorRow` und `AppWorkflowPill` als absichtliche neue UI-APIs.


## Einrichten und Formular-Einstellungen

`AppSettingsLayout` ordnet Abschnittsnavigation, Formular und optionale Hilfe
nach N5 an. `AppSettingsNav` übernimmt die hellen Navigationsflächen aus N4;
der aktive Abschnitt ist weiß und leicht angehoben, ohne Mono-Nummern.
Auf schmalen Ansichten ist die Navigation horizontal scrollbar.
`AppPreviewCard` ist die ruhige App-Hülle für öffentliche Vorschauen.
Alle drei typisierten Muster sind in der ComponentGallery und in Unit-Tests.

`AppTextInput` und `AppTextarea` verknüpfen optionale Hilfetexte mit
`aria-describedby`, ohne den Feldnamen zu verlängern. Datumsfelder bleiben
native `type="date"`-Felder einschließlich min/required. `SegmentedControl`
hat eine explizite `appearance="app"`-Variante: native Radiogruppen mit
32-px-Segmenthülle, neutraler Auswahl, unveränderten Labels und Callbacks.
Die öffentliche Standardvariante bleibt unverändert.

Gespeicherte Klassen, Nummernbereiche und eigene Felder sind kompakte
`AppEditorRow`-Zeilen. Neue Zeilen öffnen direkt. Einrichten behält seine
vorhandenen Formular-/API-Verträge; „Entwurf speichern“ bleibt sekundär,
„Speichern und Nennung öffnen“ nutzt Racing Green.

Bestehende Testerwartungen und E2E-Dateien wurden nicht verändert. Neue Tests
prüfen Navigation, Feldhinweise, native App-Radios, Formularvorschau,
Geltungsbereiche und eigene Felder. Es gibt keine Änderungen an öffentlichen
Registration-Komponenten, ihren UI-Styles oder Registration-Tokens.
