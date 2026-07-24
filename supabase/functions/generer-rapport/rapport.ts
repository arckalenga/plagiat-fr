import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export type PassageRapport = {
  numero: number;
  contenu: string;
};

export type SourceRapport = {
  titre?: unknown;
  auteur?: unknown;
  similarite?: unknown;
  extrait?: unknown;
};

export type DonneesRapport = {
  analyseId: string;
  nomFichier: string;
  nomUtilisateur: string;
  emailUtilisateur?: string | null;
  dateSoumission: string;
  originalite: number;
  scoreIA?: number | null;
  sources: SourceRapport[];
  passages: PassageRapport[];
};

type Polices = {
  normal: PDFFont;
  gras: PDFFont;
  italique: PDFFont;
};

type SegmentDocument = {
  numero: number;
  texte: string;
  similarite: number;
};

const PAGE_LARGEUR = 595.28;
const PAGE_HAUTEUR = 841.89;
const MARGE = 48;
const BAS_CONTENU = 62;
const VERT = rgb(0.035, 0.20, 0.14);
const VERT_CLAIR = rgb(0.90, 0.96, 0.92);
const OR = rgb(0.84, 0.65, 0.23);
const OR_CLAIR = rgb(1, 0.97, 0.84);
const CREME = rgb(0.985, 0.978, 0.945);
const GRIS = rgb(0.39, 0.40, 0.38);
const ROUGE = rgb(0.72, 0.09, 0.08);

function nettoyerTextePdf(texte: string) {
  return texte
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normaliserComparaison(texte: string) {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ngrammes(texte: string, taille = 2) {
  const mots = normaliserComparaison(texte).split(" ").filter(Boolean);
  const resultat = new Set<string>();
  for (let index = 0; index <= mots.length - taille; index += 1) {
    resultat.add(mots.slice(index, index + taille).join(" "));
  }
  return resultat;
}

function chevauchementLexical(texte: string, extrait: string) {
  const a = ngrammes(texte);
  const b = ngrammes(extrait);
  if (!a.size || !b.size) return 0;
  let communs = 0;
  for (const valeur of a) {
    if (b.has(valeur)) communs += 1;
  }
  return communs / Math.min(a.size, b.size);
}

function scorePassage(texte: string, sources: SourceRapport[]) {
  let score = 0;
  for (const source of sources) {
    if (
      typeof source.extrait !== "string" ||
      typeof source.similarite !== "number"
    ) {
      continue;
    }
    const chevauchement = chevauchementLexical(texte, source.extrait);
    if (chevauchement >= 0.18) {
      score = Math.max(score, Math.round(source.similarite));
    }
  }
  return score;
}

function trouverChevauchement(precedent: string[], courant: string[]) {
  const maximum = Math.min(90, precedent.length, courant.length);
  for (let taille = maximum; taille >= 8; taille -= 1) {
    const fin = precedent
      .slice(precedent.length - taille)
      .join(" ")
      .toLowerCase();
    const debut = courant.slice(0, taille).join(" ").toLowerCase();
    if (fin === debut) return taille;
  }
  return 0;
}

export function reconstruireDocument(
  passages: PassageRapport[],
  sources: SourceRapport[],
) {
  const segments: SegmentDocument[] = [];
  let precedent: string[] = [];

  for (const passage of [...passages].sort((a, b) => a.numero - b.numero)) {
    const mots = nettoyerTextePdf(passage.contenu).split(/\s+/).filter(Boolean);
    if (!mots.length) continue;
    const chevauchement = precedent.length
      ? trouverChevauchement(precedent, mots)
      : 0;
    const nouveauxMots = mots.slice(chevauchement);
    if (nouveauxMots.length) {
      segments.push({
        numero: passage.numero,
        texte: nouveauxMots.join(" "),
        similarite: scorePassage(passage.contenu, sources),
      });
    }
    precedent = mots;
  }

  return segments;
}

function couperTexte(
  texte: string,
  font: PDFFont,
  taille: number,
  largeur: number,
) {
  const lignes: string[] = [];
  let ligne = "";

  for (const motBrut of nettoyerTextePdf(texte).split(/\s+/)) {
    let mot = motBrut;
    while (font.widthOfTextAtSize(mot, taille) > largeur && mot.length > 1) {
      let coupure = mot.length - 1;
      while (
        coupure > 1 &&
        font.widthOfTextAtSize(`${mot.slice(0, coupure)}-`, taille) > largeur
      ) {
        coupure -= 1;
      }
      const morceau = `${mot.slice(0, coupure)}-`;
      if (ligne) {
        lignes.push(ligne);
        ligne = "";
      }
      lignes.push(morceau);
      mot = mot.slice(coupure);
    }

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

function dessinerDiamant(
  page: PDFPage,
  x: number,
  y: number,
  taille: number,
  opacite: number,
) {
  const demi = taille / 2;
  const haut = { x: x + demi, y: y + taille };
  const droite = { x: x + taille, y: y + demi };
  const bas = { x: x + demi, y };
  const gauche = { x, y: y + demi };
  for (const [debut, fin] of [
    [haut, droite],
    [droite, bas],
    [bas, gauche],
    [gauche, haut],
    [gauche, droite],
    [haut, bas],
  ] as const) {
    page.drawLine({
      start: debut,
      end: fin,
      thickness: taille > 80 ? 1.5 : 0.8,
      color: OR,
      opacity: opacite,
    });
  }
}

function decorerPage(
  page: PDFPage,
  polices: Polices,
  numeroPage: number,
  analyseId: string,
) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_LARGEUR,
    height: PAGE_HAUTEUR,
    color: CREME,
  });

  for (let index = 0; index < 5; index += 1) {
    page.drawLine({
      start: { x: 430 + index * 20, y: PAGE_HAUTEUR },
      end: { x: PAGE_LARGEUR, y: 675 + index * 18 },
      thickness: index === 2 ? 2.2 : 0.8,
      color: OR,
      opacity: index === 2 ? 0.38 : 0.18,
    });
  }
  dessinerDiamant(page, 430, 330, 105, 0.055);

  page.drawText("PLAGIAT-FR", {
    x: MARGE,
    y: PAGE_HAUTEUR - 38,
    size: 11,
    font: polices.gras,
    color: VERT,
  });
  page.drawLine({
    start: { x: MARGE, y: PAGE_HAUTEUR - 48 },
    end: { x: PAGE_LARGEUR - MARGE, y: PAGE_HAUTEUR - 48 },
    thickness: 0.8,
    color: OR,
    opacity: 0.65,
  });
  page.drawLine({
    start: { x: MARGE, y: 43 },
    end: { x: PAGE_LARGEUR - MARGE, y: 43 },
    thickness: 0.7,
    color: OR,
    opacity: 0.45,
  });
  page.drawText(`Rapport ${analyseId.slice(0, 8).toUpperCase()}`, {
    x: MARGE,
    y: 27,
    size: 7.5,
    font: polices.normal,
    color: GRIS,
  });
  page.drawText(`PAGE ${numeroPage}`, {
    x: PAGE_LARGEUR - MARGE - 40,
    y: 27,
    size: 7.5,
    font: polices.gras,
    color: VERT,
  });
}

function dessinerEtiquette(
  page: PDFPage,
  texte: string,
  x: number,
  y: number,
  largeur: number,
  couleurFond: ReturnType<typeof rgb>,
  polices: Polices,
) {
  page.drawRectangle({
    x,
    y,
    width: largeur,
    height: 27,
    color: couleurFond,
    borderColor: OR,
    borderWidth: 0.5,
    opacity: 0.96,
  });
  page.drawText(nettoyerTextePdf(texte), {
    x: x + 10,
    y: y + 9,
    size: 8,
    font: polices.gras,
    color: VERT,
  });
}

function couleurPassage(score: number) {
  if (score >= 75) return rgb(0.99, 0.84, 0.82);
  if (score >= 50) return rgb(1, 0.90, 0.73);
  if (score >= 35) return rgb(1, 0.96, 0.76);
  return rgb(1, 1, 1);
}

export async function genererRapportPremium(donnees: DonneesRapport) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rapport Plagiat-FR - ${donnees.nomFichier}`);
  pdf.setAuthor("Plagiat-FR");
  pdf.setSubject("Rapport de plagiat, de similarité et d'indicateur IA");
  pdf.setKeywords(["plagiat", "similarité", "originalité", "IA"]);
  pdf.setCreationDate(new Date());

  const polices: Polices = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    gras: await pdf.embedFont(StandardFonts.HelveticaBold),
    italique: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const plagiat = Math.max(0, Math.min(100, 100 - donnees.originalite));
  const sources = donnees.sources.slice(0, 10);
  const segments = reconstruireDocument(donnees.passages, sources);

  const couverture = pdf.addPage([PAGE_LARGEUR, PAGE_HAUTEUR]);
  couverture.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_LARGEUR,
    height: PAGE_HAUTEUR,
    color: VERT,
  });
  for (let index = -2; index < 9; index += 1) {
    couverture.drawLine({
      start: { x: 325 + index * 31, y: PAGE_HAUTEUR },
      end: { x: PAGE_LARGEUR, y: 430 + index * 31 },
      thickness: index === 3 ? 3 : 0.9,
      color: OR,
      opacity: index === 3 ? 0.75 : 0.30,
    });
  }
  dessinerDiamant(couverture, 380, 525, 125, 0.72);
  dessinerDiamant(couverture, 423, 568, 39, 0.75);
  couverture.drawText("PLAGIAT-FR", {
    x: 48,
    y: 768,
    size: 17,
    font: polices.gras,
    color: OR,
  });
  couverture.drawText("RAPPORT CERTIFIE", {
    x: 48,
    y: 646,
    size: 10,
    font: polices.gras,
    color: OR_CLAIR,
  });
  couverture.drawText("Plagiat, similarite", {
    x: 48,
    y: 595,
    size: 29,
    font: polices.gras,
    color: rgb(1, 1, 1),
  });
  couverture.drawText("et indicateur IA", {
    x: 48,
    y: 558,
    size: 29,
    font: polices.gras,
    color: OR,
  });
  const lignesTitre = couperTexte(
    donnees.nomFichier,
    polices.gras,
    15,
    465,
  ).slice(0, 3);
  lignesTitre.forEach((ligne, index) => {
    couverture.drawText(ligne, {
      x: 48,
      y: 485 - index * 21,
      size: 15,
      font: polices.gras,
      color: rgb(0.90, 0.96, 0.92),
    });
  });

  const cartes = [
    { x: 48, valeur: `${plagiat} %`, libelle: "PLAGIAT DETECTE", couleur: OR },
    {
      x: 219,
      valeur: `${donnees.originalite} %`,
      libelle: "ORIGINALITE",
      couleur: rgb(0.78, 0.92, 0.82),
    },
    {
      x: 390,
      valeur:
        typeof donnees.scoreIA === "number"
          ? `${Math.round(donnees.scoreIA)} %`
          : "-",
      libelle: "INDICATEUR IA",
      couleur: OR_CLAIR,
    },
  ];
  for (const carte of cartes) {
    couverture.drawRectangle({
      x: carte.x,
      y: 282,
      width: 145,
      height: 108,
      color: rgb(1, 1, 1),
      opacity: 0.08,
      borderColor: OR,
      borderWidth: 0.6,
    });
    couverture.drawText(carte.valeur, {
      x: carte.x + 15,
      y: 330,
      size: 27,
      font: polices.gras,
      color: carte.couleur,
    });
    couverture.drawText(carte.libelle, {
      x: carte.x + 15,
      y: 306,
      size: 7.5,
      font: polices.gras,
      color: rgb(0.86, 0.90, 0.87),
    });
  }
  couverture.drawText("DOCUMENT SOUMIS PAR", {
    x: 48,
    y: 218,
    size: 7.5,
    font: polices.gras,
    color: OR,
  });
  couverture.drawText(nettoyerTextePdf(donnees.nomUtilisateur), {
    x: 48,
    y: 197,
    size: 12,
    font: polices.gras,
    color: rgb(1, 1, 1),
  });
  if (donnees.emailUtilisateur) {
    couverture.drawText(nettoyerTextePdf(donnees.emailUtilisateur), {
      x: 48,
      y: 180,
      size: 8.5,
      font: polices.normal,
      color: rgb(0.75, 0.82, 0.78),
    });
  }
  couverture.drawText("DATE ET HEURE", {
    x: 342,
    y: 218,
    size: 7.5,
    font: polices.gras,
    color: OR,
  });
  couverture.drawText(nettoyerTextePdf(donnees.dateSoumission), {
    x: 342,
    y: 197,
    size: 10,
    font: polices.gras,
    color: rgb(1, 1, 1),
  });
  couverture.drawText(`ID ${donnees.analyseId.toUpperCase()}`, {
    x: 48,
    y: 58,
    size: 7,
    font: polices.normal,
    color: rgb(0.58, 0.69, 0.63),
  });

  const synthese = pdf.addPage([PAGE_LARGEUR, PAGE_HAUTEUR]);
  decorerPage(synthese, polices, 2, donnees.analyseId);
  synthese.drawText("Synthese du rapport", {
    x: MARGE,
    y: 742,
    size: 24,
    font: polices.gras,
    color: VERT,
  });
  synthese.drawText(
    "Les couleurs permettent de reperer rapidement les passages similaires.",
    {
      x: MARGE,
      y: 718,
      size: 9.5,
      font: polices.normal,
      color: GRIS,
    },
  );
  dessinerEtiquette(
    synthese,
    "JAUNE  35-49 % de similarite",
    MARGE,
    660,
    154,
    rgb(1, 0.96, 0.76),
    polices,
  );
  dessinerEtiquette(
    synthese,
    "ORANGE  50-74 % de similarite",
    220,
    660,
    165,
    rgb(1, 0.90, 0.73),
    polices,
  );
  dessinerEtiquette(
    synthese,
    "ROUGE  75-100 % de similarite",
    397,
    660,
    150,
    rgb(0.99, 0.84, 0.82),
    polices,
  );

  synthese.drawText("REFERENCES SIMILAIRES DETECTEES", {
    x: MARGE,
    y: 610,
    size: 10,
    font: polices.gras,
    color: VERT,
  });
  let ySource = 578;
  if (!sources.length) {
    synthese.drawText(
      "Aucune similitude significative dans la bibliotheque interne.",
      {
        x: MARGE,
        y: ySource,
        size: 10,
        font: polices.normal,
        color: GRIS,
      },
    );
  } else {
    for (const [index, source] of sources.entries()) {
      if (ySource < 115) break;
      const titre =
        typeof source.titre === "string" ? source.titre : "Reference interne";
      const auteur = typeof source.auteur === "string" ? source.auteur : "";
      const similarite =
        typeof source.similarite === "number"
          ? Math.round(source.similarite)
          : 0;
      synthese.drawRectangle({
        x: MARGE,
        y: ySource - 31,
        width: PAGE_LARGEUR - MARGE * 2,
        height: 48,
        color: couleurPassage(similarite),
        borderColor: rgb(0.89, 0.87, 0.78),
        borderWidth: 0.5,
      });
      synthese.drawText(`${index + 1}. ${nettoyerTextePdf(titre).slice(0, 62)}`, {
        x: MARGE + 12,
        y: ySource,
        size: 9.5,
        font: polices.gras,
        color: VERT,
      });
      synthese.drawText(
        `${nettoyerTextePdf(auteur).slice(0, 48)}  |  ${similarite} % similaire`,
        {
          x: MARGE + 12,
          y: ySource - 17,
          size: 8,
          font: polices.normal,
          color: similarite >= 75 ? ROUGE : GRIS,
        },
      );
      ySource -= 59;
    }
  }

  let pageDocument = pdf.addPage([PAGE_LARGEUR, PAGE_HAUTEUR]);
  let numeroPage = 3;
  decorerPage(pageDocument, polices, numeroPage, donnees.analyseId);
  pageDocument.drawText("Document analyse - texte integral", {
    x: MARGE,
    y: 742,
    size: 20,
    font: polices.gras,
    color: VERT,
  });
  pageDocument.drawText(
    "Les passages colores et soulignes presentent une correspondance avec une reference interne.",
    {
      x: MARGE,
      y: 719,
      size: 8.5,
      font: polices.italique,
      color: GRIS,
    },
  );
  let y = 685;

  const nouvellePageDocument = () => {
    pageDocument = pdf.addPage([PAGE_LARGEUR, PAGE_HAUTEUR]);
    numeroPage += 1;
    decorerPage(pageDocument, polices, numeroPage, donnees.analyseId);
    pageDocument.drawText("Document analyse - suite", {
      x: MARGE,
      y: 752,
      size: 13,
      font: polices.gras,
      color: VERT,
    });
    y = 720;
  };

  for (const segment of segments) {
    const lignes = couperTexte(
      segment.texte,
      polices.normal,
      9.2,
      PAGE_LARGEUR - MARGE * 2 - 18,
    );
    let position = 0;
    while (position < lignes.length) {
      const lignesDisponibles = Math.max(
        1,
        Math.floor((y - BAS_CONTENU - 24) / 13.2),
      );
      if (lignesDisponibles < 2) {
        nouvellePageDocument();
        continue;
      }
      const portion = lignes.slice(position, position + lignesDisponibles);
      const hauteur = portion.length * 13.2 + 20;
      const fond = couleurPassage(segment.similarite);
      pageDocument.drawRectangle({
        x: MARGE,
        y: y - hauteur + 6,
        width: PAGE_LARGEUR - MARGE * 2,
        height: hauteur,
        color: fond,
        borderColor:
          segment.similarite >= 35 ? OR : rgb(0.91, 0.90, 0.85),
        borderWidth: segment.similarite >= 35 ? 0.8 : 0.25,
        opacity: segment.similarite >= 35 ? 0.96 : 0.72,
      });
      if (segment.similarite >= 35) {
        pageDocument.drawText(`${segment.similarite} % similaire`, {
          x: PAGE_LARGEUR - MARGE - 74,
          y: y - 7,
          size: 7,
          font: polices.gras,
          color: segment.similarite >= 75 ? ROUGE : VERT,
        });
      }
      portion.forEach((ligne, index) => {
        const ligneY = y - 21 - index * 13.2;
        pageDocument.drawText(ligne, {
          x: MARGE + 9,
          y: ligneY,
          size: 9.2,
          font: polices.normal,
          color: rgb(0.12, 0.13, 0.12),
        });
        if (segment.similarite >= 35) {
          pageDocument.drawLine({
            start: { x: MARGE + 9, y: ligneY - 2.2 },
            end: {
              x:
                MARGE +
                9 +
                polices.normal.widthOfTextAtSize(ligne, 9.2),
              y: ligneY - 2.2,
            },
            thickness: 0.45,
            color: OR,
            opacity: 0.8,
          });
        }
      });
      y -= hauteur + 8;
      position += portion.length;
      if (position < lignes.length) nouvellePageDocument();
    }
  }

  if (!segments.length) {
    pageDocument.drawText("Aucun texte exploitable n'a ete conserve.", {
      x: MARGE,
      y,
      size: 11,
      font: polices.normal,
      color: GRIS,
    });
  }

  return pdf.save();
}
