# ReTail Supabase Setup

Run these files in the Supabase SQL Editor for the project connected to the app:

`https://ycwgsdigvpmprqreoqiz.supabase.co`

Use this order:

1. `schema.sql`
2. `policies.sql`
3. `storage.sql`
4. `seed.sql`
5. Feature patches: `distance.sql`, `rescue_accounts.sql`, `listing_getting_options.sql`, `listing_detail_fields.sql`, `realtime_messaging.sql`, `report_uniqueness.sql`
6. Sprint 5 trust SQL: `sprint5_step1_enum_values.txt`, then `sprint5_step2_trust_settings.txt`
7. Security gate SQL: `sprint55_security_remediation.sql`

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
