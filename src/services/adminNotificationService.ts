import { supabase } from '../lib/supabase';
import type { Notification } from './types';
import { throwSupabaseError } from './supabaseData';

type Row = Record<string, unknown>;

function toAdminNotification(row: Row): Notification {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: String(row.type) as Notification['type'],
    title: String(row.title ?? 'Admin notification'),
    body: String(row.body ?? ''),
    data:
      typeof row.data === 'object' && row.data !== null
        ? (row.data as Record<string, unknown>)
        : {},
    is_read: Boolean(row.is_read),
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
    deleted_at:
      typeof row.deleted_at === 'string'
        ? row.deleted_at
        : undefined,
  };
}

export async function getAdminActionNotifications(
  limit = 100
): Promise<Notification[]> {
  const { data, error } = await supabase.rpc(
    'get_admin_action_notifications',
    {
      requested_limit: limit,
    }
  );

  if (error) {
    throwSupabaseError(
      error,
      'We could not load admin notifications.'
    );
  }

  return ((data ?? []) as Row[]).map(toAdminNotification);
}

export async function markAllAdminActionNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc(
    'mark_all_admin_notifications_read'
  );

  if (error) {
    throwSupabaseError(
      error,
      'We could not mark admin notifications as read.'
    );
  }
}
