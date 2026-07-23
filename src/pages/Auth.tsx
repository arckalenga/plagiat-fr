import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../contexts/AuthContext";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { Button, Card, Input } from "../components/ui";

const connexionSchema = z.object({ email: z.string().email("Saisissez une adresse électronique valide."), motDePasse: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.") });
const inscriptionSchema = connexionSchema.extend({ nom: z.string().min(2, "Indiquez votre nom complet."), confirmation: z.string() }).refine(v => v.motDePasse === v.confirmation, { message: "Les mots de passe ne correspondent pas.", path: ["confirmation"] });

export function Auth({ mode }: { mode: "connexion" | "inscription" }) {
  const schema = mode === "connexion" ? connexionSchema : inscriptionSchema;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Record<string,string>>({ resolver: zodResolver(schema) });
  const [message, setMessage] = useState("");
  const { user, profil } = useAuth();
  const navigate = useNavigate(); const location = useLocation();
  if (user && profil) return <Navigate to={profil.statut === "approuve" ? "/app" : "/attente"} replace />;
  const soumettre = async (values: Record<string,string>) => {
    setMessage("");
    if (!supabaseConfigured) { setMessage("La configuration Supabase est absente. Consultez le fichier .env.example."); return; }
    if (mode === "inscription") {
      const { error } = await supabase.auth.signUp({ email: values.email, password: values.motDePasse, options: { data: { nom_complet: values.nom }, emailRedirectTo: `${location.origin}/connexion` } });
      if (error) return setMessage(traduireErreur(error.message));
      setMessage("Votre demande a bien été enregistrée. Vérifiez votre messagerie, puis attendez l’approbation d’un administrateur.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.motDePasse });
      if (error) return setMessage(traduireErreur(error.message));
      navigate("/app");
    }
  };
  return <div className="grid min-h-screen bg-sand lg:grid-cols-2"><aside className="hidden bg-forest-900 p-14 text-white lg:flex lg:flex-col lg:justify-between"><Link to="/" className="font-display text-2xl font-bold">Plagiat<span className="text-[#e9b949]">·FR</span></Link><div><ShieldCheck size={42} className="mb-6 text-[#e9b949]"/><h1 className="max-w-lg font-display text-5xl leading-tight">L’intégrité académique commence par un accès de confiance.</h1><p className="mt-5 max-w-md leading-7 text-white/60">Chaque compte est vérifié par un administrateur et valable pendant un an après son approbation.</p></div><p className="text-xs text-white/40">© 2026 Plagiat-FR · Traitement confidentiel</p></aside><main className="flex items-center justify-center p-5"><div className="w-full max-w-md"><Link to="/" className="mb-7 inline-flex items-center gap-2 text-sm text-black/55"><ArrowLeft size={16}/>Retour à l’accueil</Link><Card className="p-7 md:p-9"><h2 className="font-display text-3xl text-forest-900">{mode === "connexion" ? "Heureux de vous revoir" : "Demander un accès"}</h2><p className="mt-2 text-sm text-black/50">{mode === "connexion" ? "Connectez-vous à votre espace sécurisé." : "Votre compte sera examiné par un administrateur."}</p><form className="mt-7 space-y-4" onSubmit={handleSubmit(soumettre)}>
    {mode === "inscription" && <Champ label="Nom complet" erreur={errors.nom?.message}><Input autoComplete="name" {...register("nom")} /></Champ>}
    <Champ label="Adresse électronique" erreur={errors.email?.message}><Input type="email" autoComplete="email" {...register("email")} /></Champ>
    <Champ label="Mot de passe" erreur={errors.motDePasse?.message}><Input type="password" autoComplete={mode === "connexion" ? "current-password" : "new-password"} {...register("motDePasse")} /></Champ>
    {mode === "inscription" && <Champ label="Confirmer le mot de passe" erreur={errors.confirmation?.message}><Input type="password" autoComplete="new-password" {...register("confirmation")} /></Champ>}
    {message && <div role="alert" className="rounded-xl bg-forest-50 p-3 text-sm text-forest-700">{message}</div>}<Button className="w-full" disabled={isSubmitting}>{isSubmitting ? "Traitement en cours…" : mode === "connexion" ? "Se connecter" : "Envoyer ma demande"}</Button>
  </form><p className="mt-6 text-center text-sm text-black/50">{mode === "connexion" ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"} <Link className="font-semibold text-forest-700 underline" to={mode === "connexion" ? "/inscription" : "/connexion"}>{mode === "connexion" ? "S’inscrire" : "Se connecter"}</Link></p></Card></div></main></div>;
}
function Champ({ label, erreur, children }: { label: string; erreur?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span>{children}{erreur && <span className="mt-1 block text-xs text-red-700">{erreur}</span>}</label>; }
function traduireErreur(message: string) { if (message.includes("Invalid login")) return "Adresse électronique ou mot de passe incorrect."; if (message.includes("already registered")) return "Un compte existe déjà avec cette adresse."; if (message.includes("Email not confirmed")) return "Veuillez d’abord confirmer votre adresse électronique."; return "Une erreur est survenue. Réessayez dans quelques instants."; }
