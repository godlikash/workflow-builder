const { client, gql } = require('./hasuraClient');
const { getRoleForWorkflow, canTriggerRun, checkQuota } = require('./permissions');
const { runWorkflow } = require('./workflowEngine');

async function createRunWithStepRuns(workflowId, triggerType, triggeredBy) {
  const stepsQuery = gql`
    query ($workflowId: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { step_order: asc }) {
        id
      }
    }
  `;
  const { workflow_steps } = await client.request(stepsQuery, { workflowId });
  if (workflow_steps.length === 0) throw new Error('workflow has no steps');

  const createRunMutation = gql`
    mutation ($workflowId: uuid!, $triggerType: String!, $triggeredBy: uuid) {
      insert_workflow_runs_one(object: {
        workflow_id: $workflowId, status: "pending", trigger_type: $triggerType, triggered_by: $triggeredBy
      }) { id }
    }
  `;
  const { insert_workflow_runs_one } = await client.request(createRunMutation, {
    workflowId, triggerType, triggeredBy: triggeredBy || null,
  });
  const workflowRunId = insert_workflow_runs_one.id;

  const insertStepRunsMutation = gql`
    mutation ($objects: [step_runs_insert_input!]!) {
      insert_step_runs(objects: $objects) { affected_rows }
    }
  `;
  await client.request(insertStepRunsMutation, {
    objects: workflow_steps.map((s) => ({
      workflow_run_id: workflowRunId,
      workflow_step_id: s.id,
      status: 'pending',
    })),
  });

  return workflowRunId;
}

/**
 * Body shape (Hasura Action): { input: { workflow_id }, session_variables: { 'x-hasura-user-id': ... } }
 */
async function handleTriggerWorkflowRun(req, res) {
  try {
    const { input, session_variables } = req.body;
    const userId = session_variables?.['x-hasura-user-id'];
    const workflowId = input.workflow_id;

    if (!userId) return res.status(401).json({ message: 'not authenticated' });

    // --- Layer 1: caller must be owner/editor in the workflow's org ------
    const membership = await getRoleForWorkflow(userId, workflowId);
    if (!membership || !canTriggerRun(membership.role)) {
      // Same response whether the workflow doesn't exist, belongs to another
      // org, or the caller is just a viewer — no information leak either way.
      return res.status(403).json({ message: 'not permitted to trigger this workflow' });
    }

    // --- Quota check -------------------------------------------------------
    const hasQuota = await checkQuota(membership.orgId);
    if (!hasQuota) return res.status(429).json({ message: 'organization quota exhausted' });

    // --- Create the run + step_run rows, then execute ----------------------
    const workflowRunId = await createRunWithStepRuns(workflowId, 'manual', userId);
    const result = await runWorkflow(workflowRunId);

    return res.json({ workflow_run_id: workflowRunId, status: result.status });
  } catch (err) {
    console.error('triggerWorkflowRun error', err);
    return res.status(500).json({ message: String(err.message || err) });
  }
}

module.exports = { handleTriggerWorkflowRun, createRunWithStepRuns };
