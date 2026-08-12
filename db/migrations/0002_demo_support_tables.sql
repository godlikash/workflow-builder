-- Watched table for the "database event" trigger type. Inserting a row
-- here (e.g. a new lead coming from a form) auto-starts any workflow
-- whose workflow_triggers row has type='db_event' and config.table='leads'.
create table public.leads (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text,
  email      text,
  source     text,
  created_at timestamptz not null default now()
);

-- notify steps write here; a Hasura Event Trigger on INSERT is what
-- actually fires the Slack/email send (see actions/src/notifyDelivery.js).
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  step_run_id   uuid references public.step_runs(id) on delete set null,
  channel       text not null check (channel in ('slack', 'email')),
  target        text not null,      -- webhook URL or email address
  message       text not null,
  delivered     boolean not null default false,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- db_write steps land here — a generic place for a workflow to persist
-- an arbitrary JSON result without needing a bespoke table per workflow.
create table public.workflow_outputs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  workflow_id  uuid not null references public.workflows(id) on delete cascade,
  step_run_id  uuid references public.step_runs(id) on delete set null,
  data         jsonb not null,
  created_at   timestamptz not null default now()
);
