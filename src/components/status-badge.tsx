import { ChoreStatus } from "@/lib/chorepay-types";

const statusStyles: Record<ChoreStatus, string> = {
  available: "bg-slate-100/90 text-slate-700 ring-slate-200",
  submitted: "bg-amber-100/90 text-amber-800 ring-amber-200",
  approved: "bg-emerald-100/90 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-100/90 text-rose-800 ring-rose-200",
  paid: "bg-sky-100/90 text-sky-800 ring-sky-200",
  expired: "bg-violet-100/90 text-violet-800 ring-violet-200",
};

const dots: Record<ChoreStatus, string> = {
  available: "bg-slate-500",
  submitted: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
  paid: "bg-sky-500",
  expired: "bg-violet-500",
};

export function StatusBadge({ status }: { status: ChoreStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.22em] ring-1 ${statusStyles[status]}`}
    >
      <span className={`h-2 w-2 rounded-full ${dots[status]}`} />
      {status}
    </span>
  );
}
