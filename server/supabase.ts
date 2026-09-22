import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. " +
          "Create a .env file in the project root with these values.",
      );
    }

    client = createClient(url, key);
  }
  return client;
}
