// backend/services/groq.js
export async function askLlama(prompt) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY not set");
    return "Sorry, I am having technical issues right now.";
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content: `You are a helpful, friendly auto parts salesperson at Firstused Autoparts. 
            Be natural, short, and professional. Always ask one question at a time.
            Current conversation context: user is looking for a car part.`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 150
      })
    });

    const data = await res.json();
    return data.choices[0].message.content.trim();
  } catch (e) {
    console.error("Groq error:", e.message);
    return "I'm having trouble thinking right now. Please try again.";
  }
}