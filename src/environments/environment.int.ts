export const environment = {
  appEnvironment: 'int',
  production: true,
  supabase: {
    url: 'https://qmnqffpwvsvngjmyisrf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnFmZnB3dnN2bmdqbXlpc3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDY2NDAsImV4cCI6MjA5NzI4MjY0MH0.EWNr5ppEYiT7VBsgTWIPJn3p1VRaZ7JshvsDXczavA0',
    functionsUrl: 'https://qmnqffpwvsvngjmyisrf.supabase.co/functions/v1'
  },
  // Sentry configuration for production builds - set your DSN during deployment
  sentry: {
    dsn: 'https://85727d583c28765c78595a52696d74fb@o4509984646823936.ingest.de.sentry.io/4511446249111632',
    tracesSampleRate: 0.05
  }
};
