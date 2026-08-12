const fetch = require('node-fetch');
const { client, gql } = require('./hasuraClient');

async function handleNotifyDelivery(req, res) {
  try {
    const { event } = req.body;
    const row = event.data.new;

    if (row.channel === 'slack' && row.target) {
      await fetch(row.target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: row.message }),
      }).catch((e) => console.warn('slack delivery failed', e.message));
    } else {
      // email: stubbed — log instead of requiring SMTP creds for the demo
      console.log(`[email stub] to=${row.target} message=${row.message}`);
    }

    const mutation = gql`
      mutation ($id: uuid!, $now: timestamptz!) {
        update_notifications_by_pk(pk_columns: { id: $id }, _set: { delivered: true, delivered_at: $now }) { id }
      }
    `;
    await client.request(mutation, { id: row.id, now: new Date().toISOString() });

    return res.json({ ok: true });
  } catch (err) {
    console.error('notifyDelivery error', err);
    return res.status(500).json({ message: String(err.message || err) });
  }
}

module.exports = { handleNotifyDelivery };
