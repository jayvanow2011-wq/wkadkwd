import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYS = `You are a Windows automation assistant for an authorized remote-admin agent.
The user controls their own machine via the agent and asks you to write a script to run.
Output ONLY a single PowerShell script that accomplishes the request — no markdown fences,
no commentary, no explanation. Keep it short, safe (no destructive recursive deletes on
system drives without explicit ask), and self-contained. Prefer built-in Windows cmdlets.`;

export const aiGenerateScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; lang?: "powershell" | "cmd" }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS + (data.lang === "cmd" ? "\nUse Windows CMD batch, not PowerShell." : "") },
          { role: "user", content: data.prompt },
        ],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`AI gateway: ${resp.status} ${t.slice(0, 200)}`);
    }
    const j: any = await resp.json();
    const script = j?.choices?.[0]?.message?.content?.trim() ?? "";
    // Strip code fences if model emitted any
    const cleaned = script
      .replace(/^```(?:powershell|ps1|bat|cmd|batch)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return { script: cleaned, lang: data.lang ?? "powershell" };
  });
