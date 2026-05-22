export type BrowserNotificationStatus =
  | "unsupported"
  | "needs-secure-origin"
  | NotificationPermission;

export function getBrowserNotificationStatus(): BrowserNotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (!window.isSecureContext) {
    return "needs-secure-origin";
  }

  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  const status = getBrowserNotificationStatus();
  if (status === "unsupported" || status === "needs-secure-origin" || status === "granted") {
    return status;
  }

  return Notification.requestPermission();
}

export function sendBrowserNotification(title: string, body: string, tag: string) {
  if (getBrowserNotificationStatus() !== "granted") {
    return false;
  }

  new Notification(title, {
    body,
    tag,
  });
  return true;
}
