import { AppButton, AppSection, AppDialog } from '@nennbox/ui';
import { SchemaFields } from './ModuleSchemaFields.js';
import { words, type ModuleLocale } from './moduleWords.js';
import type { Module } from './AdminModules.js';
import type { ReactNode } from 'react';

export function ModuleConfigDialog({
  selected,
  locale,
  config,
  configErrors,
  onClose,
  onSave,
  onChange,
}: {
  selected: Module;
  locale: ModuleLocale;
  config: unknown;
  configErrors: Record<string, string>;
  onClose: () => void;
  onSave: () => void;
  onChange: (path: string, value: unknown) => void;
}) {
  const t = words[locale];
  const actions: ReactNode = (
    <>
      <AppButton tone="secondary" onClick={onClose}>
        {t.close}
      </AppButton>
      <AppButton tone="primary" onClick={onSave}>
        {t.save}
      </AppButton>
    </>
  );
  return (
    <AppDialog
      open
      title={selected.gallery.name[locale]}
      closeLabel={t.close}
      onClose={onClose}
      actions={actions}
    >
      <div className="nb-app-stack">
        <AppSection
          title={t.description}
          description={selected.gallery.longDescription[locale]}
        >
          <p>
            {selected.gallery.editions
              .map((edition) => t.editions[edition] ?? edition)
              .join(', ')}{' '}
            ·{' '}
            {t.entitlements[
              selected.gallery.entitlement as keyof typeof t.entitlements
            ] ?? selected.gallery.entitlement}
          </p>
        </AppSection>
        <SchemaFields
          schema={selected.configSchema}
          value={config}
          path=""
          errors={configErrors}
          onChange={onChange}
        />
      </div>
    </AppDialog>
  );
}
