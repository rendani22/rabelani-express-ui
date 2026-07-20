/**
 * Runtime config. The Supabase anon key is a public client key (already shipped
 * in the app bundle) — safe to keep here. Override via Vite env vars when set.
 */
export const config = {
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL ?? 'https://qmnqffpwvsvngjmyisrf.supabase.co',
    anonKey:
      import.meta.env.VITE_SUPABASE_ANON_KEY ??
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnFmZnB3dnN2bmdqbXlpc3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDY2NDAsImV4cCI6MjA5NzI4MjY0MH0.EWNr5ppEYiT7VBsgTWIPJn3p1VRaZ7JshvsDXczavA0',
    functionsUrl:
      import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ??
      'https://qmnqffpwvsvngjmyisrf.supabase.co/functions/v1',
  },
} as const
