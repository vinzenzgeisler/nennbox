import { AppButton, AppStatusPill, AppTable } from '@nennbox/ui';
import type { Module } from './AdminModules.js';
import { ModuleDisableButton } from './ModuleDisableButton.js';
import { words, type ModuleLocale } from './moduleWords.js';

export function ModuleTable({
  modules,
  locale,
  onUpgrade,
  onDetails,
  onChange,
}: {
  modules: Module[];
  locale: ModuleLocale;
  onUpgrade?: ((moduleId: string) => void) | undefined;
  onDetails: (module: Module) => void;
  onChange: (
    module: Module,
    payload: { enabled: boolean; reason?: string },
  ) => void;
}) {
  const t = words[locale];
  return (
    <AppTable headers={[t.module, t.description, t.status, t.actions]}>
      {modules.map((module) => (
        <tr key={module.id}>
          <td>
            <strong>{module.gallery.name[locale]}</strong>
          </td>
          <td>{module.gallery.shortDescription[locale]}</td>
          <td>
            {module.status === 'unavailable' ? (
              <AppStatusPill status="neg">
                {t[module.unavailableReason ?? 'edition']}
              </AppStatusPill>
            ) : module.enabled ? (
              <AppStatusPill status="zu">{t.active}</AppStatusPill>
            ) : (
              <AppStatusPill status="offen">{t.inactive}</AppStatusPill>
            )}
          </td>
          <td>
            <div className="nb-app-inline">
              <AppButton tone="ghost" onClick={() => onDetails(module)}>
                {t.details}
              </AppButton>
              {module.status === 'unavailable' ? (
                module.unavailableReason === 'entitlement' && onUpgrade ? (
                  <AppButton
                    tone="secondary"
                    onClick={() => onUpgrade(module.id)}
                  >
                    {t.upgrade}
                  </AppButton>
                ) : null
              ) : module.enabled ? (
                <ModuleDisableButton
                  locale={locale}
                  onConfirm={(reason) =>
                    onChange(module, { enabled: false, reason })
                  }
                />
              ) : (
                <AppButton
                  tone="secondary"
                  onClick={() => onChange(module, { enabled: true })}
                >
                  {t.activate}
                </AppButton>
              )}
            </div>
          </td>
        </tr>
      ))}
    </AppTable>
  );
}
