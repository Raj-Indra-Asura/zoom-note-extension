# Privacy Policy

## What data is captured

Lecture Note Agent captures audio from the active browser tab only after you click **Start recording** and grant the required browser permission.

## Where data is sent

Recorded audio chunks are sent to the transcription provider you select. The resulting transcript and note-generation prompt are sent to the note provider you select. Built-in providers are OpenAI, Groq, and OpenRouter; a user-configured OpenAI-compatible endpoint may also be used.

## What is stored locally

The extension stores the following in `chrome.storage.local`:

- Selected providers, models, base URLs, and provider API keys
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

This project includes no analytics, advertising SDKs, or external telemetry. Network requests are limited to the provider endpoints selected by the user for transcription and note generation.

## Affiliation statement

This project is not affiliated with Zoom, OpenAI, Groq, OpenRouter, Microsoft, or Google.
