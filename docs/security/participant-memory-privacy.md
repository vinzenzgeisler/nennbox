# Teilnehmer-Gedächtnis: Datenschutz (Issue #195)

Dieses Dokument beschreibt für Vereine und Betreiber, **was** NENNBOX für
wiederkehrende Teilnehmer speichert, **wie lange** und **wie es gelöscht
wird**. Es ist die technische Grundlage für die Datenschutzhinweise des
Vereins (Verantwortlicher im Sinne der DSGVO ist der Verein, NENNBOX ist
Auftragsverarbeiter).

## Wem gehört das Gedächtnis?

Dem **Teilnehmer als Person**, nicht der Kontaktadresse einer Nennung.
Gespeichert und angeboten werden nur Daten der Person, deren **eigene**
E-Mail-Adresse die Adresse des Rückkehrers ist und die diese Adresse
bestätigt hat. Daten anderer Personen, die jemand über seine Adresse genannt
hat (Kind, Teamkollege, Beifahrer mit eigener Adresse), werden **nicht**
übernommen: Diese Personen haben nicht eingewilligt.

Technisch gilt: Eine Adresse gehört einer Person, wenn in dieser Organisation
**genau eine** nicht gelöschte Person diese Adresse als ihre eigene führt.

- Führen zwei Personen dieselbe Adresse (typisch: ein Elternteil meldet sich
  und das Kind über dieselbe Adresse an), erkennt NENNBOX niemanden. Dann wird
  **nichts** gespeichert und nichts angeboten, auch nicht die Daten der
  Kontaktperson. Jede Person braucht eine eigene Adresse.
- Wird eine Person später gelöscht (z. B. Löschbegehren) und bleibt genau eine
  übrig, gilt die Adresse wieder dieser einen Person; der Abgleich läuft in
  derselben Transaktion wie die Löschung.
- Wird jemand Weiteres unter der Adresse genannt, wird der bestehende Bestand
  beim nächsten Abgleich (Bestätigung der neuen Nennung) entfernt und ist bis
  dahin bereits nicht mehr abrufbar.

## Was wird gespeichert?

Nur wenn der Teilnehmer **eingewilligt** hat und der Verein die Funktion
**eingeschaltet** hat. Gespeichert wird eine Kopie aus den **verifizierten,
nicht gelöschten Nennungen dieser Person bei diesem Verein**, soweit die
Nennung **innerhalb der Aufbewahrungsfrist** des Vereins liegt (Anlagedatum
der Nennung). Ältere Nennungen werden beim Einwilligen nicht mehr
hineingeholt.

| Bereich      | Felder                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fahrer       | Vor-/Nachname, Geburtsdatum, Land, Telefon, Adresse, Blutgruppe, Lizenznummer und -ablauf, Notfallkontakt (Name, Telefon), jeweils der Person selbst aus ihrer jüngsten Nennung                              |
| Fahrzeuge    | Marke, Modell, Baujahr, Kennzeichen, FIN, Fahrzeugart, Hubraum, Zylinder, Transponder-, Fahrzeugpass-Nr., Halter; nur Fahrzeuge aus Nennungen dieser Person (mehrere möglich, je Fahrzeug einmal)            |
| Beifahrer    | **nur Vor-/Nachname und E-Mail** als Verweis. Geburtsdatum, Land, Telefon und alles Weitere des Beifahrers werden nicht gespeichert. Der Beifahrer ist Dritter; die Rechtsgrundlage hierfür regelt der Verein |
| Unterlagen   | Verweis auf die bereits hochgeladene, **geprüfte** Datei (Typ, Name, Prüfsumme, Gültig-bis); es wird **keine zweite Kopie der Datei** angelegt                                                              |
| Einwilligung | siehe „Einwilligungsprotokoll"                                                                                                                                                                             |

Der Schlüssel ist die **verifizierte E-Mail-Adresse innerhalb einer
Organisation**. Dieselbe Adresse bei einem anderen Verein ist ein völlig
getrennter Bestand; es gibt keine organisationsübergreifende Erkennung, auch
nicht indirekt (Zähler, Fehlermeldungen, Antwortzeiten, Einwilligungsprotokoll:
der Hash der Adresse ist an die Organisation gebunden). Alle Abfragen filtern
auf die Organisations-ID.

Das Gedächtnis ist ein **Abgleich**, kein Anhäufen: Es enthält genau das, was
die verifizierten, nicht gelöschten Nennungen der Person heute hergeben. Was
die Quellen nicht mehr stützen, wird entfernt (siehe „Wie wird gelöscht?").

## Einwilligungsprotokoll

Je Erteilung ein eigener Datensatz: Organisation, Zeitpunkt der Erteilung und
des Widerrufs, Version und Hash des Einwilligungstextes, Grund des Endes
(`withdrawn`, `deleted`, `disabled`, `expired`, `superseded`, `erased`).

- Die E-Mail-Adresse liegt im Klartext **nur, solange die Einwilligung
  besteht** (sie wird gebraucht, um sie zuzuordnen). Mit dem Ende der
  Einwilligung, gleich aus welchem Grund, wird die Adresse im Datensatz
  gelöscht.
- Als Nachweis bleibt ein **organisationsgebundener, geschlüsselter Hash**
  der Adresse (HMAC-SHA256 mit dem Schlüssel der Einladungs-Token,
  `TEAM_INVITATION_TOKEN_KEY`). Wer Schlüssel und Adresse kennt, kann prüfen,
  ob diese Adresse eingewilligt hatte; aus der Datenbank allein lässt sich die
  Adresse nicht zurückgewinnen, und derselbe Hash gilt nicht bei einem anderen
  Verein.
- Ändert sich der Wortlaut (neue Version), gilt eine frühere Einwilligung
  **nicht mehr**: Es wird nichts angeboten, bis neu eingewilligt wurde; die
  alte Einwilligung wird mit dem Grund `superseded` beendet.
- Das Protokoll wird 1095 Tage nach dem Ende der Einwilligung gelöscht.
- Wird das Gedächtnis eines Teilnehmers vom Verein gelöscht, entsteht
  zusätzlich ein Prüfeintrag (Wer, wann, welche Organisation, Anzahl
  gelöschter Zeilen, Hash der Adresse, nicht die Adresse) mit derselben
  Aufbewahrung von 1095 Tagen.

## Wie wird erkannt, und wann gibt es ein Angebot?

1. Der Teilnehmer fordert einen Zugangslink an (`POST /public/participant-memory/request`).
   Die Antwort ist **immer gleich** (`{"accepted":true}`), und der Weg bis zur
   Antwort **führt für jede Adresse dieselben Datenbankanweisungen aus**: Die
   Anforderung wird nur in eine Warteschlange geschrieben. Ob der Verein die
   Adresse kennt, entscheidet erst der Worker (Task
   `participant_memory_requests`, jede Minute). Nur bei bekannter, verifizierter
   Adresse und eingeschalteter Funktion entsteht ein Link und eine E-Mail
   (Zustellung dadurch typischerweise nach ein bis zwei Minuten). Pro Adresse
   und Zweck steht höchstens eine Anforderung in der Warteschlange und wird
   höchstens ein Link je Minute ausgestellt. Ein Besucher kann somit weder aus
   Antwort noch aus Antwortzeit ablesen, ob eine Adresse bei diesem Verein
   bekannt ist; nur der Postfachinhaber merkt es an der E-Mail.
2. Der Link (30 Minuten gültig, einmalig) wird eingelöst und ergibt eine
   Sitzung (60 Minuten).
3. Ohne aktive Einwilligung unter dem aktuellen Wortlaut liefert die API
   **kein Angebot** (`offer: null`); nach Widerruf ebenso. Gleiches gilt, wenn
   die Adresse keiner einzelnen Person gehört.
4. Mit Einwilligung: Angebot für eine Veranstaltung mit **Vorschau je Feld**
   (Lizenznummer und FIN maskiert, bis sie übernommen werden). Der Teilnehmer
   wählt Felder, Fahrzeuge und Unterlagen einzeln (`POST .../take`). Abfragbar
   sind nur Veranstaltungen im Status „offen für Anmeldung"; Entwürfe,
   geschlossene und archivierte Veranstaltungen antworten wie unbekannte.
5. **Unterlagen** werden nur angeboten, wenn ihr Gültig-bis-Datum am
   Veranstaltungstag (Ende) der neuen Veranstaltung noch gilt, der
   Dokumenttyp dort aktiv ist **und die Quelle noch besteht** (Unterlage
   weiterhin geprüft, Nennung bestätigt und nicht gelöscht). Eine übernommene
   Unterlage entsteht als neue, **ungeprüfte** Zeile der Zielnennung.

## Wie lange?

- Der Verein stellt die Aufbewahrungsdauer pro Organisation ein
  (`PUT /admin/participant-memory`).
- **Standard 365 Tage**, **Mindestens 30**, **Höchstens 1095 Tage** (3 Jahre).
  Die Grenzen sind je Installation über
  `PARTICIPANT_MEMORY_RETENTION_DEFAULT_DAYS`,
  `PARTICIPANT_MEMORY_RETENTION_MINIMUM_DAYS` und
  `PARTICIPANT_MEMORY_RETENTION_MAXIMUM_DAYS` konfigurierbar. Werte außerhalb
  werden abgewiesen bzw. auf die Grenze begrenzt.
- Die Frist läuft ab dem **Datum der Nennung**, die die jeweilige Kopie stützt
  (Fahrer: jüngste Nennung, Fahrzeug: jüngste Nennung mit diesem Fahrzeug,
  beim Beifahrer das Ausfüllen, bei Unterlagen die Prüfung). Eine neue
  verifizierte Nennung verlängert sie für das, was sie wieder enthält;
  erneutes Einwilligen verlängert **nichts**. Daten älter als die Frist werden
  **nie** angeboten, auch wenn der Aufräumschritt noch nicht gelaufen ist.
- **Aufräumschritt**: Der Worker-Task `participant_memory_cleanup` läuft
  stündlich (Minute 17). Er arbeitet je Organisation getrennt, in kleinen
  Stapeln (500 Zeilen), mit organisationsgefilterten Anweisungen und ohne
  Tabellensperre; ein fehlerhafter Verein stoppt die anderen nicht.
- Beim **Ausschalten** der Funktion durch den Verein wird der Bestand dieser
  Organisation sofort gelöscht (die Antwort nennt `purged`), alle Einwilligungen
  enden mit dem Grund `disabled` (nach dem Wiedereinschalten ist eine neue
  Einwilligung nötig), offene Links und Sitzungen werden ungültig.
- Eine Einwilligung, die älter als die Frist ist und für die keine Daten mehr
  gespeichert sind, wird im Aufräumschritt beendet (`expired`). Abgelaufene
  Zugangslinks/Sitzungen werden einen Tag nach Ablauf entfernt, nicht
  bearbeitete Link-Anforderungen nach einem Tag. Einwilligungsprotokoll und
  Prüfeinträge werden 1095 Tage nach dem Ende gelöscht.
- E-Mails an den Teilnehmer (Zugangs- und Löschlink) liegen im allgemeinen
  Postausgang und folgen dessen Aufbewahrung, nicht diesem Aufräumschritt.

## Wie wird gelöscht?

- **Widerruf** (`POST /public/participant-memory/consent/revoke`): jederzeit,
  sofort; löscht den Bestand dieses Teilnehmers bei dieser Organisation und
  beendet das Angebot.
- **Löschen durch den Teilnehmer** über einen gesicherten Link
  (`POST .../delete-request`, dann `POST .../delete`): der Link ist **24
  Stunden gültig** und **einmalig**. Gelöscht wird das Gedächtnis dieser
  Organisation zu dieser E-Mail-Adresse, offene Links und Sitzungen enden mit
  ihm. **Nennungen und Unterlagen der Nennungen bleiben unberührt** – sie
  unterliegen den Regeln der Veranstaltung. Wird der Löschlink gleichzeitig mit
  einer neuen Anforderung benutzt, sperren beide in derselben Reihenfolge; ein
  Abbruch durch gleichzeitige Änderung wird wiederholt und kommt, falls er
  dennoch bestehen bleibt, als `409 concurrent_update` an, nie als 500.
- **Löschen einer Quelle**: Wird eine Nennung gelöscht (Löschaktion des
  Nennbüros, Löschen der Nennung), eine Person oder ein Fahrzeug gelöscht, wird
  das Gedächtnis der betroffenen Adressen **in derselben Transaktion** neu
  abgeglichen: Fahrer-, Fahrzeug-, Beifahrer- und Unterlagenkopien, die keine
  verifizierte, nicht gelöschte Nennung mehr stützt, sind danach weg. Eine
  Unterlage, deren Quelle nicht mehr „geprüft" ist, wird nicht mehr angeboten
  (Prüfung bei jedem Angebot) und beim nächsten Abgleich entfernt; ein
  nachträgliches Ablehnen einer geprüften Unterlage sieht die Anwendung nicht
  vor.
- **Löschen einer einzelnen Person durch das Nennbüro** (z. B. nach einem
  Löschbegehren nach Art. 17 DSGVO): `POST /admin/participant-memory/erase`
  mit `{"email": "…"}` im Body (nicht in der URL, damit die Adresse nicht in
  Zugriffsprotokollen steht). Berechtigung `organization:update`, gebunden an
  die Organisation des Administrators; löscht Fahrer-, Fahrzeug-, Beifahrer-
  und Unterlagenkopien dieser Adresse, beendet Einwilligung (`erased`), Links,
  Sitzungen und offene Anforderungen, schreibt einen Prüfeintrag und nennt die
  Zahl gelöschter Zeilen (`removed`). Funktioniert auch bei ausgeschalteter
  Funktion. Nennungen bleiben unberührt.
- **Ausschalten durch den Verein** und der Aufräumschritt (siehe oben).

## Sicherheit der Links

Wie bei Teameinladungen (#242): In der Datenbank liegt nur der **SHA-256-Hash**
des Tokens. Die Mail-Warteschlange enthält nur eine zufällige Nonce; API und
Worker leiten den Token im Speicher per HMAC aus `TEAM_INVITATION_TOKEN_KEY`
ab. Der Zweck (`access`/`delete`) fließt in den HMAC ein, ein Zugangslink kann
nicht als Löschlink verwendet werden (und umgekehrt). Links sind an die
Organisation gebunden, zeitlich begrenzt (Zugang 30 Minuten, Löschen 24
Stunden), einmalig; ein neuer Link macht den vorherigen ungültig;
Neuanforderungen werden je Adresse auf eine pro Minute gedrosselt. Der Token
wird als Hash per Datenbank-Gleichheit gesucht (kein eigener zeitkonstanter
Vergleich; der Suchwert ist ein SHA-256 eines 256-Bit-Tokens und für einen
Angreifer nicht steuerbar). Falsche, zu kurze und verbrauchte Token werden
gleich beantwortet (`404 Link unavailable`).

Öffentliche Aufrufe sind je **Organisation und Client** begrenzt: 6 Anforderungen
pro Minute für `request` und ebenso für `delete-request` (der 7. wird mit 429
abgewiesen), 20 Einlöseversuche pro Minute für `redeem` und ebenso für
`delete`. Die Sitzungsrouten (`GET`, `take`, `consent`, `consent/revoke`,
`logout`) haben kein eigenes Limit; die Sitzung gilt 60 Minuten und kommt nur
aus einem eingelösten Link.

Den Origin prüfen `request` und `delete-request` (bei fremdem Origin 403),
`redeem` und `delete` (404), `take`, `consent` und `consent/revoke` (404).
`logout` prüft ihn nicht (Abmelden schadet nicht).

## API-Überblick

Öffentlich (`/public/participant-memory/…`): `request`, `delete-request`,
`redeem`, `delete`, `logout`, `GET` (Angebot), `take`, `consent`,
`consent/revoke`. Admin (`/admin/participant-memory`): `GET`/`PUT` für
an/aus und Aufbewahrung, `POST /erase` für die Löschung einer Person
(jeweils Berechtigung `organization:update`).

## Betrieb

Der Worker braucht für Link-Mails `TEAM_INVITATION_TOKEN_KEY`, SMTP und die
kanonische URL. Er führt dann `participant_memory_requests` (jede Minute) und
`participant_memory_cleanup` (stündlich) aus. Ohne diese Konfiguration werden
keine Links ausgestellt.

## Hinweis zum Formular

Dieses Release liefert nur das Backend. Das öffentliche Formular ist
unverändert; die Oberfläche folgt in einem separaten Schritt.
