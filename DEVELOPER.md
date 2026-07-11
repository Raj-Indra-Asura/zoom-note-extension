# Developer Guide

## Message contracts

| Direction | Message | Payload | Notes |
|---|---|---|---|
| popup -> service worker | `GET_STATE` | none | Returns current `sessionState` |
| popup -> service worker | `START_RECORDING` | none | Valid only from `idle` |
| popup -> service worker | `STOP_RECORDING` | none | Flushes final chunk |
| popup -> service worker | `CANCEL_RECORDING` | none | Discards current session |
| popup -> service worker | `DOWNLOAD_NOTES` | none | Re-downloads saved notes |
| popup -> service worker | `DOWNLOAD_TRANSCRIPT` | none | Re-downloads saved transcript |
| popup -> service worker | `CLEAR_SESSION` | none | Clears stored session artifacts |
| service worker -> offscreen | `OFFSCREEN_START` | `streamId`, `tabTitle`, `chunkDuration` | Starts MediaRecorder |
| service worker -> offscreen | `OFFSCREEN_STOP` | none | Stops and flushes last chunk |
| service worker -> offscreen | `OFFSCREEN_CANCEL` | none | Discards media data |
| offscreen -> service worker | `OFFSCREEN_READY` | none | Signals offscreen availability |
| offscreen -> service worker | `OFFSCREEN_CHUNK_READY` | `blob`, `chunkIndex`, `startTime` | Base64 audio chunk for transcription |
| offscreen -> service worker | `OFFSCREEN_DONE` | none | All chunks emitted |
| offscreen -> service worker | `OFFSCREEN_ERROR` | `message` | Fatal offscreen failure |

## State machine

```text
idle -> starting -> recording -> stopping -> transcribing -> generating -> complete
  ^         |           |             |              |              |
  |         +---------> error <-------+--------------+--------------+
  +----------------------------- clear/cancel ----------------------+
```

States: `idle | starting | recording | stopping | transcribing | generating | complete | error`

## Providers, models, and endpoints

Built-in provider defaults live in `src/constants.js`. Transcription and note generation have independent settings. API calls use OpenAI-compatible `/audio/transcriptions` and `/chat/completions` paths.

To add a built-in provider:

1. Add its capability flags, base URL, default models, and key requirement to `PROVIDERS`.
2. Add the provider to the appropriate popup selector.
3. Add its origin to `host_permissions` and `connect-src`.
4. Add validation coverage and update the README provider table.

Custom remote endpoints require HTTPS and request optional host access from the save-button user gesture. Local HTTP is limited to `localhost` and `127.0.0.1`.

## Chunk duration defaults

- Default value: `DEFAULT_CHUNK_DURATION` in `src/constants.js`
- Allowed values: `ALLOWED_CHUNK_DURATIONS` in `src/constants.js`
- Popup selector options live in `src/popup.html`

## Architecture

- `src/popup.js` manages user interaction and renders persisted state.
- `src/service_worker.js` owns the workflow, state persistence, provider calls, downloads, and tab interruption handling.
- `src/offscreen.js` only manages media capture, chunk rotation, and chunk serialization.
- `chrome.storage.local` is the persistence layer for settings, session state, and generated artifacts.

## Adding features

1. Extend the message contract first.
2. Add or update state transitions in `src/service_worker.js`.
3. Update popup rendering and controls in `src/popup.html`, `src/popup.css`, and `src/popup.js`.
4. Keep offscreen logic focused on media only.
5. Add validation or Jest coverage for any new pure logic.
