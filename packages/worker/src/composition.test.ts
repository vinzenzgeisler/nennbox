import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@nennbox/adapter-postgres';
import type { PaymentProvider } from '@nennbox/core';
import { composeWorkerTasks, createProductWorker } from './index.js';

describe('worker task composition', () => {
  it('composes shared and assembly-owned handlers and runs the selected task', async () => {
    const shared = vi.fn(async () => {});
    const assembly = vi.fn(async () => {});
    const tasks = composeWorkerTasks(
      { 'shared.health-check': shared },
      { 'private-example.refresh': assembly },
    );
    await tasks['private-example.refresh']?.({}, { job: { id: 'job-1' } });
    expect(assembly).toHaveBeenCalledOnce();
    expect(shared).not.toHaveBeenCalled();
  });

  it('fails closed on invalid names and attempts to replace shared work', () => {
    const task = async () => {};
    expect(() =>
      composeWorkerTasks(
        { 'shared.health-check': task },
        { 'shared.health-check': task },
      ),
    ).toThrow(/already registered/);
    expect(() => composeWorkerTasks({ 'Capitalized.Task': task })).toThrow(
      /Invalid worker task name/,
    );
  });

  it('registers the refund retry job only when a payment provider is configured', () => {
    const base = {
      db: {} as Database,
      edition: { deploymentMode: 'cloud' as const },
    };
    expect(Object.keys(createProductWorker(base).taskList)).not.toContain(
      'payment_refund_retry',
    );
    expect(
      Object.keys(
        createProductWorker({
          ...base,
          payments: { provider: {} as PaymentProvider },
        }).taskList,
      ),
    ).toContain('payment_refund_retry');
  });
});
