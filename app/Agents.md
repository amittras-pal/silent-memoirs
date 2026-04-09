# Silent Memoirs - Agent & Developer Onboarding Guide

Welcome to the **Silent Memoirs** (Secure Journal) repository. This document serves as the primary context map for AI agents (Gemini, Copilot, etc.) and human developers joining the project. 

It explicitly outlines the architectural constraints, technologies, and cryptographic workflows of the application. **Agents should read this document first before proposing any changes.**

---

## 1. Project Philosophy & Constraints

Silent Memoirs is a strictly **Local-First, Bring Your Own Storage (BYOS), Privacy-Preserving PWA**.
There is **no backend, no database, and no server-side logic**. The application acts merely as a stateless client-side engine that encrypts markdown text and blindly syncs encrypted blobs to the user's personal cloud storage.

**Core Directives for Agents:**
1. **Data Sovereignty:** The user owns their keys. The app must never hold the only key to the data. The encryption format (`age`) must remain standard so the user can decrypt their `.age` files locally using CLI tools if the app disappears.
2. **Statelessness:** Never assume local state is permanent. The source of truth is always the remote Google Drive `silent-memoirs/` folder.
3. **No Backends:** Do not propose adding Firebase Firestore, Supabase, AWS, or any API routes. The only remote connection is to the Google Drive API.

---

## 2. Technology Stack

- **Framework:** React + TypeScript + Vite
- **UI Library:** Mantine UI (`@mantine/core`, `@mantine/dates`)
- **Editor:** `@uiw/react-md-editor`
- **Cloud Provider:** Google Drive API (`@react-oauth/google`)
- **Cryptography:** `@kanru/rage-wasm` (Rust-based `age` encryption compiled to WASM), Web Crypto API (PBKDF2)
- **Authentication:** WebAuthn (specifically the PRF extension)

---

## 3. Cryptography & Vault Architecture

The Vault is designed to seamlessly derive encryption keys without storing them.

### Data Structures
1. **Age Identity (`currentIdentity`):** The primary X25519 keypair for the vault.
   - `publicKey`: Starts with `age1...`.
   - `secretKey`: Starts with `AGE-SECRET-KEY-...` (This is the **Recovery Key**).
2. `vault_pub.txt`: A plaintext file stored in Google Drive containing the `publicKey`.
3. `vault_key.age`: An encrypted file stored in Google Drive containing the `secretKey`.

### The "Keyring" Unlocking Process
To unlock the vault, the app needs to decrypt the `vault_key.age` to get the `secretKey`. It does this by deriving a symmetric wrapping key from the user's hardware:
- **Primary Method (WebAuthn PRF):** Generates a deterministic 32-byte salt from the user's hardware authenticator (FaceID, Windows Hello, YubiKey).
- **Fallback Method (Password):** If the browser/OS does not support the WebAuthn PRF extension, it falls back to driving a key using the Web Crypto API `PBKDF2` algorithm and a manual password.

The wrapping key (derived from PRF or Password) surrounds the underlying `secretKey` via standard `age` passphrase encryption.

---

## 4. Storage & Sync Engine

### Google Drive Integration (`storage.ts`)
- Uses OAuth 2.0 with the `https://www.googleapis.com/auth/drive.file` scope.
- **Namespacing:** The `GoogleDriveStorage` class automatically prepends `silent-memoirs/` to all API requests. *Never manually prepend this folder in component logic.*
- **Session Persistence:** The `access_token` is cached to `localStorage` in `AuthWall.tsx` to survive page reloads. 401 Unauthorized errors trigger a global app state reset, forcing a clean re-login.

### The Sync Engine (`sync.ts`)
- **Index (`metadata.json.age`):** An encrypted JSON map of UUIDs to timestamps/metadata. This file prevents the app from needing to download every single entry to construct the sidebar.
- **Entries (`YYYY/UUID.age`):** Individual journal entries are encrypted as separate `.age` blobs and structured nicely in year-based subdirectories within Google Drive.
- **Tombstoning:** Deleting an entry does not instantly wipe it remote; it flags it as `tombstoned` in the metadata index first to handle conflict resolution across multiple devices.

---

## 5. Development Conventions

1. **Routing:** We are heavily leveraging React conditional rendering (`activeEntryId`, `storage`, `vaultManager`). There is no complex router setup like `react-router-dom` yet. Keep navigation state simple.
2. **Alerts & Toasts:** Mantine UI is strictly enforced for components. Avoid standard `window.alert` where possible.
3. **Handling Asynchronous WASM:** Be incredibly careful when invoking `@kanru/rage-wasm` methods. Passphrases are `string`, but inputs/outputs must mapped correctly via `TextEncoder`/`TextDecoder`. 
4. **WASM Destructuring Trap:** The `keygen()` function from the `age` WASM package returns the tuple `[SecretKey, PublicKey]` in that exact order. *Do not swap them accidentally.*

---

## 6. Development workflow. 

- After every major change, run `npm run build` to ensure the application is still buildable.

## 7. Onboarding & Setup

To boot this project locally:

1. Create a `secure-journal/.env` file.
2. Add your Google OAuth Client ID:
   ```env
   VITE_GOOGLE_CLIENT_ID="<your-google-oauth-client-id>"
   ```
   *(Ensure your Google Cloud Console has `http://localhost:5173` added to Authorized JavaScript origins).*
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```
