"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/ui-icons";
import { formatCurrency } from "@/lib/format";
import { formatCentsForDollarInput, parseMoneyToCents } from "@/lib/money";
import { ChildProfile, Chore, PaymentLineItem } from "@/types/app";

type DraftPayment = {
  isSelected: boolean;
  amount: string;
};

function getPaymentStatus(originalCents: number, paymentCents: number) {
  if (paymentCents === originalCents) {
    return "Paid in Full";
  }

  if (paymentCents < originalCents) {
    return "Partial Payment";
  }

  return "Bonus Payment";
}

export function PaymentReviewSheet({
  chores,
  childProfiles,
  notes,
  onClose,
  onConfirm,
  onNotesChange,
}: {
  chores: Chore[];
  childProfiles: ChildProfile[];
  notes: string;
  onClose: () => void;
  onConfirm: (childId: string, notes: string, paymentItems: PaymentLineItem[]) => void;
  onNotesChange: (value: string) => void;
}) {
  const [draftPayments, setDraftPayments] = useState<Record<string, DraftPayment>>(() =>
    Object.fromEntries(
      chores.map((chore) => [
        chore.id,
        {
          isSelected: true,
          amount: formatCentsForDollarInput(chore.amount_cents),
        },
      ]),
    ),
  );
  const primaryChildId = chores[0]?.child_id ?? childProfiles[0]?.id ?? "";

  const selectedItems = useMemo(() => {
    return chores
      .filter((chore) => draftPayments[chore.id]?.isSelected)
      .map((chore) => {
        const amountCents = parseMoneyToCents(draftPayments[chore.id]?.amount ?? "0");
        return {
          chore,
          amountCents,
          statusLabel: getPaymentStatus(chore.amount_cents, amountCents),
        };
      });
  }, [chores, draftPayments]);

  const selectedChildIds = Array.from(new Set(selectedItems.map((item) => item.chore.child_id)));
  const hasMixedChildren = selectedChildIds.length > 1;
  const totalCents = selectedItems.reduce((sum, item) => sum + item.amountCents, 0);

  function updatePayment(choreId: string, patch: Partial<DraftPayment>) {
    setDraftPayments((current) => ({
      ...current,
      [choreId]: {
        isSelected: current[choreId]?.isSelected ?? true,
        amount: current[choreId]?.amount ?? "0.00",
        ...patch,
      },
    }));
  }

  function confirmPayment() {
    if (!primaryChildId || selectedItems.length === 0 || hasMixedChildren) {
      return;
    }

    onConfirm(
      primaryChildId,
      notes,
      selectedItems.map((item) => ({
        choreId: item.chore.id,
        amountCents: item.amountCents,
        statusLabel: item.statusLabel,
      })),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1e1a13]/48 px-3 py-4 backdrop-blur-sm sm:items-center">
      <section className="payment-sheet w-full max-w-2xl overflow-hidden rounded-[30px] bg-[#fffaf0] shadow-[0_28px_80px_rgba(25,20,12,0.38)]">
        <div className="payment-sheet-header px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-kicker kicker-row">
                <span className="kicker-icon"><AppIcon className="h-4 w-4" name="wallet" /></span>
                Review payments
              </div>
              <h3 className="mt-3 font-mono text-2xl font-black">Approved chores ready to pay</h3>
            </div>
            <button className="hero-button-secondary rounded-full px-3 py-2 text-xs font-black" onClick={onClose} type="button">
              Close
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/12 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#d8cab1]">Selected</p>
              <p className="mt-1 text-xl font-black">{selectedItems.length}</p>
            </div>
            <div className="rounded-2xl bg-white/12 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#d8cab1]">Payment total</p>
              <p className="mt-1 text-xl font-black">{formatCurrency(totalCents)}</p>
            </div>
          </div>
          {hasMixedChildren ? (
            <p className="mt-3 rounded-2xl border border-[#ffd27d]/35 bg-[#fff8e7]/12 px-4 py-3 text-sm font-bold text-[#fff1c9]">
              Select approved chores for one child at a time.
            </p>
          ) : null}
        </div>

        <div className="max-h-[68vh] space-y-3 overflow-y-auto px-4 py-4">
          {chores.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
              No approved chores are waiting for payment.
            </div>
          ) : (
            chores.map((chore) => {
              const draft = draftPayments[chore.id] ?? {
                isSelected: true,
                amount: formatCentsForDollarInput(chore.amount_cents),
              };
              const paymentCents = parseMoneyToCents(draft.amount);
              const statusLabel = getPaymentStatus(chore.amount_cents, paymentCents);
              const childName = childProfiles.find((child) => child.id === chore.child_id)?.name ?? "Unknown";

              return (
                <article key={chore.id} className="rounded-[24px] border border-[#d9c075]/50 bg-white p-4 shadow-[0_14px_28px_rgba(48,35,18,0.08)]">
                  <div className="flex items-start gap-3">
                    <input
                      checked={draft.isSelected}
                      className="mt-1 h-5 w-5 accent-[#5f8f43]"
                      onChange={(event) => updatePayment(chore.id, { isSelected: event.target.checked })}
                      type="checkbox"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-black text-slate-950">{chore.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{childName}</p>
                        </div>
                        <span className="stat-chip stat-chip-soft">{statusLabel}</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-[#f8f0dc] px-3 py-3">
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6d5a2d]">Approved amount</p>
                          <p className="mt-1 text-lg font-black text-slate-950">{formatCurrency(chore.amount_cents)}</p>
                        </div>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#6d5a2d]">Payment amount</span>
                          <input
                            className="field-surface mt-1 w-full rounded-2xl px-4 py-3 text-base font-black text-slate-950"
                            inputMode="decimal"
                            onChange={(event) => updatePayment(chore.id, { amount: event.target.value })}
                            type="text"
                            value={draft.amount}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}

          <textarea
            className="field-surface min-h-24 w-full rounded-2xl px-4 py-3 text-sm text-slate-900"
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Optional payment note"
            value={notes}
          />
        </div>

        <div className="border-t border-[#ddca9b] bg-[#fff8e6] px-4 py-4">
          <button
            className="action-button w-full rounded-2xl bg-gradient-to-r from-[#5f8f43] to-[#d8aa3d] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/14 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={selectedItems.length === 0 || chores.length === 0 || hasMixedChildren}
            onClick={confirmPayment}
            type="button"
          >
            Confirm payment of {formatCurrency(totalCents)}
          </button>
        </div>
      </section>
    </div>
  );
}
