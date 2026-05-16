"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { BlockCalendarSelector } from "@/components/parent/block-calendar-selector";
import {
  FormSection,
  InputLabel,
  RepeatWeekPicker,
  ScheduleSummary,
} from "@/components/parent/parent-ui";
import { AppIcon } from "@/components/ui-icons";
import { ChoreDraft, ChildProfile, RepeatPattern, WeekdayKey } from "@/types/app";

type ChoreComposerProps = {
  childProfiles: ChildProfile[];
  composerRef: RefObject<HTMLDivElement | null>;
  draft: ChoreDraft;
  isComposerOpen: boolean;
  scheduleSummary: string;
  routineCalendarStart: string;
  routineRequiredOffsets: number[];
  onClearRoutineBlockCalendar: () => void;
  onResetDraft: () => void;
  onSetComposerOpen: (value: boolean) => void;
  onSetDraft: Dispatch<SetStateAction<ChoreDraft>>;
  onSetRepeatPattern: (pattern: RepeatPattern) => void;
  onSetRoutineBlockCalendarDate: (isoDate: string) => void;
  onSetRoutineCycleType: (cycleType: ChoreDraft["rrcSchedule"]["cycleType"]) => void;
  onSubmitDraft: () => void;
  onToggleRepeatDay: (day: WeekdayKey, week?: "a" | "b") => void;
  onToggleRoutineSimpleDay: (day: WeekdayKey) => void;
};

export function ChoreComposer({
  childProfiles,
  composerRef,
  draft,
  isComposerOpen,
  scheduleSummary,
  routineCalendarStart,
  routineRequiredOffsets,
  onClearRoutineBlockCalendar,
  onResetDraft,
  onSetComposerOpen,
  onSetDraft,
  onSetRepeatPattern,
  onSetRoutineBlockCalendarDate,
  onSetRoutineCycleType,
  onSubmitDraft,
  onToggleRepeatDay,
  onToggleRoutineSimpleDay,
}: ChoreComposerProps) {
  return (
    <div ref={composerRef} className="surface-tint rounded-[28px] p-4 scroll-mt-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="kicker-row text-slate-100">
          <span className="kicker-icon"><AppIcon className="h-4 w-4" name="spark" /></span>
          {draft.id ? "Edit chore" : "Create a chore"}
        </div>
        <button
          className="hero-button-secondary rounded-full px-3 py-2 text-sm font-black"
          onClick={() => {
            if (isComposerOpen && !draft.id) {
              onResetDraft();
              return;
            }

            if (draft.id) {
              onResetDraft();
              return;
            }

            onSetComposerOpen(true);
          }}
          type="button"
        >
          {draft.id ? "Close editor" : isComposerOpen ? "Hide form" : "Add chore"}
        </button>
      </div>

      {!isComposerOpen && !draft.id ? (
        <div className="rounded-[24px] border border-white/14 bg-white/8 px-4 py-5 text-sm text-slate-200">
          Tap <span className="font-black text-white">Add chore</span> when you want to create a new one.
        </div>
      ) : (
        <div className="space-y-6">
          <ComposerBasicsSection
            childProfiles={childProfiles}
            draft={draft}
            onSetDraft={onSetDraft}
          />

          <ComposerScheduleSection
            draft={draft}
            routineCalendarStart={routineCalendarStart}
            routineRequiredOffsets={routineRequiredOffsets}
            onClearRoutineBlockCalendar={onClearRoutineBlockCalendar}
            onSetDraft={onSetDraft}
            onSetRepeatPattern={onSetRepeatPattern}
            onSetRoutineBlockCalendarDate={onSetRoutineBlockCalendarDate}
            onSetRoutineCycleType={onSetRoutineCycleType}
          />

          <ComposerRequiredDaysSection
            draft={draft}
            onToggleRepeatDay={onToggleRepeatDay}
            onToggleRoutineSimpleDay={onToggleRoutineSimpleDay}
          />

          <ComposerRewardSettingsSection draft={draft} onSetDraft={onSetDraft} />

          <ScheduleSummary copy={scheduleSummary} />

          <button className="action-button w-full rounded-2xl bg-gradient-to-r from-[#78a85a] via-[#91b85f] to-[#d5a642] px-5 py-4 text-base font-black text-[#231d16] shadow-lg shadow-[#3d2b12]/18" onClick={onSubmitDraft} type="button">
            {draft.id ? "Save changes" : "Create chore"}
          </button>
        </div>
      )}
    </div>
  );
}

function ComposerBasicsSection({
  childProfiles,
  draft,
  onSetDraft,
}: {
  childProfiles: ChildProfile[];
  draft: ChoreDraft;
  onSetDraft: Dispatch<SetStateAction<ChoreDraft>>;
}) {
  return (
    <FormSection
      helper="Name the job, describe done, and set the reward."
      title="Basics"
      variant="plain"
    >
      <InputLabel dark label="Chore name">
        <input className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" placeholder="Feed the dogs" value={draft.title} onChange={(event) => onSetDraft((current) => ({ ...current, title: event.target.value }))} />
      </InputLabel>

      <InputLabel dark label="Description">
        <textarea className="field-surface min-h-24 w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" placeholder="Quick note about what done looks like" value={draft.description} onChange={(event) => onSetDraft((current) => ({ ...current, description: event.target.value }))} />
      </InputLabel>

      <div className="grid gap-3 sm:grid-cols-2">
        {draft.choreKind !== "routine" ? (
          <InputLabel dark label="Reward amount">
            <input className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" min="0" placeholder="10.00" step="0.01" type="number" value={draft.amount} onChange={(event) => onSetDraft((current) => ({ ...current, amount: event.target.value }))} />
          </InputLabel>
        ) : null}
        <InputLabel dark label="Assigned child">
          <select className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" value={draft.childId} onChange={(event) => onSetDraft((current) => ({ ...current, childId: event.target.value }))}>
            {childProfiles.map((child) => (
              <option key={child.id} value={child.id}>{child.name}</option>
            ))}
          </select>
        </InputLabel>
      </div>

      {draft.choreKind === "routine" ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <InputLabel dark label="Available from">
            <input className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" type="date" value={draft.startDate} onChange={(event) => onSetDraft((current) => ({ ...current, startDate: event.target.value }))} />
          </InputLabel>
          <InputLabel dark label="Due date">
            <input className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" type="date" value={draft.dueDate} onChange={(event) => onSetDraft((current) => ({ ...current, dueDate: event.target.value }))} />
          </InputLabel>
        </div>
      )}
    </FormSection>
  );
}

function ComposerScheduleSection({
  draft,
  routineCalendarStart,
  routineRequiredOffsets,
  onClearRoutineBlockCalendar,
  onSetDraft,
  onSetRepeatPattern,
  onSetRoutineBlockCalendarDate,
  onSetRoutineCycleType,
}: {
  draft: ChoreDraft;
  routineCalendarStart: string;
  routineRequiredOffsets: number[];
  onClearRoutineBlockCalendar: () => void;
  onSetDraft: Dispatch<SetStateAction<ChoreDraft>>;
  onSetRepeatPattern: (pattern: RepeatPattern) => void;
  onSetRoutineBlockCalendarDate: (isoDate: string) => void;
  onSetRoutineCycleType: (cycleType: ChoreDraft["rrcSchedule"]["cycleType"]) => void;
}) {
  return (
    <FormSection
      helper="Choose the chore rhythm. Longer blocks use exact calendar-day picks."
      title="Schedule"
      variant="accent"
    >
      <div>
        <p className="mb-3 text-base font-black text-[#f8f1df]">Chore type</p>
        <div className="grid gap-3">
          <button
            className={`setup-choice ${draft.choreKind === "one_time" ? "setup-choice-selected" : ""}`}
            onClick={() => onSetDraft((current) => ({ ...current, choreKind: "one_time", recurring: false }))}
            type="button"
          >
            One-time chore
          </button>
          <button
            className={`setup-choice ${draft.choreKind === "optional" ? "setup-choice-selected" : ""}`}
            onClick={() => onSetDraft((current) => ({ ...current, choreKind: "optional", recurring: true }))}
            type="button"
          >
            Optional rolling chore
          </button>
          <button
            className={`setup-choice ${draft.choreKind === "routine" ? "setup-choice-selected" : ""}`}
            onClick={() => onSetDraft((current) => ({ ...current, choreKind: "routine", recurring: true }))}
            type="button"
          >
            Required routine / streak chore
          </button>
        </div>
      </div>

      {draft.choreKind === "optional" ? (
        <div className="rounded-2xl border border-[#d5b873]/35 bg-[#fff8e7]/10 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-base font-black text-[#fff7df]">Availability</p>
              <p className="mt-1 text-sm leading-6 text-[#d8cab1]">Choose whether this rolls on a weekly rhythm.</p>
            </div>
            <input checked={draft.recurring} className="h-6 w-6 accent-[#4f7f3a]" type="checkbox" onChange={(event) => onSetDraft((current) => ({ ...current, recurring: event.target.checked }))} />
          </div>
          {draft.recurring ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={`setup-chip ${draft.repeatPattern === "weekly" ? "setup-chip-selected" : ""}`} onClick={() => onSetRepeatPattern("weekly")} type="button">
                Same every week
              </button>
              <button className={`setup-chip ${draft.repeatPattern === "biweekly" ? "setup-chip-selected" : ""}`} onClick={() => onSetRepeatPattern("biweekly")} type="button">
                Alternate every 2 weeks
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {draft.choreKind === "routine" ? (
        <>
          <InputLabel dark label="Block type">
            <select
              className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]"
              value={draft.rrcSchedule.cycleType}
              onChange={(event) =>
                onSetRoutineCycleType(
                  event.target.value as ChoreDraft["rrcSchedule"]["cycleType"],
                )
              }
            >
              <option value="weekly">Weekly</option>
              <option value="two_week_custody_block">Two Week Block</option>
              <option value="one_month_block">One Month Block</option>
            </select>
          </InputLabel>

          {draft.rrcSchedule.cycleType === "weekly" ? (
            <div className="rounded-2xl border border-[#d5b873]/35 bg-[#fff8e7]/10 px-4 py-4">
              <p className="text-base font-black text-[#fff7df]">Week starts on Sunday</p>
              <p className="mt-1 text-sm leading-6 text-[#d8cab1]">
                Weekly required chores reset on the next Sunday if a required day is missed.
              </p>
            </div>
          ) : (
            <>
              <BlockCalendarSelector
                cycleType={draft.rrcSchedule.cycleType}
                selectedOffsets={routineRequiredOffsets}
                startDate={routineCalendarStart}
                onClear={onClearRoutineBlockCalendar}
                onSelectDate={onSetRoutineBlockCalendarDate}
              />

              <div className="rounded-2xl border border-[#d5b873]/35 bg-[#fff8e7]/10 px-4 py-4">
                <p className="text-base font-black text-[#fff7df]">Restart rule</p>
                <p className="mt-1 text-sm leading-6 text-[#d8cab1]">
                  If the streak breaks, it restarts only at the next cycle start.
                </p>
              </div>
            </>
          )}
        </>
      ) : null}
    </FormSection>
  );
}

function ComposerRequiredDaysSection({
  draft,
  onToggleRepeatDay,
  onToggleRoutineSimpleDay,
}: {
  draft: ChoreDraft;
  onToggleRepeatDay: (day: WeekdayKey, week?: "a" | "b") => void;
  onToggleRoutineSimpleDay: (day: WeekdayKey) => void;
}) {
  if (
    !(
      (draft.choreKind === "optional" && draft.recurring) ||
      (draft.choreKind === "routine" && draft.rrcSchedule.cycleType === "weekly")
    )
  ) {
    return null;
  }

  return (
    <FormSection
      helper={
        draft.choreKind === "routine" && draft.rrcSchedule.cycleType !== "weekly"
          ? "Pick the exact calendar dates inside the block that count."
          : "Pick the days that count. Selected days use the green growth state."
      }
      title={
        draft.choreKind === "routine" && draft.rrcSchedule.cycleType !== "weekly"
          ? "Required Dates"
          : "Required Days"
      }
      variant="standout"
    >
      {draft.choreKind === "optional" ? (
        <>
          <RepeatWeekPicker days={draft.repeatDaysWeekA} label={draft.repeatPattern === "biweekly" ? "Week A" : "Weekly schedule"} onToggle={(day) => onToggleRepeatDay(day, "a")} />

          {draft.repeatPattern === "biweekly" ? (
            <RepeatWeekPicker accent="warm" days={draft.repeatDaysWeekB} label="Week B" onToggle={(day) => onToggleRepeatDay(day, "b")} />
          ) : null}
        </>
      ) : (
        <RepeatWeekPicker
          days={draft.rrcSchedule.requiredDays}
          label="Required days"
          onToggle={onToggleRoutineSimpleDay}
        />
      )}
    </FormSection>
  );
}

function ComposerRewardSettingsSection({
  draft,
  onSetDraft,
}: {
  draft: ChoreDraft;
  onSetDraft: Dispatch<SetStateAction<ChoreDraft>>;
}) {
  if (draft.choreKind !== "optional") {
    return null;
  }

  return (
    <FormSection
      helper="Control how often this can earn."
      title="Reward Settings"
      variant="plain"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <InputLabel dark label="Reset frequency">
          <select className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" value={draft.resetFrequency} onChange={(event) => onSetDraft((current) => ({ ...current, resetFrequency: event.target.value as ChoreDraft["resetFrequency"] }))}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </InputLabel>
        <InputLabel dark label="Max completions per reset">
          <input className="field-surface w-full rounded-2xl px-4 py-4 text-base text-[#2f271f]" min="1" type="number" value={draft.maxCompletionsPerReset} onChange={(event) => onSetDraft((current) => ({ ...current, maxCompletionsPerReset: Number(event.target.value) || 1 }))} />
        </InputLabel>
        <label className="rounded-2xl border border-[#d5b873]/30 bg-[#fff8e7]/10 px-4 py-4 text-sm font-bold text-white sm:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <span>Parent manually makes it available</span>
            <input checked={draft.manualAvailability} className="h-6 w-6 accent-[#4f7f3a]" type="checkbox" onChange={(event) => onSetDraft((current) => ({ ...current, manualAvailability: event.target.checked }))} />
          </div>
        </label>
      </div>
    </FormSection>
  );
}
