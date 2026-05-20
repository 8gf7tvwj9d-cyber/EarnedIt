export function isEarnedItAuthTestModeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE?.trim().toLowerCase() === "true"
  );
}
