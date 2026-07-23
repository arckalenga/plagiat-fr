import { FileCheck2, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { Button } from "./ui";

export function Layout() {
  const { profil, deconnexion } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const liens = [
    { to: "/app", label: "Tableau de bord", icon: LayoutDashboard, end: true },
    { to: "/app/nouvelle-analyse", label: "Nouvelle analyse", icon: FileCheck2 },
    ...(profil?.role === "administrateur" ? [{ to: "/admin", label: "Administration", icon: Users }, { to: "/admin/journal", label: "Journal d’audit", icon: ShieldCheck }] : [])
  ];
  return <div className="min-h-screen bg-[#f8f7f2] text-ink">
    <aside className={cn("fixed inset-y-0 left-0 z-40 w-72 bg-forest-900 p-5 text-white transition-transform lg:translate-x-0", ouvert ? "translate-x-0" : "-translate-x-full")}>
      <div className="mb-10 flex items-center justify-between"><NavLink to="/app" className="font-display text-2xl font-bold">Plagiat<span className="text-[#e9b949]">·FR</span></NavLink><button className="lg:hidden" onClick={() => setOuvert(false)} aria-label="Fermer le menu"><X /></button></div>
      <nav className="space-y-2" aria-label="Navigation principale">{liens.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOuvert(false)} className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition", isActive ? "bg-white text-forest-900" : "text-white/75 hover:bg-white/10 hover:text-white")}><Icon size={19} />{label}</NavLink>)}</nav>
      <div className="absolute bottom-5 left-5 right-5 border-t border-white/15 pt-5"><p className="truncate text-sm font-semibold">{profil?.nom_complet || "Mon compte"}</p><p className="mb-3 truncate text-xs text-white/55">{profil?.email}</p><Button variant="ghost" className="w-full justify-start text-white hover:bg-white/10" onClick={() => void deconnexion()}><LogOut size={17} />Se déconnecter</Button></div>
    </aside>
    <div className="lg:pl-72"><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-black/[.06] bg-[#f8f7f2]/90 px-5 backdrop-blur lg:px-9"><button className="lg:hidden" onClick={() => setOuvert(true)} aria-label="Ouvrir le menu"><Menu /></button><div className="ml-auto text-xs font-medium text-black/50">Espace sécurisé · Données chiffrées</div></header><main><Outlet /></main></div>
  </div>;
}
