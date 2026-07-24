import { BookOpen, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { preparerPassages } from "../lib/extraction";
import { supabase } from "../lib/supabase";
import { validerDocument } from "../lib/validation";

type DocumentReference = {
  id: string;
  titre: string;
  auteur: string | null;
  annee: number | null;
  type_document: string;
  chemin_stockage: string;
  statut: "indexation" | "indexe" | "erreur";
  nombre_passages: number;
  cree_le: string;
};

export function Bibliotheque() {
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentReference[]>([]);
  const [fichier, setFichier] = useState<File | null>(null);
  const [titre, setTitre] = useState("");
  const [auteur, setAuteur] = useState("");
  const [annee, setAnnee] = useState("");
  const [typeDocument, setTypeDocument] = useState("memoire");
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  const charger = async () => {
    const { data } = await supabase.from("bibliotheque_documents").select("*").order("cree_le", { ascending: false });
    setDocuments((data as DocumentReference[]) || []);
  };
  useEffect(() => { void charger(); }, []);

  const choisir = (selection?: File) => {
    setErreur("");
    if (!selection) return;
    const validation = validerDocument(selection, 50);
    if (validation) return setErreur(validation);
    setFichier(selection);
    if (!titre) setTitre(selection.name.replace(/\.(pdf|docx)$/i, ""));
  };

  const importer = async () => {
    if (!fichier || !user || titre.trim().length < 2) return;
    setChargement(true);
    setErreur("");
    setMessage("Extraction et découpage du document…");
    let chemin = "";
    let documentId = "";
    try {
      const passages = await preparerPassages(fichier);
      chemin = `${user.id}/${crypto.randomUUID()}/${fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      setMessage(`Téléversement sécurisé de ${passages.length} passages…`);
      const { error: erreurStockage } = await supabase.storage.from("bibliotheque").upload(chemin, fichier, { contentType: fichier.type });
      if (erreurStockage) throw new Error("Le téléversement sécurisé a échoué.");

      const { data, error: erreurDocument } = await supabase.from("bibliotheque_documents").insert({
        titre: titre.trim(),
        auteur: auteur.trim() || null,
        annee: annee ? Number(annee) : null,
        type_document: typeDocument,
        chemin_stockage: chemin,
        type_mime: fichier.type,
        taille_octets: fichier.size,
        cree_par: user.id,
      }).select("id").single();
      if (erreurDocument || !data) throw new Error("Impossible d’enregistrer le document.");
      documentId = data.id;

      const { error: erreurIndexation } = await supabase.rpc("indexer_document_reference", {
        p_document_id: documentId,
        p_passages: passages,
      });
      if (erreurIndexation) throw new Error("L’indexation du texte a échoué.");

      setMessage(`Document indexé avec succès : ${passages.length} passages disponibles.`);
      setFichier(null);
      setTitre("");
      setAuteur("");
      setAnnee("");
      if (input.current) input.current.value = "";
      await charger();
    } catch (cause) {
      if (documentId) await supabase.from("bibliotheque_documents").update({ statut: "erreur" }).eq("id", documentId);
      else if (chemin) await supabase.storage.from("bibliotheque").remove([chemin]);
      setErreur(cause instanceof Error ? cause.message : "L’importation n’a pas abouti.");
      setMessage("");
    } finally {
      setChargement(false);
    }
  };

  const supprimer = async (document: DocumentReference) => {
    setErreur("");
    const { error } = await supabase.from("bibliotheque_documents").delete().eq("id", document.id);
    if (error) return setErreur("Le document n’a pas pu être supprimé.");
    await supabase.storage.from("bibliotheque").remove([document.chemin_stockage]);
    await charger();
  };

  return <div className="p-5 lg:p-10">
    <p className="text-sm text-black/45">Corpus de comparaison interne</p>
    <h1 className="mt-1 font-display text-4xl text-forest-900">Bibliothèque documentaire</h1>
    <p className="mt-3 max-w-3xl text-black/50">Ajoutez les livres, mémoires, thèses, articles et rapports qui serviront de références aux recherches de similitudes.</p>

    <Card className="mt-8 p-5 md:p-7">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><UploadCloud size={20}/>Ajouter une référence</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block"><span className="mb-2 block text-sm font-semibold">Titre</span><Input value={titre} onChange={e=>setTitre(e.target.value)} placeholder="Titre du document"/></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold">Auteur</span><Input value={auteur} onChange={e=>setAuteur(e.target.value)} placeholder="Nom de l’auteur"/></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold">Type de document</span><select className="h-12 w-full rounded-xl border border-black/15 bg-white px-4 text-sm" value={typeDocument} onChange={e=>setTypeDocument(e.target.value)}><option value="livre">Livre</option><option value="memoire">Mémoire</option><option value="these">Thèse</option><option value="article">Article</option><option value="rapport">Rapport</option><option value="autre">Autre</option></select></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold">Année</span><Input type="number" min="1400" max="2200" value={annee} onChange={e=>setAnnee(e.target.value)} placeholder="2026"/></label>
      </div>
      <button type="button" onClick={()=>input.current?.click()} className="mt-5 flex min-h-28 w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-black/15 p-5 text-sm hover:border-forest-500 hover:bg-forest-50">
        <FileText className="text-forest-700"/><span>{fichier ? fichier.name : "Choisir un PDF ou DOCX · 50 Mo maximum"}</span>
      </button>
      <input ref={input} className="hidden" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>choisir(e.target.files?.[0])}/>
      {message&&<div className="mt-4 rounded-xl bg-forest-50 p-3 text-sm text-forest-700">{message}</div>}
      {erreur&&<div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}
      <Button className="mt-5 w-full" disabled={!fichier||titre.trim().length<2||chargement} onClick={()=>void importer()}>{chargement?<><Loader2 className="animate-spin" size={18}/>Indexation en cours…</>:<><BookOpen size={18}/>Ajouter à la bibliothèque</>}</Button>
    </Card>

    <Card className="mt-6 overflow-hidden shadow-none">
      <div className="border-b border-black/[.07] p-5"><h2 className="font-semibold">Documents de référence</h2><p className="mt-1 text-sm text-black/45">{documents.length} document(s) dans la bibliothèque</p></div>
      {documents.length?<div className="divide-y divide-black/[.06]">{documents.map(document=><div key={document.id} className="flex flex-wrap items-center gap-4 p-5"><div className="rounded-xl bg-forest-50 p-3 text-forest-700"><BookOpen size={20}/></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{document.titre}</p><p className="text-xs text-black/45">{document.auteur||"Auteur non renseigné"} · {document.type_document} {document.annee?`· ${document.annee}`:""}</p></div><Badge tone={document.statut==="indexe"?"green":document.statut==="erreur"?"red":"amber"}>{document.statut==="indexe"?`${document.nombre_passages} passages`:document.statut==="erreur"?"Échec":"Indexation"}</Badge><Button variant="ghost" title="Supprimer" onClick={()=>void supprimer(document)}><Trash2 size={17}/></Button></div>)}</div>:<div className="p-12 text-center text-sm text-black/45">La bibliothèque est vide. Importez votre premier document de référence.</div>}
    </Card>
  </div>;
}
