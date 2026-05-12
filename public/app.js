(() => {
  const CONFIG_KEY = 'fcm_config_v1';
  const REQUIRED_FIELDS = ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId', 'vapidKey'];

  const $ = (id) => document.getElementById(id);
  const setStatus = (el, message, kind = 'info') => {
    el.className = 'status ' + kind;
    el.textContent = message;
  };

  let messaging = null;
  let currentToken = null;

  // ---------- Config persistence ----------
  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }
  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
  }

  function fillConfigForm(cfg) {
    if (!cfg) return;
    const form = $('configForm');
    for (const key of Object.keys(cfg)) {
      const input = form.elements[key];
      if (input) input.value = cfg[key];
    }
  }

  function readConfigForm() {
    const form = $('configForm');
    const cfg = {};
    for (const key of [...REQUIRED_FIELDS, 'storageBucket']) {
      const input = form.elements[key];
      cfg[key] = input ? input.value.trim() : '';
    }
    return cfg;
  }

  function validateConfig(cfg) {
    const missing = REQUIRED_FIELDS.filter((k) => !cfg[k]);
    if (missing.length) return `Missing: ${missing.join(', ')}`;
    if (!cfg.vapidKey.startsWith('B') || cfg.vapidKey.length < 60) {
      return 'VAPID key looks malformed (should start with "B" and be ~88 chars).';
    }
    return null;
  }

  // ---------- Firebase init ----------
  function initFirebase(cfg) {
    if (firebase.apps.length) {
      firebase.app().delete().catch(() => {});
    }
    firebase.initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId,
      storageBucket: cfg.storageBucket || `${cfg.projectId}.appspot.com`,
      messagingSenderId: cfg.messagingSenderId,
      appId: cfg.appId,
    });
    messaging = firebase.messaging();

    // Foreground messages
    messaging.onMessage((payload) => {
      console.log('[fg-message]', payload);
      const { title, body, icon } = payload.notification || {};
      if (Notification.permission === 'granted' && title) {
        new Notification(title, { body, icon: icon || '/icon.png' });
      }
      setStatus($('sendResult'), `📨 Foreground message received: ${title} — ${body}`, 'info');
    });

    $('btnEnable').disabled = false;
  }

  // ---------- Service worker config bridge ----------
  // The service worker file is static, so we pass config to it via postMessage
  // once it's active. The SW stores config in IndexedDB / memory before
  // initializing Firebase on its side.
  async function registerSwAndSendConfig(cfg) {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    const controller = reg.active || reg.installing || reg.waiting;
    if (controller) {
      controller.postMessage({
        type: 'FIREBASE_CONFIG',
        config: {
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain,
          projectId: cfg.projectId,
          storageBucket: cfg.storageBucket || `${cfg.projectId}.appspot.com`,
          messagingSenderId: cfg.messagingSenderId,
          appId: cfg.appId,
        },
      });
    }
    return reg;
  }

  // ---------- Permission & token ----------
  function updatePermState() {
    $('permState').textContent = (typeof Notification !== 'undefined') ? Notification.permission : 'unavailable';
  }

  async function enableNotifications() {
    const cfg = loadConfig();
    if (!cfg) {
      setStatus($('configStatus'), 'Save your config first.', 'error');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      updatePermState();
      if (permission !== 'granted') {
        setStatus($('sendResult'), `Permission ${permission}. Cannot subscribe.`, 'error');
        return;
      }

      const swReg = await registerSwAndSendConfig(cfg);

      const token = await messaging.getToken({
        vapidKey: cfg.vapidKey,
        serviceWorkerRegistration: swReg,
      });

      if (!token) {
        setStatus($('sendResult'), 'No registration token returned. Try resetting site permissions.', 'error');
        return;
      }

      currentToken = token;
      $('fcmToken').textContent = token;
      $('btnCopyToken').disabled = false;
      setStatus($('sendResult'), '✅ Token obtained and registered with server.', 'success');

      // Register with backend so /api/send broadcasts can reach it
      await fetch('/api/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      refreshServerStatus();
    } catch (err) {
      console.error(err);
      setStatus($('sendResult'), `Error: ${err.message}`, 'error');
    }
  }

  // ---------- Sending ----------
  async function sendNotification(e) {
    e.preventDefault();
    const form = e.target;
    const target = form.target.value;
    const payload = {
      title: form.title.value.trim(),
      body: form.body.value.trim(),
      link: form.link.value.trim() || undefined,
      imageUrl: form.imageUrl.value.trim() || undefined,
    };

    if (target === 'self') {
      if (!currentToken) {
        setStatus($('sendResult'), 'No token yet. Click "Enable Notifications" first.', 'error');
        return;
      }
      payload.token = currentToken;
    } else if (target === 'broadcast') {
      // server uses its in-memory token store
    } else if (target === 'topic') {
      const t = form.topic.value.trim();
      if (!t) { setStatus($('sendResult'), 'Topic required.', 'error'); return; }
      payload.topic = t;
    } else if (target === 'custom') {
      const t = form.customToken.value.trim();
      if (!t) { setStatus($('sendResult'), 'Custom token required.', 'error'); return; }
      payload.token = t;
    }

    setStatus($('sendResult'), '📤 Sending…', 'info');
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus($('sendResult'), `❌ ${data.error || res.statusText}${data.hint ? ' — ' + data.hint : ''}`, 'error');
        return;
      }
      setStatus($('sendResult'), `✅ Sent! ${JSON.stringify(data)}`, 'success');
    } catch (err) {
      setStatus($('sendResult'), `Network error: ${err.message}`, 'error');
    }
  }

  // ---------- Server status ----------
  async function refreshServerStatus() {
    const el = $('serverStatus');
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      el.innerHTML = `
        <strong>Admin SDK initialized:</strong> ${data.adminInitialized ? '✅ yes' : '❌ no'}<br />
        <strong>Registered tokens:</strong> ${data.registeredTokens}<br />
        ${data.initError ? `<strong>Init error:</strong> <code>${data.initError}</code>` : ''}
      `;
    } catch (err) {
      el.textContent = `Could not reach server: ${err.message}`;
    }
  }

  // ---------- Wire up ----------
  document.addEventListener('DOMContentLoaded', () => {
    updatePermState();

    const cfg = loadConfig();
    if (cfg) {
      fillConfigForm(cfg);
      try {
        initFirebase(cfg);
        setStatus($('configStatus'), '✅ Configuration loaded from this browser.', 'success');
      } catch (err) {
        setStatus($('configStatus'), `Init failed: ${err.message}`, 'error');
      }
    }

    $('configForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = readConfigForm();
      const err = validateConfig(cfg);
      if (err) { setStatus($('configStatus'), err, 'error'); return; }
      saveConfig(cfg);
      try {
        initFirebase(cfg);
        setStatus($('configStatus'), '✅ Configuration saved. Now click "Enable Notifications".', 'success');
      } catch (e) {
        setStatus($('configStatus'), `Init failed: ${e.message}`, 'error');
      }
    });

    $('clearConfig').addEventListener('click', () => {
      clearConfig();
      $('configForm').reset();
      setStatus($('configStatus'), 'Configuration cleared.', 'info');
      $('btnEnable').disabled = true;
    });

    $('btnEnable').addEventListener('click', enableNotifications);

    $('btnCopyToken').addEventListener('click', async () => {
      if (!currentToken) return;
      await navigator.clipboard.writeText(currentToken);
      setStatus($('sendResult'), 'Token copied to clipboard.', 'success');
    });

    $('sendForm').addEventListener('submit', sendNotification);
    $('sendForm').target.addEventListener('change', (e) => {
      $('topicField').hidden = e.target.value !== 'topic';
      $('customField').hidden = e.target.value !== 'custom';
    });

    $('btnRefreshStatus').addEventListener('click', refreshServerStatus);
    refreshServerStatus();
  });
})();
