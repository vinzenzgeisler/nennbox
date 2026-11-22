// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportJob } from '@nennbox/contracts';
import { ExportHistory } from './ExportHistory.js';
import { ExportForm } from './ExportForm.js';
import { initialDraft } from './exportModel.js';
import { OverviewWarnings } from '../overview/OverviewWarnings.js';

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

describe('app view action wiring', () => {
  it('keeps selected export columns, submit, and busy protection wired to their callbacks', () => {
    const host = document.createElement('div');
    root = createRoot(host);
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const props = {
      draft: initialDraft,
      onChange,
      onSubmit,
      classes: [],
      statuses: [],
      busy: false,
    };
    act(() => root!.render(<ExportForm {...props} />));
    const driver = Array.from(host.querySelectorAll('label'))
      .find((label) => label.textContent === 'Fahrer')!
      .querySelector('input')!;
    act(() => driver.click());
    expect(onChange).toHaveBeenCalledWith({
      ...initialDraft,
      fields: initialDraft.fields.filter((field) => field !== 'driver'),
    });
    act(() => host.querySelector('button')!.click());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    act(() => root!.render(<ExportForm {...props} busy />));
    expect(host.querySelector('button')?.disabled).toBe(true);
    act(() =>
      root!.render(
        <ExportForm {...props} draft={{ ...initialDraft, fields: [] }} />,
      ),
    );
    expect(host.querySelector('button')?.disabled).toBe(true);
  });
  it('opens only the warning filters of the currently selected event', () => {
    const host = document.createElement('div');
    root = createRoot(host);
    const onOpenEntries = vi.fn();
    const warnings = [
      {
        type: 'unverified-email' as const,
        count: 2,
        filter: {
          eventId: 'event-a',
          verificationStatus: 'unverified' as const,
        },
      },
    ];
    act(() =>
      root!.render(
        <OverviewWarnings
          eventId="event-a"
          warnings={warnings}
          onOpenEntries={onOpenEntries}
        />,
      ),
    );
    act(() => host.querySelector('button')!.click());
    expect(onOpenEntries).toHaveBeenCalledWith({
      verificationStatus: 'unverified',
    });
    const stale = renderToStaticMarkup(
      <OverviewWarnings
        eventId="event-b"
        warnings={warnings}
        onOpenEntries={onOpenEntries}
      />,
    );
    expect(stale).not.toContain('<button');
    expect(stale).toContain('2 Nennungen');
  });
  it('keeps only finished safe downloads actionable and shows relative creation time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
    const job: ExportJob = {
      jobId: '12345678-1234-1234-1234-123456789012',
      status: 'finished',
      createdAt: '2026-11-22T10:00:00Z',
      expiresAt: null,
      fields: ['driver'],
      filters: {},
      downloadUrl:
        '/admin/artifact-jobs/12345678-1234-1234-1234-123456789012/download',
    };
    const onDownload = vi.fn();
    const host = document.createElement('div');
    root = createRoot(host);
    try {
      act(() =>
        root!.render(
          <ExportHistory
            jobs={[
              job,
              {
                ...job,
                jobId: 'unsafe',
                downloadUrl: 'https://example.com/export.csv',
              },
              { ...job, jobId: 'running', status: 'running' },
            ]}
            classes={new Map()}
            statuses={new Map()}
            downloading={null}
            onDownload={onDownload}
          />,
        ),
      );
      expect(host.querySelectorAll('button')).toHaveLength(1);
      expect(host.querySelector('time')?.textContent).toBe('vor 2 Std.');
      expect(host.querySelector('time')?.dateTime).toBe(job.createdAt);
      act(() => host.querySelector('button')!.click());
      expect(onDownload).toHaveBeenCalledWith(job, job.downloadUrl);
    } finally {
      vi.useRealTimers();
    }
  });
});
