import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery } from '@apollo/client';
import { useOrg } from '../../../context/OrgContext';
import { GET_ORG_WORKFLOWS } from '../../../lib/graphql/queries';
import { SAVE_WORKFLOW } from '../../../lib/graphql/mutations';
import StepEditor from '../../../components/StepEditor';
import TriggerEditor from '../../../components/TriggerEditor';

export default function BuildWorkflow() {
  const router = useRouter();
  const { id } = router.query; // 'new' for a fresh workflow
  const { orgId, role } = useOrg();
  const isNew = id === 'new';

  const { data } = useQuery(GET_ORG_WORKFLOWS, { variables: { orgId }, skip: !orgId });
  const existing = data?.workflows.find((w) => w.id === id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [saveWorkflow, { loading: saving }] = useMutation(SAVE_WORKFLOW);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description || '');
      setSteps(existing.workflow_steps.map((s) => ({ type: s.type, config: s.config })));
      setTriggers(existing.workflow_triggers.map((t) => ({ type: t.type, config: t.config, is_enabled: t.is_enabled })));
    }
  }, [existing]);

  if (role === 'viewer') {
    return <p style={{ margin: 40 }}>Viewers cannot edit workflows.</p>;
  }

  const onSave = async () => {
    const workflowId = isNew ? crypto.randomUUID() : id;
    await saveWorkflow({
      variables: {
        orgId,
        workflowId,
        name,
        description,
        steps: steps.map((s, i) => ({ workflow_id: workflowId, step_order: i, type: s.type, config: s.config })),
        triggers: triggers.map((t) => ({ workflow_id: workflowId, type: t.type, config: t.config, is_enabled: t.is_enabled })),
      },
    });
    router.push('/');
  };

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
      <h1>{isNew ? 'New workflow' : 'Edit workflow'}</h1>
      <div className="card">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        <label>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
      </div>

      <StepEditor steps={steps} setSteps={setSteps} canEditRestrictedTypes={role === 'owner'} />
      <TriggerEditor triggers={triggers} setTriggers={setTriggers} canAddWebhook={role === 'owner'} />

      <button onClick={onSave} disabled={saving || !name}>
        {saving ? 'Saving…' : 'Save workflow'}
      </button>
    </div>
  );
}
