export function isEarnedDebugEnabled(channel?: string) {
  if (process.env.NEXT_PUBLIC_EARNEDIT_DEBUG_LOGS === "true") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.localStorage.getItem("earnedit-debug") === "true" ||
    Boolean(channel && window.localStorage.getItem(`earnedit-debug-${channel}`) === "true")
  );
}

export function debugLog(channel: string, message: string, details?: unknown) {
  if (!isEarnedDebugEnabled(channel)) {
    return;
  }

  if (details === undefined) {
    console.log(`[Earned] ${message}`);
    return;
  }

  console.log(`[Earned] ${message}`, details);
}
