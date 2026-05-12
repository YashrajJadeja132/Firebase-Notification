require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'service-account.json');

let adminInitialized = false;
let initError = null;

try {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `Service account file not found at "${SERVICE_ACCOUNT_PATH}". ` +
      'Download it from Firebase Console > Project Settings > Service accounts > Generate new private key, ' +
      'then save it as server/service-account.json'
    );
  }
  const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  adminInitialized = true;
  console.log(`[firebase-admin] Initialized for project: ${serviceAccount.project_id}`);
} catch (err) {
  initError = err.message;
  console.warn('[firebase-admin] NOT initialized:', err.message);
  console.warn('[firebase-admin] /api/send will return 503 until you add a valid service-account.json');
}

const tokenStore = new Set();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    adminInitialized,
    initError,
    registeredTokens: tokenStore.size,
  });
});

app.post('/api/register-token', (req, res) => {
  const { token } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token (string) is required' });
  }
  tokenStore.add(token);
  console.log(`[token] Registered. Total tokens: ${tokenStore.size}`);
  res.json({ ok: true, totalTokens: tokenStore.size });
});

app.post('/api/unregister-token', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });
  tokenStore.delete(token);
  res.json({ ok: true, totalTokens: tokenStore.size });
});

app.get('/api/tokens', (req, res) => {
  res.json({ tokens: Array.from(tokenStore) });
});

app.post('/api/send', async (req, res) => {
  if (!adminInitialized) {
    return res.status(503).json({
      error: 'Firebase Admin SDK not initialized.',
      hint: initError,
    });
  }

  const { token, tokens, topic, title, body, imageUrl, link, data } = req.body || {};

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  const notification = { title, body };
  if (imageUrl) notification.imageUrl = imageUrl;

  const webpush = {
    notification: {
      icon: '/icon.png',
      badge: '/badge.png',
    },
    fcmOptions: {},
  };
  if (link) webpush.fcmOptions.link = link;

  try {
    let result;

    if (token) {
      result = await admin.messaging().send({
        token,
        notification,
        webpush,
        data: data || {},
      });
      return res.json({ ok: true, mode: 'single', messageId: result });
    }

    if (Array.isArray(tokens) && tokens.length > 0) {
      result = await admin.messaging().sendEachForMulticast({
        tokens,
        notification,
        webpush,
        data: data || {},
      });
      return res.json({
        ok: true,
        mode: 'multicast',
        successCount: result.successCount,
        failureCount: result.failureCount,
        responses: result.responses.map((r, i) => ({
          token: tokens[i],
          success: r.success,
          error: r.error ? r.error.message : null,
        })),
      });
    }

    if (topic) {
      result = await admin.messaging().send({
        topic,
        notification,
        webpush,
        data: data || {},
      });
      return res.json({ ok: true, mode: 'topic', topic, messageId: result });
    }

    const allTokens = Array.from(tokenStore);
    if (allTokens.length === 0) {
      return res.status(400).json({
        error: 'No target specified and no registered tokens. Provide token, tokens[], or topic.',
      });
    }
    result = await admin.messaging().sendEachForMulticast({
      tokens: allTokens,
      notification,
      webpush,
      data: data || {},
    });
    res.json({
      ok: true,
      mode: 'broadcast',
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (err) {
    console.error('[send] Error:', err);
    res.status(500).json({ error: err.message, code: err.code });
  }
});

app.post('/api/subscribe-topic', async (req, res) => {
  if (!adminInitialized) return res.status(503).json({ error: 'Admin not initialized' });
  const { token, topic } = req.body || {};
  if (!token || !topic) return res.status(400).json({ error: 'token and topic required' });
  try {
    const result = await admin.messaging().subscribeToTopic([token], topic);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unsubscribe-topic', async (req, res) => {
  if (!adminInitialized) return res.status(503).json({ error: 'Admin not initialized' });
  const { token, topic } = req.body || {};
  if (!token || !topic) return res.status(400).json({ error: 'token and topic required' });
  try {
    const result = await admin.messaging().unsubscribeFromTopic([token], topic);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Push notification server running at http://localhost:${PORT}`);
  console.log(`  Open the URL above in your browser to start the onboarding.\n`);
});
