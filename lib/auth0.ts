import { Auth0Client } from "@auth0/nextjs-auth0/server";

const configured =
  !!process.env.AUTH0_DOMAIN && !!process.env.AUTH0_CLIENT_ID && !!process.env.AUTH0_SECRET;

/** null when Auth0 env vars are missing — the app falls back to nickname identity */
export const auth0: Auth0Client | null = configured ? new Auth0Client() : null;
