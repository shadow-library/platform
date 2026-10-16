// The smoke measures the OpenRouter leg it spends on, which only the legacy backend calls directly, and bootstrap loads that leg's keys
// only when the backend it reads at import is legacy.
process.env['AI_BACKEND'] = 'legacy';
