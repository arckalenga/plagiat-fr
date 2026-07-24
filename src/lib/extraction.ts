import * as mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type PassageIndexe = {
  numero: number;
  contenu: string;
  contenu_normalise: string;
};

export function normaliserTexte(texte: string) {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decouperTexte(texte: string, motsParPassage = 180, chevauchement = 35): PassageIndexe[] {
  const propre = texte
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  const mots = propre.split(" ").filter(Boolean);
  if (mots.length < 20) return [];

  const passages: PassageIndexe[] = [];
  const pas = Math.max(1, motsParPassage - chevauchement);
  for (let debut = 0; debut < mots.length; debut += pas) {
    const contenu = mots.slice(debut, debut + motsParPassage).join(" ").trim();
    if (contenu.length < 80) break;
    passages.push({
      numero: passages.length,
      contenu,
      contenu_normalise: normaliserTexte(contenu),
    });
  }
  return passages;
}

async function extrairePdf(donnees: ArrayBuffer) {
  const pdf = await getDocument({ data: new Uint8Array(donnees) }).promise;
  const pages: string[] = [];
  for (let numero = 1; numero <= pdf.numPages; numero += 1) {
    const page = await pdf.getPage(numero);
    const contenu = await page.getTextContent();
    pages.push(
      contenu.items
        .map(item => "str" in item ? item.str : "")
        .filter(Boolean)
        .join(" "),
    );
  }
  await pdf.destroy();
  return pages.join("\n\n");
}

export async function extraireTexte(fichier: File) {
  const donnees = await fichier.arrayBuffer();
  if (fichier.type === "application/pdf") return extrairePdf(donnees);
  if (fichier.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const resultat = await mammoth.extractRawText({ arrayBuffer: donnees });
    return resultat.value;
  }
  throw new Error("Format de document non pris en charge.");
}

export async function preparerPassages(fichier: File) {
  const texte = await extraireTexte(fichier);
  const passages = decouperTexte(texte);
  if (!passages.length) throw new Error("Le document ne contient pas assez de texte exploitable.");
  if (passages.length > 2500) throw new Error("Le document est trop volumineux pour être indexé en une seule opération.");
  return passages;
}
