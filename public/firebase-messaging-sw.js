/*
 * Firebase Cloud Messaging Service Worker
 * Receives push notifications while the page is closed / backgrounded.
 *
 * This file MUST be served from the site root with this exact filename:
 *   https://your-domain/firebase-messaging-sw.js
 * Firebase looks it up by convention.
 */

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// The page posts the config to us after the user saves it. We keep it in
// IndexedDB so we still have it on cold starts when the page isn't open.
const DB_NAME = 'fcm-sw-config';
const STORE = 'config';

function idb(mode) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result.transaction(STORE, mode).objectStore(STORE));
    req.onerror = () => reject(req.error);
  });
}
async function dbGet(key) {
  const store = await idb('readonly');
  return new Promise((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbSet(key, value) {
  const store = await idb('readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(value, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    await dbSet('config', event.data.config);
    initIfReady();
  }
});

let initialized = false;
async function initIfReady() {
  if (initialized) return;
  const cfg = await dbGet('config');
  if (!cfg) return;
  firebase.initializeApp(cfg);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[sw] Background message:', payload);
    const title = (payload.notification && payload.notification.title) || 'Notification';
    const options = {
      body: (payload.notification && payload.notification.body) || '',
      icon: (payload.notification && payload.notification.icon) || '/icon.png',
      badge: '/badge.png',
      data: {
        click_action:
          (payload.fcmOptions && payload.fcmOptions.link) ||
          (payload.data && payload.data.click_action) ||
          '/',
      },
    };
    if (payload.notification && payload.notification.image) {
      options.image = payload.notification.image;
    }
    return self.registration.showNotification(title, options);
  });

  initialized = true;
  console.log('[sw] Firebase messaging initialized');
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.click_action) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.endsWith(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(initIfReady));
});

// Try to init right away in case config was previously stored
initIfReady();
