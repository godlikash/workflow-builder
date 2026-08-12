const fetch = require('node-fetch');

/**
 * config: { url: string, method?: string, headers?: object, body?: any }
 * body may contain the literal string "{{previous_output}}" anywhere in
 * a JSON value, which gets swapped for the previous step's output.
 */
async function runHttpRequest(config, previousOutput) {
  const method = config.method || 'GET';
  let body;
  if (config.body !== undefined) {
    const bodyStr = JSON.stringify(config.body).replace(
      /"\{\{\s*previous_output\s*\}\}"/g,
      JSON.stringify(previousOutput ?? null)
    );
    body = bodyStr;
  }

  const res = await fetch(config.url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });

  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }

  if (!res.ok) {
    const err = new Error(`http_request failed: ${res.status}`);
    err.output = { status: res.status, body: parsed };
    throw err;
  }

  return { status: res.status, body: parsed };
}

module.exports = { runHttpRequest };
