# Vault Recovery Upon Password Loss

## Feature ID: FEAT-0001
**Status**: Planned  

## Objective
To provide a secure secondary recovery mechanism (recovery key) for users who created their vault using a password, allowing them to decrypt the vault, reset, or create a new password if their original password is lost.

## Background & Requirements
- In case the user has created the vault using a password, the app should provide a way to recover the vault using a recovery key. 
- The recovery key should be generated when the vault is created. 
- The recovery key should be stored in a secure location. 
- The recovery key should be used to decrypt the vault. 
- The recovery key should be used to reset the password. 
- The recovery key should be used to create a new password.

## Detailed Implementation Breakdown
### 1. Recovery Key Generation
- On vault creation or upon a dedicated "Enable Recovery" process, cryptographically generate a secure, high-entropy recovery key (e.g., a mnemonic seed phrase or a strong random alphanumeric string).
- Ensure the key is not stored locally anywhere except explicitly exported by the user.
- Provide a UI for the user to copy or download this key safely (e.g., printing instructions or downloading a safe text file).

### 2. Encryption Strategy
- Modify the existing age encryption wrapper so the vault's master decrypt key can be unlocked by EITHER the user's password OR the recovery key.
- This might involve splitting keys or having multiple key slots that decrypt the vault master key.

### 3. Recovery Flow UI
- On the vault unlock screen, add an "I forgot my password / Use Recovery Key" alternate flow.
- Construct a dedicated UI module that securely inputs the recovery key without storing it.
- Upon successful validation and vault unlock with the recovery key, immediately prompt the user into a compulsory "Set New Password" flow.
- Ensure the vault metadata is updated with the latest password while retaining the same master decryption data.

## Acceptance Criteria
- [ ] User is presented with a recovery key upon vault creation.
- [ ] Vault can be unlocked using the recovery key when the password is lost.
- [ ] User is prompted to set a new password upon unlocking with the recovery key.
- [ ] Previous password no longer works, and the new password unlocks the vault perfectly.

## Dependencies & Considerations
- Cryptographic library implementation (e.g., `rage-wasm` key slot handling).
- Requires careful thought around local storage and persistence during the recovery window.
