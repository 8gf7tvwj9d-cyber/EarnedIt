import { ChoreStatus } from "@/types/app";

const statusStyles: Record<ChoreStatus, string> = {
  available: "bg-white/88 text-[#5f5747] ring-[#d8c8a9] shadow-[0_12px_24px_rgba(48,35,18,0.06)]",
  submitted: "bg-amber-100/98 text-amber-900 ring-amber-300 shadow-[0_12px_24px_rgba(250,180,45,0.16)]",
  approved: "bg-[#dff1ce]/98 text-[#285d20] ring-[#84ad57] shadow-[0_12px_24px_rgba(95,143,67,0.18)]",
  rejected: "bg-rose-50/96 text-rose-800 ring-rose-200 shadow-[0_12px_24px_rgba(227,85,111,0.12)]",
  paid: "bg-[#fff8e6]/96 text-[#6b522c] ring-[#d9c075] shadow-[0_12px_24px_rgba(48,35,18,0.12)]",
  expired: "bg-[#efe3d1]/96 text-[#7a4d2f] ring-[#c9aa7a] shadow-[0_12px_24px_rgba(126,91,42,0.12)]",
};

const customStatusStyles = {
  active: "bg-[#edf6df]/96 text-[#3f6f2f] ring-[#a7c279] shadow-[0_12px_24px_rgba(95,143,67,0.14)]",
  done_today: "bg-[#dff1ce]/98 text-[#285d20] ring-[#84ad57] shadow-[0_12px_24px_rgba(95,143,67,0.18)]",
  unavailable: "bg-slate-100/96 text-slate-600 ring-slate-300 shadow-[0_12px_24px_rgba(15,23,42,0.08)]",
  missed: "bg-amber-100/98 text-amber-950 ring-amber-300 shadow-[0_12px_24px_rgba(250,180,45,0.16)]",
  broken: "bg-rose-100/96 text-rose-900 ring-rose-300 shadow-[0_12px_24px_rgba(227,85,111,0.16)]",
} as const;

const dots: Record<ChoreStatus, string> = {
  available: "#22c55e",
  submitted: "#f59e0b",
  approved: "#10b981",
  rejected: "#f43f5e",
  paid: "#d8aa3d",
  expired: "#7a4d2f",
};

const customDots = {
  active: "#22c55e",
  done_today: "#10b981",
  unavailable: "#94a3b8",
  missed: "#f59e0b",
  broken: "#dc2626",
} as const;

export function StatusBadge({
  status,
  label,
  tone,
}: {
  status: ChoreStatus;
  label?: string;
  tone?: keyof typeof customStatusStyles;
}) {
  const resolvedTone = tone ? customStatusStyles[tone] : statusStyles[status];
  const resolvedDot = tone ? customDots[tone] : dots[status];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.2em] ring-1 backdrop-blur-sm ${resolvedTone}`}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.22)]"
        style={{ backgroundColor: resolvedDot }}
      />
      {label ?? status}
    </span>
  );
}
