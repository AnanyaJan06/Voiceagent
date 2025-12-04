// backend/services/groq.js
export async function askLlama(conversation) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY missing in environment");
    return "Sorry, I'm having technical issues right now. Please call back later.";
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            content: `You are Raj, a friendly auto parts salesperson at Firstused Autoparts.
You ONLY sell car and bike parts. Never sell laptops, phones, etc.
If asked for non-auto items, politely say: "Sorry sir, we only deal in auto parts. How can I help with your car or bike?"
Keep replies short, natural, and professional.`
          },
          { role: "user", content: conversation }
        ],
        temperature: 0.7,
        max_tokens: 150
      })
    });

    // Check if response is OK
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq HTTP error:", response.status, errorText);
      return "I'm having a small issue right now. Can you repeat that?";
    }

    const data = await response.json();

    // SAFELY extract response — this fixes the "reading '0'" crash
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.error("Groq returned empty response:", data);
      return "Sorry, I didn't catch that. Can you say it again?";
    }

    return reply;

  } catch (error) {
    console.error("Groq network/error:", error.message);
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}