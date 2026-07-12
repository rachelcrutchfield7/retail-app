export type AnalyticsEvent = {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
  userId?: string;
  createdAt: string;
};

const analyticsEvents: AnalyticsEvent[] = [];
let identifiedUserId: string | undefined;

export function trackEvent(name: string, properties?: AnalyticsEvent['properties']): void {
  analyticsEvents.push({
    name,
    properties,
    userId: identifiedUserId,
    createdAt: new Date().toISOString(),
  });
}

export function getTrackedEvents(): AnalyticsEvent[] {
  return [...analyticsEvents];
}

export function identifyUser(userId: string, properties?: AnalyticsEvent['properties']): void {
  identifiedUserId = userId;
  trackEvent('User Identified', properties);
}

export function resetAnalyticsUser(): void {
  identifiedUserId = undefined;
}
