-- ============================================================
-- AI Agent Workflow Builder — core schema
-- Assumes nhost's built-in `auth.users` table already exists.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- organizations ----------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  quota_limit      int  not null default 1000,      -- calls allowed per period
  quota_used       int  not null default 0,          -- calls used this period
  quota_period_start timestamptz not null default date_trunc('month', now()),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- org_members ----------
create table public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.org_members (user_id);
create index on public.org_members (org_id);

-- ---------- workflows ----------
create table public.workflows (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.workflows (org_id);

-- ---------- workflow_steps ----------
create table public.workflow_steps (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.workflows(id) on delete cascade,
  step_order   int  not null,
  type         text not null check (type in
                 ('llm_call', 'http_request', 'db_write', 'notify',
                  'conditional_branch', 'approval_gate')),
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (workflow_id, step_order)
);
create index on public.workflow_steps (workflow_id);

-- ---------- workflow_triggers ----------
create table public.workflow_triggers (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.workflows(id) on delete cascade,
  type         text not null check (type in ('manual', 'webhook', 'scheduled', 'db_event')),
  config       jsonb not null default '{}'::jsonb,
  -- webhook: { "secret": "..." }  (secret is checked by the Action handler)
  -- scheduled: { "cron": "*/5 * * * *" }
  -- db_event: { "table": "leads", "op": "INSERT" }
  is_enabled   boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on public.workflow_triggers (workflow_id);

-- ---------- workflow_runs ----------
create table public.workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references public.workflows(id) on delete cascade,
  status        text not null check (status in
                  ('pending', 'running', 'paused', 'completed', 'failed'))
                  default 'pending',
  trigger_type  text not null check (trigger_type in ('manual', 'webhook', 'scheduled', 'db_event')),
  triggered_by  uuid references auth.users(id),   -- null for non-manual triggers
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index on public.workflow_runs (workflow_id);
create index on public.workflow_runs (status);

-- ---------- step_runs ----------
create table public.step_runs (
  id               uuid primary key default gen_random_uuid(),
  workflow_run_id  uuid not null references public.workflow_runs(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id) on delete cascade,
  status           text not null check (status in
                     ('pending', 'running', 'succeeded', 'failed', 'paused', 'skipped'))
                     default 'pending',
  input            jsonb,
  output           jsonb,
  error            text,
  attempt_count    int not null default 0,
  approved_by      uuid references auth.users(id),
  approved_at      timestamptz,
  started_at       timestamptz,
  finished_at      timestamptz
);
create index on public.step_runs (workflow_run_id);
create index on public.step_runs (status);

-- ============================================================
-- Aggregations (used as Hasura computed fields / a tracked view)
-- ============================================================

-- Org-level usage this period, exposed as a view so Hasura can track it
-- and relate it back to `organizations` as an object relationship.
create or replace view public.org_usage_view as
select
  o.id as org_id,
  o.quota_used,
  o.quota_limit,
  o.quota_period_start,
  round(o.quota_used::numeric / nullif(o.quota_limit, 0) * 100, 1) as percent_used
from public.organizations o;

-- Average run duration per workflow (only counts finished runs).
create or replace view public.workflow_run_stats_view as
select
  w.id as workflow_id,
  count(r.id) filter (where r.finished_at is not null) as completed_runs,
  avg(extract(epoch from (r.finished_at - r.started_at)))
    filter (where r.finished_at is not null) as avg_duration_seconds
from public.workflows w
left join public.workflow_runs r on r.workflow_id = w.id
group by w.id;

-- Helper used by permission checks / the Action handler to increment quota.
create or replace function public.increment_org_quota(p_org_id uuid, p_amount int default 1)
returns void as $$
begin
  update public.organizations
  set quota_used = quota_used + p_amount,
      updated_at = now()
  where id = p_org_id;
end;
$$ language plpgsql;
