// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
