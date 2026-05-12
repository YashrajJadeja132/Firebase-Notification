# Complete Firebase Push Notification Setup Guide

This is the canonical, end-to-end onboarding. Follow it once and you'll have working push notifications.

> The same content is rendered as an interactive wizard on the home page of the app (`http://localhost:3000`) — you can use whichever you prefer.

---

## Step 1 — Create a Firebase project

1. Go to **<https://console.firebase.google.com>** and sign in with a Google account.
2. Click **"Add project"** (or "Create a project").
3. Enter a project name. Example: `push-notification-demo`.
4. **Google Analytics**: not required for FCM. You can disable it now and skip the analytics-account step. If you enable it, just pick the default account.
5. Wait ~30 seconds while Firebase provisions the project, then click **Continue**.

You should now be on the project dashboard.

---

## Step 2 — Register a Web App

> This creates the `firebaseConfig` object the browser SDK needs.

1. From the project dashboard, look for **"Get started by adding Firebase to your app"** and click the **`</>`** icon (the Web platform).
   - If you don't see it, click the **⚙️ gear icon → Project settings**, scroll to **"Your apps"**, and click **`</>`**.
2. **App nickname**: anything, e.g., `push-demo-web`.
3. **Firebase Hosting**: leave **unchecked** unless you intend to deploy here.
4. Click **Register app**.
5. You'll see a snippet like:

   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyABC...",
     authDomain: "push-notification-demo.firebaseapp.com",
     projectId: "push-notification-demo",
     storageBucket: "push-notification-demo.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123def456"
   };
   ```

6. **Copy these 6 values.** You'll paste them into the onboarding form (Step 7 on the home page).
7. Click **Continue to console**.

If you ever lose the snippet: ⚙️ → Project settings → **General** tab → scroll to **"Your apps"** → expand the web app → **SDK setup and configuration** → "Config" radio button.

---

## Step 3 — Get the VAPID (Web Push) Key

> The VAPID key is the public part of an asymmetric key pair the browser uses to verify push messages came from your server.

1. Still in **Project settings**, click the **Cloud Messaging** tab.
2. Scroll to **"Web configuration"** → **"Web Push certificates"**.
3. If the list is empty, click **"Generate key pair"**.
4. You'll see a key starting with `B…`, roughly **88 characters** long.
5. Click the copy icon next to it. Save it for the onboarding form.

> ⚠️ The VAPID key is **public** — it's safe to ship in your frontend code. Don't confuse it with the private server key.

---

## Step 4 — Generate the Service Account JSON (server credentials)

> This is what `firebase-admin` on your backend uses to authenticate as your project.

1. **Project settings** → **Service accounts** tab.
2. The default service account is selected. Click **"Generate new private key"**.
3. A confirmation dialog appears warning you to keep the key safe. Click **"Generate key"**.
4. A JSON file downloads. It looks like:

   ```json
   {
     "type": "service_account",
     "project_id": "push-notification-demo",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "firebase-adminsdk-xxxxx@push-notification-demo.iam.gserviceaccount.com",
     ...
   }
   ```

5. **Rename** the file to `service-account.json`.
6. **Move** it to `server/service-account.json` in this project.

> ⚠️ **Treat this file like a password.** Anyone with it can send notifications as your project (and access other Firebase services). It's already in `.gitignore` — never commit it.

### Production alternative
Instead of a JSON file on disk, set the env var `GOOGLE_APPLICATION_CREDENTIALS` to the path, or load the JSON from a secret manager (AWS Secrets Manager, GCP Secret Manager, Doppler, etc.) and pass it as an object to `admin.credential.cert(...)`.

---

## Step 5 — (Conditional) Enable the Cloud Messaging API V1

Newer Firebase projects have this enabled automatically. **If `/api/send` returns a 403 or "API has not been used"** error:

1. Open **<https://console.cloud.google.com/apis/library/fcm.googleapis.com>**.
2. Use the project picker in the top bar to select your Firebase project.
3. Click **Enable**.
4. Wait ~1 minute for propagation, then retry.

---

## Step 6 — Install and start the server

From this project's folder:

```bash
npm install
npm start
```

You should see:

```
[firebase-admin] Initialized for project: push-notification-demo
Push notification server running at http://localhost:3000
```

If you see `[firebase-admin] NOT initialized`, the server can't find `server/service-account.json` — go back to Step 4.

---

## Step 7 — Paste your config in the browser

1. Open **<http://localhost:3000>**.
2. Scroll to **"Step 7 — Paste Your Firebase Web Config"**.
3. Fill in each field with the values from Step 2 + Step 3:
   - `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`
   - `vapidKey` (from Step 3)
4. Click **💾 Save Configuration**.

Your config is stored in `localStorage` only. To reset, click **Clear** or use DevTools → Application → Local Storage.

---

## Step 8 — Grant permission and get a token

1. Click **🔔 Enable Notifications**.
2. The browser will prompt for permission. Click **Allow**.
3. Behind the scenes:
   - The service worker `firebase-messaging-sw.js` is registered.
   - Your Firebase config is posted to the service worker (it stores it in IndexedDB).
   - `messaging.getToken(...)` returns a long FCM registration token.
   - The token is POSTed to `/api/register-token` on the server so broadcasts can reach it.
4. The token appears under "FCM Token". Click **📋 Copy Token** if you want it.

> If the button says permission is **denied**, click the 🔒 lock icon in the address bar → Site settings → reset Notifications → reload.

---

## Step 9 — Send a test notification

1. Scroll to **"Step 9 — Send a Test Notification"**.
2. Fill in title and body. Optionally add a click URL and image.
3. Choose a target:
   - **This device** — uses the token from Step 8.
   - **All registered tokens** — every device that hit `/api/register-token` since the server started.
   - **Topic** — needs at least one device subscribed (you can subscribe via `POST /api/subscribe-topic`).
   - **Custom token** — paste any FCM token (e.g., from another phone/browser).
4. Click **📤 Send Notification**.

To see the **system notification**, switch to another tab or minimize the browser before clicking send. In the foreground, the page logs the payload and uses the Web Notifications API directly.

---

## Troubleshooting

### `messaging/unsupported-browser`
FCM needs **HTTPS** or `localhost`, Service Workers, and the Push API.
- Safari supports web push from version **16.4+** on iOS and macOS.
- Private/incognito windows often disable service workers.

### `Permission denied` and you can't get the prompt back
The browser remembers your "Block" decision.
- **Chrome / Edge**: click the lock icon → Site settings → Notifications: "Reset" or "Allow".
- **Firefox**: click the lock icon → Connection secure → More information → Permissions → Receive Notifications: clear.

### `messaging/registration-token-not-registered` when sending
The token expired or was deleted. On the client, call `getToken()` again. On the server, delete that token from your store.

### `messaging/invalid-argument` or 400 errors
- Confirm the VAPID key matches the Firebase project the server is using.
- Confirm the project ID in `service-account.json` matches the `projectId` in your web config.
- A token from project A cannot be sent to from project B.

### 403 / `SERVICE_DISABLED` / `Cloud Messaging API has not been used`
Go back to **Step 5** and enable the API.

### Service worker not found (404 on `/firebase-messaging-sw.js`)
- File must be at the **site root** (`/firebase-messaging-sw.js`, not `/js/...`).
- Filename must match exactly.
- In dev, hard-refresh the page (Ctrl+Shift+R) to bust the SW cache.

### Notifications work in the foreground but not background
- Check DevTools → Application → Service Workers. The SW should be "activated and running".
- Check the SW console for `[sw] Background message:` logs.
- Make sure you sent the message with a top-level `notification` field (the Admin SDK code in `server.js` does this).

### My phone shows the notification, my desktop doesn't (or vice versa)
Each browser/device has its own FCM token. Subscribe each one separately.

---

## Next steps

- **Persist tokens**: swap the in-memory `tokenStore` in `server.js` for a database. Save user_id ↔ token mapping.
- **Authenticate `/api/send`**: require an API key or signed JWT so only your services can send.
- **Topics**: a topic is a logical channel. Subscribe a user to `news`, `orders`, `user_<id>`, etc., and send to the topic instead of looking up tokens.
- **Analytics**: enable Firebase Analytics events to track notification opens (`fcm_options.analytics_label`).
- **Rich notifications**: actions (buttons), inline replies, custom layouts — see the [Web Notifications spec](https://developer.mozilla.org/en-US/docs/Web/API/Notification).
