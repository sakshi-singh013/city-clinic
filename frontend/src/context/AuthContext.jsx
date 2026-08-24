import React, { createContext, useContext, useState, useCallback } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("cc_user");
    return raw ? JSON.parse(raw) : null;
  });

  const persist = (token, user) => {
    localStorage.setItem("cc_token", token);
    localStorage.setItem("cc_user", JSON.stringify(user));
    setUser(user);
  };

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    persist(data.token, data.user);
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password, phone) => {
    const data = await api.post("/auth/register", { name, email, password, phone });
    persist(data.token, data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
