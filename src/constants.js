export const PROVIDERS = Object.freeze({
  openai: Object.freeze({
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    transcriptionModel: 'whisper-1',
    notesModel: 'gpt-4o-mini',
    supportsTranscription: true,
    supportsNotes: true,
    requiresApiKey: true
  }),
  groq: Object.freeze({
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    transcriptionModel: 'whisper-large-v3-turbo',
    notesModel: 'llama-3.3-70b-versatile',
    supportsTranscription: true,
    supportsNotes: true,
    requiresApiKey: true
  }),
  openrouter: Object.freeze({
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    transcriptionModel: '',
    notesModel: 'openrouter/free',
    supportsTranscription: false,
    supportsNotes: true,
    requiresApiKey: true
  }),
  custom: Object.freeze({
    name: 'Custom OpenAI-compatible',
    baseUrl: '',
    transcriptionModel: '',
    notesModel: '',
    supportsTranscription: true,
    supportsNotes: true,
    requiresApiKey: false
  })
});

export const DEFAULT_TRANSCRIPTION_PROVIDER = 'openai';
export const DEFAULT_NOTES_PROVIDER = 'openai';
export const DEFAULT_CHUNK_DURATION = 180;
export const ALLOWED_CHUNK_DURATIONS = [60, 120, 180, 300];

export function getProvider(providerId) {
  return PROVIDERS[providerId] || null;
}

export function joinApiUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(path || '').replace(/^\/+/, '')}`;
}
