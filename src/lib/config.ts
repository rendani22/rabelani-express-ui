/**
 * Runtime config. The Supabase anon key is a public client key (already shipped
 * in the app bundle) — safe to keep here. Override via Vite env vars when set.
 */
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://qmnqffpwvsvngjmyisrf.supabase.co'

// Known Supabase project refs, so the env placard can be derived from the
// backend the app is *actually* talking to (see `envLabel` below). Keep these
// in sync with the `supabase:link-*` scripts in package.json.
const PROJECT_REFS = {
  prod: 'udsigrijzqgmtmkilluv',
  dev: 'qmnqffpwvsvngjmyisrf',
} as const

/**
 * Header env marker, derived from the resolved Supabase URL — never hardcoded,
 * so it cannot drift from reality. Empty string in production (the app hides
 * the placard); "DEV"/"INT" otherwise as a caution that this isn't prod. A
 * misconfigured deploy that points prod at the dev DB will visibly read "DEV".
 */
function deriveEnvLabel(url: string): string {
  if (url.includes(PROJECT_REFS.prod)) return ''
  if (url.includes(PROJECT_REFS.dev)) return 'DEV'
  return 'INT'
}

export const config = {
  supabase: {
    url: supabaseUrl,
    anonKey:
      import.meta.env.VITE_SUPABASE_ANON_KEY ??
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnFmZnB3dnN2bmdqbXlpc3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDY2NDAsImV4cCI6MjA5NzI4MjY0MH0.EWNr5ppEYiT7VBsgTWIPJn3p1VRaZ7JshvsDXczavA0',
    functionsUrl:
      import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ??
      'https://qmnqffpwvsvngjmyisrf.supabase.co/functions/v1',
  },
  envLabel: deriveEnvLabel(supabaseUrl),
} as const
