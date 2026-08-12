import { gql } from '@apollo/client';

// Live step-by-step progress for a single run, including the
// "paused, awaiting approval" state.
export const STEP_RUNS_SUBSCRIPTION = gql`
  subscription StepRuns($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { workflow_step: { step_order: asc } }
    ) {
      id
      status
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      finished_at
      workflow_step { id step_order type }
    }
    workflow_runs_by_pk(id: $workflowRunId) {
      id
      status
      finished_at
    }
  }
`;
