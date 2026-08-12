const { client, gql } = require('./hasuraClient');
const { checkQuota } = require('./permissions');
const { runWorkflow } = require('./workflowEngine');
const { createRunWithStepRuns } = require('./triggerWorkflowRun');

/**
 * No user session here — this is an inbound endpoint for external systems.
 * Auth is a per-workflow secret stored in workflow_triggers.config.secret,
 * generated when an owner attaches the webhook trigger (see Layer 2: only
 * an owner could create that trigger row in the first place).
 *
 * Body shape (Hasura Action): { input: { workflow_id, secret, payload } }
 */
async function handleWebhookTriggerRun(req, res) {
  try {
    const { input } = req.body;
    const { workflow_id: workflowId, secret } = input;

    const triggerQuery = gql`
      query ($workflowId: uuid!) {
        workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: "webhook" }, is_enabled: { _eq: true } }) {
          config
        }
        workflows_by_pk(id: $workflowId) { org_id }
      }
    `;
    const data = await client.request(triggerQuery, { workflowId });
    const trigger = data.workflow_triggers[0];
    const workflow = data.workflows_by_pk;

    if (!trigger || !workflow) return res.status(404).json({ message: 'no webhook trigger configured' });
    if (trigger.config?.secret !== secret) return res.status(401).json({ message: 'invalid webhook secret' });

    const hasQuota = await checkQuota(workflow.org_id);
    if (!hasQuota) return res.status(429).json({ message: 'organization quota exhausted' });

    const workflowRunId = await createRunWithStepRuns(workflowId, 'webhook', null);
    const result = await runWorkflow(workflowRunId);

    return res.json({ workflow_run_id: workflowRunId, status: result.status });
  } catch (err) {
    console.error('webhookTriggerRun error', err);
    return res.status(500).json({ message: String(err.message || err) });
  }
}

module.exports = { handleWebhookTriggerRun };
