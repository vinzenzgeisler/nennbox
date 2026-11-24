import React from 'react';

export type IconName =
  | 'list'
  | 'document'
  | 'mail'
  | 'calendar'
  | 'approval'
  | 'check'
  | 'info'
  | 'search'
  | 'filter'
  | 'more'
  | 'next'
  | 'overview'
  | 'export'
  | 'settings'
  | 'switch'
  | 'person'
  | 'amount'
  | 'note'
  | 'link'
  | 'warning'
  | 'payment'
  | 'tag'
  | 'trash';

const paths: Record<IconName, React.ReactNode> = {
  // Navigation glyphs follow the app reference (quelle/N2Nennungen.dc.html).
  list: <path d="M5 6h14M5 12h14M5 18h9" />,
  document: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  approval: <path d="M5 5h3M16 5h3v16H5V5M9 13l2 2 4-4" />,
  check: <path d="M5 12l4 4L19 6" />,
  info: <path d="M12 3l9 17H3zM12 10v4M12 16.5v1" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  more: (
    <path d="M5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2z" fill="currentColor" />
  ),
  next: <path d="M4 12h16M14 6l6 6-6 6" />,
  overview: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  export: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  person: (
    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21v-2a8 8 0 0 1 16 0v2" />
  ),
  amount: (
    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM16 7a6 6 0 0 0-3-1c-3 0-5 2-5 6s2 6 5 6a6 6 0 0 0 3-1M6 10h8M6 14h7" />
  ),
  note: <path d="M13 4H4v16h16v-9M10 14l1-4 9-9 3 3-9 9zM18 3l3 3" />,
  link: (
    <path d="M10 8l4-4a4 4 0 0 1 6 6l-4 4M14 16l-4 4a4 4 0 0 1-6-6l4-4M8 16l8-8" />
  ),
  warning: <path d="M12 3L2 21h20zM12 9v5M12 17v1" />,
  payment: <path d="M3 6h18v12H3zM3 10h18M7 15h4" />,
  tag: <path d="M4 4h8l8 8-8 8-8-8zM8 8h2v2H8z" />,
  trash: <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />,
  switch: <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
};
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg
      className="nb-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name]}
    </svg>
  );
}
