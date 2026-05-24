export const environment = {
  production: true,
  supabase: {
    url: 'https://udsigrijzqgmtmkilluv.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkc2lncmlqenFnbXRta2lsbHV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MzU3MjQsImV4cCI6MjA4NDUxMTcyNH0.N9nlgm4oTtboTv4oyxa3wEfGM3A_BcGv1glPLCnF3d4',
    functionsUrl: 'https://udsigrijzqgmtmkilluv.supabase.co/functions/v1'
  },
  // Sentry configuration for production builds - set your DSN during deployment
  sentry: {
    dsn: 'https://85727d583c28765c78595a52696d74fb@o4509984646823936.ingest.de.sentry.io/4511446249111632',
    tracesSampleRate: 0.05
  }
};
