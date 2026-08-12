const { client, gql } = require('../hasuraClient');

/** db_write: persists the previous step's output (or a config-supplied
 *  literal) into workflow_outputs. Always admin-written — this is what
 *  the "only owner may add a db_write step" gate is protecting. */
async function runDbWrite(config, previousOutput, ctx) {
  const data = config.data ?? previousOutput ?? null;
  const mutation = gql`
    mutation ($orgId: uuid!, $workflowId: uuid!, $stepRunId: uuid!, $data: jsonb!) {
      insert_workflow_outputs_one(object: {
        org_id: $orgId, workflow_id: $workflowId, step_run_id: $stepRunId, data: $data
      }) { id }
    }
  `;
  const result = await client.request(mutation, {
    orgId: ctx.orgId,
    workflowId: ctx.workflowId,
    stepRunId: ctx.stepRunId,
    data,
  });
  return { written_id: result.insert_workflow_outputs_one.id, data };
}

/** notify: writes a row to `notifications`; the actual Slack/email send
 *  is performed by the `on_notification_insert` Event Trigger, not here. */
async function runNotify(config, previousOutput, ctx) {
  const message = (config.message || 'Workflow notification').replace(
    '{{previous_output}}',
    typeof previousOutput === 'string' ? previousOutput : JSON.stringify(previousOutput ?? '')
  );
  const mutation = gql`
    mutation ($orgId: uuid!, $stepRunId: uuid!, $channel: String!, $target: String!, $message: String!) {
      insert_notifications_one(object: {
        org_id: $orgId, step_run_id: $stepRunId, channel: $channel, target: $target, message: $message
      }) { id }
    }
  `;
  const result = await client.request(mutation, {
    orgId: ctx.orgId,
    stepRunId: ctx.stepRunId,
    channel: config.channel || 'slack',
    target: config.target || '',
    message,
  });
  return { notification_id: result.insert_notifications_one.id, queued: true };
}

/** conditional_branch: evaluates a field on the previous step's output
 *  and returns which branch was taken. The engine (workflowEngine.js)
 *  uses `.branch` to decide whether to skip the very next step. */
function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function evaluate(operator, actual, expected) {
  switch (operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'contains': return typeof actual === 'string' && actual.includes(expected);
    case 'gt': return Number(actual) > Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    default: throw new Error(`unknown conditional_branch operator: ${operator}`);
  }
}

async function runConditionalBranch(config, previousOutput) {
  const actual = getPath(previousOutput, config.field);
  const result = evaluate(config.operator || 'contains', actual, config.value);
  return { field: config.field, actual, operator: config.operator, expected: config.value, branch: result ? 'true' : 'false' };
}

module.exports = { runDbWrite, runNotify, runConditionalBranch };
