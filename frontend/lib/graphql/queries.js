import { gql } from '@apollo/client';

// Org's workflows with steps, triggers, and most-recent run status.
export const GET_ORG_WORKFLOWS = gql`
  query GetOrgWorkflows($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      name
      usage { quota_used quota_limit percent_used }
    }
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      description
      is_active
      run_stats { completed_runs avg_duration_seconds }
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        config
      }
      workflow_triggers {
        id
        type
        config
        is_enabled
      }
      workflow_runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        finished_at
      }
    }
  }
`;

export const GET_MY_ORGS = gql`
  query GetMyOrgs {
    org_members {
      role
      org { id name }
    }
  }
`;

export const GET_WORKFLOW_RUN = gql`
  query GetWorkflowRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      trigger_type
      started_at
      finished_at
      workflow { id name }
    }
  }
`;
