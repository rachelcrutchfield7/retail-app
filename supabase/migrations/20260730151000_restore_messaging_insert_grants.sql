-- Restore table grants required by RLS-backed messaging writes.

grant insert on messages to authenticated;
grant insert on conversations to authenticated;
