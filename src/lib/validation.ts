export const TYPES_AUTORISES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export const TAILLE_MAX = 20 * 1024 * 1024;
export function validerDocument(fichier: Pick<File, "type" | "size">, tailleMaxMo = 20): string | null {
  if (!TYPES_AUTORISES.includes(fichier.type as typeof TYPES_AUTORISES[number])) return "Format non autorisé. Importez uniquement un fichier PDF ou DOCX.";
  if (fichier.size > tailleMaxMo * 1024 * 1024) return `Le fichier dépasse la taille maximale de ${tailleMaxMo} Mo.`;
  if (fichier.size === 0) return "Le fichier sélectionné est vide.";
  return null;
}
