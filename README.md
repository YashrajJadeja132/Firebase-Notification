# 🔔 Firebase Push Notifications — Complete Implementation

A full, working web push notification system using **Firebase Cloud Messaging (FCM)** with:

- ✅ In-browser onboarding wizard that walks you through every credential
- ✅ Frontend that subscribes to push, displays foreground and background notifications
- ✅ Node.js backend using `firebase-admin` to send to a single device, multiple devices, a topic, or broadcast to everyone
- ✅ Service worker for receiving notifications when the tab is closed
- ✅ Click-through routing (clicking a notification opens a URL)
- ✅ Topic subscribe/unsubscribe endpoints
- ✅ No credentials checked into git

## Quick start (TL;DR)

```bash
npm install
npm start
```

Then open **http://localhost:3000** and follow the on-page onboarding (steps 1–9).

## What you need from Firebase

You need **two sets of credentials** — one for the browser, one for the server:

| Where it's used | What it is | Where to get it |
|---|---|---|
| Browser (frontend) | `firebaseConfig` object (apiKey, authDomain, projectId, …) | Firebase Console → Project Settings → **General** → "Your apps" → Web app config |
| Browser (frontend) | **VAPID key** (web push public key) | Firebase Console → Project Settings → **Cloud Messaging** → Web Push certificates |
| Server (backend) | **Service Account JSON** | Firebase Console → Project Settings → **Service accounts** → Generate new private key |

Full step-by-step walkthrough with screenshots-equivalent prose: **[docs/SETUP.md](docs/SETUP.md)** and **[docs/CREDENTIALS.md](docs/CREDENTIALS.md)**.

## Project structure

```
push-notification/
├── public/                       # Static frontend (served by Express)
│   ├── index.html                # Onboarding + config + test UI
│   ├── app.js                    # Token registration, send UI
│   ├── style.css
│   ├── firebase-messaging-sw.js  # Service worker (MUST be at root, exact filename)
│   └── icon.svg
├── server/
│   ├── server.js                 # Express + firebase-admin
│   └── service-account.json      # ← YOU add this (gitignored)
├── docs/
│   ├── SETUP.md                  # Full onboarding guide
│   └── CREDENTIALS.md            # Reference for every credential
├── .env.example
├── .gitignore
└── package.json
```

## API reference (backend)

All endpoints accept/return JSON.

### `GET /api/status`
Health check. Returns `{ adminInitialized, registeredTokens, initError? }`.

### `POST /api/register-token`
Body: `{ "token": "<fcm-token>" }`. Stores token in the in-memory token set so it can be broadcast to.

### `POST /api/send`
Body:
```json
{
  "title": "Hello",
  "body": "World",
  "token": "<fcm-token>",         // OR
  "tokens": ["<t1>", "<t2>"],     // OR
  "topic": "news",                // OR omit all three to broadcast to /api/register-token list
  "link": "https://...",          // optional - URL to open on click
  "imageUrl": "https://...",      // optional
  "data": { "any": "json" }       // optional custom data
}
```

### `POST /api/subscribe-topic` / `POST /api/unsubscribe-topic`
Body: `{ "token": "...", "topic": "..." }`.

## Sending from your own code

```javascript
// Send to one device
await fetch('http://localhost:3000/api/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'DEVICE_FCM_TOKEN',
    title: 'Order shipped',
    body: 'Your order #1234 is on the way.',
    link: 'https://shop.example.com/orders/1234',
  }),
});
```

```javascript
// Broadcast to a topic
await fetch('http://localhost:3000/api/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    topic: 'news',
    title: 'Breaking news',
    body: 'Something happened!',
  }),
});
```

## Production checklist

- [ ] Serve over HTTPS (FCM only works on HTTPS or `localhost`).
- [ ] Replace the in-memory `tokenStore` with a real database (associate each token with a user).
- [ ] Handle token rotation — call `getToken()` regularly and update the server; delete invalid tokens when `/api/send` returns `messaging/registration-token-not-registered`.
- [ ] Keep `service-account.json` off disk in prod — use a secret manager and load JSON from env or Workload Identity.
- [ ] Add auth to `/api/send` so anyone with the URL can't spam your users.
- [ ] Add icon.png (192×192) and badge.png (96×96, monochrome) for nicer notifications.

## Troubleshooting

See the **Troubleshooting** section at the bottom of `http://localhost:3000` after you start the server, or open [docs/SETUP.md](docs/SETUP.md#troubleshooting).
