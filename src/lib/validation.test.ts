import { describe, expect, it } from "vitest";
import { TAILLE_MAX, validerDocument } from "./validation";
describe("validation des documents", () => {
  it("accepte un PDF non vide", () => expect(validerDocument({ type: "application/pdf", size: 1024 })).toBeNull());
  it("accepte un DOCX non vide", () => expect(validerDocument({ type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 2048 })).toBeNull());
  it("refuse un format exécutable", () => expect(validerDocument({ type: "application/x-msdownload", size: 1024 })).toContain("Format non autorisé"));
  it("refuse un fichier de plus de 20 Mo", () => expect(validerDocument({ type: "application/pdf", size: TAILLE_MAX + 1 })).toContain("20 Mo"));
  it("refuse un fichier vide", () => expect(validerDocument({ type: "application/pdf", size: 0 })).toContain("vide"));
});
