import { useState, type ReactNode } from 'react';
import { AppSettingsLayout, AppSettingsNav } from '@nennbox/ui';
import { TeamView } from './TeamView.js';
export function AccountSettings({ children }: { children: ReactNode }) {
  const [section, setSection] = useState('registration');
  return (
    <AppSettingsLayout
      navigation={
        <AppSettingsNav
          items={[
            { id: 'registration', label: 'Nennung und Unterlagen' },
            { id: 'team', label: 'Team' },
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
