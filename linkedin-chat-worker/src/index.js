// Proxies chat messages to Claude so the API key never reaches the browser.
// Also relays the finished conversation to n8n as a normal "linkedin" source enquiry.

const ALLOWED_ORIGIN = "https://rawanmohamed1.github.io";
const N8N_WEBHOOK_URL = "https://bigmind.trevorsadd.co.uk/webhook/1562e4c6-cc21-4635-810a-3f77e8641648"; // reuse existing intake webhook

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === "/chat" && request.method === "POST") {
      const { messages } = await request.json();

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 300,
          system:
            "You are a friendly intake assistant for Marlow & Finch, a UK recruitment agency, chatting with someone on a LinkedIn-style DM widget. " +
            "Ask short, natural follow-up questions to understand what role/hire they need, location, budget, and urgency — one question at a time, max 4 exchanges. " +
            "Once you have enough to log an enquiry, say a brief closing line thanking them and confirming a consultant will follow up.",
          messages,
        }),
      });

      const data = await claudeRes.json();
      const reply = data?.content?.[0]?.text ?? "Sorry, something went wrong — a consultant will follow up by email.";

      return new Response(JSON.stringify({ reply }), {
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }

    if (url.pathname === "/submit" && request.method === "POST") {
      const { raw_text, name } = await request.json();

      await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "linkedin", raw_text, name: name || "" }),
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
