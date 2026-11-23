import React, { useEffect, useRef } from 'react';
import { Icon } from '../icon/Icon.js';

export function Menu({
  label,
  children,
  onOpenChange,
}: {
  label: string;
  children: React.ReactNode;
  onOpenChange?: ((open: boolean) => void) | undefined;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const items = () =>
    Array.from(
      detailsRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    summaryRef.current?.focus();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        event.preventDefault();
        event.stopImmediatePropagation();
        detailsRef.current.open = false;
        summaryRef.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !detailsRef.current?.contains(event.target)
      )
        if (detailsRef.current) detailsRef.current.open = false;
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  return (
    <details
      ref={detailsRef}
      className="nb-menu"
      onClick={(event) => event.stopPropagation()}
      onToggle={() => {
        const open = Boolean(detailsRef.current?.open);
        onOpenChange?.(open);
        if (open && document.activeElement === summaryRef.current)
          items()[0]?.focus();
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const buttons = items();
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        if (event.key === 'Tab') {
          if (detailsRef.current) detailsRef.current.open = false;
          return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          detailsRef.current!.open = true;
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : index < 0
                  ? event.key === 'ArrowUp'
                    ? buttons.length - 1
                    : 0
                  : (index +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
          buttons[next]?.focus();
        } else if (detailsRef.current?.open && event.key.length === 1) {
          const target = buttons.find(
            (button) =>
              button.dataset.shortcut?.toLowerCase() ===
              event.key.toLowerCase(),
          );
          if (target) {
            event.preventDefault();
            event.stopPropagation();
            target.click();
          }
        }
      }}
    >
      <summary ref={summaryRef} aria-label={label} aria-haspopup="menu">
        <Icon name="more" />
      </summary>
      <div
        className="nb-menu-disclosure"
        role="menu"
        aria-label={label}
        onClickCapture={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button:not(:disabled), a')
          )
            close();
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function MenuItem({
  children,
  onClick,
  shortcut,
  tone = 'default',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: (() => void) | undefined;
  shortcut?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      data-shortcut={shortcut}
      data-tone={tone}
      disabled={disabled}
    >
      <span>{children}</span>
      {shortcut && (
        <kbd aria-hidden="true">{shortcut === 'Enter' ? '↵' : shortcut}</kbd>
      )}
    </button>
  );
}
