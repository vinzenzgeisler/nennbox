# NENNBOX Community: Selbstbetrieb-Kurzanleitung

Diese Anleitung startet den lokalen Community-Stack aus einem frischen Checkout.
Sie ist eine Entwicklungs-/Evaluierungsinstallation (HTTP, lokaler Keycloak und
Mailpit), keine gehärtete öffentliche Produktionsumgebung. Benötigt werden Git,
Node.js 24, npm 11, Docker mit Compose v2 und Bash.

## Start

```bash
git clone https://github.com/vinzenzgeisler/nennbox.git
cd nennbox
git switch main
git pull --ff-only
bash scripts/community-up.sh
```

Beim ersten Start erzeugt das Skript lokale OIDC-Zugangsdaten, bereitet Keycloak
und PostgreSQL vor, migriert die Datenbank automatisch, baut die Pakete und startet
API, Worker, App und Mailpit. Es legt die Community-Organisation sowie den ersten
Admin anhand des OIDC-Bootstrap-Selectors an; es ist kein Datenbankzugriff nötig.
Lass das Terminal geöffnet.

| Dienst | Adresse |
| --- | --- |
| Admin-App | <http://127.0.0.1:5173/app> |
| Mailpit (Test-E-Mails) | <http://127.0.0.1:8025> |
| API Health | <http://127.0.0.1:3000/health> |
| Keycloak | <http://127.0.0.1:8080> |

Melde dich in der App mit der im Terminal gezeigten E-Mail-Adresse (Standard
`admin@nennbox.local`) und dem automatisch erzeugten Passwort an. Falls benötigt,
kann es in einem zweiten Terminal aus `.community-local/config.json` mit
`node scripts/community-config.mjs --password` angezeigt werden. Die Datei enthält
Zugangsdaten und darf nicht weitergegeben werden.

## Veranstaltung und erste Nennung

1. In der Admin-App **Einrichten** öffnen, Name und Zeitraum angeben, mindestens
eine Klasse und Startgeld festlegen und Teilnahmebedingungen ergänzen.
2. **Speichern und Nennung öffnen** wählen und den öffentlichen Link öffnen.
3. Das Teilnehmerformular mit Testdaten absenden. Die Bestätigungsmail erscheint
   in Mailpit; den darin enthaltenen Link öffnen.
4. In der Admin-App die Veranstaltung auswählen, Nennung öffnen, Unterlagen prüfen
   und Zulassung sowie Zahlung erfassen. Der Verlauf dokumentiert die Änderungen.

Alle Daten sind lokal; verwende keine echten personenbezogenen Daten in dieser
Testinstallation. Dienste lauschen auf Loopback. Die OIDC-URLs erwarten
`127.0.0.1`, nicht `localhost`.

## Stoppen und fortsetzen

Im Terminal mit dem laufenden Stack `Ctrl+C` drücken. PostgreSQL- und
Keycloak-Volumes sowie `.community-local/` bleiben erhalten. Für den nächsten Start
im Checkout erneut `bash scripts/community-up.sh` ausführen.

## Backup und vollständige Wiederherstellung

Das Backup besteht aus einem PostgreSQL-Custom-Dump und `.community-local`. Letzteres
enthält die Zugangsdaten, den importierbaren Keycloak-Realm sowie den lokalen
Upload-Speicher. Die Realm-Datei wird von `community-config.mjs` erzeugt; sie ist
Teil des Backups, damit Benutzer/Passwort, Client und Redirect-URLs exakt erhalten
bleiben. Das Backup enthält vertrauliche Daten und muss verschlüsselt sowie
zugriffsbeschränkt aufbewahrt werden. Vor dem Backup App und Worker mit `Ctrl+C`
beenden (PostgreSQL und Keycloak dürfen laufen):

```bash
bash scripts/community-backup.sh backups/community-2026-11-18
```

Für einen vollständigen Restore im selben Checkout/Projekt (Standardprojekt
`nennbox-community`) werden zunächst Container **und beide Compose-Volumes**
entfernt, die lokalen Dateien aus dem Archiv wiederhergestellt, danach PostgreSQL,
Keycloak und der Realm neu angelegt und der Dump eingespielt:

```bash
bash scripts/community-restore.sh backups/community-2026-11-18
bash scripts/community-up.sh
```

`pg_restore --clean --if-exists` ersetzt Datenbankobjekte; dies ist kein Merge in
eine bestehende Datenbank. Der Restore löscht die Volumes des angegebenen Compose-
Projekts. Für Isolation kann `COMPOSE_PROJECT_NAME` auf denselben eindeutigen Wert
für Backup, Restore und Start gesetzt werden. Für alternative Host-Ports können
`COMMUNITY_POSTGRES_PORT`, `COMMUNITY_KEYCLOAK_PORT`, `COMMUNITY_SMTP_PORT`,
`COMMUNITY_MAILPIT_PORT`, `COMMUNITY_API_PORT` und `COMMUNITY_APP_PORT` gesetzt
werden; bei abweichenden Ports müssen dieselben Werte und die passenden
`COMMUNITY_KEYCLOAK_URL`/`COMMUNITY_APP_URL` für Backup, Restore und Start gelten.
Verwende niemals den Namen eines anderen laufenden Compose-Projekts. Danach in der
App anmelden, die gespeicherte Veranstaltung/Nennung öffnen und den Upload aus den
Unterlagen herunterladen.


## Upgrade

Vor dem Upgrade Backup wie oben erstellen. Im Checkout:

```bash
git pull --ff-only origin main
bash scripts/community-up.sh
```

Der Start baut den aktuellen Quellstand und führt Datenbankmigrationen aus.
Bewahre den vorherigen Commit sowie ein passendes Backup bis zur erfolgreichen
Funktionsprüfung auf. Bei Problemen Stack stoppen und nur mit einem konsistenten
Backup wiederherstellen; ein Downgrade von Schemaänderungen wird nicht zugesichert.

Weitere Hinweise zur lokalen Nutzung stehen im
[Community-Leitfaden](../getting-started/community-local.md); der vollständige
Browser-Abnahmenachweis liegt in [`alpha-flow.spec.ts`](../../packages/app/e2e/alpha-flow.spec.ts).
