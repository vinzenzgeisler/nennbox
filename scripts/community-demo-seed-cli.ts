import { createDatabase } from '@nennbox/adapter-postgres';
import { seedCommunityDemo } from './community-demo-seed.js';

async function runCli() {
  if (
    process.env.COMMUNITY_DEMO_SEED !== 'I_UNDERSTAND' ||
    process.env.DEPLOYMENT_MODE !== 'community'
  ) {
    throw new Error(
      'Demo seed requires COMMUNITY_DEMO_SEED=I_UNDERSTAND and DEPLOYMENT_MODE=community',
    );
  }
  const url = process.env.DATABASE_URL;
  const slug = process.env.COMMUNITY_ORGANIZATION_SLUG;
  if (!url || !slug)
    throw new Error(
      'DATABASE_URL and COMMUNITY_ORGANIZATION_SLUG are required',
    );
  const { db, pool } = await createDatabase(url);
  try {
    await seedCommunityDemo(db, {
      organizationSlug: slug,
      organizationName: process.env.COMMUNITY_ORGANIZATION_NAME,
      eventSlug: process.env.COMMUNITY_DEMO_EVENT_SLUG,
      eventName: process.env.COMMUNITY_DEMO_EVENT_NAME,
      deploymentMode: 'community',
    });
  } finally {
    await pool.end();
  }
}

await runCli();
