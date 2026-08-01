import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createSupabaseAdmin, requireAuthenticatedRequest } from '../_shared/supabase.ts';

type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
};

type NotificationType =
  | 'message'
  | 'favorite'
  | 'review'
  | 'transaction_completed'
  | 'listing_sold'
  | 'listing_donated'
  | 'saved_search'
  | 'system';

type NotificationPreferencesRow = {
  email_messages?: boolean | null;
  email_favorites?: boolean | null;
  email_reviews?: boolean | null;
  email_marketplace_updates?: boolean | null;
  email_system?: boolean | null;
};

const resendEndpoint = 'https://api.resend.com/emails';

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const notificationId = notificationIdFromPayload(payload);

    if (!notificationId) {
      return jsonResponse({ error: 'Missing notification id.' }, 400);
    }

    const webhookTrusted = isTrustedWebhook(request);
    const authContext = webhookTrusted ? null : await requireAuthenticatedRequest(request);
    const supabaseAdmin = authContext?.supabaseAdmin ?? createSupabaseAdmin();

    const notification = await loadNotification(supabaseAdmin, notificationId);

    if (!webhookTrusted && !canRequestNotificationEmail(notification, authContext?.user.id)) {
      return jsonResponse({ error: 'You cannot send this notification email.' }, 403);
    }

    const recipient = await loadRecipient(supabaseAdmin, notification.user_id);

    if (!recipient.email) {
      await markEmailSkipped(supabaseAdmin, notification, 'Recipient account has no email address.');
      return jsonResponse({ ok: true, skipped: true, reason: 'missing_email' });
    }

    const deliveryCreated = await reserveDelivery(supabaseAdmin, notification, recipient.email);

    if (!deliveryCreated) {
      return jsonResponse({ ok: true, skipped: true, reason: 'already_queued_or_sent' });
    }

    const preferences = await loadPreferences(supabaseAdmin, notification.user_id);

    if (!emailEnabled(preferences, notification.type)) {
      await updateDelivery(supabaseAdmin, notification.id, {
        status: 'skipped',
        error: 'Recipient disabled this email type.',
      });
      return jsonResponse({ ok: true, skipped: true, reason: 'preferences_disabled' });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      await updateDelivery(supabaseAdmin, notification.id, {
        status: 'failed',
        error: 'Missing RESEND_API_KEY Supabase secret.',
      });
      return jsonResponse({ error: 'Email provider is not configured.' }, 500);
    }

    const message = buildEmail(notification, recipient.displayName);
    const response = await fetch(resendEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RETAIL_EMAIL_FROM') ?? 'ReTail <notifications@retailpetapp.com>',
        to: recipient.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const resendResult = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      const error = typeof resendResult.message === 'string' ? resendResult.message : 'Resend rejected the email.';
      await updateDelivery(supabaseAdmin, notification.id, { status: 'failed', error });
      return jsonResponse({ error }, 502);
    }

    await updateDelivery(supabaseAdmin, notification.id, {
      status: 'sent',
      resend_id: typeof resendResult.id === 'string' ? resendResult.id : null,
      sent_at: new Date().toISOString(),
      error: null,
    });

    return jsonResponse({ ok: true, resendId: resendResult.id ?? null });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Notification email failed.' }, status);
  }
});

function notificationIdFromPayload(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.notificationId === 'string') {
    return payload.notificationId;
  }

  const record = payload.record;

  if (record && typeof record === 'object' && typeof (record as { id?: unknown }).id === 'string') {
    return (record as { id: string }).id;
  }

  return undefined;
}

function isTrustedWebhook(request: Request): boolean {
  const expectedSecret = Deno.env.get('RETAIL_NOTIFICATION_WEBHOOK_SECRET');
  const providedSecret = request.headers.get('x-retail-notification-secret');

  return Boolean(expectedSecret && providedSecret && timingSafeEqual(expectedSecret, providedSecret));
}

function timingSafeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < first.length; index += 1) {
    diff |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }

  return diff === 0;
}

async function loadNotification(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, notificationId: string): Promise<NotificationRow> {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id,user_id,type,title,body,data,created_at')
    .eq('id', notificationId)
    .single();

  if (error || !data) {
    throw Object.assign(new Error('Notification not found.'), { status: 404 });
  }

  return {
    id: String(data.id),
    user_id: String(data.user_id),
    type: String(data.type) as NotificationType,
    title: String(data.title),
    body: String(data.body),
    data: typeof data.data === 'object' && data.data !== null ? data.data as Record<string, unknown> : {},
    created_at: String(data.created_at),
  };
}

function canRequestNotificationEmail(notification: NotificationRow, requesterId: string | undefined): boolean {
  if (!requesterId) {
    return false;
  }

  if (notification.user_id === requesterId) {
    return true;
  }

  return notification.data.actorUserId === requesterId;
}

async function loadRecipient(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, userId: string): Promise<{ email?: string; displayName?: string }> {
  const [{ data: authUser }, { data: profile }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  return {
    email: authUser.user?.email ?? undefined,
    displayName: typeof profile?.display_name === 'string' ? profile.display_name : undefined,
  };
}

async function loadPreferences(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<NotificationPreferencesRow | null> {
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('email_messages,email_favorites,email_reviews,email_marketplace_updates,email_system')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as NotificationPreferencesRow | null;
}

function emailEnabled(preferences: NotificationPreferencesRow | null, type: NotificationType): boolean {
  if (type === 'message') return preferences?.email_messages !== false;
  if (type === 'favorite') return preferences?.email_favorites === true;
  if (type === 'review') return preferences?.email_reviews !== false;
  if (type === 'system') return preferences?.email_system !== false;
  return preferences?.email_marketplace_updates !== false;
}

async function reserveDelivery(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  notification: NotificationRow,
  recipientEmail: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('notification_email_deliveries')
    .insert({
      notification_id: notification.id,
      user_id: notification.user_id,
      notification_type: notification.type,
      recipient_email: recipientEmail,
      status: 'pending',
    });

  return !error;
}

async function markEmailSkipped(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  notification: NotificationRow,
  reason: string
): Promise<void> {
  await supabaseAdmin
    .from('notification_email_deliveries')
    .upsert({
      notification_id: notification.id,
      user_id: notification.user_id,
      notification_type: notification.type,
      recipient_email: 'unknown@example.invalid',
      status: 'skipped',
      error: reason,
    }, { onConflict: 'notification_id' });
}

async function updateDelivery(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  notificationId: string,
  updates: Record<string, unknown>
): Promise<void> {
  await supabaseAdmin
    .from('notification_email_deliveries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('notification_id', notificationId);
}

function buildEmail(notification: NotificationRow, displayName: string | undefined): { subject: string; html: string; text: string } {
  const appUrl = (Deno.env.get('RETAIL_APP_URL') ?? 'https://www.retailpetapp.com').replace(/\/$/, '');
  const logoUrl = Deno.env.get('RETAIL_EMAIL_LOGO_URL') ?? `${appUrl}/assets/email/retail-logo-email.png`;
  const route = typeof notification.data.route === 'string' ? notification.data.route : undefined;
  const actionUrl = route ? `${appUrl}${route.startsWith('/') ? route : `/${route}`}` : appUrl;
  const actionLabel = actionLabelFor(notification.type);
  const greeting = displayName ? `Hi ${displayName},` : 'Hi there,';
  const subject = subjectFor(notification);
  const safeTitle = escapeHtml(notification.title);
  const safeBody = escapeHtml(notification.body);
  const safeGreeting = escapeHtml(greeting);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#F6F2EA;font-family:Arial,Helvetica,sans-serif;color:#1F2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F2EA;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D7E3DD;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 10px;text-align:center;">
                <img src="${escapeHtml(logoUrl)}" alt="ReTail" width="220" style="display:block;width:220px;max-width:82%;height:auto;margin:0 auto;border:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px 6px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:24px;color:#43515A;">${safeGreeting}</p>
                <h1 style="margin:0 0 12px;font-size:24px;line-height:31px;color:#267E78;font-weight:800;">${safeTitle}</h1>
                <p style="margin:0;font-size:16px;line-height:25px;color:#43515A;">${safeBody}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 30px 10px;text-align:center;">
                <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#F2784B;color:#FFFFFF;text-decoration:none;font-size:16px;line-height:20px;font-weight:800;border-radius:999px;padding:14px 24px;">${escapeHtml(actionLabel)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px 28px;">
                <p style="margin:0;font-size:13px;line-height:20px;color:#6B7C72;text-align:center;">You received this because your ReTail notification settings allow this email. You can update email alerts in Settings.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

${notification.title}

${notification.body}

Open ReTail: ${actionUrl}

You can update email alerts in ReTail Settings.`;

  return { subject, html, text };
}

function subjectFor(notification: NotificationRow): string {
  if (notification.type === 'message') return 'New ReTail message';
  if (notification.type === 'favorite') return 'Someone saved your ReTail listing';
  if (notification.type === 'review') return 'You received a ReTail review';
  if (notification.type === 'saved_search') return 'New ReTail saved search match';
  if (notification.type === 'transaction_completed') return 'ReTail transaction completed';
  if (notification.type === 'listing_sold') return 'Your ReTail listing was marked sold';
  if (notification.type === 'listing_donated') return 'Your ReTail listing was marked donated';
  return `ReTail: ${notification.title}`;
}

function actionLabelFor(type: NotificationType): string {
  if (type === 'message') return 'Open Message';
  if (type === 'favorite') return 'View Listing';
  if (type === 'review') return 'View Review';
  if (type === 'saved_search') return 'View Match';
  if (type === 'transaction_completed') return 'View Details';
  if (type === 'listing_sold' || type === 'listing_donated') return 'View Listing';
  return 'Open ReTail';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
