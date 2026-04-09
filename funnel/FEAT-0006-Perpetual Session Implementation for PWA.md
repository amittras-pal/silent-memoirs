# Perpetual Session Implementation for PWA

## Feature ID: FEAT-0006
**Status**: Planned  

## Objective
To achieve a "perpetual session" experience without the complexity of a backend. Leverage Google Identity Services (GIS) invisible promptless checks to silently renew access tokens.

## Background & Requirements
- The app currently limits the session based on the standard `google_access_token` which naturally expires after 1 hour due to Google OAuth's token lifetime policy for implicit flows. The artificial 55-minute auto-logout was removed.
- **Proposed Mechanism for True Perpetual Session (Backend-less)**:
  - Because this is a serverless application, standard OAuth `refresh_token` flows (which require a Client Secret) cannot be securely implemented client-side.
  - We can migrate to Google Identity Services (GIS) `initTokenClient` configured with `prompt: ''` (Promptless Auth). This leverages an invisible iframe and Google's session cookies to silently refresh the access token without user interaction before the 1-hour expiration hits. 
  - If third-party cookies block silent refresh, the fallback involves elegantly intercepting `UnauthorizedError`s during sync, stalling the sync operation, opening the Google pop-up for the user to re-grant access with one click, and transparently resuming the sync operation so that the user never loses context or unsaved changes.

## Detailed Implementation Breakdown
### 1. Token Refresh Timer Engine
- Set a global timeout (e.g., 45-50 minutes) after establishing the initial `google_access_token`. 
- Have this service implicitly fire a payload using GIS `initTokenClient` with `prompt: ''`. 
- If Google detects the cached cookie/session in the browser context, it silently responds with a fresh token. Update the Redux/Context layer accordingly. 

### 2. Synchronization Error Interceptor (Fallback Mechanism)
- For every Google Drive request in the sync cycle, parse the response. 
- If a `401 Unauthorized` happens dynamically (due to sleep mode missing the timer or third-party cookie blocking):
  - Pause the sync execution promise queue. 
  - Pop up an urgent modal detailing "Google Auth Expired. Please reconnect."
  - Invoke `initTokenClient` requesting active authentication interaction. 
  - Ensure the active journal edit is fully cached locally so the context isn't lost on redirect or reload. 
  - Once returned, re-try the failed sync request immediately.

### 3. Edge Case Mitigation
- Account for users explicitly signing out of Google from a different tab. 
- Consider multi-tab sync implications.

## Acceptance Criteria
- [ ] User leaving app idle for > 1 hour will not face a harsh logout if silent refresh is possible. 
- [ ] Forced 401 triggers an elegant reconnect module rather than data loss. 
- [ ] Sync operations reliably resume from where they failed. 

## Dependencies & Considerations
- Google Identity Services (GIS).
- Heavily relies on browser specifics regarding third-party cookie handling and ITP (Intelligent Tracking Prevention in Safari/iOS). 
