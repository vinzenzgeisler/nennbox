import { useEffect, useRef, useState } from 'react';

export const PREVIEW_WIDTH_KEY = 'nennbox.preview.width';
export function clampPreviewWidth(width: number, workspace: number) {
  return Math.min(Math.max(340, workspace / 2), Math.max(340, width));
}
export function usePreviewResize() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem(PREVIEW_WIDTH_KEY));
      return value >= 340 && Number.isFinite(value) ? value : 380;
    } catch {
      return 380;
    }
  });
  const [maximum, setMaximum] = useState(760);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const workspace =
      element.closest<HTMLElement>('.nb-admin-workspace-body') ?? element;
    const measure = () => {
      const size = workspace.getBoundingClientRect().width;
      if (size <= 0) return;
      setMaximum(Math.max(340, size / 2));
      setWidth((current) => clampPreviewWidth(current, size));
    };
    measure();
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(workspace);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  useEffect(() => {
    const workspace = ref.current?.closest<HTMLElement>(
      '.nb-admin-workspace-body',
    );
    workspace?.style.setProperty('--workspace-preview-width', `${width}px`);
    try {
      localStorage.setItem(PREVIEW_WIDTH_KEY, String(width));
    } catch {
      /* Optional persistence. */
    }
    return () => {
      workspace?.style.removeProperty('--workspace-preview-width');
    };
  }, [width]);
  return {
    ref,
    width,
    maximum,
    resize: (value: number) =>
      setWidth(Math.max(340, Math.min(maximum, value))),
  };
}
