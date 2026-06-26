export const environment = {
  appEnvironment: 'local',
  production: false,
  supabase: {
    url: 'http://127.0.0.1:54321',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    functionsUrl: 'http://127.0.0.1:54321/functions/v1'
  },
  // Sentry configuration - leave dsn empty for local/dev unless you want to capture dev errors
  sentry: {
    dsn: '',
    tracesSampleRate: 0
  }
};
