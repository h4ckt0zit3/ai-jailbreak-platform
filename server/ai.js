const { OpenAI } = require('openai');

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
  timeout: 15000,           // 15s timeout per request
  maxRetries: 0,            // We handle retries ourselves
});

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000; // 1s, 2s, 4s backoff

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getChatResponse(systemPrompt, messages) {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 500,
        temperature: 0.7,
      });
      const content = response?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');
      return content;
    } catch (err) {
      lastError = err;
      const isRateLimit = err.status === 429;
      const isServerError = err.status >= 500;

      if (isRateLimit || isServerError) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`Groq API ${isRateLimit ? 'rate-limited' : 'server error'} (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      // Non-retryable error
      break;
    }
  }

  console.error('Groq API error after retries:', lastError?.message || 'Unknown error');
  throw new Error('AI_UNAVAILABLE');
}

module.exports = { getChatResponse };
