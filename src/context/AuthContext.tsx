import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { User, UserProfile } from 'oidc-client-ts';
import { getUserManager, renewOidcUser, startOidcLogin } from '../lib/oidc';

interface AuthContextValue {
  // The full oidc-client-ts user, or null when signed out.
  user: User | null;
  // ID-token claims (sub, name, email, ...), or null when signed out.
  profile: UserProfile | null;
  accessToken: string | null;
  idToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  // True until the stored session has been read on startup.
  loading: boolean;
  // Set when the OIDC setup itself failed, e.g. config.json lacks the SSO
  // settings.
  error: string | null;
  login: () => Promise<void>;
  // Forgets the session locally; does not end the session at the IdP.
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    getUserManager()
      .then(async (userManager) => {
        if (cancelled) {
          return;
        }
        // The callback page and token renewals go through the shared
        // manager, so its events keep this context in sync with them.
        const onLoaded = (loaded: User) => setUser(loaded);
        const onUnloaded = () => setUser(null);
        // Renew shortly before the access token expires, and again once it
        // has expired, which is the first chance after the device slept or a
        // background tab's timers were throttled past the expiring event.
        const renew = () => {
          void renewOidcUser().then((renewed) => {
            if (!cancelled) {
              setUser(renewed);
            }
          });
        };
        const { events } = userManager;
        events.addUserLoaded(onLoaded);
        events.addUserUnloaded(onUnloaded);
        events.addUserSignedOut(onUnloaded);
        events.addAccessTokenExpiring(renew);
        events.addAccessTokenExpired(renew);
        unsubscribe = () => {
          events.removeUserLoaded(onLoaded);
          events.removeUserUnloaded(onUnloaded);
          events.removeUserSignedOut(onUnloaded);
          events.removeAccessTokenExpiring(renew);
          events.removeAccessTokenExpired(renew);
        };

        // Also arms the expiring/expired timers for the stored session.
        const stored = await userManager.getUser();
        // A session whose access token lapsed while the app was closed can
        // still be renewed with its refresh token.
        const current =
          stored && !stored.expired ? stored : await renewOidcUser();
        if (!cancelled) {
          setUser(current);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const login = useCallback(() => startOidcLogin(), []);

  const logout = useCallback(async () => {
    const userManager = await getUserManager();
    await userManager.removeUser();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile: user?.profile ?? null,
      accessToken: user?.access_token ?? null,
      idToken: user?.id_token ?? null,
      refreshToken: user?.refresh_token ?? null,
      isAuthenticated: user !== null,
      loading,
      error,
      login,
      logout,
    }),
    [user, loading, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
