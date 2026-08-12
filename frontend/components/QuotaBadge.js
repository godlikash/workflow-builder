export default function QuotaBadge({ usage }) {
  if (!usage) return null;
  const pct = usage.percent_used ?? 0;
  const color = pct >= 100 ? '#b91c1c' : pct >= 80 ? '#b45309' : '#15803d';
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <strong>Usage this period:</strong>
      <span>{usage.quota_used} / {usage.quota_limit}</span>
      <div style={{ flex: 1, height: 8, background: '#2a2e38', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}
