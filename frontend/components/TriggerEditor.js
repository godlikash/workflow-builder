const TRIGGER_TYPES = ['manual', 'webhook', 'scheduled', 'db_event'];

function randomSecret() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const DEFAULT_CONFIG = {
  manual: {},
  webhook: { secret: randomSecret() },
  scheduled: { cron: '*/5 * * * *' },
  db_event: { table: 'leads', op: 'INSERT' },
};

export default function TriggerEditor({ triggers, setTriggers, canAddWebhook }) {
  const addTrigger = (type) => {
    if (type === 'webhook' && !canAddWebhook) {
      alert('Only an org owner can attach a webhook trigger.');
      return;
    }
    setTriggers([...triggers, { type, config: DEFAULT_CONFIG[type], is_enabled: true }]);
  };

  const removeTrigger = (i) => setTriggers(triggers.filter((_, idx) => idx !== i));

  return (
    <div>
      <h3>Triggers</h3>
      {triggers.map((t, i) => (
        <div key={i} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{t.type}</strong>
            <button onClick={() => removeTrigger(i)}>Remove</button>
          </div>
          {t.type === 'webhook' && (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              POST to <code>webhookTriggerRun</code> with workflow_id + this secret:<br />
              <code>{t.config.secret}</code>
            </p>
          )}
          {t.type === 'scheduled' && (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>cron: <code>{t.config.cron}</code></p>
          )}
          {t.type === 'db_event' && (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              fires on {t.config.op} into <code>{t.config.table}</code>
            </p>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        {TRIGGER_TYPES.map((t) => (
          <button key={t} onClick={() => addTrigger(t)}>+ {t}</button>
        ))}
      </div>
    </div>
  );
}
