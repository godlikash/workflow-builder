const STEP_TYPES = ['llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate'];

const DEFAULT_CONFIG = {
  llm_call: { prompt: 'Summarize: {{previous_output}}', model: 'llama-3.1-8b-instant' },
  http_request: { url: 'https://api.example.com/endpoint', method: 'POST', body: {} },
  db_write: {},
  notify: { channel: 'slack', target: 'https://hooks.slack.com/services/...', message: 'Workflow update: {{previous_output}}' },
  conditional_branch: { field: 'text', operator: 'contains', value: 'negative', skip_next_if_false: true },
  approval_gate: {},
};

export default function StepEditor({ steps, setSteps, canEditRestrictedTypes }) {
  const addStep = (type) => {
    if (['db_write', 'notify'].includes(type) && !canEditRestrictedTypes) {
      alert('Only an org owner can add db_write / notify steps.');
      return;
    }
    setSteps([...steps, { type, config: DEFAULT_CONFIG[type] }]);
  };

  const removeStep = (i) => setSteps(steps.filter((_, idx) => idx !== i));

  const move = (i, dir) => {
    const next = [...steps];
    const target = i + dir;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    setSteps(next);
  };

  const updateConfig = (i, raw) => {
    try {
      const parsed = JSON.parse(raw);
      const next = [...steps];
      next[i] = { ...next[i], config: parsed };
      setSteps(next);
    } catch {
      // ignore invalid JSON while typing
    }
  };

  return (
    <div>
      <h3>Steps</h3>
      {steps.map((step, i) => (
        <div key={i} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{i + 1}. {step.type}</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => move(i, -1)}>↑</button>
              <button onClick={() => move(i, 1)}>↓</button>
              <button onClick={() => removeStep(i)}>Remove</button>
            </div>
          </div>
          <textarea
            defaultValue={JSON.stringify(step.config, null, 2)}
            onBlur={(e) => updateConfig(i, e.target.value)}
            rows={4}
            style={{ width: '100%', marginTop: 8, fontFamily: 'monospace' }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STEP_TYPES.map((t) => (
          <button key={t} onClick={() => addStep(t)}>+ {t}</button>
        ))}
      </div>
    </div>
  );
}
