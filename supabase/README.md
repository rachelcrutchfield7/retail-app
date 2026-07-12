# ReTail Supabase Setup

Run these files in the Supabase SQL Editor for the project connected to the app:

`https://ycwgsdigvpmprqreoqiz.supabase.co`

Use this order:

1. `schema.sql`
2. `policies.sql`
3. `storage.sql`
4. `seed.sql`

After running `schema.sql`, confirm the core tables exist with:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'categories', 'listings')
order by table_name;
```

Expected result:

```text
categories
listings
profiles
```

If the app logs `Could not find the table 'public.profiles'`, `public.categories`, or `public.listings`, the schema has not been applied to the Supabase project the app is using.
