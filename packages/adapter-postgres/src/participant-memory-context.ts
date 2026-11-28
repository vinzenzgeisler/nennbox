import {
  createRequestContext,
  organizationId,
  permissionsForRole,
  staticCanonicalOrigin,
} from '@nennbox/core';
import type { createDatabase } from './index.js';

export const tokenKey = 'c'.repeat(64);
export const origin = staticCanonicalOrigin('https://memory.example.test');
export type TestDb = Awaited<ReturnType<typeof createDatabase>>['db'];

export const publicContext = (org: string) =>
  createRequestContext({
    deploymentMode: 'community',
    organizationId: organizationId(org),
    permissions: new Set(),
    capabilities: new Set(),
    correlationId: crypto.randomUUID(),
  });
export const adminContext = (org: string, role: 'admin' | 'viewer' = 'admin') =>
  createRequestContext({
    deploymentMode: 'community',
    organizationId: organizationId(org),
    subject: {
      issuer: 'https://id.example.test',
      subject: crypto.randomUUID(),
    },
    permissions: permissionsForRole(role),
    capabilities: new Set(),
    correlationId: crypto.randomUUID(),
  });
