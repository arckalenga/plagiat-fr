import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Passage = { contenu?: unknown };

function selectionnerTexteIA(passages: Passage[]) {
  const contenus = passages
    .map((passage) =>
      typeof passage?.contenu === "string" ? passage.contenu.trim() : "",
    )
    .filter(Boolean);
  if (contenus.length <= 8) return contenus.join("\n\n").slice(0, 60_000);

  const positions = new Set(
    Array.from({ length: 8 }, (_, index) =>
      Math.round((index * (contenus.length - 1)) / 7),
    ),
  );
  return [...positions]
    .sort((a, b) => a - b)
    .map((index) => contenus[index])
    .join("\n\n")
    .slice(0, 60_000);
}

async function detecterRedactionIA(passages: Passage[]) {
  const url = Deno.env.get("DETECTEUR_IA_URL");
  const cle = Deno.env.get("DETECTEUR_IA_API_KEY");
  if (!url || !cle) {
    return {
      score: null,
      resume:
        "Le détecteur de rédaction IA n’est pas encore configuré sur ce projet.",
    };
  }

  const texte = selectionnerTexteIA(passages);
  if (texte.split(/\s+/).length < 120) {
    return {
      score: null,
      resume:
        "Texte trop court pour produire un indicateur de rédaction IA.",
    };
  }

  try {
    const racine = url.replace(/\/$/, "");
    const lancement = await fetch(`${racine}/gradio_api/call/detecter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: [texte, cle] }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!lancement.ok) {
      throw new Error(`Détecteur indisponible (${lancement.status})`);
    }
    const evenement = await lancement.json();
    if (typeof evenement.event_id !== "string") {
      throw new Error("Réponse invalide du détecteur");
    }

    const reponse = await fetch(
      `${racine}/gradio_api/call/detecter/${evenement.event_id}`,
      { signal: AbortSignal.timeout(120_000) },
    );
    if (!reponse.ok) {
      throw new Error(`Détecteur indisponible (${reponse.status})`);
    }
    const flux = await reponse.text();
    const ligne = flux
      .split("\n")
      .find((valeur) => valeur.startsWith("data: "));
    if (!ligne) throw new Error("Résultat absent du détecteur");
    const donnees = JSON.parse(ligne.slice(6));
    const resultat = Array.isArray(donnees) ? donnees[0] : null;
    if (!resultat || typeof resultat !== "object") {
      throw new Error("Résultat invalide du détecteur");
    }
    const score =
      typeof resultat.probabilite_ia === "number" &&
      resultat.probabilite_ia >= 0 &&
      resultat.probabilite_ia <= 100
        ? Math.round(resultat.probabilite_ia)
        : null;
    if (resultat.abstention || score === null) {
      return {
        score: null,
        resume:
          typeof resultat.raison === "string"
            ? resultat.raison
            : "Le détecteur de rédaction IA n’a pas pu établir un indicateur fiable.",
      };
    }

    const confiance =
      typeof resultat.confiance === "number"
        ? ` Confiance technique : ${Math.round(resultat.confiance)} %.`
        : "";
    return {
      score,
      resume: `Probabilité estimée de rédaction assistée par IA : ${score} %.${confiance} Ce résultat doit être interprété humainement.`,
    };
  } catch {
    return {
      score: null,
      resume:
        "Le détecteur de rédaction IA est momentanément indisponible. L’analyse de plagiat reste valide.",
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let analyseId: string | null = null;
  let relanceIA = false;
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
    relanceIA = body.relancer_detection_ia === true;
    if (!analyseId) throw new Error("Identifiant d’analyse invalide");

    const { data: analyse } = await client.from("analyses").select("id").eq("id", analyseId).single();
    if (!analyse) throw new Error("Analyse introuvable");

    if (relanceIA) {
      const { data: passagesEnregistres, error: erreurPassages } = await client
        .from("analyse_passages")
        .select("contenu")
        .eq("analyse_id", analyseId)
        .order("numero", { ascending: true });
      if (erreurPassages || !passagesEnregistres?.length) {
        throw new Error("Aucun texte exploitable n’est disponible pour cette analyse");
      }

      const resultatIA = await detecterRedactionIA(passagesEnregistres);
      await admin
        .from("analyses")
        .update({
          score_ia: resultatIA.score,
          resume_ia: resultatIA.resume,
        })
        .eq("id", analyseId);

      return Response.json(
        { succes: true, detection_ia: resultatIA },
        { headers: cors },
      );
    }

    const passages = body.passages;
    if (!Array.isArray(passages) || passages.length === 0) {
      throw new Error("Le document ne contient aucun passage exploitable");
    }

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

    const resultatIA =
      body.activer_detection_ia === true
        ? await detecterRedactionIA(passages)
        : {
            score: null,
            resume:
              "La détection de rédaction IA n’a pas été demandée.",
          };
    await admin
      .from("analyses")
      .update({
        score_ia: resultatIA.score,
        resume_ia: resultatIA.resume,
      })
      .eq("id", analyseId);

    return Response.json(
      { succes: true, resultat, detection_ia: resultatIA },
      { headers: cors },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    if (analyseId && !relanceIA) {
      await admin
        .from("analyses")
        .update({ statut: "erreur", erreur: message })
        .eq("id", analyseId);
    }
    return Response.json({ erreur: message }, { status: 400, headers: cors });
  }
});
