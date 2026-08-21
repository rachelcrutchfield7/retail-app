-- Remove anonymous execution from authoritative offer mutation RPCs.
-- Authenticated marketplace users remain allowed.

revoke execute on function public.create_marketplace_offer(uuid, integer)
  from anon;

revoke execute on function public.respond_to_marketplace_offer(uuid, text, integer)
  from anon;

revoke execute on function public.create_marketplace_offer(uuid, integer)
  from public;

revoke execute on function public.respond_to_marketplace_offer(uuid, text, integer)
  from public;

grant execute on function public.create_marketplace_offer(uuid, integer)
  to authenticated;

grant execute on function public.respond_to_marketplace_offer(uuid, text, integer)
  to authenticated;
