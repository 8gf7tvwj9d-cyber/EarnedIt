import type { ReactNode } from "react";
import { AppIcon } from "@/components/ui-icons";
import { weekdayOptions } from "@/lib/chore-helpers";
import { WeekdayKey } from "@/types/app";

export function SummaryCard({
  accent,
  icon,
  label,
  value,
  copy,
  onClick,
}: {
  accent: string;
  icon: "wallet" | "clock" | "trophy" | "seed" | "leaf" | "sprout";
  label: string;
  value: string;
  copy: string;
  onClick?: () => void;
}) {
  const className = `metric-card metric-card-premium glass-card rounded-[26px] bg-gradient-to-br ${accent} p-4 text-left`;
  const content = (
    <>
      <div className="kicker-row text-slate-600"><span className="kicker-icon"><AppIcon className="h-4 w-4" name={icon} /></span>{label}</div>
      <p className="metric-value mt-3 font-mono text-3xl font-black text-[#2c281f]">{value}</p>
      <p className="mt-1 max-w-52 text-sm leading-6 text-[#5f5747]">{copy}</p>
    </>
  );

  if (onClick) {
    return (
      <button className={`${className} action-button w-full`} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}

export function InputLabel({
  label,
  dark,
  children,
}: {
  label: string;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className={`text-[0.95rem] font-black ${dark ? "text-[#fff7df]" : "text-[#5f5747]"}`}>{label}</span>
      {children}
    </label>
  );
}

export function FormSection({
  children,
  helper,
  title,
  variant = "plain",
}: {
  children: ReactNode;
  helper?: string;
  title: string;
  variant?: "plain" | "accent" | "standout";
}) {
  const variantClass =
    variant === "accent"
      ? "border-[#caa44f]/45 bg-gradient-to-br from-[#3f4f2e]/78 via-[#314328]/70 to-[#493c25]/72"
      : variant === "standout"
        ? "border-[#87a46d]/45 bg-gradient-to-br from-[#28452f]/80 via-[#38552f]/74 to-[#5a4828]/70"
        : "border-[#d7c5a3]/24 bg-[#fff8e7]/9";

  return (
    <section className={`rounded-[26px] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.09)] ${variantClass}`}>
      <div className="mb-5">
        <h3 className="text-2xl font-black tracking-normal text-[#fff7df]">{title}</h3>
        {helper ? <p className="mt-1 text-sm leading-6 text-[#d8cab1]">{helper}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function ScheduleSummary({ copy }: { copy: string }) {
  return (
    <aside className="rounded-[24px] border border-[#d6b75e]/40 bg-gradient-to-br from-[#fff8e4] to-[#efe2c3] px-4 py-4 text-[#352a1a] shadow-[0_18px_34px_rgba(48,35,18,0.12)]">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6d5a2d]">Preview</p>
      <p className="mt-2 text-base font-bold leading-7">{copy}</p>
    </aside>
  );
}

export function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-sm text-slate-500">{copy}</div>;
}

export function RepeatWeekPicker({
  accent = "cool",
  days,
  label,
  onToggle,
}: {
  accent?: "cool" | "warm";
  days: WeekdayKey[];
  label: string;
  onToggle: (day: WeekdayKey) => void;
}) {
  return (
    <div className="rounded-[22px] border border-[#d7c5a3]/35 bg-[#fff8e7]/12 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <p className="mb-4 text-lg font-black text-[#fff7df]">{label}</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {weekdayOptions.map((day) => (
          <button key={day.key} className={`day-tile ${days.includes(day.key) ? accent === "cool" ? "day-tile-selected" : "day-tile-selected-warm" : ""}`} onClick={() => onToggle(day.key)} type="button">
            {day.short}
          </button>
        ))}
      </div>
    </div>
  );
}
