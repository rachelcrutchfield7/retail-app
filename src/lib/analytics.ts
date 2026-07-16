export type AnalyticsEvent = {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
  userId?: string;
  createdAt: string;
};

const analyticsEvents: AnalyticsEvent[] = [];
let identifiedUserId: string | undefined;
const sensitiveAnalyticsKeyPattern = /(address|body|comment|credential|detail|email|latitude|longitude|message|password|phone|secret|token)/i;

function sanitizeProperties(properties?: AnalyticsEvent['properties']): AnalyticsEvent['properties'] {
  if (!properties) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      sensitiveAnalyticsKeyPattern.test(key) ? '[redacted]' : value,
    ])
  ) as AnalyticsEvent['properties'];
}

export function trackEvent(name: string, properties?: AnalyticsEvent['properties']): void {
  analyticsEvents.push({
    name,
    properties: sanitizeProperties(properties),
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
