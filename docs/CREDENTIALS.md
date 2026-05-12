# Firebase Credentials — Reference

A flat list of every credential this project uses, where it lives, and where to get it.

| # | Credential | Type | Used by | Where to get it | Sensitive? |
|---|---|---|---|---|---|
| 1 | `apiKey` | string | Browser | Firebase Console → ⚙️ → Project settings → **General** → Your apps → Web app → Config | Public (rate-limited by HTTP referrer) |
| 2 | `authDomain` | string | Browser | Same place as #1 | Public |
| 3 | `projectId` | string | Browser + Server | Same place as #1, **and** inside `service-account.json` as `project_id` | Public |
| 4 | `storageBucket` | string | Browser | Same place as #1 | Public |
| 5 | `messagingSenderId` | string | Browser | Same place as #1 | Public |
| 6 | `appId` | string | Browser | Same place as #1 | Public |
| 7 | **VAPID key** | string | Browser | Project settings → **Cloud Messaging** → Web Push certificates → **Generate key pair** | Public |
| 8 | **Service Account JSON** | file | Server | Project settings → **Service accounts** → **Generate new private key** | 🔒 **SECRET** |

## What each credential does

### 1–6: `firebaseConfig` (Web SDK config)
Identifies your Firebase project to the JavaScript SDK and tells it which APIs are enabled. Despite containing an `apiKey`, this is **not** a secret — it's similar to a public client ID. Restrict access by setting **HTTP referrers** in Google Cloud Console → APIs & Services → Credentials.

### 7: VAPID Key
Public key half of a [VAPID](https://datatracker.ietf.org/doc/html/rfc8292) key pair. The browser passes it to the push service so push messages can be authenticated as coming from your origin. Always public.

### 8: Service Account JSON
A private RSA key bundled with metadata, granting the holder permission to act as the Firebase Admin service account. **This must stay secret.** Anyone with the file can:

- Send notifications as your project
- Read/write Firestore, RTDB, Storage, etc.
- Generate custom auth tokens

Protections this project applies:
- File path is `server/service-account.json` (gitignored)
- `.env` and `service-account.json` are in `.gitignore`
- In production, prefer loading it from a secret manager rather than disk

## Where each credential is configured in this project

| Credential | Configured at |
|---|---|
| 1–7 (web config + VAPID) | Onboarding form on `http://localhost:3000` → saved to browser `localStorage` |
| 8 (service account) | File at `server/service-account.json`, or set `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env` |

## If you commit a service account by accident

1. **Immediately** revoke it: Project settings → Service accounts → click the service account → **"Manage all service accounts"** (opens Google Cloud Console) → find the key under the account → **Delete**.
2. Generate a new key (Step 4 in `SETUP.md`).
3. Rewrite git history to remove the file: `git filter-repo --invert-paths --path server/service-account.json` (or use BFG Repo-Cleaner).
4. Force-push and tell anyone who cloned the repo to re-clone.

> Treat a leaked service account like a leaked database password. It's not "just" notification access — the same key authenticates to other Firebase services.

## Visual cheat sheet — Firebase Console paths

```
Firebase Console (console.firebase.google.com)
└── <Your project>
    └── ⚙️ Project settings
        ├── General tab
        │   └── "Your apps" section
        │       └── Web app config  →  apiKey, authDomain, projectId,
        │                              storageBucket, messagingSenderId, appId
        │
        ├── Cloud Messaging tab
        │   └── "Web configuration"
        │       └── "Web Push certificates"  →  VAPID key
        │
        └── Service accounts tab
            └── "Generate new private key"  →  service-account.json
```
