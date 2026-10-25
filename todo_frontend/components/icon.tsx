import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  check: "m5 12 4 4L19 6",
  plus: "M12 5v14M5 12h14",
  all: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  today: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z",
  upcoming: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  completed: "m7 12 3 3 7-7M21 11v1a9 9 0 1 1-5-8",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  close: "m6 6 12 12M18 6 6 18",
  edit: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  flag: "M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4",
  logout: "M9 3H4v18h5M10 12h11m-4-4 4 4-4 4",
  upload: "M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6",
  file: "M14 2H5v20h14V7zM14 2v6h6M8 13h8M8 17h5",
  menu: "M4 6h16M4 12h16M4 18h16",
  moon: "M20.5 13a9 9 0 0 1-9.5-9.5A9 9 0 1 0 20.5 13Z",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
  telegram: "m21 3-4 18-6-5-4 3 1-6L21 3 3 10l5 3",
  shield: "M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6z",
  chevron: "m9 5 7 7-7 7",
  leaf: "M20 3C7 1 1 9 7 16c7 6 15 0 13-13ZM4 21 15 10",
  info: "M12 11v6M12 7v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name] || paths.all} />
    </svg>
  );
}
