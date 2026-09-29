import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type User = {
  id: string;
  email: string | null;
  username: string;
  level: string;
  total_words: number;
} | null;

type AuthContextType = {
  token: string | null;
  loading: boolean;
  user: User;
  setToken: (t: string | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<User>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!supabase) {
      setTokenState(null);
      setUser(null);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setTokenState(data.session?.access_token ?? null);
      setUser(toVocabStreamUser(data.session?.user ?? null));
      setLoading(false);
    }).catch(() => { setTokenState(null); setUser(null); setLoading(false); });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTokenState(session?.access_token ?? null);
      setUser(toVocabStreamUser(session?.user ?? null));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  function setToken(t: string | null) {
    setTokenState(t);
  }

  async function logout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setTokenState(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

function toVocabStreamUser(user: SupabaseUser | null): User {
  if (!user) return null;

  const username =
    readString(user.user_metadata?.username) ||
    readString(user.user_metadata?.full_name) ||
    readString(user.user_metadata?.name) ||
    user.email?.split("@")[0] ||
    "Learner";

  return {
    id: user.id,
    email: user.email ?? null,
    username,
    level: readString(user.user_metadata?.level) || "",
    total_words: 0,
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
