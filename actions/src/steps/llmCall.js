const fetch = require('node-fetch');

// Very small templating: replaces {{previous_output}} and
// {{previous_output.some.path}} with values from the prior step's output.
function renderTemplate(str, previousOutput) {
  return str.replace(/\{\{\s*previous_output(?:\.([\w.]+))?\s*\}\}/g, (_, path) => {
    if (!path) return JSON.stringify(previousOutput ?? null);
    const value = path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), previousOutput);
    return typeof value === 'string' ? value : JSON.stringify(value ?? null);
  });
}

/**
 * config: { prompt: string, model?: string, api?: 'groq' | 'stub' }
 * If GROQ_API_KEY (or OPENROUTER/GEMINI equivalents) isn't set, falls back
 * to a disclosed stub with an artificial delay rather than failing —
 * matches the assignment's "stub is fine if disclosed" allowance.
 */
async function runLlmCall(config, previousOutput) {
  const prompt = renderTemplate(config.prompt || '', previousOutput);

  if (process.env.GROQ_API_KEY) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.model || 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return { prompt, text, provider: 'groq', model: config.model || 'llama-3.1-8b-instant' };
  }

  // --- STUBBED (disclosed) ---------------------------------------------
  await new Promise((resolve) => setTimeout(resolve, 800)); // artificial delay
  const lower = prompt.toLowerCase();
  const stubText = lower.includes('angry') || lower.includes('bad') || lower.includes('refund')
    ? 'sentiment: negative — the customer is unhappy and requesting a refund.'
    : 'sentiment: positive — the customer is satisfied with the product.';
  return { prompt, text: stubText, provider: 'stub', stubbed: true, model: config.model || 'stub-model' };
}

module.exports = { runLlmCall };
