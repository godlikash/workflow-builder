const express = require('express');
const { handleTriggerWorkflowRun } = require('./triggerWorkflowRun');
const { handleApproveStep } = require('./approveStep');
const { handleWebhookTriggerRun } = require('./webhookTriggerRun');
const { handleDbEventTrigger } = require('./dbEventTrigger');
const { handleNotifyDelivery } = require('./notifyDelivery');
const { handleScheduledDispatch } = require('./scheduledDispatch');

const app = express();
app.use(express.json());

// Every route is also protected by a shared secret Hasura sends on every
// call (set via ACTION_SECRET / x-action-secret header) so this service
// can't be hit directly by anything that isn't Hasura itself.
app.use((req, res, next) => {
  if (req.headers['x-action-secret'] !== process.env.ACTION_SECRET) {
    return res.status(401).json({ message: 'bad action secret' });
  }
  next();
});

// --- Hasura Actions (called on behalf of an authenticated user) ---------
app.post('/actions/trigger-workflow-run', handleTriggerWorkflowRun);
app.post('/actions/approve-step', handleApproveStep);
app.post('/actions/webhook-trigger-run', handleWebhookTriggerRun);

// --- Hasura Event Triggers (fired by DB row changes) ---------------------
app.post('/events/db-event-trigger', handleDbEventTrigger);
app.post('/events/notify-delivery', handleNotifyDelivery);

// --- Hasura Cron Trigger (polled every minute) ----------------------------
app.post('/scheduled/dispatch', handleScheduledDispatch);

app.get('/healthz', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Action handler listening on :${port}`));
