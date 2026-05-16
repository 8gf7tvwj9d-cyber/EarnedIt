"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/ui-icons";
import { formatCurrency, formatDate, formatShortDateTime } from "@/lib/format";
import { getProofEntries } from "@/lib/chore-helpers";
import { getTodayKey } from "@/lib/chore-progress";
import { CheckIn, Chore, Payout } from "@/types/app";

type PayoutCalendarModalProps = {
  checkIns: CheckIn[];
  chores: Chore[];
  payouts: Payout[];
  onClose: () => void;
};

type PayoutWithChores = {
  payout: Payout;
  chores: Chore[];
};

function getLocalDateKey(timestamp: string) {
  return getTodayKey(new Date(timestamp));
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildCalendarDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const leadingOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - leadingOffset);
  const days: Date[] = [];

  while (days.length < 42) {
    days.push(new Date(start));
    start.setDate(start.getDate() + 1);
  }

  return { days, firstDay, lastDay };
}

export function PayoutCalendarModal({
  checkIns,
  chores,
  payouts,
  onClose,
}: PayoutCalendarModalProps) {
  const payoutRecords = useMemo<PayoutWithChores[]>(() => {
    return payouts
      .map((payout) => ({
        payout,
        chores: chores.filter(
          (chore) =>
            chore.child_id === payout.child_id &&
            chore.status === "paid" &&
            chore.paid_at === payout.paid_at,
        ),
      }))
      .sort((left, right) => right.payout.paid_at.localeCompare(left.payout.paid_at));
  }, [chores, payouts]);

  const availableMonths = useMemo(() => {
    const monthKeys = Array.from(
      new Set(payoutRecords.map((record) => formatMonthKey(new Date(record.payout.paid_at)))),
    ).sort((left, right) => right.localeCompare(left));

    return monthKeys;
  }, [payoutRecords]);

  const [selectedMonth, setSelectedMonth] = useState(
    availableMonths[0] ?? formatMonthKey(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const recordsByDate = useMemo(() => {
    return payoutRecords.reduce<Record<string, PayoutWithChores[]>>((accumulator, record) => {
      const dateKey = getLocalDateKey(record.payout.paid_at);
      accumulator[dateKey] = [...(accumulator[dateKey] ?? []), record];
      return accumulator;
    }, {});
  }, [payoutRecords]);

  const selectedDateRecords = selectedDate ? recordsByDate[selectedDate] ?? [] : [];
  const { days, firstDay } = buildCalendarDays(selectedMonth);
  const activeMonth = formatMonthKey(firstDay);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="section-shell max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[32px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <div className="kicker-row text-slate-500">
              <span className="kicker-icon"><AppIcon className="h-4 w-4" name="seed" /></span>
              Recorded payments only
            </div>
            <h3 className="mt-2 font-mono text-2xl font-black text-slate-900">Payment calendar</h3>
          </div>
          <button
            aria-label="Close payment calendar"
            className="rounded-full border-2 border-[#3f4f2e] bg-[#fff8e6] px-5 py-3 text-sm font-black text-[#2f271f] shadow-[0_10px_22px_rgba(48,35,18,0.16)] transition hover:bg-[#f1d790]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border-b border-slate-200 px-5 py-5 lg:border-b-0 lg:border-r lg:px-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <select
                className="field-surface rounded-full px-4 py-2 text-sm font-black text-slate-900"
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setSelectedDate(null);
                }}
                value={selectedMonth}
              >
                {availableMonths.length === 0 ? (
                  <option value={selectedMonth}>{formatDate(`${selectedMonth}-01`)}</option>
                ) : (
                  availableMonths.map((monthKey) => (
                    <option key={monthKey} value={monthKey}>
                      {formatDate(`${monthKey}-01`)}
                    </option>
                  ))
                )}
              </select>
              <span className="stat-chip stat-chip-soft">
                {payouts.length} payment{payouts.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mb-3 grid grid-cols-7 gap-2 text-center text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {days.map((day) => {
                const dateKey = getTodayKey(day);
                const dayRecords = recordsByDate[dateKey] ?? [];
                const dayTotal = dayRecords.reduce(
                  (sum, record) => sum + record.payout.amount_cents,
                  0,
                );
                const isCurrentMonth = formatMonthKey(day) === activeMonth;
                const isSelected = selectedDate === dateKey;

                return (
                  <button
                    key={dateKey}
                    className={`min-h-[98px] rounded-[20px] border p-2 text-left shadow-sm ${
                      isSelected
                        ? "border-[#d8aa3d] bg-[#fff8e6]"
                        : isCurrentMonth
                          ? "border-slate-200 bg-white"
                          : "border-slate-100 bg-slate-50 text-slate-400"
                    } ${dayRecords.length > 0 ? "ring-2 ring-emerald-200" : ""}`}
                    onClick={() => setSelectedDate(dateKey)}
                    type="button"
                  >
                    <div className="text-xs font-black text-slate-700">{day.getDate()}</div>
                    {dayRecords.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <div className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-900">
                          {formatCurrency(dayTotal)}
                        </div>
                        <p className="text-[11px] font-bold text-slate-600">
                          {dayRecords.length} payment{dayRecords.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-400">No payments</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[72vh] overflow-y-auto px-5 py-5 lg:px-6">
            {!selectedDate ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                Pick a payment date on the calendar to see the reward breakdown.
              </div>
            ) : selectedDateRecords.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                No payments were recorded on {formatDate(selectedDate)}.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="support-label">Selected payment date</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{formatDate(selectedDate)}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatCurrency(
                      selectedDateRecords.reduce(
                        (sum, record) => sum + record.payout.amount_cents,
                        0,
                      ),
                    )} total paid
                  </p>
                </div>

                {selectedDateRecords.map((record) => (
                  <article
                    key={record.payout.id}
                    className="card-spotlight rounded-[24px] border border-[#d9c075]/45 bg-gradient-to-br from-[#fff8e6] to-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="support-label">Payment recorded</p>
                        <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900">
                          {formatCurrency(record.payout.amount_cents)}
                        </p>
                        <p className="text-sm text-slate-600">
                          {formatShortDateTime(record.payout.paid_at)}
                        </p>
                      </div>
                      <span className="stat-chip stat-chip-soft">
                        {record.chores.length} chore{record.chores.length === 1 ? "" : "s"} paid
                      </span>
                    </div>

                    {record.payout.notes ? (
                      <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
                        {record.payout.notes}
                      </p>
                    ) : null}

                    <div className="mt-4 space-y-3">
                      {record.chores.length === 0 ? (
                        <div className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                          No chore breakdown was found for this payment.
                        </div>
                      ) : (
                        record.chores.map((chore) => {
                          const proofEntries = getProofEntries(chore, checkIns);
                          const latestProofDate =
                            proofEntries[proofEntries.length - 1]?.proof_date ?? null;

                          return (
                            <div
                              key={chore.id}
                              className="rounded-[20px] border border-slate-200 bg-white px-3 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-black text-slate-900">{chore.title}</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {latestProofDate
                                      ? `Completion / check-in date: ${formatDate(latestProofDate)}`
                                      : "Completion / check-in date unavailable"}
                                  </p>
                                  <p className="text-sm text-slate-600">
                                    {chore.approved_at
                                      ? `Approval date: ${formatShortDateTime(chore.approved_at)}`
                                      : "Approval date unavailable"}
                                  </p>
                                </div>
                                <span className="text-sm font-black text-slate-900">
                                  {formatCurrency(chore.amount_cents)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
