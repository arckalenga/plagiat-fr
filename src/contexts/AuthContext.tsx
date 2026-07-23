import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

export type Profil = { id: string; email: string; nom_complet: string; role: "utilisateur" | "administrateur"; statut: "en_attente" | "approuve" | "refuse" | "expire"; valide_jusqu_au: string | null };
type AuthValue = { user: User | null; session: Session | null; profil: Profil | null; chargement: boolean; deconnexion: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [chargement, setChargement] = useState(true);
  useEffect(() => {
    if (!supabaseConfigured) { setChargement(false); return; }
    const charger = async (current: Session | null) => {
      setSession(current);
      if (current?.user) {
        const { data } = await supabase.from("profils").select("*").eq("id", current.user.id).maybeSingle();
        setProfil(data as Profil | null);
      } else setProfil(null);
      setChargement(false);
    };
    void supabase.auth.getSession().then(({ data }) => charger(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, current) => void charger(current));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={{ user: session?.user ?? null, session, profil, chargement, deconnexion: async () => { await supabase.auth.signOut(); } }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return value;
};
