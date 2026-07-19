alter table profiles enable row level security;
alter table categories enable row level security;
alter table listings enable row level security;
alter table listing_images enable row level security;
alter table favorites enable row level security;
alter table saved_searches enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table transactions enable row level security;
alter table reviews enable row level security;
alter table reports enable row level security;
alter table blocks enable row level security;
alter table notifications enable row level security;
alter table notification_preferences enable row level security;
alter table device_tokens enable row level security;
alter table report_moderation_events enable row level security;
alter table audit_logs enable row level security;
alter table rate_limit_events enable row level security;

drop policy if exists "Profiles are publicly readable" on profiles;
drop policy if exists "Users insert their own profile" on profiles;
drop policy if exists "Users update their own profile" on profiles;
drop policy if exists "Admins update any profile" on profiles;
drop policy if exists "Categories are publicly readable" on categories;
drop policy if exists "Admins manage categories" on categories;
drop policy if exists "Active listings are publicly readable" on listings;
drop policy if exists "Users read their own listings" on listings;
drop policy if exists "Users create their own listings" on listings;
drop policy if exists "Users update their own listings" on listings;
drop policy if exists "Admins update any listing" on listings;
drop policy if exists "Admins read any listing" on listings;
drop policy if exists "Listing owners delete own listings" on listings;
drop policy if exists "Admins delete any listing" on listings;
drop policy if exists "Listing images follow public listings" on listing_images;
drop policy if exists "Listing owners manage images" on listing_images;
drop policy if exists "Users read their own favorites" on favorites;
drop policy if exists "Users create their own favorites" on favorites;
drop policy if exists "Users delete their own favorites" on favorites;
drop policy if exists "Users manage their own saved searches" on saved_searches;
drop policy if exists "Conversation participants can read conversations" on conversations;
drop policy if exists "Buyers create conversations for themselves" on conversations;
drop policy if exists "Conversation participants can update conversations" on conversations;
drop policy if exists "Conversation participants can read messages" on messages;
drop policy if exists "Conversation participants can send messages" on messages;
drop policy if exists "Conversation participants can mark messages read" on messages;
drop policy if exists "Transaction participants can read transactions" on transactions;
drop policy if exists "Sellers create transactions for own listings" on transactions;
drop policy if exists "Transaction participants can update transactions" on transactions;
drop policy if exists "Reviews are publicly readable" on reviews;
drop policy if exists "Users create reviews they wrote" on reviews;
drop policy if exists "Users update reviews they wrote" on reviews;
drop policy if exists "Users create reports" on reports;
drop policy if exists "Users read their own reports" on reports;
drop policy if exists "Admins read reports" on reports;
drop policy if exists "Admins update reports" on reports;
drop policy if exists "Users manage their own blocks" on blocks;
drop policy if exists "Users read their own notifications" on notifications;
drop policy if exists "Users update their own notifications" on notifications;
drop policy if exists "Service inserts notifications" on notifications;
drop policy if exists "Participants create message notifications" on notifications;
drop policy if exists "Users create favorite notifications" on notifications;
drop policy if exists "Users manage their own device tokens" on device_tokens;
drop policy if exists "Phase E transaction participants can read" on transactions;
drop policy if exists "Phase E public can read reviews" on reviews;
drop policy if exists "Phase E admins can read reports" on reports;
drop policy if exists "Phase E users can read own notifications" on notifications;
drop policy if exists "Phase E admins can read report moderation events" on report_moderation_events;
drop policy if exists "Admins read audit logs" on audit_logs;
drop policy if exists "Admins insert audit logs" on audit_logs;
drop policy if exists "Users insert rate limit events" on rate_limit_events;
drop policy if exists "Admins read rate limit events" on rate_limit_events;

create policy "Profiles are publicly readable"
  on profiles for select
  using (deleted_at is null and is_banned = false);

create policy "Users insert their own profile"
  on profiles for insert
  with check (
    auth.uid() = id
    and is_admin = false
    and is_banned = false
    and is_verified = false
  );

create policy "Users update their own profile"
  on profiles for update
  using (auth.uid() = id and is_account_active())
  with check (auth.uid() = id and is_account_active());

create policy "Admins update any profile"
  on profiles for update
  using (is_admin())
  with check (is_admin());

create policy "Categories are publicly readable"
  on categories for select
  using (is_active = true);

create policy "Admins manage categories"
  on categories for all
  using (is_admin())
  with check (is_admin());

create policy "Active listings are publicly readable"
  on listings for select
  using (status = 'active' and deleted_at is null);

create policy "Users read their own listings"
  on listings for select
  using (auth.uid() = seller_id and is_account_active());

create policy "Users create their own listings"
  on listings for insert
  with check (
    auth.uid() = seller_id
    and is_account_active()
  );

create policy "Users update their own listings"
  on listings for update
  using (auth.uid() = seller_id and is_account_active())
  with check (auth.uid() = seller_id and is_account_active());

create policy "Admins update any listing"
  on listings for update
  using (is_admin())
  with check (is_admin());

create policy "Admins read any listing"
  on listings for select
  using (is_admin());

create policy "Listing owners delete own listings"
  on listings for delete
  using (auth.uid() = seller_id and is_account_active());

create policy "Admins delete any listing"
  on listings for delete
  using (is_admin());

create policy "Listing images follow public listings"
  on listing_images for select
  using (
    exists (
      select 1 from listings
      where listings.id = listing_images.listing_id
        and listings.status = 'active'
        and listings.deleted_at is null
    )
  );

create policy "Listing owners manage images"
  on listing_images for all
  using (
    is_account_active()
    and
    exists (
      select 1 from listings
      where listings.id = listing_images.listing_id
        and listings.seller_id = auth.uid()
    )
  )
  with check (
    is_account_active()
    and
    exists (
      select 1 from listings
      where listings.id = listing_images.listing_id
        and listings.seller_id = auth.uid()
    )
  );

create policy "Users read their own favorites"
  on favorites for select
  using (auth.uid() = user_id);

create policy "Users create their own favorites"
  on favorites for insert
  with check (auth.uid() = user_id and is_account_active());

create policy "Users delete their own favorites"
  on favorites for delete
  using (auth.uid() = user_id and is_account_active());

create policy "Users manage their own saved searches"
  on saved_searches for all
  using (auth.uid() = user_id and is_account_active())
  with check (auth.uid() = user_id and is_account_active());

create policy "Conversation participants can read conversations"
  on conversations for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "Buyers create conversations for themselves"
  on conversations for insert
  with check (
    auth.uid() = buyer_id
    and buyer_id <> seller_id
    and is_account_active()
    and exists (
      select 1 from listings
      where listings.id = conversations.listing_id
        and listings.seller_id = conversations.seller_id
        and listings.status = 'active'
        and listings.deleted_at is null
    )
  );

create policy "Conversation participants can update conversations"
  on conversations for update
  using ((auth.uid() = buyer_id or auth.uid() = seller_id) and is_account_active())
  with check ((auth.uid() = buyer_id or auth.uid() = seller_id) and is_account_active());

create policy "Conversation participants can read messages"
  on messages for select
  using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Conversation participants can send messages"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and is_account_active()
    and exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Conversation participants can mark messages read"
  on messages for update
  using (
    is_account_active()
    and
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  )
  with check (
    is_account_active()
    and
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Phase E transaction participants can read"
  on transactions for select
  to authenticated
  using (
    is_account_active()
    and (auth.uid() = buyer_id or auth.uid() = seller_id or is_admin())
  );

create policy "Phase E public can read reviews"
  on reviews for select
  to anon, authenticated
  using (deleted_at is null);

create policy "Phase E admins can read reports"
  on reports for select
  to authenticated
  using (is_admin());

create policy "Users manage their own blocks"
  on blocks for all
  using (auth.uid() = blocker_id and is_account_active())
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id and is_account_active());

create policy "Phase E users can read own notifications"
  on notifications for select
  to authenticated
  using (auth.uid() = user_id and is_account_active() and deleted_at is null);

create policy "Phase E admins can read report moderation events"
  on report_moderation_events for select
  to authenticated
  using (is_admin());

create policy "Admins read audit logs"
  on audit_logs for select
  using (is_admin());

create policy "Admins insert audit logs"
  on audit_logs for insert
  with check (is_admin());

create policy "Users insert rate limit events"
  on rate_limit_events for insert
  with check (auth.uid() = user_id or user_id is null);

create policy "Admins read rate limit events"
  on rate_limit_events for select
  using (is_admin());

notify pgrst, 'reload schema';
