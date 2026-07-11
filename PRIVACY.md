# Privacy Policy

## What data is captured

Lecture Note Agent captures audio from the active browser tab only after you click **Start recording** and grant the required browser permission.

## Where data is sent

Recorded audio chunks, transcript prompts, and note-generation prompts are sent to the OpenAI API at `https://api.openai.com`.

## What is stored locally

The extension stores the following in `chrome.storage.local`:

- Your OpenAI API key
- Chunk duration preference
- Session state metadata
- Generated transcript content
- Generated note content
- Suggested download filenames

## How to remove data

- Use the **Clear Session** button to remove the current transcript, notes, and session metadata.
- Remove the saved API key with the **Remove key** button.
- Advanced removal: open the extension's storage tools and run `chrome.storage.local.clear()` from the extension context if you want to clear all extension data.

## Retention policy

Data remains stored locally until you remove it, clear browser extension storage, or uninstall the extension. The extension does not implement remote retention because it has no backend.

## Analytics and telemetry

This project includes no analytics, no advertising SDKs, and no external telemetry beyond the direct OpenAI API requests required for transcription and note generation.

## Affiliation statement

This project is not affiliated with Zoom, OpenAI, Microsoft, or Google.
