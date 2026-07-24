import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

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

function couperTexte(texte: string, font: PDFFont, taille: number, largeur: number) {
  const lignes: string[] = [];
  let ligne = "";

  for (const mot of texte.replace(/\s+/g, " ").trim().split(" ")) {
    const candidate = ligne ? `${ligne} ${mot}` : mot;
    if (font.widthOfTextAtSize(candidate, taille) <= largeur) {
      ligne = candidate;
    } else {
      if (ligne) lignes.push(ligne);
      ligne = mot;
    }
  }

  if (ligne) lignes.push(ligne);
  return lignes;
}

function dessinerLignes(
  page: PDFPage,
  lignes: string[],
  x: number,
  y: number,
  font: PDFFont,
  taille: number,
  couleur = rgb(0.15, 0.15, 0.15),
) {
  lignes.forEach((ligne, index) => {
    page.drawText(ligne, {
      x,
      y: y - index * (taille + 4),
      size: taille,
      font,
      color: couleur,
    });
  });
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
        "id, utilisateur_id, nom_fichier, cree_le, score_originalite, score_ia, resume_ia, sources",
      )
      .eq("id", analyse_id)
      .single();

    if (error || !analyse) throw new Error("Rapport inaccessible.");

    const { data: profil } = await client
      .from("profils")
      .select("nom_complet,email")
      .eq("id", analyse.utilisateur_id)
      .single();

    let fuseau = "UTC";
    if (typeof fuseau_horaire === "string") {
      try {
        new Intl.DateTimeFormat("fr-FR", { timeZone: fuseau_horaire }).format();
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
    const originalite = analyse.score_originalite ?? 0;
    const plagiat = 100 - originalite;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
    const vert = rgb(0.07, 0.22, 0.16);
    const gris = rgb(0.38, 0.38, 0.38);

    page.drawRectangle({ x: 0, y: 750, width: 595, height: 92, color: vert });
    page.drawText("PLAGIAT-FR", {
      x: 42,
      y: 790,
      size: 22,
      font: gras,
      color: rgb(1, 1, 1),
    });
    page.drawText("Rapport de plagiat et de similarite", {
      x: 42,
      y: 768,
      size: 11,
      font,
      color: rgb(0.8, 0.9, 0.84),
    });

    const titre = couperTexte(analyse.nom_fichier, gras, 18, 511).slice(0, 2);
    dessinerLignes(page, titre, 42, 700, gras, 18, vert);

    page.drawText("DOCUMENT SOUMIS PAR", {
      x: 42,
      y: 650,
      size: 10,
      font: gras,
      color: gris,
    });
    page.drawText(profil?.nom_complet ?? "Utilisateur", {
      x: 42,
      y: 630,
      size: 12,
      font: gras,
      color: vert,
    });
    if (profil?.email) {
      page.drawText(profil.email, {
        x: 42,
        y: 614,
        size: 9,
        font,
        color: gris,
      });
    }

    page.drawText("DATE ET HEURE DE SOUMISSION", {
      x: 320,
      y: 650,
      size: 10,
      font: gras,
      color: gris,
    });
    dessinerLignes(
      page,
      couperTexte(dateSoumission, gras, 11, 233).slice(0, 2),
      320,
      630,
      gras,
      11,
      vert,
    );

    page.drawText("TAUX DE PLAGIAT DETECTE", {
      x: 42,
      y: 565,
      size: 10,
      font: gras,
      color: gris,
    });
    page.drawText(`${plagiat} %`, {
      x: 42,
      y: 520,
      size: 36,
      font: gras,
      color: rgb(0.72, 0.08, 0.08),
    });

    page.drawText("INDICE D'ORIGINALITE INTERNE", {
      x: 320,
      y: 565,
      size: 10,
      font: gras,
      color: gris,
    });
    page.drawText(`${originalite} %`, {
      x: 320,
      y: 520,
      size: 36,
      font: gras,
      color: vert,
    });

    page.drawText("INDICATEUR DE REDACTION IA", {
      x: 42,
      y: 490,
      size: 9,
      font: gras,
      color: gris,
    });
    const resultatIA =
      typeof analyse.score_ia === "number"
        ? `${Math.round(analyse.score_ia)} % de probabilite estimee`
        : "Resultat indetermine ou non demande";
    page.drawText(resultatIA, {
      x: 320,
      y: 490,
      size: 9,
      font: gras,
      color: vert,
    });

    page.drawLine({
      start: { x: 42, y: 468 },
      end: { x: 553, y: 468 },
      thickness: 1,
      color: rgb(0.86, 0.86, 0.84),
    });

    page.drawText("REFERENCES SIMILAIRES DETECTEES", {
      x: 42,
      y: 438,
      size: 11,
      font: gras,
      color: vert,
    });

    const sources = Array.isArray(analyse.sources) ? analyse.sources.slice(0, 5) : [];
    let y = 408;
    if (sources.length === 0) {
      page.drawText("Aucune similitude significative dans la bibliotheque interne.", {
        x: 42,
        y,
        size: 10,
        font,
        color: gris,
      });
    } else {
      for (const source of sources) {
        const titreSource =
          typeof source?.titre === "string" ? source.titre : "Reference interne";
        const similarite =
          typeof source?.similarite === "number" ? source.similarite : 0;
        const lignes = couperTexte(
          `${titreSource} - ${similarite} % similaire`,
          gras,
          10,
          511,
        ).slice(0, 2);
        dessinerLignes(page, lignes, 42, y, gras, 10, vert);
        y -= lignes.length * 14 + 16;
      }
    }

    page.drawText(
      "Comparaison limitee aux documents presents dans la bibliotheque Plagiat-FR.",
      { x: 42, y: 105, size: 9, font, color: gris },
    );
    page.drawText(`Identifiant : ${analyse.id}`, {
      x: 42,
      y: 76,
      size: 8,
      font,
      color: gris,
    });

    const octets = await pdf.save();
    let binaire = "";
    for (const octet of octets) binaire += String.fromCharCode(octet);

    return reponseJson(req, { pdf_base64: btoa(binaire) });
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
