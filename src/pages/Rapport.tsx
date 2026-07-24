import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Bot,
  CalendarClock,
  Download,
  ExternalLink,
  FileWarning,
  Quote,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card } from "../components/ui";
import { supabase } from "../lib/supabase";
import { formatDateHeure } from "../lib/utils";

type Source = {
  document_id?: string;
  titre: string;
  auteur?: string | null;
  url?: string;
  similarite: number;
  extrait: string;
};

type Analyse = {
  id: string;
  utilisateur_id: string;
  nom_fichier: string;
  cree_le: string;
  statut: string;
  erreur: string | null;
  score_originalite: number | null;
  score_ia: number | null;
  resume_ia: string | null;
  sources: Source[] | null;
  soumissionnaire?: { nom_complet: string; email: string };
};

export function Rapport() {
  const { id } = useParams();
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [erreur, setErreur] = useState("");
  const [erreurPdf, setErreurPdf] = useState("");
  const [telechargement, setTelechargement] = useState(false);

  useEffect(() => {
    if (!id) return;

    const charger = async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        setErreur(
          "Ce rapport est introuvable ou vous n’êtes pas autorisé à le consulter.",
        );
        return;
      }

      const { data: profil } = await supabase
        .from("profils")
        .select("nom_complet,email")
        .eq("id", data.utilisateur_id)
        .single();

      setAnalyse({
        ...(data as Analyse),
        soumissionnaire: profil ?? undefined,
      });
    };

    void charger();
    const canal = supabase
      .channel(`analyse-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "analyses",
          filter: `id=eq.${id}`,
        },
        () => void charger(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [id]);

  const telechargerPdf = async () => {
    if (!id || telechargement) return;
    setTelechargement(true);
    setErreurPdf("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "generer-rapport",
        {
          body: {
            analyse_id: id,
            fuseau_horaire:
              Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          },
        },
      );
      if (error || !data?.pdf_base64) throw new Error();

      const octets = Uint8Array.from(atob(data.pdf_base64), (caractere) =>
        caractere.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([octets], { type: "application/pdf" }),
      );
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `rapport-${analyse?.nom_fichier || "analyse"}.pdf`;
      lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setErreurPdf(
        "La génération du rapport PDF a échoué. Veuillez réessayer.",
      );
    } finally {
      setTelechargement(false);
    }
  };

  if (erreur) return <div className="p-10 text-red-700">{erreur}</div>;

  if (analyse?.statut === "erreur") {
    return (
      <div className="grid min-h-[70vh] place-items-center p-8 text-center">
        <div className="max-w-lg">
          <AlertTriangle className="mx-auto mb-5 text-red-700" size={48} />
          <h1 className="font-display text-3xl text-forest-900">
            L’analyse n’a pas abouti
          </h1>
          <p className="mt-3 text-black/55">
            {analyse.erreur || "La comparaison interne n’a pas abouti."}
          </p>
          <Link to="/app/nouvelle-analyse">
            <Button className="mt-6">Revenir à l’importation</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!analyse || analyse.statut !== "terminee") {
    return (
      <div className="grid min-h-[70vh] place-items-center p-8 text-center">
        <div>
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-forest-100" />
          <h1 className="font-display text-3xl text-forest-900">
            Comparaison en cours
          </h1>
          <p className="mt-2 text-black/45">
            Le rapport se mettra à jour automatiquement.
          </p>
        </div>
      </div>
    );
  }

  const originalite = analyse.score_originalite ?? 0;
  const plagiat = 100 - originalite;

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/app"
            className="mb-3 flex items-center gap-2 text-sm text-black/45"
          >
            <ArrowLeft size={16} />
            Retour au tableau de bord
          </Link>
          <h1 className="font-display text-4xl text-forest-900">
            Rapport de plagiat et de similarité
          </h1>
          <p className="mt-2 text-sm text-black/45">{analyse.nom_fichier}</p>
        </div>
        <div>
          <Button
            disabled={telechargement}
            onClick={() => void telechargerPdf()}
          >
            <Download size={18} />
            {telechargement
              ? "Génération en cours…"
              : "Télécharger le rapport PDF"}
          </Button>
          {erreurPdf && (
            <p className="mt-2 max-w-xs text-sm text-red-700">{erreurPdf}</p>
          )}
        </div>
      </div>

      <Card className="mb-5 grid gap-5 p-6 shadow-none md:grid-cols-2">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 text-forest-700" size={21} />
          <div>
            <p className="text-xs uppercase tracking-wide text-black/40">
              Document soumis par
            </p>
            <p className="mt-1 font-semibold">
              {analyse.soumissionnaire?.nom_complet || "Utilisateur"}
            </p>
            {analyse.soumissionnaire?.email && (
              <p className="text-sm text-black/45">
                {analyse.soumissionnaire.email}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 text-forest-700" size={21} />
          <div>
            <p className="text-xs uppercase tracking-wide text-black/40">
              Date et heure de soumission
            </p>
            <p className="mt-1 font-semibold">
              {formatDateHeure(analyse.cree_le)}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Score
          icon={FileWarning}
          titre="Taux de plagiat détecté"
          score={plagiat}
          type="plagiat"
          note="Pourcentage de contenu similaire aux références de la bibliothèque interne."
        />
        <Score
          icon={ShieldCheck}
          titre="Indice d’originalité interne"
          score={originalite}
          type="originalite"
          note="Part du document ne présentant pas de similitude détectée dans la bibliothèque."
        />
        <Card className="p-6 shadow-none">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot size={20} />
            Détection de rédaction IA
          </div>
          <p className="mt-5 text-2xl font-bold text-black/45">Non activée</p>
          <p className="mt-4 text-xs leading-5 text-black/45">
            Aucun score IA n’est produit tant qu’un modèle francophone n’a pas
            été entraîné et validé.
          </p>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden shadow-none">
        <div className="border-b border-black/[.07] p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <BookOpen size={20} />
            Références similaires détectées
          </h2>
          <p className="mt-1 text-sm text-black/45">
            {analyse.sources?.length || 0} correspondance(s) dans la
            bibliothèque interne
          </p>
        </div>
        <div className="divide-y divide-black/[.06]">
          {analyse.sources?.length ? (
            analyse.sources.map((source, index) => (
              <div
                className="p-6"
                key={`${source.document_id || source.url}-${index}`}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 font-semibold text-forest-700 hover:underline"
                      >
                        {source.titre}
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <p className="font-semibold text-forest-700">
                        {source.titre}
                      </p>
                    )}
                    {source.auteur && (
                      <p className="mt-1 text-xs text-black/40">
                        {source.auteur}
                      </p>
                    )}
                    <p className="mt-2 max-w-2xl text-sm italic text-black/50">
                      <Quote className="mr-1 inline" size={14} />
                      {source.extrait}
                    </p>
                  </div>
                  <Badge tone={source.similarite > 50 ? "red" : "amber"}>
                    {source.similarite} % similaire
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <p className="p-8 text-center text-sm text-black/45">
              Aucune similitude significative avec la bibliothèque interne.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Score({
  icon: Icon,
  titre,
  score,
  note,
  type,
}: {
  icon: typeof ShieldCheck;
  titre: string;
  score: number;
  note: string;
  type: "plagiat" | "originalite";
}) {
  const couleur =
    type === "plagiat"
      ? score > 30
        ? "text-red-700"
        : score > 10
          ? "text-amber-700"
          : "text-emerald-700"
      : score > 75
        ? "text-emerald-700"
        : score > 45
          ? "text-amber-700"
          : "text-red-700";

  return (
    <Card className="p-6 shadow-none">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon size={20} />
        {titre}
      </div>
      <div className={`mt-5 text-5xl font-bold ${couleur}`}>
        {score}
        <span className="text-2xl"> %</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-current"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-black/45">{note}</p>
    </Card>
  );
}
