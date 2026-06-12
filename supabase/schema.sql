-- Phone Jail schema — paste into the Supabase SQL editor.
-- Hackathon-grade RLS: anon can read/write everything.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  planned_minutes int not null default 25,
  completed boolean not null default false
);

create table if not exists violations (
  id bigint generated always as identity primary key,
  session_id uuid references sessions (id) on delete cascade,
  user_name text not null,
  kind text not null check (kind in ('phone', 'tab')),
  site text, -- which site (Mac app tab kills know it; browser tab switches don't)
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;
alter table violations enable row level security;

create policy "anon all sessions" on sessions for all using (true) with check (true);
create policy "anon all violations" on violations for all using (true) with check (true);

create index if not exists violations_user_idx on violations (user_name);
create index if not exists sessions_user_idx on sessions (user_name, started_at desc);
