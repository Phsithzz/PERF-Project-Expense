import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";

import * as authApi from "../api/auth-api";
import { setAccessToken, subscribeToUnauthorized } from "../api/token-store";
import type { User } from "../api/types";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let active = true;

    void authApi
      .refreshSession()
      .then((session) => {
        if (!active) return;
        setAccessToken(session.accessToken);
        setUser(session.user);
      })
      .catch(() => {
        if (!active) return;
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) setIsBootstrapping(false);
      });

    const unsubscribe = subscribeToUnauthorized(() => {
      setUser(null);
      queryClient.clear();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isBootstrapping,
      login: async (input) => {
        const session = await authApi.login(input);
        setAccessToken(session.accessToken);
        setUser(session.user);
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          setAccessToken(null);
          setUser(null);
          queryClient.clear();
        }
      },
    }),
    [isBootstrapping, queryClient, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
