-- spatial_ref_sys is managed by PostGIS. Keep read access needed by spatial
-- operations while removing direct application-role write capabilities.

revoke insert, update, delete, truncate, references, trigger
on table public.spatial_ref_sys
from anon, authenticated;
grant select
on table public.spatial_ref_sys
to anon, authenticated;
