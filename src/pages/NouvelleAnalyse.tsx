import {
  Bot,
  Check,
  FileText,
  Loader2,
  LockKeyhole,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { preparerPassages } from "../lib/extraction";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { validerDocument } from "../lib/validation";

export function NouvelleAnalyse() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [glisse, setGlisse] = useState(false);
  const [detectionIA, setDetectionIA] = useState(false);

  const choisir = (file?: File) => {
    setErreur("");
    if (!file) return;
    const validation = validerDocument(file);
    if (validation) {
      setErreur(validation);
      return;
    }
    setFichier(file);
  };

  const lancer = async () => {
    if (!fichier || !user) return;
    if (!supabaseConfigured) {
      setErreur("La configuration Supabase est absente.");
      return;
    }

    setChargement(true);
    setErreur("");
    let chemin = "";

    try {
      const passages = await preparerPassages(fichier);
      chemin = `${user.id}/${crypto.randomUUID()}/${fichier.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      )}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(chemin, fichier, {
          contentType: fichier.type,
          upsert: false,
        });
      if (uploadError) {
        throw new Error("Le téléversement sécurisé a échoué.");
      }

      const { data, error } = await supabase
        .from("analyses")
        .insert({
          utilisateur_id: user.id,
          nom_fichier: fichier.name,
          chemin_stockage: chemin,
          type_mime: fichier.type,
          taille_octets: fichier.size,
          statut: "en_attente",
        })
        .select("id")
        .single();
      if (error || !data) {
        await supabase.storage.from("documents").remove([chemin]);
        throw new Error("Impossible de créer l’analyse.");
      }

      const { error: fonctionError } = await supabase.functions.invoke(
        "analyser-document",
        {
          body: {
            analyse_id: data.id,
            passages,
            activer_detection_ia: detectionIA,
          },
        },
      );
      if (fonctionError) {
        setErreur("La comparaison interne n’a pas abouti.");
      }
      navigate(`/app/rapport/${data.id}`);
    } catch (cause) {
      setErreur(
        cause instanceof Error ? cause.message : "L’analyse n’a pas abouti.",
      );
      setChargement(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-5 lg:p-10">
      <p className="text-sm text-black/45">Analyse documentaire</p>
      <h1 className="mt-1 font-display text-4xl text-forest-900">
        Vérifier un document
      </h1>
      <p className="mt-3 max-w-2xl text-black/50">
        Comparez un document avec la bibliothèque interne constituée par votre
        établissement.
      </p>

      <Card className="mt-8 p-5 md:p-8">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setGlisse(true);
          }}
          onDragLeave={() => setGlisse(false)}
          onDrop={(event) => {
            event.preventDefault();
            setGlisse(false);
            choisir(event.dataTransfer.files[0]);
          }}
          onClick={() => input.current?.click()}
          className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
            glisse
              ? "border-forest-500 bg-forest-50"
              : "border-black/15 hover:border-forest-500 hover:bg-forest-50/40"
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(event) =>
            event.key === "Enter" && input.current?.click()
          }
        >
          <input
            ref={input}
            className="hidden"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => choisir(event.target.files?.[0])}
          />
          <div className="mb-4 rounded-2xl bg-forest-100 p-4 text-forest-700">
            <UploadCloud size={29} />
          </div>
          <h2 className="font-semibold">Déposez votre fichier ici</h2>
          <p className="mt-2 text-sm text-black/45">
            ou cliquez pour parcourir · PDF ou DOCX · 20 Mo maximum
          </p>
        </div>

        {fichier && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-sand p-4">
            <FileText className="text-forest-700" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{fichier.name}</p>
              <p className="text-xs text-black/40">
                {(fichier.size / 1024 / 1024).toFixed(2)} Mo
              </p>
            </div>
            <button
              aria-label="Retirer le fichier"
              onClick={() => setFichier(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}

        <label className="mt-5 flex cursor-pointer gap-3 rounded-xl border border-black/10 bg-white p-4">
          <input
            type="checkbox"
            checked={detectionIA}
            onChange={(event) => setDetectionIA(event.target.checked)}
            className="mt-1 size-4 accent-forest-700"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Bot size={17} />
              Activer la détection expérimentale de rédaction IA
            </span>
            <span className="mt-1 block text-xs leading-5 text-black/50">
              Avec votre accord, des extraits du document seront traités par
              notre service de modèle hébergé sur Hugging Face. Le résultat est
              probabiliste et ne constitue jamais une preuve.
            </span>
          </span>
        </label>

        {erreur && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {erreur}
          </div>
        )}

        <div className="mt-6 grid gap-3 text-sm md:grid-cols-3">
          {[
            "Comparaison avec la bibliothèque",
            "Passages sources identifiés",
            "Rapport PDF détaillé",
          ].map((texte) => (
            <div className="flex gap-2" key={texte}>
              <Check size={17} className="text-forest-500" />
              {texte}
            </div>
          ))}
        </div>

        <Button
          className="mt-7 w-full"
          disabled={!fichier || chargement}
          onClick={() => void lancer()}
        >
          {chargement ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Comparaison en cours…
            </>
          ) : (
            <>
              <LockKeyhole size={17} />
              Lancer la comparaison sécurisée
            </>
          )}
        </Button>
      </Card>
    </div>
  );
}
