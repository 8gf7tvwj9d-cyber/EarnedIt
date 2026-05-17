"use client";

import { useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { ChoreDraft } from "@/types/app";
import { addDays, getTodayKey, parseIsoDate } from "@/components/parent/parent-date-utils";

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
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDate, setPendingDate] = useState("");
  const blockEndDate =
    cycleType === "weekly" || !startDate
      ? null
      : cycleType === "one_month_block"
        ? getTodayKey(new Date(parseIsoDate(startDate).getFullYear(), parseIsoDate(startDate).getMonth() + 1, 0))
        : addDays(startDate, 13);
  const selectedDates = useMemo(
    () => (startDate ? selectedOffsets.map((offset) => addDays(startDate, offset)) : []),
    [selectedOffsets, startDate],
  );
  const minDate = startDate || undefined;
  const maxDate = blockEndDate || undefined;

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

  function openPicker() {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.focus();
  }

  function handleDateChange(isoDate: string) {
    setPendingDate("");
    if (!isoDate || !isEnabledDate(isoDate)) {
      return;
    }

    onSelectDate(isoDate);
  }

  return (
    <div className="rounded-[22px] border border-[#d7c5a3]/35 bg-[#fff8e7]/12 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-[#fff7df]">
            {cycleType === "one_month_block" ? "Required dates in this month" : "Required dates in this two week block"}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#d8cab1]">
            {startDate
              ? cycleType === "one_month_block"
                ? `First selected date locked this block to ${formatDate(startDate)} through ${blockEndDate ? formatDate(blockEndDate) : ""}.`
                : `First selected date anchored this block to ${formatDate(startDate)} through ${blockEndDate ? formatDate(blockEndDate) : ""}.`
              : "Pick the first required date to anchor the block, then add any other dates that should count."}
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

      <div className="space-y-2">
        <input
          ref={dateInputRef}
          aria-label={startDate ? "Add required block date" : "Pick first required block date"}
          className="sr-only"
          max={maxDate}
          min={minDate}
          tabIndex={-1}
          type="date"
          value={pendingDate}
          onChange={(event) => handleDateChange(event.target.value)}
        />
        <button
          className="action-button w-full rounded-2xl bg-gradient-to-r from-[#6f9a52] to-[#d4ad4f] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/14"
          onClick={openPicker}
          type="button"
        >
          {startDate ? "Add required block day" : "Pick required block day"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {selectedDates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#d7c5a3]/35 px-3 py-3 text-sm font-bold text-[#d8cab1]">
            No required block dates selected yet.
          </p>
        ) : (
          selectedDates.map((isoDate) => (
            <button
              key={isoDate}
              className={`rounded-full px-3 py-2 text-xs font-black ${
                isoDate === startDate
                  ? "bg-gradient-to-r from-[#d2ab46] to-[#fff0b3] text-[#231d16]"
                  : "bg-gradient-to-r from-[#7aad55] to-[#d2ab46] text-[#231d16]"
              }`}
              onClick={() => onSelectDate(isoDate)}
              type="button"
            >
              {formatDate(isoDate)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
