import { useState, type ReactNode } from 'react';
import { AppSettingsLayout, AppSettingsNav } from '@nennbox/ui';
import { TeamView } from './TeamView.js';
export function AccountSettings({ children }: { children: ReactNode }) {
  const [section, setSection] = useState('team');
  return (
    <AppSettingsLayout
      navigation={
        <AppSettingsNav
          items={[
            { id: 'team', label: 'Team' },
            { id: 'registration', label: 'Nennung und Unterlagen' },
          ]}
          activeId={section}
          onSelect={setSection}
        />
      }
    >
      {section === 'team' ? <TeamView /> : children}
    </AppSettingsLayout>
  );
}
