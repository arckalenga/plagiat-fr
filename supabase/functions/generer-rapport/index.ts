import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  genererRapportPremium,
  type PassageRapport,
  type SourceRapport,
} from "./rapport.ts";

const ORIGINES_AUTORISEES = new Set([
  "https://plagiat-fr.com",
  "https://www.plagiat-fr.com",
  "http://localhost:5173",
]);

function entetesCors(req: Request) {
  const origine = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINES_AUTORISEES.has(origine)
      ? origine
      : "https://plagiat-fr.com",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function reponseJson(req: Request, corps: unknown, statut = 200) {
  return Response.json(corps, {
    status: statut,
    headers: entetesCors(req),
  });
}

function convertirBase64(octets: Uint8Array) {
  const morceaux: string[] = [];
  const tailleMorceau = 0x8000;
  for (let index = 0; index < octets.length; index += tailleMorceau) {
    morceaux.push(
      String.fromCharCode(...octets.subarray(index, index + tailleMorceau)),
    );
  }
  return btoa(morceaux.join(""));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: entetesCors(req) });
  }

  if (req.method !== "POST") {
    return reponseJson(req, { erreur: "Méthode non autorisée." }, 405);
  }

  try {
    const token = req.headers.get("Authorization");
    if (!token) throw new Error("Authentification requise.");

    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: token } } },
    );

    const { analyse_id, fuseau_horaire } = await req.json();
    if (typeof analyse_id !== "string") {
      throw new Error("Identifiant d’analyse invalide.");
    }

    const { data: analyse, error } = await client
      .from("analyses")
      .select(
        "id, utilisateur_id, nom_fichier, cree_le, score_originalite, score_ia, sources",
      )
      .eq("id", analyse_id)
      .single();

    if (error || !analyse) throw new Error("Rapport inaccessible.");

    const [{ data: profil }, { data: passages, error: erreurPassages }] =
      await Promise.all([
        client
          .from("profils")
          .select("nom_complet,email")
          .eq("id", analyse.utilisateur_id)
          .single(),
        client
          .from("analyse_passages")
          .select("numero,contenu")
          .eq("analyse_id", analyse_id)
          .order("numero", { ascending: true }),
      ]);

    if (erreurPassages || !passages?.length) {
      throw new Error(
        "Le texte intégral du document n’est pas disponible pour ce rapport.",
      );
    }

    let fuseau = "UTC";
    if (typeof fuseau_horaire === "string") {
      try {
        new Intl.DateTimeFormat("fr-FR", {
          timeZone: fuseau_horaire,
        }).format();
        fuseau = fuseau_horaire;
      } catch {
        fuseau = "UTC";
      }
    }

    const dateSoumission = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: fuseau,
    }).format(new Date(analyse.cree_le));
    const sources = Array.isArray(analyse.sources)
      ? (analyse.sources as SourceRapport[])
      : [];
    const octets = await genererRapportPremium({
      analyseId: analyse.id,
      nomFichier: analyse.nom_fichier,
      nomUtilisateur: profil?.nom_complet ?? "Utilisateur",
      emailUtilisateur: profil?.email ?? null,
      dateSoumission,
      originalite:
        typeof analyse.score_originalite === "number"
          ? analyse.score_originalite
          : 0,
      scoreIA:
        typeof analyse.score_ia === "number" ? analyse.score_ia : null,
      sources,
      passages: passages as PassageRapport[],
    });

    return reponseJson(req, { pdf_base64: convertirBase64(octets) });
  } catch (cause) {
    return reponseJson(
      req,
      {
        erreur:
          cause instanceof Error
            ? cause.message
            : "La génération du rapport a échoué.",
      },
      400,
    );
  }
});
