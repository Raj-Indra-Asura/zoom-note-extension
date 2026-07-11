# Lecture Note Agent

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Microsoft%20Edge](https://img.shields.io/badge/Edge-supported-success)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

Lecture Note Agent captures audio from a browser tab, transcribes it, and generates downloadable Markdown notes. Transcription and note generation are configured separately, so you can combine providers—for example, Groq for transcription and OpenRouter for notes—or use a compatible local server.

> [!IMPORTANT]
> No provider can be guaranteed to remain free. Free credits, model availability, quotas, and terms change. Check the provider's current pricing before use. The extension never purchases a subscription, but a provider can charge the account connected to your key.

## Features

- Chrome and Microsoft Edge Manifest V3 support
- OpenAI and Groq transcription
- OpenAI, Groq, and OpenRouter note generation
- Custom OpenAI-compatible HTTPS or local endpoints
- Independent provider, model, endpoint, and API-key settings
- Chunked tab-audio recording and persisted session state
- Markdown transcript and notes downloads
- No analytics, advertising, backend, or runtime npm dependencies

## Beginner quick start

### 1. Download the project

Choose one method:

- **No Git:** open the repository on GitHub, select **Code > Download ZIP**, and extract the ZIP.
- **With Git:** run `git clone https://github.com/Raj-Indra-Asura/zoom-note-extension.git`.

The folder containing `manifest.json` is the extension folder.

### 2. Optional developer checks

The checked-in icons are ready to use, so Node.js is not required merely to load the extension. To validate or modify it, install [Node.js 20 or newer](https://nodejs.org/), open a terminal in the extension folder, and run:

```bash
npm install
npm run check
```

### 3. Load it in Chrome

1. Enter `chrome://extensions` in Chrome's address bar.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Select the extension folder—the folder containing `manifest.json`, not its parent.
5. Open the puzzle-piece menu and pin **Lecture Note Agent**.

### 4. Load it in Microsoft Edge

1. Enter `edge://extensions` in Edge's address bar.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Select the extension folder containing `manifest.json`.
5. Open the Extensions menu and pin **Lecture Note Agent**.

### 5. Configure providers

Open the extension popup and configure both sections:

1. Choose an **Audio transcription** provider, model, and key.
2. Choose a **Note generation** provider, model, and key.
3. Select **Save providers**.
4. If using a custom endpoint, approve the browser's request to access that endpoint.

The two providers may be different. A practical low-cost starting configuration is Groq transcription plus OpenRouter note generation. You can also use Groq for both and paste the same Groq key into both key fields.

### 6. Record a test

1. Open a normal web tab that is playing speech.
2. Open the extension and choose a chunk duration.
3. Read and check the consent box.
4. Select **Start recording**.
5. After a short test, select **Stop & generate**.
6. Wait for **Complete**, then download the notes and transcript.

Only audio from the selected browser tab is captured. Internal pages such as `chrome://extensions` cannot be captured.

## Provider setup

| Provider | Transcription | Notes | Default models | Key |
|---|---:|---:|---|---|
| OpenAI | Yes | Yes | `whisper-1`, `gpt-4o-mini` | [Create an OpenAI key](https://platform.openai.com/api-keys) |
| Groq | Yes | Yes | `whisper-large-v3-turbo`, `llama-3.3-70b-versatile` | [Create a Groq key](https://console.groq.com/keys) |
| OpenRouter | No | Yes | `openrouter/free` | [Create an OpenRouter key](https://openrouter.ai/settings/keys) |
| Custom OpenAI-compatible | Depends on server | Depends on server | You enter both model names | Server-specific |

OpenRouter is a note-generation provider in this extension; it does not expose the audio transcription endpoint used by the recording pipeline. Pair it with OpenAI, Groq, or a compatible transcription server.

Provider model catalogs change. If a default model is retired or unavailable to your account, enter a currently supported model ID from that provider.

### Custom or local servers

Select **Custom OpenAI-compatible** separately for transcription and/or notes. Enter the base URL ending at the API version, not the operation:

- Correct: `https://example-provider.test/v1`
- Correct for a local server: `http://localhost:8000/v1`
- Incorrect: `https://example-provider.test/v1/chat/completions`

The server must implement the OpenAI-compatible paths used by the selected capability:

- `POST {base URL}/audio/transcriptions`
- `POST {base URL}/chat/completions`

Remote custom endpoints must use HTTPS. HTTP is accepted only for `localhost` or `127.0.0.1`. A key is optional for custom endpoints. The browser asks for host permission when you save a custom URL.

## Stored data and key safety

Provider settings and keys are stored in `chrome.storage.local` in the current browser profile. They are not synced by this extension. Anyone with access to your browser profile or extension debugging tools may be able to extract them.

- Use low-privilege keys with spending limits where supported.
- Select **Remove keys** to erase saved provider keys.
- Select **Clear session** to erase the current notes, transcript, and session state.
- For a public production service, route provider requests through a secured backend instead of distributing shared keys in the extension.

## Build a store-upload ZIP

The extension has no compile step. Create a ZIP whose root contains `manifest.json`, `src/`, `icons/`, and the policy files. Do not wrap these files in another folder.

From the repository root on macOS or Linux:

```bash
npm run check
zip -r lecture-note-agent.zip manifest.json src icons LICENSE PRIVACY.md SECURITY.md README.md
```

On Windows, select those files and folders in File Explorer, right-click, choose **Compress to ZIP file**, and verify that opening the ZIP shows `manifest.json` at the top level.

Before every upload:

1. Run `npm run check`.
2. Complete the tests in [`CHECKLIST.md`](CHECKLIST.md) in both browsers.
3. Increase `version` in `manifest.json` for an update.
4. Review provider permissions, privacy disclosures, screenshots, and listing text.

## Publish to the Chrome Web Store

Loading an unpacked extension installs it only for you. Store publication makes it available to other Chrome users.

1. Create and verify a developer account in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/). Google may require a registration payment and identity verification.
2. Build the ZIP described above.
3. Select **New item** and upload the ZIP.
4. Complete the store listing: description, category, language, icon, screenshots, and support information.
5. Complete **Privacy practices** accurately:
   - tab audio is captured only after user action;
   - audio is sent to the selected transcription provider;
   - transcript text is sent to the selected note provider;
   - keys and generated files are stored locally;
   - there is no analytics or advertising.
6. Explain why each permission is required using the list in [`SECURITY.md`](SECURITY.md).
7. Provide a publicly accessible privacy-policy URL containing the content of [`PRIVACY.md`](PRIVACY.md). A repository file URL may not satisfy every store or jurisdiction; host a normal HTTPS page when required.
8. Choose visibility and distribution regions, then submit for review.
9. After approval, install the store version in a clean Chrome profile and repeat the manual checklist.

For updates, upload a new ZIP with a higher manifest version. Never upload keys, recordings, generated notes, `node_modules`, or `.git`.

## Publish to Microsoft Edge Add-ons

1. Register and verify a developer account in [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview).
2. Create a new Microsoft Edge extension submission and reserve its name if prompted.
3. Upload the same validated ZIP.
4. Complete properties, availability, age rating, store listing, screenshots, support details, and privacy disclosures.
5. Describe permissions and provider data flows using [`SECURITY.md`](SECURITY.md) and [`PRIVACY.md`](PRIVACY.md).
6. Submit for certification and respond to any reviewer questions.
7. After publication, install the Add-ons version in a clean Edge profile and repeat [`CHECKLIST.md`](CHECKLIST.md).

For updates, increment the manifest version and create a new submission package. Dashboard labels and requirements can change; follow the current instructions shown in each official portal.

## Architecture

```text
popup settings + controls
          |
          v
Manifest V3 service worker ----> transcription provider
          |                              |
          |                              v
          |                         transcript text
          |                              |
          +------------------------------+----> note provider
          |
          +---- offscreen MediaRecorder <---- active tab audio
          |
          +---- chrome.storage.local + downloads
```

- `src/popup.js` stores provider settings and renders workflow state.
- `src/service_worker.js` freezes settings when recording starts, calls OpenAI-compatible APIs, and creates downloads.
- `src/offscreen.js` captures and chunks tab audio only.
- `src/constants.js` contains provider defaults.

See [`DEVELOPER.md`](DEVELOPER.md) for internal contracts.

## Troubleshooting

- **Start is disabled:** save valid settings for both providers, then check the consent box.
- **Invalid or missing key:** create a key for the provider selected in that section; keys are not interchangeable.
- **Model not found:** copy a current model ID from the selected provider's model catalog.
- **OpenRouter transcription error:** OpenRouter is supported for notes, not transcription.
- **Custom connection denied:** save again and approve host access; ensure the URL is HTTPS or local HTTP.
- **No speech detected:** make sure the captured tab is audible and the transcription model accepts WebM audio.
- **401/403:** verify the correct key, provider, account permissions, and endpoint.
- **402/quota/rate-limit error:** check the provider dashboard; free allocation may be exhausted.
- **Protected page error:** record from a normal HTTP/HTTPS page, not a browser settings page.
- **Changes do not appear:** select **Reload** for the unpacked extension on the browser's extensions page.
- **Popup closed during recording:** reopen it; session state is persisted.

## Limitations

- Provider API compatibility, free quotas, and model availability are controlled by each provider.
- A custom server must expose compatible transcription and/or chat-completion endpoints.
- The extension does not diarize speakers or sync across devices.
- Long sessions can consume provider quotas and significant local memory.
- Direct client-side keys are suitable for personal use and prototypes, not a shared production secret.

## No affiliation disclaimer

This project is not affiliated with or endorsed by Zoom, OpenAI, Groq, OpenRouter, Microsoft, Google, or any lecture platform.

## License

Released under the [MIT License](LICENSE).
