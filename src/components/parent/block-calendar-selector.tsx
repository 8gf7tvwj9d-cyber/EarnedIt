"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { ChoreDraft } from "@/types/app";
import { addDays, addMonths, getTodayKey, parseIsoDate } from "@/components/parent/parent-date-utils";

export function BlockCalendarSelector({
  cycleType,
  selectedOffsets,
  startDate,
  onClear,
  onSelectDate,
}: {
  cycleType: ChoreDraft["rrcSchedule"]["cycleType"];
  selectedOffsets: number[];
  startDate: string;
  onClear: () => void;
  onSelectDate: (isoDate: string) => void;
}) {
  const initialMonth =
    cycleType === "one_month_block" && startDate ? startDate : startDate || getTodayKey();
  const [visibleMonth, setVisibleMonth] = useState(() => `${initialMonth.slice(0, 7)}-01`);
  const monthDate = parseIsoDate(visibleMonth);
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leadingDays = Array.from({ length: startOffset }, () => null);
  const monthDays = Array.from({ length: daysInMonth }, (_, index) =>
    getTodayKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1)),
  );
  const blockEndDate =
    cycleType === "weekly" || !startDate
      ? null
      : cycleType === "one_month_block"
        ? getTodayKey(new Date(parseIsoDate(startDate).getFullYear(), parseIsoDate(startDate).getMonth() + 1, 0))
        : addDays(startDate, 13);
  const selectedDates = new Set(
    startDate ? selectedOffsets.map((offset) => addDays(startDate, offset)) : [],
  );

  function isEnabledDate(isoDate: string) {
    if (!startDate) {
      return true;
    }

    if (cycleType === "one_month_block") {
      return isoDate.slice(0, 7) === startDate.slice(0, 7);
    }

    if (!blockEndDate) {
      return false;
    }

    return isoDate >= startDate && isoDate <= blockEndDate;
  }

  return (
    <div className="rounded-[22px] border border-[#d7c5a3]/35 bg-[#fff8e7]/12 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-[#fff7df]">
            {cycleType === "one_month_block" ? "Required dates in this month" : "Required dates in this two week block"}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#d8cab1]">
            {startDate
              ? cycleType === "one_month_block"
                ? `First selected date locked this block to ${formatDate(startDate)} through ${blockEndDate ? formatDate(blockEndDate) : ""}.`
                : `First selected date anchored this block to ${formatDate(startDate)} through ${blockEndDate ? formatDate(blockEndDate) : ""}.`
              : "Tap the first date to anchor the block, then pick the other dates that should count."}
          </p>
        </div>
        {startDate ? (
          <button
            className="hero-button-secondary rounded-full px-3 py-2 text-xs font-black"
            onClick={onClear}
            type="button"
          >
            Start over
          </button>
        ) : null}
      </div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          className="hero-button-secondary rounded-full px-3 py-2 text-xs font-black"
          onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
          type="button"
        >
          Prev
        </button>
        <p className="text-sm font-black uppercase tracking-[0.16em] text-[#fff7df]">{monthLabel}</p>
        <button
          className="hero-button-secondary rounded-full px-3 py-2 text-xs font-black"
          onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
          type="button"
        >
          Next
        </button>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-black uppercase tracking-[0.14em] text-[#d8cab1]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayLabel) => (
          <span key={dayLabel}>{dayLabel}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {leadingDays.map((_, index) => (
          <span key={`blank-${index}`} className="h-12 rounded-2xl opacity-0" />
        ))}
        {monthDays.map((isoDate) => {
          const selected = selectedDates.has(isoDate);
          const enabled = isEnabledDate(isoDate);
          const firstSelected = startDate && isoDate === startDate;
          return (
            <button
              key={isoDate}
              className={`rounded-2xl px-2 py-3 text-sm font-black transition ${
                selected
                  ? firstSelected
                    ? "bg-gradient-to-r from-[#d2ab46] to-[#fff0b3] text-[#231d16]"
                    : "bg-gradient-to-r from-[#7aad55] to-[#d2ab46] text-[#231d16]"
                  : enabled
                    ? "bg-white/90 text-[#443722] hover:bg-[#f2e3b9]"
                    : "bg-white/30 text-[#8a806d] opacity-45"
              }`}
              disabled={!enabled}
              onClick={() => onSelectDate(isoDate)}
              type="button"
            >
              {isoDate.slice(-2)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
