-- Run this after 0001_init.sql + 0002_demo_support_tables.sql, and after
-- creating the demo users in nhost Auth (email/password is fine) so their
-- auth.users.id values exist to reference below.
--
-- Replace the <...> placeholders with the real auth.users.id values from
-- your nhost project (Auth > Users), then run this file.

-- Org A
insert into organizations (id, name, quota_limit, quota_used)
values ('11111111-1111-1111-1111-111111111111', 'Org A', 1000, 0);

insert into org_members (org_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '<org-a-owner-user-id>',  'owner'),
  ('11111111-1111-1111-1111-111111111111', '<org-a-editor-user-id>', 'editor');

-- Org B — completely separate, used to prove cross-org isolation
insert into organizations (id, name, quota_limit, quota_used)
values ('22222222-2222-2222-2222-222222222222', 'Org B', 1000, 0);

insert into org_members (org_id, user_id, role) values
  ('22222222-2222-2222-2222-222222222222', '<org-b-user-id>', 'owner');

-- Org A demo workflow: llm_call -> conditional_branch -> http_request,
-- with an approval_gate before the http_request, matching the Final Task.
insert into workflows (id, org_id, name, description, created_by) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Customer feedback triage', 'Classifies feedback and escalates negative ones', '<org-a-owner-user-id>');

insert into workflow_steps (workflow_id, step_order, type, config) values
  ('33333333-3333-3333-3333-333333333333', 0, 'llm_call',
   '{"prompt": "Classify the sentiment of this feedback as positive or negative: {{previous_output}}"}'),
  ('33333333-3333-3333-3333-333333333333', 1, 'conditional_branch',
   '{"field": "text", "operator": "contains", "value": "negative", "skip_next_if_false": false}'),
  ('33333333-3333-3333-3333-333333333333', 2, 'approval_gate', '{}'),
  ('33333333-3333-3333-3333-333333333333', 3, 'http_request',
   '{"url": "https://httpbin.org/post", "method": "POST", "body": {"escalation": "{{previous_output}}"}}');

insert into workflow_triggers (workflow_id, type, config) values
  ('33333333-3333-3333-3333-333333333333', 'manual', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'webhook', '{"secret": "demo-secret-change-me"}');

-- A first run, seeded with fake input, so the initial input to llm_call
-- has something to classify (in the real UI the run just starts with
-- input = null on step 1 unless you pass payload through a webhook).
