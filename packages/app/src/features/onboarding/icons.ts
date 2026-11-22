/**
 * Placeholder drawings for the cards: one 24 × 24 line path each (the reference
 * ships the same kind of stand-in). Real sketches per card are still open.
 */
export const icons = {
  google: 'M20 12a8 8 0 1 1-2.3-5.6M12 12h8',
  passkey: 'M8 12a4 4 0 1 1 3.4 3.96L10 17.4H8.5V19H7v1.5H4.5v-2.1L8.3 14.6',
  'email-code': 'M4 6h16v12H4zM4 7.5l8 6 8-6',
  hillclimb: 'M3 20l4-4 3 3 4-7 3 3 4-8',
  rally: 'M6 21V4M6 5h11l-2.5 3.5L17 12H6',
  slalom: 'M4 19l3.5-9 3.5 9M13 19l3.5-9 3.5 9',
  regularity: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18',
  kart: 'M4 15h16M7 15v-2h10v2M10 13l1-3h4M6.5 19a1.6 1.6 0 1 0 0-3.2a1.6 1.6 0 1 0 0 3.2M17.5 19a1.6 1.6 0 1 0 0-3.2a1.6 1.6 0 1 0 0 3.2',
  circuit: 'M12 6c5 0 9 2.7 9 6s-4 6-9 6-9-2.7-9-6 4-6 9-6',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
  licensed: 'M12 3l7 3v5.5c0 4-3 6.8-7 8.5-4-1.7-7-4.5-7-8.5V6zM9 12l2 2 4-4',
  clubsport:
    'M9 10a3 3 0 1 0 0-6a3 3 0 1 0 0 6M3 19c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5M17 11a2.5 2.5 0 1 0 0-5M18.6 19c0-2-.6-3.3-1.6-4',
  guests:
    'M10 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M3 20c0-3.5 3-5.5 7-5.5M17 14v6M14 17h6',
  historic: 'M4 6h16v14H4zM4 11h16M8 3v4M16 3v4M8 15h3',
  modern: 'M3 16h18M6 16v-3l2.5-4.5h7L18 13v3M8 19v1M16 19v1',
  mixed: 'M4 8h9v7H4zM11 12h9v7h-9M8 15v4M16 8v4',
  car: 'M3 16h18M6 16v-3l2.5-4.5h7L18 13v3M8 19v1M16 19v1',
  motorcycle:
    'M6 18.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5M18 18.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5M6 16l4-6h5l3 6M10 10l-1-2H7',
  both: 'M4 8h9v7H4zM11 12h9v7h-9M8 15v4M16 8v4',
  requested: 'M9 4L7 20M17 4l-2 16M4 9h16M3 15h16',
  assigned: 'M4 6h4M4 12h4M4 18h4M12 6h8M12 12h8M12 18h8',
  automatic: 'M4 12h12M12 7l5 5-5 5M20 5v14',
  codriver:
    'M9 10a3 3 0 1 0 0-6a3 3 0 1 0 0 6M3 19c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5M17 11a2.5 2.5 0 1 0 0-5M18.6 19c0-2-.6-3.3-1.6-4',
  solo: 'M12 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5',
  'double-start': 'M4 4h11v11H4zM9 9h11v11H9z',
  'single-start': 'M5 5h14v14H5z',
  online: 'M3 6h18v12H3zM3 10h18M7 15h3',
  transfer: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
  'online-and-transfer': 'M3 7h14l-3-3M21 17H7l3 3',
  'stripe-now': 'M12 3v9l5 3M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18',
  'stripe-later': 'M5 12h14M13 6l6 6-6 6',
  brand:
    'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.5-2s0-2.5 1.5-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5',
  stats: 'M5 20V10M12 20V4M19 20v-8',
  form: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7',
  docs: 'M7 3h7l4 4v14H7zM14 3v4h4M9 13h6M9 17h6',
  translate:
    'M4 5h9M8.5 5v2M6 12c2-1 4-3.5 4.5-7M6 9c1 2.5 3 4 5 4.5M13 20l4-9 4 9M14.5 17h5',
} as const;
export type IconName = keyof typeof icons;
