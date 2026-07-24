import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let analyseId: string | null = null;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const token = req.headers.get("Authorization");
    if (!token) throw new Error("Authentification requise");
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: token } },
    });
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Session invalide");

    const body = await req.json();
    analyseId = body.analyse_id;
    const passages = body.passages;
    if (!analyseId || !Array.isArray(passages) || passages.length === 0) {
      throw new Error("Le document ne contient aucun passage exploitable");
    }

    const { data: analyse } = await client.from("analyses").select("id").eq("id", analyseId).single();
    if (!analyse) throw new Error("Analyse introuvable");
    await admin.from("analyses").update({ statut: "traitement", erreur: null }).eq("id", analyseId);

    const { error: erreurIndexation } = await client.rpc("indexer_analyse_interne", {
      p_analyse_id: analyseId,
      p_passages: passages,
    });
    if (erreurIndexation) throw new Error(erreurIndexation.message);

    const { data: resultat, error: erreurComparaison } = await client.rpc("comparer_analyse_interne", {
      p_analyse_id: analyseId,
    });
    if (erreurComparaison) throw new Error(erreurComparaison.message);

    return Response.json({ succes: true, resultat }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    if (analyseId) await admin.from("analyses").update({ statut: "erreur", erreur: message }).eq("id", analyseId);
    return Response.json({ erreur: message }, { status: 400, headers: cors });
  }
});
