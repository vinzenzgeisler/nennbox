# Teilnehmer-Gedächtnis: Datenschutz (Issue #195)

Dieses Dokument beschreibt für Vereine und Betreiber, **was** NENNBOX für
wiederkehrende Teilnehmer speichert, **wie lange** und **wie es gelöscht
wird**. Es ist die technische Grundlage für die Datenschutzhinweise des
Vereins (Verantwortlicher im Sinne der DSGVO ist der Verein, NENNBOX ist
Auftragsverarbeiter).

## Was wird gespeichert?

Nur wenn der Teilnehmer **eingewilligt** hat und der Verein die Funktion
**eingeschaltet** hat. Gespeichert wird eine Kopie aus der letzten
verifizierten Nennung bei **diesem Verein**:

| Bereich      | Felder                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fahrer       | Vor-/Nachname, Geburtsdatum, Land, Telefon, Adresse, Blutgruppe, Lizenznummer und -ablauf, Notfallkontakt (Name, Telefon)                                            |
| Fahrzeuge    | Marke, Modell, Baujahr, Kennzeichen, FIN, Fahrzeugart, Hubraum, Zylinder, Transponder-, Fahrzeugpass-Nr., Halter (mehrere Fahrzeuge möglich)                          |
| Beifahrer    | Vor-/Nachname, E-Mail, Geburtsdatum, Land, Telefon                                                                                                                  |
| Unterlagen   | Verweis auf die bereits hochgeladene Datei (Typ, Name, Prüfsumme, Gültig-bis); es wird **keine zweite Kopie der Datei** angelegt                                    |
| Einwilligung | Zeitpunkt der Erteilung/des Widerrufs, Organisation, Version des Einwilligungstextes (`participantMemoryConsentTerms.version`), als eigener, protokollierter Datensatz |

Der Schlüssel ist die **verifizierte E-Mail-Adresse innerhalb einer
Organisation**. Dieselbe Adresse bei einem anderen Verein ist ein völlig
getrennter Bestand; es gibt keine organisationsübergreifende Erkennung, auch
nicht indirekt (Zähler, Fehlermeldungen, Antwortzeiten ändern sich nicht).
Alle Abfragen filtern auf die Organisations-ID.

## Wie wird erkannt, und wann gibt es ein Angebot?

1. Der Teilnehmer fordert einen Zugangslink an (`POST /public/participant-memory/request`).
   Die Antwort ist **immer gleich** – ob die Adresse bekannt ist oder nicht.
   Nur bei bekannter, verifizierter Adresse und eingeschalteter Funktion wird
   eine E-Mail mit Link versandt.
2. Der Link (30 Minuten gültig, einmalig) wird eingelöst und ergibt eine
   Sitzung (60 Minuten).
3. Ohne aktive Einwilligung liefert die API **kein Angebot**
   (`offer: null`); nach Widerruf ebenso.
4. Mit Einwilligung: Angebot für eine Veranstaltung mit **Vorschau je Feld**
   (Lizenznummer und FIN maskiert, bis sie übernommen werden). Der Teilnehmer
   wählt Felder, Fahrzeuge und Unterlagen einzeln (`POST .../take`).
5. **Unterlagen** werden nur angeboten, wenn ihr Gültig-bis-Datum am
   Veranstaltungstag (Ende) der neuen Veranstaltung noch gilt und der
   Dokumenttyp dort aktiv ist.

## Wie lange?

- Der Verein stellt die Aufbewahrungsdauer pro Organisation ein
  (`PUT /admin/participant-memory`).
- **Standard 365 Tage**, **Mindestens 30**, **Höchstens 1095 Tage** (3 Jahre).
  Die Grenzen sind je Installation über
  `PARTICIPANT_MEMORY_RETENTION_DEFAULT_DAYS`,
  `PARTICIPANT_MEMORY_RETENTION_MINIMUM_DAYS` und
  `PARTICIPANT_MEMORY_RETENTION_MAXIMUM_DAYS` konfigurierbar. Werte außerhalb
  werden abgewiesen bzw. auf die Grenze begrenzt.
- Die Frist läuft ab der letzten Erfassung (jede neue verifizierte Nennung
  verlängert sie). Daten älter als die Frist werden **nie** angeboten, auch
  wenn der Aufräumschritt noch nicht gelaufen ist.
- **Aufräumschritt**: Der Worker-Task `participant_memory_cleanup` läuft
  stündlich (Minute 17). Er arbeitet je Organisation getrennt, in kleinen
  Stapeln (500 Zeilen), mit organisationsgefilterten Anweisungen und ohne
  Tabellensperre; ein fehlerhafter Verein stoppt die anderen nicht.
- Beim **Ausschalten** der Funktion durch den Verein wird der Bestand dieser
  Organisation sofort gelöscht (die Antwort nennt `purged`).
- Eine Einwilligung, deren Daten vollständig abgelaufen sind, wird im selben
  Lauf beendet. Abgelaufene Zugangslinks/Sitzungen werden einen Tag nach Ablauf
  entfernt. Das Einwilligungsprotokoll (nur Zeitpunkte, Organisation,
  Textversion; keine Nennungsdaten) wird als Nachweis 1095 Tage nach dem
  Widerruf bzw. Ende der Einwilligung aufbewahrt und danach gelöscht.

## Wie wird gelöscht?

- **Widerruf** (`POST /public/participant-memory/consent/revoke`): jederzeit,
  sofort; löscht den Bestand dieses Teilnehmers bei dieser Organisation und
  beendet das Angebot.
- **Löschen durch den Teilnehmer** über einen gesicherten Link
  (`POST .../delete-request`, dann `POST .../delete`): der Link ist **24
  Stunden gültig** und **einmalig**. Gelöscht wird das Gedächtnis dieser
  Organisation zu dieser E-Mail-Adresse. **Nennungen und Unterlagen der
  Nennungen bleiben unberührt** – sie unterliegen den Regeln der
  Veranstaltung.
- **Ausschalten durch den Verein** und der Aufräumschritt (siehe oben).

## Sicherheit der Links

Wie bei Teameinladungen (#242): In der Datenbank liegt nur der **SHA-256-Hash**
des Tokens. Die Mail-Warteschlange enthält nur eine zufällige Nonce; API und
Worker leiten den Token im Speicher per HMAC aus `TEAM_INVITATION_TOKEN_KEY`
ab. Der Zweck (`access`/`delete`) fließt in den HMAC ein, ein Zugangslink kann
nicht als Löschlink verwendet werden (und umgekehrt). Links sind an die
Organisation gebunden, zeitlich begrenzt, einmalig; ein neuer Link macht den
vorherigen ungültig; Neuanforderungen werden gedrosselt. Zustandsändernde
Aufrufe prüfen den Origin.

## API-Überblick

Öffentlich (`/public/participant-memory/…`): `request`, `delete-request`,
`redeem`, `delete`, `logout`, `GET` (Angebot), `take`, `consent`,
`consent/revoke`. Admin (`/admin/participant-memory`): `GET`/`PUT` für
an/aus und Aufbewahrung (Berechtigung `organization:update`).

## Hinweis zum Formular

Dieses Release liefert nur das Backend. Das öffentliche Formular ist
unverändert; die Oberfläche folgt in einem separaten Schritt.
