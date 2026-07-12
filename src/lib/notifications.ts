export type LocalNotification = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const queuedNotifications: LocalNotification[] = [];

export async function queueLocalNotification(notification: LocalNotification): Promise<void> {
  queuedNotifications.push(notification);
}

export function getQueuedNotifications(): LocalNotification[] {
  return [...queuedNotifications];
}
