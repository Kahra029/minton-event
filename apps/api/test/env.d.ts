import type { D1Migration } from 'cloudflare:test';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      AUTH_RATE_LIMITER: RateLimit;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
