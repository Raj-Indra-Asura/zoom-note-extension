# Security Notes

## Client-side API key risk

This extension stores and uses an OpenAI API key in the browser. That is convenient for development, but it also means the key may be extractable by someone with local access to your browser profile or extension environment. Treat this architecture as a demo or internal prototype.

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
- `https://api.openai.com/*` host access for API requests

## Responsible disclosure

Please report suspected security issues to the project maintainer before public disclosure.
