# Check-In Regression Checklist

Use this after any change to check-in, routine progress, optional chore resets, or payout logic.

## Required routine / streak checks

- Child submits a required daily chore with a photo.
- The child sees a loading state while the check-in saves.
- The child sees a success message only after the check-in record is persisted.
- The child counter updates immediately after save.
- Parent view shows the same updated counter for the same chore.
- Refreshing the page keeps the same counter in both views.
- The same required chore cannot be checked in twice on the same day.
- A duplicate same-day attempt shows `Already checked in today.`
- A required routine only becomes submittable for approval when all required days are complete.
- Rejected routine submissions do not count as approved earnings.

## Optional rolling chore checks

- An optional rolling chore can be completed once per reset period.
- Completing an optional rolling chore does not increase required routine progress.
- Optional rolling chores remain separate from required streak chores in both parent and child views.
- Optional rolling chores only add to earnings after parent approval.

## Earnings and payout checks

- Approved chores appear in earned totals in both views.
- Rejected chores do not count toward earnings.
- Marking a balance as paid moves approved chores into paid history.
- Paid history remains correct after refresh.

## Sync and persistence checks

- Child and parent views both read from the same saved check-in records.
- Refreshing the app does not lose saved check-ins.
- Console logging shows the flow:
  - Save Check-In clicked
  - photo upload success
  - check-in record created
  - counter recalculation after check-in
  - response returned to frontend
  - parent/child state refreshed
