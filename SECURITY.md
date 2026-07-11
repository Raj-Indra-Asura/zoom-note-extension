# Security Notes

## Client-side API key risk

This extension stores and uses provider API keys in the browser. That is convenient for personal use and development, but keys may be extractable by someone with local access to the browser profile or extension environment. Use low-privilege keys and provider spending limits where available.

## Production recommendation

For production deployments, replace direct OpenAI API usage with a backend proxy that:

- keeps provider secrets off the client,
- enforces authentication and authorization,
- rate-limits traffic,
- logs abuse and failures centrally, and
- returns only scoped results to the extension.

## Permission scope

The extension requests only the permissions needed for this workflow:

- `tabCapture` for browser-tab audio capture
- `activeTab` to identify the active lecture tab
- `storage` for local settings and session persistence
- `downloads` to save transcript and notes
- `offscreen` to host media capture and recording logic
- `https://api.openai.com/*`, `https://api.groq.com/*`, and `https://openrouter.ai/*` for built-in provider requests
- Optional HTTPS or localhost host access, requested only when the user saves a custom provider endpoint

Remote custom providers must use HTTPS. Plain HTTP is limited to `localhost` and `127.0.0.1`.

## Responsible disclosure

Please report suspected security issues to the project maintainer before public disclosure.
