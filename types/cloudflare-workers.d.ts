declare module "cloudflare:workers" {
  import type { D1Database } from "@miniflare/d1";

  export const env: {
    DB?: D1Database;
  };
}
