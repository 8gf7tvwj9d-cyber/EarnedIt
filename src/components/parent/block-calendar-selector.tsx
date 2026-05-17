"use client";

import { useMemo, useState } from "react";
import { addDays, addMonths, getDayDiff, getTodayKey, parseIsoDate } from "@/components/parent/parent-date-utils";
import { formatDate } from "@/lib/format";
import { ChoreDraft } from "@/types/app";

export function BlockCalendarSelector({
  cycleType,
  selectedOffsets,
  startDate,
  onApplyDates,
  onClear,
}: {
  cycleType: ChoreDraft["rrcSchedule"]["cycleType"];
  selectedOffsets: number[];
  startDate: string;
  onApplyDates: (startDate: string, offsets: number[]) => void;
  onClear: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(startDate);
  const [draftOffsets, setDraftOffsets] = useState<number[]>(selectedOffsets);
  const [visibleMonth, setVisibleMonth] = useState(() => `${(startDate || getTodayKey()).slice(0, 7)}-01`);

  const savedDates = useMemo(
    () => (startDate ? selectedOffsets.map((offset) => addDays(startDate, offset)) : []),
    [selectedOffsets, startDate],
  );
  const draftDates = useMemo(
    () => (draftStartDate ? draftOffsets.map((offset) => addDays(draftStartDate, offset)) : []),
    [draftOffsets, draftStartDate],
  );
  const draftSelectedDateSet = useMemo(() => new Set(draftDates), [draftDates]);
  const monthDate = parseIsoDate(visibleMonth);
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const leadingDays = Array.from({ length: firstDay.getDay() }, () => null);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, index) =>
    getTodayKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1)),
  );
  const blockEndDate = draftStartDate ? getBlockEndDate(draftStartDate, cycleType) : null;
  const fieldCopy =
    savedDates.length === 0
      ? "mm/dd/yyyy"
      : `${savedDates.length} day${savedDates.length === 1 ? "" : "s"} selected`;

  function openCalendar() {
    setDraftStartDate(startDate);
    setDraftOffsets([...selectedOffsets]);
    setVisibleMonth(`${(startDate || getTodayKey()).slice(0, 7)}-01`);
    setIsOpen(true);
  }

  function getAnchorDate(isoDate: string) {
    return cycleType === "one_month_block" ? `${isoDate.slice(0, 7)}-01` : isoDate;
  }

  function isEnabledDate(isoDate: string) {
    if (!draftStartDate) {
      return true;
    }

    if (cycleType === "one_month_block") {
      return isoDate.slice(0, 7) === draftStartDate.slice(0, 7);
    }

    return Boolean(blockEndDate && isoDate >= draftStartDate && isoDate <= blockEndDate);
  }

  function toggleDraftDate(isoDate: string) {
    if (!draftStartDate) {
      const nextStartDate = getAnchorDate(isoDate);
      setDraftStartDate(nextStartDate);
      setDraftOffsets([getDayDiff(nextStartDate, isoDate)]);
      setVisibleMonth(`${nextStartDate.slice(0, 7)}-01`);
      return;
    }

    if (!isEnabledDate(isoDate)) {
      return;
    }

    const offset = getDayDiff(draftStartDate, isoDate);
    setDraftOffsets((current) => {
      const next = current.includes(offset)
        ? current.filter((entry) => entry !== offset)
        : [...current, offset];
      return next.sort((left, right) => left - right);
    });
  }

  function handleClear() {
    setDraftStartDate("");
    setDraftOffsets([]);
    onClear();
    setIsOpen(false);
  }

  function handleSave() {
    if (!draftStartDate || draftOffsets.length === 0) {
      onClear();
      setIsOpen(false);
      return;
    }

    onApplyDates(draftStartDate, draftOffsets);
    setIsOpen(false);
  }

  return (
    <div className="rounded-[22px] border border-[#d7c5a3]/35 bg-[#fff8e7]/12 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mb-4">
        <p className="text-lg font-black text-[#fff7df]">Days available</p>
        <p className="mt-1 text-sm leading-6 text-[#d8cab1]">
          Pick all days that count in this block, then save them together.
        </p>
      </div>

      <button
        className="field-surface flex w-full items-center justify-between gap-4 rounded-[28px] border-[#d7c5a3]/60 bg-[#f6f1e7] px-5 py-5 text-left text-[#2f271f] shadow-[0_14px_28px_rgba(48,35,18,0.12)]"
        onClick={openCalendar}
        type="button"
      >
        <span className={`text-2xl font-medium ${savedDates.length === 0 ? "text-[#2f271f]" : "text-[#4b3d28]"}`}>
          {fieldCopy}
        </span>
        <CalendarGlyph />
      </button>

      {isOpen ? (
        <div className="mt-3 rounded-[24px] border border-[#d7c5a3]/45 bg-[#fff8e7] p-3 text-[#2f271f] shadow-[0_18px_38px_rgba(48,35,18,0.18)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button className="rounded-xl border border-[#d7c5a3] px-3 py-2 text-sm font-black" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} type="button">
              Prev
            </button>
            <p className="text-sm font-black uppercase tracking-[0.12em] text-[#5f4e31]">{monthLabel}</p>
            <button className="rounded-xl border border-[#d7c5a3] px-3 py-2 text-sm font-black" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} type="button">
              Next
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[0.68rem] font-black uppercase text-[#7a6b4f]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayLabel) => (
              <span key={dayLabel}>{dayLabel}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {leadingDays.map((_, index) => (
              <span key={`blank-${index}`} className="aspect-square rounded-xl opacity-0" />
            ))}
            {monthDays.map((isoDate) => {
              const selected = draftSelectedDateSet.has(isoDate);
              const enabled = isEnabledDate(isoDate);
              return (
                <button
                  key={isoDate}
                  className={`aspect-square rounded-xl text-sm font-black transition ${
                    selected
                      ? "bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] text-[#231d16]"
                      : enabled
                        ? "bg-white text-[#443722] hover:bg-[#f0e3c5]"
                        : "bg-[#ddd1b8] text-[#92846a] opacity-45"
                  }`}
                  disabled={!enabled}
                  onClick={() => toggleDraftDate(isoDate)}
                  type="button"
                >
                  {Number(isoDate.slice(-2))}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {draftDates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#b8a77f] px-3 py-2 text-sm font-bold text-[#6d5a2d]">
                No days selected yet.
              </p>
            ) : (
              draftDates.map((isoDate) => (
                <button
                  key={isoDate}
                  className="rounded-full bg-[#e6d49d] px-3 py-2 text-xs font-black text-[#2f271f]"
                  onClick={() => toggleDraftDate(isoDate)}
                  type="button"
                >
                  {formatDate(isoDate)}
                </button>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button className="action-button flex-1 rounded-2xl bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] px-4 py-3 font-black text-[#231d16]" onClick={handleSave} type="button">
              Save days
            </button>
            <button className="rounded-2xl border border-[#b8a77f] px-4 py-3 font-black text-[#4b3d28]" onClick={() => setIsOpen(false)} type="button">
              Cancel
            </button>
            <button className="rounded-2xl border border-rose-300 px-4 py-3 font-black text-rose-700" onClick={handleClear} type="button">
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getBlockEndDate(startDate: string, cycleType: ChoreDraft["rrcSchedule"]["cycleType"]) {
  if (cycleType === "one_month_block") {
    const monthStart = parseIsoDate(startDate);
    return getTodayKey(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
  }

  return addDays(startDate, 13);
}

function CalendarGlyph() {
  return (
    <svg aria-hidden="true" className="h-9 w-9 shrink-0 text-[#17140f]" viewBox="0 0 36 36" fill="none">
      <rect x="6" y="7" width="24" height="24" rx="5" stroke="currentColor" strokeWidth="2.5" />
      <path d="M6 14h24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="13" cy="20" r="1.7" fill="currentColor" />
      <circle cx="18" cy="20" r="1.7" fill="currentColor" />
      <circle cx="23" cy="20" r="1.7" fill="currentColor" />
      <circle cx="13" cy="25" r="1.7" fill="currentColor" />
      <circle cx="18" cy="25" r="1.7" fill="currentColor" />
    </svg>
  );
}
