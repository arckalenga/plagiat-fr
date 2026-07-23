import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Accueil } from "./pages/Accueil";
import { Auth } from "./pages/Auth";
import { NouvelleAnalyse } from "./pages/NouvelleAnalyse";
import { Rapport } from "./pages/Rapport";
import { TableauDeBord } from "./pages/TableauDeBord";
import { Admin } from "./pages/Admin";
import { JournalAudit } from "./pages/JournalAudit";
import "./styles.css";

function Placeholder({ titre }: { titre: string }) { return <div className="p-6 lg:p-10"><h1 className="font-display text-4xl text-forest-900">{titre}</h1><p className="mt-3 text-black/50">Cette section sera disponible dans la prochaine étape.</p></div>; }
function Protection({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { user, profil, chargement } = useAuth();
  if (chargement) return <div className="grid min-h-screen place-items-center bg-sand">Chargement de votre espace…</div>;
  if (!user) return <Navigate to="/connexion" replace />;
  if (!profil || profil.statut !== "approuve" || (profil.valide_jusqu_au && new Date(profil.valide_jusqu_au) < new Date())) return <Navigate to="/attente" replace />;
  if (admin && profil.role !== "administrateur") return <Navigate to="/app" replace />;
  return children;
}
function App() { return <Routes><Route path="/" element={<Accueil/>}/><Route path="/connexion" element={<Auth mode="connexion"/>}/><Route path="/inscription" element={<Auth mode="inscription"/>}/><Route path="/attente" element={<Placeholder titre="Compte en attente d’approbation"/>}/><Route element={<Protection><Layout/></Protection>}><Route path="/app" element={<TableauDeBord/>}/><Route path="/app/nouvelle-analyse" element={<NouvelleAnalyse/>}/><Route path="/app/rapport/:id" element={<Rapport/>}/></Route><Route element={<Protection admin><Layout/></Protection>}><Route path="/admin" element={<Admin/>}/><Route path="/admin/journal" element={<JournalAudit/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>; }
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></React.StrictMode>);
