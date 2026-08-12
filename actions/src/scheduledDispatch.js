const { client, gql } = require('./hasuraClient');
const { checkQuota } = require('./permissions');
const { runWorkflow } = require('./workflowEngine');
const { createRunWithStepRuns } = require('./triggerWorkflowRun');
const { cronMatches } = require('./cronMatch');

async function handleScheduledDispatch(req, res) {
  try {
    const now = new Date();
    const query = gql`
      query {
        workflow_triggers(where: { type: { _eq: "scheduled" }, is_enabled: { _eq: true } }) {
          workflow_id
          config
          workflow { org_id }
        }
      }
    `;
    const data = await client.request(query);

    const results = [];
    for (const trig of data.workflow_triggers) {
      const cron = trig.config?.cron;
      if (!cron || !cronMatches(cron, now)) continue;

      const orgId = trig.workflow.org_id;
      const hasQuota = await checkQuota(orgId);
      if (!hasQuota) { results.push({ workflow_id: trig.workflow_id, skipped: 'quota_exhausted' }); continue; }

      const workflowRunId = await createRunWithStepRuns(trig.workflow_id, 'scheduled', null);
      const result = await runWorkflow(workflowRunId);
      results.push({ workflow_id: trig.workflow_id, workflow_run_id: workflowRunId, status: result.status });
    }

    return res.json({ dispatched: results });
  } catch (err) {
    console.error('scheduledDispatch error', err);
    return res.status(500).json({ message: String(err.message || err) });
  }
}

module.exports = { handleScheduledDispatch };
