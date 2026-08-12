import { useRouter } from 'next/router';
import { useSubscription } from '@apollo/client';
import { STEP_RUNS_SUBSCRIPTION } from '../../../../lib/graphql/subscriptions';
import RunStatus from '../../../../components/RunStatus';

export default function RunView() {
  const router = useRouter();
  const { runId } = router.query;

  const { data, loading } = useSubscription(STEP_RUNS_SUBSCRIPTION, {
    variables: { workflowRunId: runId },
    skip: !runId,
  });

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
      <h1>Run progress</h1>
      {loading && <p>Connecting…</p>}
      {data && (
        <RunStatus run={data.workflow_runs_by_pk} stepRuns={data.step_runs} />
      )}
    </div>
  );
}
