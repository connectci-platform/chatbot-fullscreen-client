import { Client } from "@langchain/langgraph-sdk";

export function createClient(
  apiUrl: string,
  apiKey: string | undefined,
  authScheme: string | undefined,
) {
  return new Client({
    apiKey,
    apiUrl,
    ...(authScheme && {
      defaultHeaders: {
        "X-Auth-Scheme": authScheme,
      },
    }),
    // Send the SESSaccess_auth cookie on every call (notably /threads/search
    // for the sidebar) so an authenticated user's conversations are actually
    // returned. Without this the sidebar is empty even when signed in, which
    // also mis-fires the anon empty-state. Mirrors the Client in Stream.tsx.
    onRequest: (_url, init) => ({ ...init, credentials: "include" }),
  });
}
