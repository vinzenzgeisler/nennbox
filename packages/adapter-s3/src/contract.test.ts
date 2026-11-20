import { describe, it } from 'vitest';
import { verifyObjectStorageContract } from '@nennbox/core';
import { createS3ObjectStorage } from './index.js';

const endpoint = process.env.NENNBOX_S3_TEST_ENDPOINT;
const bucket = process.env.NENNBOX_S3_TEST_BUCKET;
describe.skipIf(!endpoint || !bucket)(
  'S3 object storage port contract (MinIO)',
  () => {
    it('satisfies the shared object storage contract', async () => {
      await verifyObjectStorageContract(
        createS3ObjectStorage({
          endpoint: endpoint!,
          bucket: bucket!,
          region: process.env.NENNBOX_S3_TEST_REGION ?? 'us-east-1',
          forcePathStyle: true,
          ...(process.env.NENNBOX_S3_TEST_ACCESS_KEY &&
          process.env.NENNBOX_S3_TEST_SECRET_KEY
            ? {
                credentials: {
                  accessKeyId: process.env.NENNBOX_S3_TEST_ACCESS_KEY,
                  secretAccessKey: process.env.NENNBOX_S3_TEST_SECRET_KEY,
                },
              }
            : {}),
        }),
      );
    });
  },
);
