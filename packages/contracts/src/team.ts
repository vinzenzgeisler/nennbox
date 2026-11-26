import { z } from 'zod';

export const teamRoles = {
  admin: {
    label: 'Administrator',
    description: 'Verwaltet alles, auch Team, Einstellungen und Zahlungen.',
    permissions: [
      'organization:update',
      'event:write',
      'class:write',
      'entry:write',
      'entry:inspect',
      'payment:write',
      'timing:record',
      'timing:correct',
      'timing:publish',
    ],
  },
  office: {
    label: 'Nennbüro',
    description:
      'Bearbeitet Nennungen, lässt zu, prüft Unterlagen und Abnahme und schreibt Nachrichten. Keine Zahlungen oder Einstellungen.',
    permissions: ['entry:write', 'entry:inspect'],
  },
  cashier: {
    label: 'Kasse',
    description:
      'Erfasst Zahlungen und Erstattungen; kann Nennungen lesen, aber nicht bearbeiten.',
    permissions: ['payment:write'],
  },
  scrutineer: {
    label: 'Abnahme vor Ort',
    description:
      'Bearbeitet technische Abnahme und Haftverzicht; kann Nennungen lesen, aber nicht zulassen.',
    permissions: ['entry:inspect'],
  },
  viewer: {
    label: 'Nur lesen',
    description:
      'Kann alles ansehen, aber nichts ändern. Kein Zugriff auf Einstellungen.',
    permissions: [],
  },
} as const;
export const TeamRoleSchema = z.enum([
  'admin',
  'office',
  'cashier',
  'scrutineer',
  'viewer',
]);
export type TeamRole = z.infer<typeof TeamRoleSchema>;
export const TeamResponse = z.object({
  members: z.array(
    z.object({
      id: z.string(),
      email: z.string().nullable(),
      displayName: z.string().nullable(),
      role: TeamRoleSchema,
      status: z.enum(['active', 'disabled']),
      lastSignedInAt: z.string().nullable(),
    }),
  ),
  invitations: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      role: TeamRoleSchema,
      expiresAt: z.string(),
      revokedAt: z.string().nullable(),
      redeemedAt: z.string().nullable(),
    }),
  ),
  history: z.array(
    z.object({
      id: z.string(),
      actorIssuer: z.string(),
      actorSubject: z.string(),
      actorName: z.string().nullable().optional(),
      action: z.string(),
      targetId: z.string(),
      details: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }),
  ),
});
export type Team = z.infer<typeof TeamResponse>;
