const { client, gql } = require('./hasuraClient');
const { checkQuota } = require('./permissions');
const { runWorkflow } = require('./workflowEngine');
const { createRunWithStepRuns } = require('./triggerWorkflowRun');

/**
 * Hasura Event Trigger payload shape:
 * { event: { op, data: { new, old } }, table: { schema, name } }
 */
async function handleDbEventTrigger(req, res) {
  try {
    const { event, table } = req.body;
    const newRow = event.data.new;
    const orgId = newRow.org_id;

    const triggersQuery = gql`
      query ($orgId: uuid!, $table: String!) {
        workflow_triggers(
          where: {
            type: { _eq: "db_event" }
            is_enabled: { _eq: true }
            _and: [{ config: { _contains: { table: $table } } }]
            workflow: { org_id: { _eq: $orgId } }
          }
        ) {
          workflow_id
          config
        }
      }
    `;
    const data = await client.request(triggersQuery, { orgId, table: table.name });

    const results = [];
    for (const trig of data.workflow_triggers) {
      const wantedOp = trig.config?.op || 'INSERT';
      if (wantedOp !== event.op) continue;

      const hasQuota = await checkQuota(orgId);
      if (!hasQuota) { results.push({ workflow_id: trig.workflow_id, skipped: 'quota_exhausted' }); continue; }

      const workflowRunId = await createRunWithStepRuns(trig.workflow_id, 'db_event', null);
      const result = await runWorkflow(workflowRunId);
      results.push({ workflow_id: trig.workflow_id, workflow_run_id: workflowRunId, status: result.status });
    }

    return res.json({ triggered: results });
  } catch (err) {
    console.error('dbEventTrigger error', err);
    return res.status(500).json({ message: String(err.message || err) });
  }
}

module.exports = { handleDbEventTrigger };
