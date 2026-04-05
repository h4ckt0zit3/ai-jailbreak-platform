const { OpenAI } = require('openai');

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

async function getChatResponse(systemPrompt, messages) {
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
    return response.choices[0].message.content;
  } catch (err) {
    console.error('Groq API error:', err.message);
    return "I'm SecureBot, your AI security guard! How can I help you today? 🔒";
  }
}

module.exports = { getChatResponse };
