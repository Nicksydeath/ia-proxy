// Simple Express proxy for OpenRouter
// - Protects your OpenRouter key behind PROXY_SECRET
// - Relays chat/completion requests to OpenRouter

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cors());

// Basic rate limiter to avoid abuse. Tune for your use.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
});
app.use(limiter);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const PROXY_SECRET = process.env.PROXY_SECRET; // a random secret you share with client
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

if (!OPENROUTER_KEY) {
  console.error('Missing OPENROUTER_API_KEY');
}

// health
app.get('/health', (req, res) => res.json({ ok: true }));

// Simple endpoint the client will call
app.post('/api/chat', async (req, res) => {
  try {
    const proxyKey = req.header('x-proxy-key');
    if (!proxyKey || proxyKey !== PROXY_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const body = req.body || {};
    const orBody = {};

    if (body.messages) {
      orBody.messages = body.messages;
    } else if (body.prompt) {
      orBody.messages = [
        { role: 'user', content: [{ type: 'text', text: body.prompt }] }
      ];
    } else {
      return res.status(400).json({ error: 'no prompt/messages provided' });
    }

    orBody.model = body.model || 'gpt-4o-mini';

    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify(orBody),
    });

    const payload = await r.json();
    res.status(r.status).json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Proxy listening on', port));
