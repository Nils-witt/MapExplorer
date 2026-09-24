import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { User } from 'oidc-client-ts';

// OIDC authorization-code flow with PKCE via oidc-client-ts, against the IdP
// configured via `oidcIssuer` / `oidcClientId` in config.json.

export const OIDC_CALLBACK_PATH = '/login/callback';

export interface OidcConfig {
  issuer: string;
  clientId: string;
}

export async function loadOidcConfig(): Promise<OidcConfig> {
  if (import.meta.env.DEV) {
    return {
      issuer: import.meta.env.VITE_OIDC_ISSUER,
      clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
    };
  }
  const response = await fetch('/config.json');
  if (!response.ok) {
    throw new Error(`Failed to load config.json (${response.status})`);
  }
  const config = (await response.json()) as {
    oidcIssuer?: string;
    oidcClientId?: string;
  };
  if (!config.oidcIssuer || !config.oidcClientId) {
    throw new Error(
      'SSO is not configured - set oidcIssuer and oidcClientId in config.json',
    );
  }
  return { issuer: config.oidcIssuer, clientId: config.oidcClientId };
}

// config.json is only fetched once; every caller shares the same manager so
// they all see the same signed-in user and renewal timers.
let userManagerPromise: Promise<UserManager> | null = null;

export function getUserManager(): Promise<UserManager> {
  if (!userManagerPromise) {
    userManagerPromise = loadOidcConfig().then(
      ({ issuer, clientId }) =>
        new UserManager({
          authority: issuer,
          client_id: clientId,
          redirect_uri: `${window.location.origin}${OIDC_CALLBACK_PATH}`,
          response_type: 'code',
          scope: 'openid profile offline_access',
          // Keep the session across tabs and reloads; the in-flight login
          // state stays in sessionStorage (the library default).
          userStore: new WebStorageStateStore({ store: window.localStorage }),
        }),
    );
    // Let a later call retry, e.g. after config.json is fixed.
    userManagerPromise.catch(() => {
      userManagerPromise = null;
    });
  }
  return userManagerPromise;
}

// Redirects the browser to the IdP's authorization endpoint. Never resolves
// on success, since the page navigates away.
export async function startOidcLogin(): Promise<void> {
  const userManager = await getUserManager();
  await userManager.signinRedirect();
}

// The login state is single-use, so a second call for the same callback URL
// (e.g. StrictMode re-running the callback page's effect) must share the
// first call's result rather than find the state already consumed.
const callbacksInFlight = new Map<string, Promise<User>>();

// Finishes the login from the query string the IdP redirected back with:
// verifies `state`, redeems the code and stores the resulting user.
export function completeOidcLogin(search: string): Promise<User> {
  let inFlight = callbacksInFlight.get(search);
  if (!inFlight) {
    inFlight = getUserManager().then((userManager) =>
      userManager.signinRedirectCallback(
        `${window.location.origin}${OIDC_CALLBACK_PATH}${search}`,
      ),
    );
    callbacksInFlight.set(search, inFlight);
  }
  return inFlight;
}

// The signed-in user (access/refresh/ID token, profile), or null when signed
// out or the stored session has expired.
export async function getOidcUser(): Promise<User | null> {
  const user = await (await getUserManager()).getUser();
  return user && !user.expired ? user : null;
}
