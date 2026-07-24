import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let analyseId: string | null = null;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const token = req.headers.get("Authorization");
    if (!token) throw new Error("Authentification requise");

    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: token } } },
    );
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Session invalide");

    const body = await req.json();
    analyseId = body.analyse_id;
    if (!analyseId) throw new Error("Identifiant d’analyse manquant");

    const { data: analyse } = await client.from("analyses").select("*").eq("id", analyseId).single();
    if (!analyse) throw new Error("Analyse introuvable");

    await admin.from("analyses").update({ statut: "traitement", erreur: null }).eq("id", analyseId);

    const endpoint = Deno.env.get("ANALYSIS_API_URL");
    const apiKey = Deno.env.get("ANALYSIS_API_KEY");
    if (!endpoint || !apiKey) throw new Error("Le service d’analyse n’est pas configuré");

    const { data: signed } = await admin.storage.from("documents").createSignedUrl(analyse.chemin_stockage, 300);
    if (!signed?.signedUrl) throw new Error("Le document ne peut pas être lu");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        document_url: signed.signedUrl,
        language: "fr",
        checks: ["plagiarism", "ai-writing"],
      }),
    });
    if (!response.ok) throw new Error("Le service d’analyse a refusé la demande");

    const result = await response.json();
    await admin.from("analyses").update({
      statut: "terminee",
      score_originalite: result.originality_score,
      score_ia: result.ai_score,
      resume_ia: result.ai_summary,
      sources: result.sources || [],
      terminee_le: new Date().toISOString(),
    }).eq("id", analyseId);

    return Response.json({ succes: true }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    if (analyseId) {
      await admin.from("analyses").update({
        statut: "erreur",
        erreur: message,
      }).eq("id", analyseId);
    }
    return Response.json({ erreur: message }, { status: 400, headers: cors });
  }
});
