// Proxies chat messages to an LLM so the API key never reaches the browser.
// Also relays the finished conversation to n8n as a "chat" source enquiry.

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

      const systemPrompt =
        "You are a friendly intake assistant for Marlow & Finch, a UK recruitment agency, chatting with a website visitor. " +
        "Ask short, natural follow-up questions, one at a time, to understand: what role/hire they need, location, budget, urgency, " +
        "and — before you finish — their NAME and an email address or phone number so a consultant can reach them. " +
        "Do not close the conversation until you have at least a name and one contact method, even if that takes a couple of extra questions. " +
        "Once you have enough to log the enquiry, thank them, confirm a consultant will follow up, and end your final message with the exact tag [ENQUIRY_COMPLETE] on its own at the very end (this tag will be stripped before the visitor sees it, so phrase the rest of the message as a normal, complete closing line).";

      // Free-tier model via OpenRouter — keeps this endpoint cost-free even if the
      // public URL is ever hit outside the demo, since it carries no paid Claude usage.
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemma-4-26b-a4b-it:free",
          max_tokens: 300,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
      });

      const data = await orRes.json();
      const rawReply = data?.choices?.[0]?.message?.content ?? "Sorry, something went wrong — a consultant will follow up by email.";

      const complete = rawReply.includes("[ENQUIRY_COMPLETE]");
      const reply = rawReply.replace("[ENQUIRY_COMPLETE]", "").trim();

      return new Response(JSON.stringify({ reply, complete }), {
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }

    if (url.pathname === "/submit" && request.method === "POST") {
      const { raw_text, name } = await request.json();

      await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "chat", raw_text, name: name || "" }),
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
