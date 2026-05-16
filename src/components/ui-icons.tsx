import type { ReactNode, SVGProps } from "react";

type IconName =
  | "spark"
  | "wallet"
  | "camera"
  | "check"
  | "clock"
  | "trophy"
  | "repeat"
  | "gift"
  | "star"
  | "leaf"
  | "seed"
  | "sprout"
  | "dog"
  | "bed"
  | "dish"
  | "laundry"
  | "room";

export function AppIcon({
  name,
  className = "h-5 w-5",
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      className={className}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

export function getChoreIcon(title: string): IconName {
  const normalized = title.toLowerCase();
  if (normalized.includes("dog") || normalized.includes("pet")) return "dog";
  if (normalized.includes("bed")) return "bed";
  if (normalized.includes("dish") || normalized.includes("kitchen")) return "dish";
  if (normalized.includes("laundry") || normalized.includes("clothes")) return "laundry";
  if (normalized.includes("room") || normalized.includes("playroom") || normalized.includes("clean")) return "room";
  return "star";
}

const iconPaths: Record<IconName, ReactNode> = {
  spark: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
      <path d="M5 14l.6 1.6L7.2 16l-1.6.6L5 18.2l-.6-1.6L2.8 16l1.6-.4L5 14z" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a3 3 0 0 1 3 3v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5z" />
      <path d="M15 12h6" />
      <path d="M5 6V5a2 2 0 0 1 2-2h10" />
      <circle cx="16.5" cy="12" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      <path d="M4.5 8.5h3l1.4-2h6.2l1.4 2h3a1.5 1.5 0 0 1 1.5 1.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-6.5A1.5 1.5 0 0 1 4.5 8.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.2 2.2 4.8-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.6l3 1.8" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v3.3A4 4 0 0 1 12 11a4 4 0 0 1-4-3.7z" />
      <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v.2A3.3 3.3 0 0 0 7.3 10H8" />
      <path d="M16 5h2.5A1.5 1.5 0 0 1 20 6.5v.2A3.3 3.3 0 0 1 16.7 10H16" />
      <path d="M12 11v4" />
      <path d="M9 20h6" />
      <path d="M10 15h4l1 5H9z" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 7h3V4" />
      <path d="M20 7l-3.3-3.3A4 4 0 0 0 13.9 2.5H8.5A4.5 4.5 0 0 0 4 7" />
      <path d="M7 17H4v3" />
      <path d="M4 17l3.3 3.3a4 4 0 0 0 2.8 1.2h5.4A4.5 4.5 0 0 0 20 17" />
    </>
  ),
  gift: (
    <>
      <path d="M4 10h16v9H4z" />
      <path d="M12 10v9" />
      <path d="M3 7h18v3H3z" />
      <path d="M12 7H9.4A2.2 2.2 0 1 1 12 4.2z" />
      <path d="M12 7h2.6A2.2 2.2 0 1 0 12 4.2z" />
    </>
  ),
  star: (
    <>
      <path d="M12 3.8l2.3 4.8 5.2.8-3.8 3.8.9 5.4-4.6-2.5-4.6 2.5.9-5.4L4.5 9.4l5.2-.8L12 3.8z" />
    </>
  ),
  leaf: (
    <>
      <path d="M19.5 4.5C11.8 4.4 6.2 8.7 5.2 15.8c5.8.8 10.8-2.1 12.9-7.3.6-1.4 1-2.7 1.4-4z" />
      <path d="M5.2 15.8c3.4-3 6.7-5.1 10.2-6.4" />
      <path d="M6.2 18.8c1.1-1.3 2-2.3 3.1-3.1" />
    </>
  ),
  seed: (
    <>
      <path d="M12 20c4-2.2 6-5.4 6-9.5C18 6.4 15.5 3.7 12 2c-3.5 1.7-6 4.4-6 8.5C6 14.6 8 17.8 12 20z" />
      <path d="M12 20V8" />
      <path d="M9.2 11.8c1.1.4 2 .5 2.8.2" />
      <path d="M14.8 8.5c-1.1.2-2 .7-2.8 1.5" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20V9" />
      <path d="M12 10.5C9.4 7.6 6.4 6.3 3.4 6.7c.4 3.7 3 6 8.6 6.1" />
      <path d="M12 9.4c2.1-3.3 5-4.9 8.5-4.8-.2 4.1-2.8 6.8-8.5 7.6" />
      <path d="M5 20h14" />
    </>
  ),
  dog: (
    <>
      <path d="M6.5 10.5l-1.8-2.6A1.4 1.4 0 0 1 6 5.7h1.8L9.7 8" />
      <path d="M17.5 10.5l1.8-2.6A1.4 1.4 0 0 0 18 5.7h-1.8L14.3 8" />
      <path d="M7 10h10a2 2 0 0 1 2 2v3.2A3.8 3.8 0 0 1 15.2 19H8.8A3.8 3.8 0 0 1 5 15.2V12a2 2 0 0 1 2-2z" />
      <circle cx="9.5" cy="13.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13.5" r=".8" fill="currentColor" stroke="none" />
      <path d="M11 16c.6.5 1.4.5 2 0" />
    </>
  ),
  bed: (
    <>
      <path d="M4 12.5h16v5H4z" />
      <path d="M4 9.5h7a2.5 2.5 0 0 1 2.5 2.5v.5H4z" />
      <path d="M15 9.5h3a2 2 0 0 1 2 2v1H13.5V12a2.5 2.5 0 0 1 1.5-2.5z" />
      <path d="M5 17.5v2" />
      <path d="M19 17.5v2" />
    </>
  ),
  dish: (
    <>
      <path d="M5 4v5a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V4" />
      <path d="M8 4v8" />
      <path d="M14 4v7a2 2 0 0 0 2 2h1v7" />
    </>
  ),
  laundry: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2.4" />
      <circle cx="12" cy="13" r="3.6" />
      <path d="M8.5 7.5h.01" />
      <path d="M11 7.5h.01" />
      <path d="M13.5 7.5h2" />
    </>
  ),
  room: (
    <>
      <path d="M4 10.2L12 4l8 6.2" />
      <path d="M6.5 9.5V20h11V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
};
