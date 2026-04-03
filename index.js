const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Force trust proxy so Railway doesn't redirect
app.set('trust proxy', false);

const RAILWAY_URL = 'https://smartfarmingsystemforstringbeans-web-production.up.railway.app';

app.post('/api/sensor-reading', async (req, res) => {
  try {
    console.log('📡 Received from Arduino:', req.body);
    const response = await fetch(`${RAILWAY_URL}/api/sensor-reading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    console.log('✅ Forwarded to Railway:', data);
    res.status(200).json(data);
  } catch (e) {
    console.error('Bridge error:', e);
    res.status(500).json({ error: 'Bridge error' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'OK' }));

app.listen(process.env.PORT || 3000, () => console.log('Bridge running'));