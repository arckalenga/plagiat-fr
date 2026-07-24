import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

export type Profil = { id: string; email: string; nom_complet: string; role: "utilisateur" | "administrateur"; statut: "en_attente" | "approuve" | "refuse" | "expire"; valide_jusqu_au: string | null };
type AuthValue = { user: User | null; session: Session | null; profil: Profil | null; chargement: boolean; rafraichirProfil: () => Promise<Profil | null>; deconnexion: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [chargement, setChargement] = useState(true);
  const chargerProfil = useCallback(async (utilisateurId: string) => {
    const { data } = await supabase.from("profils").select("*").eq("id", utilisateurId).maybeSingle();
    const profilCharge = data as Profil | null;
    setProfil(profilCharge);
    return profilCharge;
  }, []);
  const rafraichirProfil = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfil(null);
      return null;
    }
    return chargerProfil(user.id);
  }, [chargerProfil]);
  useEffect(() => {
    if (!supabaseConfigured) { setChargement(false); return; }
    const charger = async (current: Session | null) => {
      setSession(current);
      if (current?.user) {
        await chargerProfil(current.user.id);
      } else setProfil(null);
      setChargement(false);
    };
    void supabase.auth.getSession().then(({ data }) => charger(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, current) => void charger(current));
    return () => data.subscription.unsubscribe();
  }, [chargerProfil]);
  return <AuthContext.Provider value={{ user: session?.user ?? null, session, profil, chargement, rafraichirProfil, deconnexion: async () => { await supabase.auth.signOut(); } }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return value;
};
