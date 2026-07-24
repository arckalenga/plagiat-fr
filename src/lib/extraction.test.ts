import { describe, expect, it } from "vitest";
import { decouperTexte, normaliserTexte } from "./extraction";

describe("indexation documentaire", () => {
  it("normalise les accents et la ponctuation", () => {
    expect(normaliserTexte("L’intégrité, déjà vérifiée !")).toBe("l integrite deja verifiee");
  });

  it("découpe un texte en passages chevauchants", () => {
    const texte = Array.from({ length: 420 }, (_, index) => `mot${index}`).join(" ");
    const passages = decouperTexte(texte, 100, 20);
    expect(passages.length).toBeGreaterThan(4);
    expect(passages[0].contenu.split(" ")).toHaveLength(100);
    expect(passages[1].contenu.startsWith("mot80 ")).toBe(true);
  });

  it("refuse un contenu insuffisant", () => {
    expect(decouperTexte("Texte trop court.")).toEqual([]);
  });
});
