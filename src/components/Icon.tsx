import type { SVGProps } from 'react';

/** A small, consistent stroke icon set (24px grid, 1.75 stroke) drawn for WorkRadar. */
const PATHS: Record<string, string> = {
  today: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6.5-6.5',
  feed: 'M4 6h16M4 12h16M4 18h10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.6c1.8.7 3 2.5 3 5.4',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-4l-.3-2.4a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 2-3.4 1.9.7a7 7 0 0 1 2-1.2L10.8 3h4l.3 2.4a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l2.7 2.7L16 10',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  'user-plus': 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 20c0-3.3 2.9-5.5 6.5-5.5 1.3 0 2.5.3 3.5.8M18 14v6M15 17h6',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 4l9 16H3l9-16zM12 10v4M12 17.2v.1',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  inbox: 'M4 13l2.5-7h11L20 13M4 13v6h16v-6M4 13h4.5l1 2h5l1-2H20',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14.5h8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  play: 'M7 5l12 7-12 7V5z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  sweep: 'M12 3a9 9 0 1 0 9 9M12 12V3M12 12l6.4-6.4',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  // Source glyphs
  hash: 'M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16',
  ticket: 'M4 7.5V5h16v2.5a2.5 2.5 0 0 0 0 5V19H4v-6.5a2.5 2.5 0 0 0 0-5zM14 5v14',
  pr: 'M6 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 16a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18 16a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 8v8M18 16V9a3 3 0 0 0-3-3h-4M13 3.5L10.5 6 13 8.5',
  mail: 'M3 6h18v12H3zM3.5 6.5L12 13l8.5-6.5',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
