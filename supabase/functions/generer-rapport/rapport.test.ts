import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
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

  it("ajoute toutes les pages du PDF original sans modifier leur format", async () => {
    const original = await PDFDocument.create();
    const figure = original.addPage([612, 792]);
    figure.drawRectangle({
      x: 72,
      y: 420,
      width: 468,
      height: 220,
      color: rgb(0.08, 0.35, 0.58),
    });
    figure.drawText("Figure originale en couleur", {
      x: 165,
      y: 520,
      size: 22,
    });
    const tableau = original.addPage([595.28, 841.89]);
    for (let ligne = 0; ligne < 6; ligne += 1) {
      tableau.drawLine({
        start: { x: 70, y: 650 - ligne * 45 },
        end: { x: 525, y: 650 - ligne * 45 },
      });
    }
    for (let colonne = 0; colonne < 5; colonne += 1) {
      tableau.drawLine({
        start: { x: 70 + colonne * 113.75, y: 425 },
        end: { x: 70 + colonne * 113.75, y: 650 },
      });
    }
    tableau.drawText("Tableau original", { x: 70, y: 680, size: 18 });
    const originalBytes = await original.save();

    const octets = await genererRapportPremium({
      analyseId: "11111111-2222-4333-8444-555555555555",
      nomFichier: "document-avec-figures.pdf",
      nomUtilisateur: "Auteur du document",
      dateSoumission: "24 juillet 2026 a 10:30",
      originalite: 93,
      sources: [],
      passages: [{ numero: 0, contenu: "Texte integral du document soumis." }],
      typeMime: "application/pdf",
      fichierOriginal: originalBytes,
    });
    const rapport = await PDFDocument.load(octets);
    const pages = rapport.getPages();

    expect(pages).toHaveLength(6);
    expect(pages.at(-2)?.getSize()).toEqual({ width: 612, height: 792 });
    expect(pages.at(-1)?.getSize().width).toBeCloseTo(595.28, 1);

    await mkdir("tmp/pdfs", { recursive: true });
    await writeFile("tmp/pdfs/rapport-original-test.pdf", octets);
  });
});
