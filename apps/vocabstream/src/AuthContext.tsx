import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";  
import { apiMe } from "./api";

type User = { username: string; level: string; total_words: number } | null;

type AuthContextType = {
  token: string | null;
  user: User; //３行前で設定したのがここに入る
  setToken: (t: string | null) => void;
  logout: () => void;
};

//これを行うことで、他のコードですぐに使えるようになる
//ログインしていると上でセットしたAuthContextTypeが、ログインしていないとundefinedが使われる。
const AuthContext = createContext<AuthContextType | undefined>(undefined);

//このページの主なアウトプット、import AuthProvider from "./AuthContext.tsx"と使えるようになる
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  //useState is used to store the token in React state.
  //if login, use localStorage.getItem("token")
  //but if not logged in, return null
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<User>(null);
  const navigate = useNavigate(); // これで、navigateを使ってページの移動ができるようになる

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTokenState(window.localStorage.getItem("token"));
  }, []);

  useEffect(() => {
    if (token) { //if there is token
      apiMe(token) //fetch the token with API
        .then((res) => setUser(res.user))  //if successful, update res with res.user
        .catch(() => {
          setToken(null);  //if fails, clead the token
        });
    } else {
      setUser(null); //if no token, set user back to null
    }
  }, [token]);

  function setToken(t: string | null) {
    if (typeof window !== "undefined") {
      if (t) window.localStorage.setItem("token", t);
      else window.localStorage.removeItem("token");
    }
    setTokenState(t);
  }

  function logout() {
    setToken(null);
    navigate("/login"); // ← ログアウト後に必ずログインページへ
  }

  return (
    //wraps everything insider the context provider
    //any component calls useContext(AuthContext) will get access to token, user, setToken, and logout
    <AuthContext.Provider value={{ token, user, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
