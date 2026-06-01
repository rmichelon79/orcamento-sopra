// Cliente Supabase — Plataforma Sopra (login único + dados do orçamento).
import { createClient } from "@supabase/supabase-js";

export const SB_URL = "https://cgnuelmiacweybmvlbcm.supabase.co";
// anon key — pública por design; RLS protege os dados.
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnbnVlbG1pYWN3ZXlibXZsYmNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDM0ODMsImV4cCI6MjA5Mjc3OTQ4M30.l02F-jt6CSgZf7wd5Dz0IY6jB9gCLzM6Iny7EsZLNSw";

export const supabase = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
