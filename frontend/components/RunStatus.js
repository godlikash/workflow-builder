import { useMutation } from '@apollo/client';
import { APPROVE_STEP } from '../lib/graphql/mutations';
import { useOrg } from '../context/OrgContext';

export default function RunStatus({ run, stepRuns }) {
  const { role } = useOrg();
  const [approveStep, { loading }] = useMutation(APPROVE_STEP);
  const canApprove = role === 'owner' || role === 'editor';

  return (
    <div>
      <div className="card">
        <strong>Run status: </strong>
        <span className={`badge badge-${run?.status}`}>{run?.status}</span>
      </div>

      {stepRuns.map((sr) => (
        <div key={sr.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{sr.workflow_step.step_order + 1}. {sr.workflow_step.type}</strong>
            <span className={`badge badge-${sr.status}`}>{sr.status}</span>
          </div>
          {sr.status === 'paused' && (
            <div style={{ marginTop: 8 }}>
              <p style={{ color: '#f59e0b' }}>⏸ Awaiting approval</p>
              {canApprove ? (
                <button disabled={loading} onClick={() => approveStep({ variables: { stepRunId: sr.id } })}>
                  {loading ? 'Approving…' : 'Approve'}
                </button>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: 13 }}>Only an owner/editor in this org can approve.</p>
              )}
            </div>
          )}
          {sr.error && <pre style={{ color: '#f87171', whiteSpace: 'pre-wrap' }}>{sr.error}</pre>}
          {sr.output && (
            <pre style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(sr.output, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
