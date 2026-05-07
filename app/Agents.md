# Silent Memoirs - Agent & Developer Onboarding Guide

Welcome to the Silent Memoirs repository. This file is the primary context map for AI agents and human developers. Read this before proposing or implementing changes.

The app is a local-first encrypted journal client. There is no backend.

---

## 1. Repository Layout (Root-Level Contract)

Treat each root directory with strict boundaries:

- `app/`: The actual product code (React + TypeScript + Vite). All implementation work for the running app happens here.
- `funnel/`: Product and feature planning docs. This is reference material, not executable app logic.
- `Notes/`: Developer scratch pad. Ignore this for architecture decisions, production implementation, and code review unless explicitly asked.

Important:
- Do not wire app behavior to `Notes/`.
- Do not treat `funnel/` docs as guaranteed implementation truth. Verify against `app/src`.

---

## 2. Command Discipline (Critical)

All app-related terminal commands must run inside `app/`.

From repo root, always use:

```bash
cd app
npm install
npm run dev
npm run build
npm run lint
```

Do not run npm, Vite, lint, or build commands from the repository root.

---

## 3. Project Philosophy & Constraints

Silent Memoirs is strictly local-first, BYOS, and privacy-preserving.

Core directives:
1. Data sovereignty: users own keys and encrypted data.
2. Standard crypto portability: encrypted files must remain decryptable with standard `age` tooling.
3. No backend: no database, API routes, or server-side business logic.
4. Stateless mindset: remote Google Drive content under `silent-memoirs/` is the source of truth.

---

## 4. Technology Stack

- Framework: React + TypeScript + Vite
- UI: Mantine (`@mantine/core`, `@mantine/dates`, `@mantine/hooks`)
- Routing: `react-router-dom` (BrowserRouter)
- Editor: `@uiw/react-md-editor`
- Cloud storage: Google Drive API via OAuth (`@react-oauth/google`)
- Crypto: `@kanru/rage-wasm` (`age`) + Web Crypto API (PBKDF2 fallback)
- PWA: `vite-plugin-pwa` (`registerType: autoUpdate`)

---

## 5. Routing Model (Current)

Routing is now URL-driven using `react-router-dom`, not only conditional rendering.

- Route constants are centralized in `src/lib/routes.ts`.
- App routes:
  - `/login`
  - `/unlock`
  - `/editor`
  - `/entries`
  - `/viewer`
- Query params:
  - `?e=` stores encoded entry path for editor/viewer routes.
  - `?dir=` stores encoded directory path for entries explorer route.
- Use helpers from `src/lib/routes.ts` (`buildEditorRoute`, `buildViewerRoute`, `buildEntriesRoute`) rather than hand-building URLs.
- Unknown routes redirect to `/editor`.

Guard behavior:
- No storage session -> redirect to `/login`.
- Storage exists but vault locked -> redirect to `/unlock`.
- Protected routes require both storage and unlocked vault.

---

## 6. Vault & Cryptography

Vault identity is an X25519 `age` identity:

- `publicKey`: `age1...`
- `secretKey`: `AGE-SECRET-KEY-...` (recovery key shown to the user)

Remote files in Drive:
- `vault_pub.txt`: plaintext public key
- `vault_key.age`: secret key wrapped with passphrase encryption

Unlock flow:
- Primary: password-derived key via PBKDF2 (`SHA-256`, 600000 iterations).
- Fallback: recovery key (raw age secret key).

Critical WASM note:
- `keygen()` returns `[SecretKey, PublicKey]` in that order.

---

## 7. Storage & Sync Engine (Current Behavior)

Google Drive storage (`src/lib/storage.ts`):
- Uses scope `https://www.googleapis.com/auth/drive.file`.
- Automatically namespaces all paths under `silent-memoirs/`.
- Caches OAuth token in localStorage key `google_access_token`.
- 401 responses should trigger logout/reset flow.

Sync engine (`src/lib/sync.ts`):
- Index file is `manifest.age` (encrypted JSON manifest).
- Entry files follow `YYYY/YYYY-MM-DD_HH-mm.age`.
- Directory explorer is manifest-driven (`EntryDirectory` + `EntryMetadata`).
- If manifest is missing, the app rebuilds it by scanning year folders.
- Current delete behavior is hard delete + manifest rewrite (no tombstone workflow at this time).

---

## 8. Session & Security Behavior

- Vault auto-locks after 10 minutes of inactivity.
- Warning modal appears in the final 30 seconds before auto-lock.
- Visibility return checks can immediately lock if timeout elapsed while backgrounded.

---

## 9. Development Conventions

1. Keep using Mantine components as the UI baseline.
2. Keep route and query handling centralized in `src/lib/routes.ts`.
3. Be careful with WASM input/output types (`TextEncoder` / `TextDecoder` where needed).
4. Never manually prepend `silent-memoirs/` in component/business logic.
5. After major changes, run `npm run build` from `app/`.

---

## 10. Local Setup

1. Move into the app directory:
   ```bash
   cd app
   ```
2. Create `app/.env`:
   ```env
   VITE_GOOGLE_CLIENT_ID="<your-google-oauth-client-id>"
   ```
3. Ensure `http://localhost:5173` is in Google OAuth authorized JavaScript origins.
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
