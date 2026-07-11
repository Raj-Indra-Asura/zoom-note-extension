# Lecture Note Agent

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Microsoft%20Edge](https://img.shields.io/badge/Edge-supported-success)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

Lecture Note Agent is a Chrome and Microsoft Edge Manifest V3 extension that captures audio from the active browser tab, transcribes it with the OpenAI API, and generates structured Markdown lecture notes.

## Features

- Browser-tab audio capture for web-based lectures and conferences
- Chunked recording for longer sessions
- OpenAI Whisper transcription pipeline
- Structured Markdown note generation with Chat Completions
- Automatic transcript and notes downloads
- Session persistence in `chrome.storage.local`
- Re-download notes or transcript after closing and reopening the popup
- Consent gate before recording starts
- Compatible with unpacked installs in Chrome and Edge

## Architecture

```text
+-------------+        runtime messages        +-------------------+
| popup.html  | <----------------------------> | service_worker.js |
| popup.js    |                                | state + API calls |
+------+------+                                +----+--------------+
       | storage.local updates                      |
       v                                            | runtime messages
+------+-------------------------------+            v
| chrome.storage.local                 |    +-------+--------+
| settings + sessionState + artifacts  |    | offscreen.html |
+--------------------------------------+    | offscreen.js   |
                                            | MediaRecorder  |
                                            +-------+--------+
                                                    |
                                                    v
                                             OpenAI API + Downloads
```

## Prerequisites

- Google Chrome or Microsoft Edge (current Chromium-based release)
- Node.js 20+ for local validation
- An OpenAI API key with billing enabled
- A browser-tab-based lecture source with audible audio

## Chrome installation

1. Clone or download this repository.
2. Run `npm install`.
3. Run `npm run generate-icons`.
4. Open Chrome and go to `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the repository root folder.
8. Pin **Lecture Note Agent** from the extensions toolbar if desired.

## Edge installation

1. Clone or download this repository.
2. Run `npm install`.
3. Run `npm run generate-icons`.
4. Open Edge and go to `edge://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the repository root folder.
8. Pin **Lecture Note Agent** to the toolbar if desired.

## Usage walkthrough

1. Open your lecture or meeting in a normal browser tab.
2. Open the extension popup.
3. Paste your OpenAI API key and click **Save key**.
4. Choose a chunk duration.
5. Check the consent box.
6. Click **Start recording**.
7. Approve tab-audio capture if the browser prompts you.
8. Leave the lecture tab open while recording.
9. Click **Stop & generate** when finished.
10. Wait for transcription and note generation.
11. Download or re-download the transcript and notes from the popup.

## API key setup

- Create an API key from your OpenAI account.
- Ensure billing is enabled before recording.
- Paste the key into the popup and click **Save key**.
- The key is stored in `chrome.storage.local` on the current browser profile only.

> [!WARNING]
> This project stores an API key client-side for demo and development use. Anyone with access to your browser profile or extension storage may be able to extract it. Do not use a high-privilege production key in this architecture.

## Configuration

- **Chunk duration:** 60, 120, 180, or 300 seconds
- **Default chunk duration:** 180 seconds
- **Transcription model:** `whisper-1`
- **Note generation model:** `gpt-4o-mini`
- **Storage:** `chrome.storage.local`

## Troubleshooting

1. **Start button is disabled** — save an API key, check the consent box, and ensure the extension is idle.
2. **Protected page error** — browser internal pages such as `chrome://` and `edge://` cannot be captured.
3. **No active tab found** — focus the lecture tab and reopen the popup.
4. **No audio in transcript** — confirm the lecture tab is actually playing audio.
5. **Browser prompts never appear** — retry from a standard HTTPS tab and ensure extension permissions are enabled.
6. **Recording stops unexpectedly** — the active lecture tab may have closed or navigated away.
7. **Notes generation fails** — verify API key validity, billing, and network access to `api.openai.com`.
8. **Transcript download missing** — wait for the session to reach the **complete** state, then click **Download transcript**.
9. **Popup closed mid-session** — reopen it; state is restored from storage.
10. **Lint or tests fail locally** — use Node.js 20+ and rerun `npm install`.
11. **Offscreen document errors** — reload the unpacked extension and try again.
12. **Large sessions feel slow** — shorter chunk durations reduce final waiting time after stop.

## Limitations

- This is a client-side demo architecture.
- Browser tab capture only works on compatible Chromium tabs.
- Very long recordings may create large API usage costs.
- Accuracy depends on audio quality, speaker overlap, and background noise.
- The extension does not diarize speakers.
- The extension does not sync across devices.

## Production backend migration guidance

For production use, move API access to a backend service:

1. Replace direct OpenAI calls in `src/service_worker.js` with requests to your backend.
2. Keep the browser extension keyless.
3. Issue short-lived user/session tokens from your backend.
4. Add server-side rate limiting, logging, and abuse controls.
5. Store generated artifacts on trusted infrastructure instead of local extension storage.

## Privacy note

The extension captures only the active tab's audio when you explicitly start recording. Audio and prompts are sent to OpenAI for transcription and note generation. No analytics or third-party telemetry are included.

## No affiliation disclaimer

This project is not affiliated with or endorsed by Zoom, OpenAI, Microsoft, Google, or any lecture platform.

## License

Released under the [MIT License](LICENSE).
