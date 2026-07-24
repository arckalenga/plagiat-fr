import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  genererRapportPremium,
  reconstruireDocument,
  type PassageRapport,
} from "./rapport";

function passagesAvecChevauchement(nombre: number): PassageRapport[] {
  const document = Array.from(
    { length: nombre * 145 + 35 },
    (_, index) =>
      index % 53 === 0
        ? "cependant"
        : index % 37 === 0
          ? "analyse"
          : `contenu${index}`,
  );
  return Array.from({ length: nombre }, (_, numero) => ({
    numero,
    contenu: document
      .slice(numero * 145, numero * 145 + 180)
      .join(" "),
  }));
}

describe("rapport PDF premium", () => {
  it("reconstruit le document sans répéter les chevauchements", () => {
    const passages = passagesAvecChevauchement(4);
    const segments = reconstruireDocument(passages, []);
    const mots = segments.flatMap((segment) => segment.texte.split(" "));

    expect(segments).toHaveLength(4);
    expect(mots).toHaveLength(4 * 145 + 35);
    expect(mots.at(-1)).toBe("contenu614");
  });

  it("génère un rapport multipage contenant tout un long document", async () => {
    const passages = passagesAvecChevauchement(50);
    const octets = await genererRapportPremium({
      analyseId: "ae000a65-4eee-4a68-a9d1-afa3f7abd5e6",
      nomFichier: "Memoire complet - cinquante pages.pdf",
      nomUtilisateur: "Utilisateur de démonstration",
      emailUtilisateur: "utilisateur@example.com",
      dateSoumission: "24 juillet 2026 à 08:15",
      originalite: 66,
      scoreIA: 7,
      sources: [
        {
          titre: "Introduction générale",
          auteur: "Bibliothèque Plagiat-FR",
          similarite: 78,
          extrait: passages[4].contenu,
        },
        {
          titre: "Méthodologie de référence",
          auteur: "Équipe académique",
          similarite: 46,
          extrait: passages[21].contenu,
        },
      ],
      passages,
    });
    const pdf = await PDFDocument.load(octets);

    expect(pdf.getPageCount()).toBeGreaterThan(12);
    expect(octets.length).toBeGreaterThan(50_000);

    await mkdir("tmp/pdfs", { recursive: true });
    await writeFile("tmp/pdfs/rapport-premium-test.pdf", octets);
  }, 30_000);
});
