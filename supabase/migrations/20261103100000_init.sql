-- Sync Up: one couple, two partners (slot A = who set it up, slot B = who joined with
-- the invite code). Every row belongs to a couple, and row level security makes sure
-- a couple only ever sees its own data and each partner only writes as themselves.

-- ── Couples & who's in them ────────────────────────────────────────────────

create table public.couples (
  id          uuid primary key default gen_random_uuid(),
  name_a      text not null check (char_length(name_a) between 1 and 40),
  name_b      text not null check (char_length(name_b) between 1 and 40),
  invite_code text unique,            -- cleared once partner B joins
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  couple_id  uuid not null references public.couples on delete cascade,
  slot       text not null check (slot in ('A', 'B')),
  created_at timestamptz not null default now(),
  unique (couple_id, slot)
);

-- Security definer so policies can call them without recursing into profiles' own RLS.
create function public.my_couple_id() returns uuid
language sql stable security definer set search_path = public
as $$ select couple_id from profiles where id = auth.uid() $$;

create function public.my_slot() returns text
language sql stable security definer set search_path = public
as $$ select slot from profiles where id = auth.uid() $$;

-- ── The day ────────────────────────────────────────────────────────────────

create table public.moods (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples on delete cascade,
  slot       text not null check (slot in ('A', 'B')),
  emoji      text not null check (char_length(emoji) <= 16),
  label      text not null check (char_length(label) <= 40),
  note       text not null default '' check (char_length(note) <= 80),
  created_at timestamptz not null default now()
);
create index on public.moods (couple_id, slot, created_at desc);

-- The shared thread: status updates plus the automatic "felt calm", "added a photo"... posts.
create table public.feed (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples on delete cascade,
  slot       text not null check (slot in ('A', 'B')),
  type       text not null default 'status',
  text       text not null check (char_length(text) between 1 and 300),
  emoji      text,
  created_at timestamptz not null default now()
);
create index on public.feed (couple_id, created_at desc);

create table public.reactions (
  feed_id    uuid not null references public.feed on delete cascade,
  slot       text not null check (slot in ('A', 'B')),
  couple_id  uuid not null references public.couples on delete cascade,
  created_at timestamptz not null default now(),
  primary key (feed_id, slot)
);

create table public.schedule_items (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples on delete cascade,
  slot       text not null check (slot in ('A', 'B')),
  day        date not null,
  time       text not null check (time ~ '^\d{2}:\d{2}$'),
  activity   text not null check (char_length(activity) between 1 and 140),
  created_at timestamptz not null default now()
);
create index on public.schedule_items (couple_id, day);

create table public.date_plans (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples on delete cascade,
  added_by   text not null check (added_by in ('A', 'B')),
  title      text not null check (char_length(title) between 1 and 140),
  date       date not null,
  time       text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);
create index on public.date_plans (couple_id, date);

create table public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples on delete cascade,
  slot       text not null check (slot in ('A', 'B')),
  day        date not null,
  text       text not null check (char_length(text) between 1 and 5000),
  created_at timestamptz not null default now(),
  unique (couple_id, slot, day)
);

create table public.photos (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples on delete cascade,
  slot       text not null check (slot in ('A', 'B')),
  day        date not null,
  path       text not null,           -- object in the private "photos" storage bucket
  created_at timestamptz not null default now(),
  unique (couple_id, slot, day)
);

-- "On The Way": one live row per partner, updated as they move.
create table public.driving_sessions (
  couple_id   uuid not null references public.couples on delete cascade,
  slot        text not null check (slot in ('A', 'B')),
  active      boolean not null default false,
  mode        text not null default 'drive',
  destination text not null default '',
  dest_lat    double precision,
  dest_lng    double precision,
  lat         double precision,
  lng         double precision,
  eta_min     integer,
  started_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (couple_id, slot)
);

-- ── Row level security ─────────────────────────────────────────────────────

alter table public.couples          enable row level security;
alter table public.profiles         enable row level security;
alter table public.moods            enable row level security;
alter table public.feed             enable row level security;
alter table public.reactions        enable row level security;
alter table public.schedule_items   enable row level security;
alter table public.date_plans       enable row level security;
alter table public.journal_entries  enable row level security;
alter table public.photos           enable row level security;
alter table public.driving_sessions enable row level security;

create policy "members read their couple" on public.couples
  for select to authenticated using (id = (select public.my_couple_id()));

create policy "members read their profiles" on public.profiles
  for select to authenticated using (couple_id = (select public.my_couple_id()));

-- Tables where each partner has their own rows: both can read, you write only your own.
do $$
declare t text;
begin
  foreach t in array array['moods', 'feed', 'reactions', 'schedule_items', 'photos', 'driving_sessions'] loop
    execute format($p$
      create policy "couple reads" on public.%1$I for select to authenticated
        using (couple_id = (select public.my_couple_id()));
      create policy "write your own" on public.%1$I for insert to authenticated
        with check (couple_id = (select public.my_couple_id()) and slot = (select public.my_slot()));
      create policy "update your own" on public.%1$I for update to authenticated
        using (couple_id = (select public.my_couple_id()) and slot = (select public.my_slot()))
        with check (couple_id = (select public.my_couple_id()) and slot = (select public.my_slot()));
      create policy "delete your own" on public.%1$I for delete to authenticated
        using (couple_id = (select public.my_couple_id()) and slot = (select public.my_slot()));
    $p$, t);
  end loop;
end $$;

-- Date plans are shared: either partner can add, edit or remove them.
create policy "couple reads" on public.date_plans for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy "couple adds" on public.date_plans for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and added_by = (select public.my_slot()));
create policy "couple edits" on public.date_plans for update to authenticated
  using (couple_id = (select public.my_couple_id())) with check (couple_id = (select public.my_couple_id()));
create policy "couple removes" on public.date_plans for delete to authenticated
  using (couple_id = (select public.my_couple_id()));

-- Journal: private until you've both written that day. Your partner's entry for a day
-- only becomes readable once you have an entry for the same day.
create function public.i_wrote_journal(p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from journal_entries
    where couple_id = public.my_couple_id() and slot = public.my_slot() and day = p_day
  )
$$;

create policy "read yours, or theirs once you've both written" on public.journal_entries
  for select to authenticated
  using (couple_id = (select public.my_couple_id())
         and (slot = (select public.my_slot()) or public.i_wrote_journal(day)));
create policy "write your own" on public.journal_entries for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and slot = (select public.my_slot()));
create policy "update your own" on public.journal_entries for update to authenticated
  using (couple_id = (select public.my_couple_id()) and slot = (select public.my_slot()))
  with check (couple_id = (select public.my_couple_id()) and slot = (select public.my_slot()));

-- Who has written on a day, without revealing what they wrote.
create function public.journal_status(p_day date) returns setof text
language sql stable security definer set search_path = public as $$
  select slot from journal_entries where couple_id = public.my_couple_id() and day = p_day
$$;

-- ── Setting up a couple ────────────────────────────────────────────────────

create function public.new_invite_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6)
$$;

-- Partner A signs up, then creates the couple with both names (the joint setup).
-- Returns the invite code to give partner B.
create function public.create_couple(p_name_a text, p_name_b text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code   text;
  v_couple uuid;
begin
  if auth.uid() is null then raise exception 'Please log in first'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'This account is already part of a Sync Up';
  end if;
  if coalesce(trim(p_name_a), '') = '' or coalesce(trim(p_name_b), '') = '' then
    raise exception 'Fill in both names to continue';
  end if;

  loop
    v_code := public.new_invite_code();
    exit when not exists (select 1 from couples where invite_code = v_code);
  end loop;

  insert into couples (name_a, name_b, invite_code)
  values (trim(p_name_a), trim(p_name_b), v_code)
  returning id into v_couple;

  insert into profiles (id, couple_id, slot) values (auth.uid(), v_couple, 'A');
  return v_code;
end $$;

-- Lets partner B see whose Sync Up they're joining before they sign up.
create function public.invite_preview(p_code text) returns table (name_a text, name_b text)
language sql stable security definer set search_path = public as $$
  select c.name_a, c.name_b from couples c
  where c.invite_code = upper(trim(p_code))
    and not exists (select 1 from profiles p where p.couple_id = c.id and p.slot = 'B')
$$;

-- Partner B joins with the code. The code is single use.
create function public.join_couple(p_code text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_couple uuid;
begin
  if auth.uid() is null then raise exception 'Please log in first'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'This account is already part of a Sync Up';
  end if;

  select id into v_couple from couples where invite_code = upper(trim(p_code)) for update;
  if v_couple is null or exists (select 1 from profiles where couple_id = v_couple and slot = 'B') then
    raise exception 'That invite code isn''t valid';
  end if;

  insert into profiles (id, couple_id, slot) values (auth.uid(), v_couple, 'B');
  update couples
     set invite_code = null,
         name_b = coalesce(nullif(trim(p_name), ''), name_b)
   where id = v_couple;
end $$;

-- Consecutive days you've both posted something. Today only counts once you both have,
-- and not having posted yet today doesn't break the streak.
create function public.couple_streak(p_tz text default 'UTC') returns integer
language plpgsql stable set search_path = public as $$
declare
  v_today  date := (now() at time zone p_tz)::date;
  v_day    date;
  v_expect date;
  v_streak integer := 0;
begin
  for v_day in
    select (created_at at time zone p_tz)::date
    from feed
    where couple_id = public.my_couple_id() and created_at > now() - interval '400 days'
    group by 1
    having count(distinct slot) = 2
    order by 1 desc
  loop
    if v_expect is null then
      if v_day < v_today - 1 then exit; end if;
      v_expect := v_day;
    end if;
    exit when v_day <> v_expect;
    v_streak := v_streak + 1;
    v_expect := v_expect - 1;
  end loop;
  return v_streak;
end $$;

revoke execute on function public.create_couple(text, text) from public, anon;
revoke execute on function public.join_couple(text, text)   from public, anon;
revoke execute on function public.couple_streak(text)       from public, anon;
revoke execute on function public.journal_status(date)      from public, anon;
grant  execute on function public.create_couple(text, text) to authenticated;
grant  execute on function public.join_couple(text, text)   to authenticated;
grant  execute on function public.couple_streak(text)       to authenticated;
grant  execute on function public.journal_status(date)      to authenticated;
grant  execute on function public.invite_preview(text)      to anon, authenticated;

-- ── Live sync ──────────────────────────────────────────────────────────────

alter publication supabase_realtime add table
  public.couples, public.profiles, public.moods, public.feed, public.reactions,
  public.schedule_items, public.date_plans, public.journal_entries, public.photos,
  public.driving_sessions;

-- ── Photo storage ──────────────────────────────────────────────────────────
-- Private bucket. Paths are <couple_id>/<slot>/<file>, so a couple can only read its own
-- photos and each partner can only add or remove their own.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "couple reads photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select public.my_couple_id())::text);
create policy "partner adds own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos'
              and (storage.foldername(name))[1] = (select public.my_couple_id())::text
              and (storage.foldername(name))[2] = (select public.my_slot()));
create policy "partner removes own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos'
         and (storage.foldername(name))[1] = (select public.my_couple_id())::text
         and (storage.foldername(name))[2] = (select public.my_slot()));
