import { createClient } from "@supabase/supabase-js";

// Tolerates a URL pasted with "/rest/v1/" or a trailing slash
const supabaseUrl = ((import.meta.env.VITE_SUPABASE_URL as string) || "").replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);