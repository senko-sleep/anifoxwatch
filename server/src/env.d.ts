/**
 * Cloudflare Workers – Strongly-typed Environment Bindings
 *
 * Every variable, secret, and KV namespace declared in wrangler.toml is
 * mirrored here. Import this interface wherever you need `Env`:
 *
 *   import type { Env } from '../env.d.ts';
 *   const app = new Hono<{ Bindings: Env }>();
 */

export interface Env {
  // -----------------------------------------------------------------------
  // Public variables (wrangler.toml [vars] block)
  // -----------------------------------------------------------------------
  /** "development" | "staging" | "production" */
  NODE_ENV: string;

  /** "debug" | "info" | "warn" | "error" */
  LOG_LEVEL: string;

  /** Semver string, e.g. "1.0.0" */
  API_VERSION: string;

  /** Worker's own name, useful in logging */
  WORKER_NAME: string;

  // External API base URLs
  ANILIST_API_URL: string;
  JIKAN_API_URL: string;
  HIANIME_REST_URL: string;

  // Timeout settings (all values are numeric strings from TOML)
  GLOBAL_TIMEOUT_MS: string;
  API_CALL_TIMEOUT_MS: string;
  FETCH_RETRY_COUNT: string;
  FETCH_RETRY_DELAY_MS: string;

  // Feature flags (string "true" | "false" from TOML)
  ENABLE_KV_CACHING: string;
  ENABLE_REQUEST_LOGGING: string;

  // Cache TTL configuration (seconds, as strings)
  CACHE_TTL_SEARCH: string;
  CACHE_TTL_TRENDING: string;
  CACHE_TTL_SEASONAL: string;
  CACHE_TTL_ANIME_DETAIL: string;

  // -----------------------------------------------------------------------
  // Secrets (injected by Cloudflare at runtime via `wrangler secret put`)
  // These are NOT in wrangler.toml values – they are encrypted server-side.
  // -----------------------------------------------------------------------

  /**
   * AniList OAuth client secret (if you use authenticated queries).
   * Set via: npx wrangler secret put ANILIST_CLIENT_SECRET --env production
   */
  ANILIST_CLIENT_SECRET: string | undefined;

  /**
   * Internal API key for guarding admin endpoints like /api/cache/purge.
   * Set via: npx wrangler secret put INTERNAL_API_KEY --env production
   */
  INTERNAL_API_KEY: string | undefined;

  // -----------------------------------------------------------------------
  // KV Namespace Bindings (wrangler.toml [[kv_namespaces]])
  // -----------------------------------------------------------------------

  /**
   * Distributed edge cache for API responses.
   * Accessed via: env.CACHE_STORE.get(key), env.CACHE_STORE.put(key, value, { expirationTtl })
   *
   * May be undefined when running `wrangler dev` without a preview KV namespace.
   */
  CACHE_STORE: KVNamespace | undefined;
}
