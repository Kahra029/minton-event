import type { D1Migration } from 'cloudflare:test';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      RESEND_API_KEY?: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
