import { registerTeamRoutes } from './routes/team.js';
import {
  registerParticipantMemoryAdminRoutes,
  registerParticipantMemoryRoutes,
} from './routes/participant-memory.js';
import { registerDriverPortalRoutes } from './routes/driver-portal.js';
import { Hono } from 'hono';
import { requestBodyLimit } from './request-body-limit.js';
import { createContextResolvers } from './context-resolvers.js';
import { createPublicRegistrationRouteDeps } from './registration-budget.js';
import { installModules } from './modules.js';
import { registerEntriesRoutes } from './routes/entries.js';
import { registerEventsRoutes } from './routes/events.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerOrganizationRoutes } from './routes/organization.js';
import {
  registerPassengerAdminRoutes,
  registerPassengerPublicRoutes,
} from './routes/passengers.js';
import {
  registerPaymentsRoutes,
  registerPaymentProviderRoutes,
} from './routes/payments.js';
import { registerPaymentRefundRoutes } from './routes/payment-refunds.js';
import { registerPublicRegistrationRoutes } from './routes/public-registration.js';
import {
  registerPublicEventFormRoute,
  registerPublicFormRoute,
} from './routes/registration-assets.js';
import {
  registerRegistrationResumeRoutes,
  registerRegistrationRoutes,
} from './routes/registration.js';
import { registerRuntimeBootstrapRoute } from './routes/runtime-bootstrap.js';
import { createMemberGuard } from './routes/guard.js';
import type { ApiRoutesContext } from './routes/context.js';
import { registerStorageRoutes } from './storage-routes.js';
import type { ApiDeps } from './types.js';

/** Fails at startup for edition inputs that cannot work together. */
function assertEditionWiring(deps: ApiDeps): void {
  if (deps.team && !deps.memberships)
    throw new Error('Team requires per-request membership resolution');
  if (deps.config.deploymentMode === 'community' && !deps.config.organizationId)
    throw new Error('Community mode requires a configured organization');
  if (
    deps.config.deploymentMode === 'cloud' &&
    deps.publicRegistration &&
    deps.publicRegistration.rateLimiter.persistence !== 'shared'
  )
    throw new Error(
      'Cloud public registration requires shared persistent rate-limit storage',
    );
}

/**
 * Registers the routes of every module whose dependencies are present. Core
 * dependencies are mandatory in the type; edition inputs (storage, public
 * registration, event modules) decide which optional routes exist.
 */
export function createApp(deps: ApiDeps) {
  assertEditionWiring(deps);
  const app = new Hono();
  app.use('*', requestBodyLimit);
  app.use('*', async (c, next) => {
    await next();
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    if (new URL(c.req.url).protocol === 'https:')
      c.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
  });
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  const contexts = createContextResolvers(deps);
  const routes: ApiRoutesContext = {
    app,
    deps,
    resolvePublicContext: contexts.public,
    requireMember: createMemberGuard(contexts.member),
    mode: contexts.mode,
    communityOrganizationId: contexts.communityOrganizationId,
  };
  const registration = deps.publicRegistration
    ? createPublicRegistrationRouteDeps(
        deps.config,
        deps.publicRegistration.service,
        deps.publicRegistration.rateLimiter,
      )
    : undefined;
  registerRuntimeBootstrapRoute(routes);
  app.get('/auth/config', (c) => c.json({ oidc: deps.oidcClient ?? null }));
  registerOrganizationRoutes(routes);
  registerTeamRoutes(routes);
  registerParticipantMemoryAdminRoutes(routes);
  registerEventsRoutes(routes);
  registerEntriesRoutes(routes);
  registerPassengerAdminRoutes(routes);
  registerMessageRoutes(routes);
  registerPaymentsRoutes(routes);
  registerPaymentProviderRoutes(routes);
  registerPaymentRefundRoutes(routes);
  registerRegistrationRoutes(routes);
  if (registration) {
    registerPublicRegistrationRoutes(routes, registration);
    registerPassengerPublicRoutes(routes, registration);
    registerDriverPortalRoutes(routes, registration);
    registerParticipantMemoryRoutes(routes, registration);
    registerPublicFormRoute(routes, registration.service);
    registerRegistrationResumeRoutes(routes, registration);
  } else registerPublicEventFormRoute(routes);
  if (deps.objectStorage)
    registerStorageRoutes(routes, deps.objectStorage, registration);
  if (deps.modules)
    installModules(app, deps.modules, contexts.member, contexts.public);
  deps.mountAdditionalRoutes?.(app, {
    public: contexts.public,
    member: contexts.member,
  });
  return app;
}
