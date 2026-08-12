# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built on **nhost (Postgres + Hasura + Auth) + GraphQL + Next.js**.

Every workflow belongs to an organization; every action is checked against
two permission layers (org+role scoping, and step-level type gating); runs
stream live over a GraphQL subscription and can pause mid-execution on an
`approval_gate` step.

## Repo layout

```
db/migrations/        Postgres schema (run in order)
db/seed_demo.sql       Two-org demo scenario matching the Final Task
hasura/metadata/        Tables, relationships, permissions, Actions, Event/Cron triggers
actions/                 Node/Express service backing every Hasura Action & webhook
frontend/                 Next.js app (nhost auth, workflow builder, live run view)
```

## 1. Set up nhost

1. Create a free project at [nhost.io](https://nhost.io) (or run `nhost dev` locally with the CLI).
2. Note your **subdomain**, **region**, and **Hasura admin secret** from the project dashboard.
3. Enable email/password auth (default is fine for the demo).

## 2. Apply the schema

```bash
psql "$NHOST_POSTGRES_CONNECTION_STRING" -f db/migrations/0001_init.sql
psql "$NHOST_POSTGRES_CONNECTION_STRING" -f db/migrations/0002_demo_support_tables.sql
```

## 3. Deploy the Action handler

The `actions/` service is what backs `triggerWorkflowRun`, `approveStep`,
`webhookTriggerRun`, the `leads` DB event trigger, notification delivery,
and the scheduled dispatcher. Deploy it anywhere that gives you a public
HTTPS URL (Railway, Render, Fly.io, or an nhost Serverless Function if you
prefer to fold it in there instead of a standalone service).

```bash
cd actions
cp .env.example .env   # fill in HASURA_GRAPHQL_URL, HASURA_ADMIN_SECRET, ACTION_SECRET
npm install
npm start
```

`GROQ_API_KEY` is optional — leave it unset and `llm_call` steps use a
disclosed stub (fixed artificial delay + simple keyword-based response)
instead of failing the assignment for lack of API access. Get a free key
at [console.groq.com](https://console.groq.com) to use a real model.

## 4. Wire up Hasura metadata

In `hasura/metadata/actions.yaml`, replace `{{ACTIONS_BASE_URL}}` with your
deployed Action handler's URL, and set the `ACTION_SECRET` env var in your
Hasura project to match the one in `actions/.env`. Then apply the metadata
(via `hasura metadata apply` with the Hasura CLI, or paste the equivalent
config into the Hasura Console under Actions / Events / Cron Triggers —
the YAML here is written to map 1:1 onto either path). `tables.yaml` maps
onto Console → Data → *table* → Permissions for the `user` role.

## 5. Seed the demo scenario

Create your demo users in nhost Auth first (Auth → Users → email/password
is fine), copy their user IDs into `db/seed_demo.sql`, then run it. This
gives you Org A (owner + editor) and Org B (owner), plus a ready-to-run
"Customer feedback triage" workflow in Org A with an `approval_gate`.

## 6. Run the frontend

```bash
cd frontend
cp .env.example .env.local   # fill in NEXT_PUBLIC_NHOST_SUBDOMAIN / _REGION
npm install
npm run dev
```

Deploy to Vercel for the hosted URL deliverable — same env vars.

## Trying the Final Task scenario

1. Log in as the Org A owner, open **Customer feedback triage**, hit **Run**.
   Watch the `llm_call` → `conditional_branch` → `approval_gate` steps
   update live with no refresh.
2. While paused, approve the gate — the `http_request` step fires and the
   run completes.
3. Start the same workflow via webhook instead: `POST` to
   `{ACTIONS_BASE_URL}/actions/webhook-trigger-run` through Hasura's
   `webhookTriggerRun` action, with `{"workflow_id": "...", "secret": "demo-secret-change-me"}`.
4. Log out, log in as the Org B user. Confirm Org A's workflow doesn't
   appear in the list, and that hitting its URLs / IDs directly (e.g.
   querying `workflows(where: {id: {_eq: "<org-a-workflow-id>"}})`) returns
   nothing — Hasura's row-level permission filters it out server-side, not
   just hidden in the UI.

## Notes on the two permission layers

See `WRITEUP.md` for the full reasoning. Short version: Layer 1 (org+role
scoping) lives entirely in Hasura's declarative permissions, joining out to
`org_members` on every table. Layer 2 (step-level gating) is split: the
*static* half — "only an owner can add a `db_write`/webhook/`notify`" — is
still a Hasura permission (a boolean check combining the step's `type`
column with the caller's role). The *dynamic* half — approving a paused
`approval_gate` — can't be a database permission at all, since it's a
decision made mid-execution about the run's current state, so it's
enforced explicitly in `actions/src/approveStep.js` before anything is
written.
