# Write-up

## Schema reasoning

The core chain is `organizations → org_members → workflows → workflow_steps
/ workflow_triggers → workflow_runs → step_runs`. Everything hangs off
`org_id` (directly or transitively) because the whole permission model is
built on "which org does this row belong to, and what's the caller's role
there" — putting that one relationship at the center meant every later
permission rule is the same shape (join to `org_members`, compare
`user_id`/`role`), instead of bespoke logic per table.

`workflow_steps` and `workflow_triggers` are separate tables rather than
columns on `workflows` because they have independent lifecycles (reordered,
added, removed) and independent permission rules — a trigger's `webhook`
type needs a stricter check than a step's `http_request` type, which is
easier to express as two boolean expressions than one shared one.

`workflow_runs` and `step_runs` are split so a run's overall status
(`pending/running/paused/completed/failed`) and a step's individual status
can diverge — a run is `paused` exactly when its current step is `paused`,
but every other step in that run is independently `succeeded`/`pending`.
That split is also what makes the subscription cheap: the frontend
subscribes to `step_runs` filtered by `workflow_run_id` and gets fine-
grained, ordered progress for free via the `workflow_step.step_order`
relationship, with no need for the client to reconstruct ordering itself.

`config jsonb` on both `workflow_steps` and `workflow_triggers` keeps the
schema stable while step/trigger-specific shapes (a prompt, a cron
expression, a webhook secret) evolve — validated at the application layer
in the Action handler rather than the database, since Postgres check
constraints on JSONB shape would get unwieldy fast for six step types.

## How the two permission layers are enforced differently

**Layer 1 (org + role scoping)** is pure declarative Hasura row-level
security. Every table's `select`/`insert`/`update`/`delete` permission for
the `user` role joins out to `org_members` and compares
`user_id: {_eq: X-Hasura-User-Id}` (and, where relevant, `role: {_in:
[...]}`). Because Hasura evaluates this as a SQL predicate on every query,
it's structurally impossible to see or touch another org's row — including
by guessing an ID directly, since the `where` clause is injected
server-side regardless of what the client asks for. A `workflows(where:
{id: {_eq: "<org-b-id>"}})` query from an Org A user simply returns zero
rows, the same as if the row didn't exist.

**Layer 2 (step-level gating)** has a static half and a dynamic half. The
static half — *"only an owner can add a `db_write` step, a webhook
trigger, or a `notify` step"* — is still expressible as a Hasura
permission: the insert `check` on `workflow_steps` is `_and: [<is
owner/editor>, _or: [<type not in db_write>, <is owner>]]`, so the
constraint is enforced by Postgres at insert time, before Hasura even
returns success. The dynamic half — resolving an `approval_gate` — is not
a row insert or update in the normal sense; it's a decision about the
run's *current, mid-execution* state ("is this step actually paused right
now, and does this specific caller currently hold the right role in this
org"). That can't be a static permission because it depends on runtime
state a permission predicate can't see cleanly (which step is the *active*
one) and because resuming a run needs custom logic afterward, not just a
row mutation. So `approveStep` is a Hasura Action: the handler re-fetches
the step's live status, re-checks the caller's role fresh (never trusting
anything cached client-side), and only then flips the step to `succeeded`
and calls back into the run engine.

## Approval-gate pause/resume implementation

The run engine (`actions/src/workflowEngine.js`) walks `workflow_steps` in
`step_order`. When it reaches a step of type `approval_gate`, it sets that
step's `step_runs` row to `paused`, sets the parent `workflow_runs` row to
`paused`, and returns — it does not block a thread waiting for approval;
the whole call simply ends there. The subscription reflects `paused`
immediately.

`approveStep` is a separate Action, invoked later (possibly minutes or
hours after) by a different HTTP request. After validating the approver's
role, it marks that step's `step_runs` row `succeeded` and calls
`runWorkflow(workflowRunId, fromOrder: <next step_order>)` — the same
engine function used for a fresh run, just given a starting offset. It
reconstructs `previousOutput` by scanning for the last `succeeded` step
before resuming, so the step after the gate sees the same output it would
have if execution had never stopped. This means the pause/resume boundary
is just "which `step_order` do we start the loop at," not a separate code
path — the same retry, failure, and quota-increment logic that runs a
workflow start-to-finish also runs the tail end after an approval.
