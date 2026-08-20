-- ReTail hot-path RLS initplan optimization.
--
-- This migration preserves existing authorization semantics and only changes
-- stable auth/session calls so Postgres can evaluate them as initplans instead
-- of re-running them for each candidate row.

alter policy "Phase D users can view own blocks"
  on public.blocks
  using (
    private.is_account_active((select auth.uid()))
    and (
      blocker_id = (select auth.uid())
      or private.is_admin((select auth.uid()))
    )
  );

alter policy "Buyers create conversations for themselves"
  on public.conversations
  with check (
    (select auth.uid()) = buyer_id
    and buyer_id <> seller_id
    and private.is_account_active((select auth.uid()))
    and (
      (
        listing_id is not null
        and rescue_id is null
        and exists (
          select 1
          from public.listings
          where listings.id = conversations.listing_id
            and listings.seller_id = conversations.seller_id
            and listings.status = 'active'::public.listing_status
            and listings.deleted_at is null
        )
      )
      or (
        listing_id is null
        and rescue_id is not null
        and exists (
          select 1
          from public.rescue_profiles
          where rescue_profiles.id = conversations.rescue_id
            and rescue_profiles.owner_id = conversations.seller_id
            and rescue_profiles.is_active = true
            and rescue_profiles.is_verified = true
            and rescue_profiles.verification_status = 'verified'::text
            and rescue_profiles.deleted_at is null
        )
      )
    )
  );

alter policy "Phase D participants can view conversations"
  on public.conversations
  using (
    deleted_at is null
    and private.is_account_active((select auth.uid()))
    and (
      (select auth.uid()) = buyer_id
      or (select auth.uid()) = seller_id
      or private.is_admin((select auth.uid()))
    )
  );

alter policy "Users create their own favorites"
  on public.favorites
  with check (
    (select auth.uid()) = user_id
    and private.is_account_active((select auth.uid()))
  );

alter policy "Users delete their own favorites"
  on public.favorites
  using (
    (select auth.uid()) = user_id
    and private.is_account_active((select auth.uid()))
  );

alter policy "Users read their own favorites"
  on public.favorites
  using (
    (select auth.uid()) = user_id
  );

alter policy "Listing owners delete own listings"
  on public.listings
  using (
    (select auth.uid()) = seller_id
    and private.is_account_active((select auth.uid()))
  );

alter policy "Users create their own listings"
  on public.listings
  with check (
    (select auth.uid()) = seller_id
    and private.is_account_active((select auth.uid()))
  );

alter policy "Users update their own listings"
  on public.listings
  using (
    (select auth.uid()) = seller_id
    and private.is_account_active((select auth.uid()))
  )
  with check (
    (select auth.uid()) = seller_id
    and private.is_account_active((select auth.uid()))
  );

alter policy "Phase D participants can send messages"
  on public.messages
  with check (
    (select auth.uid()) = sender_id
    and private.is_account_active((select auth.uid()))
    and (
      (
        message_type = 'text'::public.message_type
        and body is not null
        and char_length(trim(both from body)) >= 1
        and char_length(trim(both from body)) <= 2000
      )
      or (
        message_type = 'system'::public.message_type
        and body is not null
        and char_length(trim(both from body)) >= 1
        and char_length(trim(both from body)) <= 2000
      )
      or (
        message_type = 'image'::public.message_type
        and image_url is not null
      )
    )
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.deleted_at is null
        and (
          c.buyer_id = (select auth.uid())
          or c.seller_id = (select auth.uid())
        )
        and not private.is_blocked_between(c.buyer_id, c.seller_id)
    )
  );

alter policy "Phase D participants can view messages"
  on public.messages
  using (
    private.is_account_active((select auth.uid()))
    and (
      private.is_admin((select auth.uid()))
      or exists (
        select 1
        from public.conversations c
        where c.id = messages.conversation_id
          and c.deleted_at is null
          and (
            (select auth.uid()) = c.buyer_id
            or (select auth.uid()) = c.seller_id
          )
      )
    )
  );

alter policy "Phase E users can read own notifications"
  on public.notifications
  using (
    private.is_account_active((select auth.uid()))
    and (select auth.uid()) = user_id
    and deleted_at is null
  );

alter policy "Users insert their own profile"
  on public.profiles
  with check (
    (select auth.uid()) = id
    and is_admin = false
    and is_banned = false
    and is_verified = false
  );

alter policy "Users update their own profile"
  on public.profiles
  using (
    (select auth.uid()) = id
    and private.is_account_active((select auth.uid()))
  )
  with check (
    (select auth.uid()) = id
    and private.is_account_active((select auth.uid()))
  );
