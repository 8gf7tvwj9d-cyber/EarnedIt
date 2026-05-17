const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

function clampCents(cents: number) {
  if (!Number.isFinite(cents)) {
    return 0;
  }

  return Math.min(MAX_SAFE_CENTS, Math.max(0, Math.round(cents)));
}

function expandExponential(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 20,
    useGrouping: false,
  });
}

export function parseMoneyToCents(value: string | number | null | undefined) {
  const rawValue =
    typeof value === "number" ? expandExponential(value) : String(value ?? "");
  const normalized = rawValue.trim().replace(/[$,\s]/g, "");
  const match = normalized.match(/^([+-])?(\d*)(?:\.(\d*))?$/);

  if (!match || match[1] === "-" || (!match[2] && !match[3])) {
    return 0;
  }

  const dollars = match[2] ? Number.parseInt(match[2], 10) : 0;
  const decimal = match[3] ?? "";
  const centDigits = decimal.slice(0, 2).padEnd(2, "0");
  const cents = Number.parseInt(centDigits, 10) || 0;
  const shouldRoundUp = Number.parseInt(decimal[2] ?? "0", 10) >= 5;

  return clampCents(dollars * 100 + cents + (shouldRoundUp ? 1 : 0));
}

export function normalizeCents(value: unknown, fallbackDollars?: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampCents(value);
  }

  if (typeof value === "string" && value.trim()) {
    const cents = Number(value);
    if (Number.isFinite(cents)) {
      return clampCents(cents);
    }
  }

  if (fallbackDollars !== undefined) {
    return parseMoneyToCents(fallbackDollars as string | number | null | undefined);
  }

  return 0;
}

export function formatCentsForDollarInput(amountCents: number) {
  return (normalizeCents(amountCents) / 100).toFixed(2);
}
