create extension if not exists pgcrypto;

create table if not exists public.campaign_state (
  id text primary key default 'main',
  state_json jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.campaign_state (id, state_json, revision, updated_at)
values ('main', '{}'::jsonb, 0, now())
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('campaign-assets', 'campaign-assets', true)
on conflict (id) do nothing;
