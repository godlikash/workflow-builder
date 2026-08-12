import { gql } from '@apollo/client';

// Create/edit a workflow, its steps, and its triggers in one call.
export const SAVE_WORKFLOW = gql`
  mutation SaveWorkflow(
    $orgId: uuid!
    $workflowId: uuid
    $name: String!
    $description: String
    $steps: [workflow_steps_insert_input!]!
    $triggers: [workflow_triggers_insert_input!]!
  ) {
    # upsert the workflow itself
    insert_workflows_one(
      object: { id: $workflowId, org_id: $orgId, name: $name, description: $description }
      on_conflict: { constraint: workflows_pkey, update_columns: [name, description] }
    ) {
      id
    }
    # steps/triggers are replaced wholesale for simplicity — delete then insert
    delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) { affected_rows }
    insert_workflow_steps(objects: $steps) { affected_rows }
    delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) { affected_rows }
    insert_workflow_triggers(objects: $triggers) { affected_rows }
  }
`;

export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      workflow_run_id
      status
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(step_run_id: $stepRunId) {
      step_run_id
      status
    }
  }
`;
