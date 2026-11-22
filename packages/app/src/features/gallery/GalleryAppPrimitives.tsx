import {
  AppButton,
  AppChip,
  AppCheckbox,
  AppField,
  AppMenuItem,
  AppPopover,
  AppProgressDots,
  AppSegmented,
  AppStatusPill,
  AppThumb,
} from '@nennbox/ui';

export function GalleryAppPrimitives({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: (value: boolean) => void;
}) {
  return (
    <section>
      <h2>App-Design · neue Muster</h2>
      <div className="nb-gallery-row">
        <AppButton tone="primary">Zulassen</AppButton>
        <AppButton>Nachricht schreiben</AppButton>
        <AppButton tone="ghost">Abbrechen</AppButton>
        <AppButton disabled>Nicht verfügbar</AppButton>
        <AppStatusPill status="offen">Offen</AppStatusPill>
        <AppStatusPill status="vor">In Prüfung</AppStatusPill>
        <AppStatusPill status="zu">Zugelassen</AppStatusPill>
        <AppStatusPill status="neg">Abgelehnt</AppStatusPill>
        <AppStatusPill status="ab">Abgemeldet</AppStatusPill>
        <AppThumb>42</AppThumb>
        <AppProgressDots
          states={['ok', 'missing', 'waiting', 'waiting']}
          label="1 von 4 erledigt"
        />
        <AppSegmented
          label="Status"
          value={selected ? 'alle' : 'offen'}
          onChange={(value) => onSelect(value === 'alle')}
          options={[
            { value: 'alle', label: 'Alle' },
            { value: 'offen', label: 'Offen' },
          ]}
        />
        <AppField aria-label="Suchen" placeholder="Suchen" />
        <AppChip>Klasse A</AppChip>
        <AppCheckbox label="Auswählen" />
        <AppPopover>
          <AppMenuItem>Öffnen</AppMenuItem>
          <AppMenuItem danger>Ablehnen</AppMenuItem>
        </AppPopover>
      </div>
    </section>
  );
}
