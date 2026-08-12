const { client, gql } = require('./hasuraClient');
const { runLlmCall } = require('./steps/llmCall');
const { runHttpRequest } = require('./steps/httpRequest');
const { runDbWrite, runNotify, runConditionalBranch } = require('./steps/otherSteps');

const MAX_ATTEMPTS = { llm_call: 3, http_request: 3 }; // "at least one retry on failure"
const DEFAULT_MAX_ATTEMPTS = 1;

async function getRunContext(workflowRunId) {
  const query = gql`
    query ($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        id
        status
        workflow_id
        workflow { id org_id }
      }
      step_runs(
        where: { workflow_run_id: { _eq: $id } }
        order_by: { workflow_step: { step_order: asc } }
      ) {
        id
        status
        output
        workflow_step { id step_order type config }
      }
    }
  `;
  const data = await client.request(query, { id: workflowRunId });
  return {
    run: data.workflow_runs_by_pk,
    orgId: data.workflow_runs_by_pk.workflow.org_id,
    workflowId: data.workflow_runs_by_pk.workflow_id,
    stepRuns: data.step_runs,
  };
}

async function updateStepRun(stepRunId, patch) {
  const mutation = gql`
    mutation ($id: uuid!, $patch: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: $patch) { id }
    }
  `;
  await client.request(mutation, { id: stepRunId, patch });
}

async function incrementAttempt(stepRunId) {
  const mutation = gql`
    mutation ($id: uuid!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _inc: { attempt_count: 1 }) { attempt_count }
    }
  `;
  const res = await client.request(mutation, { id: stepRunId });
  return res.update_step_runs_by_pk.attempt_count;
}

async function updateWorkflowRun(workflowRunId, patch) {
  const mutation = gql`
    mutation ($id: uuid!, $patch: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $patch) { id }
    }
  `;
  await client.request(mutation, { id: workflowRunId, patch });
}

async function executeStepWithRetry(type, config, previousOutput, ctx, stepRunId) {
  const maxAttempts = MAX_ATTEMPTS[type] || DEFAULT_MAX_ATTEMPTS;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await incrementAttempt(stepRunId);
    try {
      switch (type) {
        case 'llm_call': return await runLlmCall(config, previousOutput);
        case 'http_request': return await runHttpRequest(config, previousOutput);
        case 'db_write': return await runDbWrite(config, previousOutput, ctx);
        case 'notify': return await runNotify(config, previousOutput, ctx);
        case 'conditional_branch': return await runConditionalBranch(config, previousOutput);
        default: throw new Error(`unsupported step type: ${type}`);
      }
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt)); // simple backoff
      }
    }
  }
  throw lastError;
}

/**
 * Runs (or resumes) a workflow_run starting at `fromOrder` (inclusive).
 * Stops on: approval_gate reached (pauses), a step failing all retries
 * (fails the run), or reaching the end (completes the run + bumps quota).
 */
async function runWorkflow(workflowRunId, fromOrder = null) {
  const { stepRuns, orgId, workflowId } = await getRunContext(workflowRunId);
  const ordered = [...stepRuns].sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order);

  let previousOutput = null;
  // seed previousOutput from the last succeeded step if we're resuming
  for (const sr of ordered) {
    if (sr.status === 'succeeded') previousOutput = sr.output;
  }

  let skipNext = false;
  const startIndex = fromOrder == null
    ? 0
    : ordered.findIndex((sr) => sr.workflow_step.step_order === fromOrder);

  await updateWorkflowRun(workflowRunId, { status: 'running' });
  const ctx = { orgId, workflowId };

  for (let i = Math.max(startIndex, 0); i < ordered.length; i++) {
    const sr = ordered[i];
    const step = sr.workflow_step;

    if (sr.status === 'succeeded') continue; // already done (e.g. the approval step itself, on resume)

    if (skipNext) {
      await updateStepRun(sr.id, { status: 'skipped', finished_at: new Date().toISOString() });
      skipNext = false;
      continue;
    }

    ctx.stepRunId = sr.id;

    if (step.type === 'approval_gate') {
      await updateStepRun(sr.id, { status: 'paused', started_at: new Date().toISOString() });
      await updateWorkflowRun(workflowRunId, { status: 'paused' });
      return { status: 'paused', pausedAtStepRunId: sr.id };
    }

    await updateStepRun(sr.id, { status: 'running', started_at: new Date().toISOString(), input: previousOutput });

    try {
      const output = await executeStepWithRetry(step.type, step.config, previousOutput, ctx, sr.id);
      await updateStepRun(sr.id, { status: 'succeeded', output, finished_at: new Date().toISOString() });
      previousOutput = output;

      if (step.type === 'conditional_branch' && output.branch === 'false' && step.config.skip_next_if_false) {
        skipNext = true;
      }
    } catch (err) {
      await updateStepRun(sr.id, {
        status: 'failed',
        error: String(err.message || err),
        output: err.output ?? null,
        finished_at: new Date().toISOString(),
      });
      await updateWorkflowRun(workflowRunId, { status: 'failed', finished_at: new Date().toISOString() });
      return { status: 'failed', failedAtStepRunId: sr.id };
    }
  }

  await updateWorkflowRun(workflowRunId, { status: 'completed', finished_at: new Date().toISOString() });

  const incrementMutation = gql`
    mutation ($orgId: uuid!) {
      update_organizations_by_pk(pk_columns: { id: $orgId }, _inc: { quota_used: 1 }) { id }
    }
  `;
  await client.request(incrementMutation, { orgId });

  return { status: 'completed' };
}

module.exports = { runWorkflow, getRunContext };
