import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation } from '@apollo/client';
import { useAuthenticationStatus, useSignOut } from '@nhost/react';
import { useOrg } from '../context/OrgContext';
import { GET_ORG_WORKFLOWS } from '../lib/graphql/queries';
import { TRIGGER_WORKFLOW_RUN } from '../lib/graphql/mutations';
import QuotaBadge from '../components/QuotaBadge';

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const router = useRouter();
  const { orgId, role, orgName, memberships, setOrgId } = useOrg();
  const { signOut } = useSignOut();

  const { data, loading, refetch } = useQuery(GET_ORG_WORKFLOWS, {
    variables: { orgId },
    skip: !orgId,
  });
  const [triggerRun] = useMutation(TRIGGER_WORKFLOW_RUN);

  if (!authLoading && !isAuthenticated) {
    if (typeof window !== 'undefined') router.push('/login');
    return null;
  }

  const canTrigger = role === 'owner' || role === 'editor';
  const canCreate = role === 'owner' || role === 'editor';

  const runNow = async (workflowId) => {
    const res = await triggerRun({ variables: { workflowId } });
    const { workflow_run_id } = res.data.triggerWorkflowRun;
    router.push(`/workflows/${workflowId}/run/${workflow_run_id}`);
  };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Workflows</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={orgId || ''} onChange={(e) => setOrgId(e.target.value)}>
            {memberships.map((m) => (
              <option key={m.org.id} value={m.org.id}>{m.org.name} ({m.role})</option>
            ))}
          </select>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      <QuotaBadge usage={data?.organizations_by_pk?.usage} />

      {canCreate && (
        <Link href="/workflows/new/build"><button>+ New workflow</button></Link>
      )}

      {loading && <p>Loading…</p>}

      {data?.workflows.map((wf) => {
        const lastRun = wf.workflow_runs[0];
        return (
          <div key={wf.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0 }}>{wf.name}</h3>
                <p style={{ margin: '4px 0', color: '#9ca3af' }}>{wf.description}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                  {wf.workflow_steps.length} steps · avg run{' '}
                  {wf.run_stats?.avg_duration_seconds ? `${Math.round(wf.run_stats.avg_duration_seconds)}s` : '—'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                {lastRun && <span className={`badge badge-${lastRun.status}`}>{lastRun.status}</span>}
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <Link href={`/workflows/${wf.id}/build`}><button>Edit</button></Link>
                  {canTrigger && <button onClick={() => runNow(wf.id)}>Run</button>}
                  {lastRun && (
                    <Link href={`/workflows/${wf.id}/run/${lastRun.id}`}><button>View last run</button></Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
