const { client, gql } = require('./hasuraClient');

/**
 * Returns the caller's role in the org that owns `workflowId`, or null
 * if they're not a member at all (which also covers "workflow doesn't
 * exist" and "belongs to a different org" — both come back as null,
 * so cross-org access and ID-guessing fail the exact same way).
 */
async function getRoleForWorkflow(userId, workflowId) {
  const query = gql`
    query ($workflowId: uuid!, $userId: uuid!) {
      workflows(where: { id: { _eq: $workflowId } }) {
        id
        org_id
        org {
          org_members(where: { user_id: { _eq: $userId } }) {
            role
          }
        }
      }
    }
  `;
  const data = await client.request(query, { workflowId, userId });
  const wf = data.workflows[0];
  if (!wf) return null; // no such workflow — don't leak whether it exists
  const member = wf.org.org_members[0];
  return member ? { role: member.role, orgId: wf.org_id } : null;
}

async function getRoleForOrg(userId, orgId) {
  const query = gql`
    query ($orgId: uuid!, $userId: uuid!) {
      org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }) {
        role
      }
    }
  `;
  const data = await client.request(query, { orgId, userId });
  return data.org_members[0]?.role ?? null;
}

/** Layer 1, enforced again here because triggering a run is an Action,
 *  not a plain row insert, so no static Hasura permission covers it. */
function canTriggerRun(role) {
  return role === 'owner' || role === 'editor';
}

/** Layer 2: only owner/editor may resolve an approval_gate. */
function canApprove(role) {
  return role === 'owner' || role === 'editor';
}

async function checkQuota(orgId) {
  const query = gql`
    query ($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        quota_used
        quota_limit
      }
    }
  `;
  const data = await client.request(query, { orgId });
  const org = data.organizations_by_pk;
  if (!org) throw new Error('org not found');
  return org.quota_used < org.quota_limit;
}

module.exports = { getRoleForWorkflow, getRoleForOrg, canTriggerRun, canApprove, checkQuota };
