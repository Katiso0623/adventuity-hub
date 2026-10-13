/* Adventuity Floodline — site configuration. Edit these values, then re-upload the site. */
window.FL_CONFIG = {
  brand: {
    company: 'Adventuity (Pty) Ltd',
    short: 'Adventuity',
    product: 'Floodline',
    slogan: 'Transforming ideas into reality.',
    logo: '',                      // optional: path to your logo image, e.g. 'assets/logo.png'
  },
  // Shown on the public website only when filled in.
  contact: { phone: '', whatsapp: '', email: '', area: 'Gauteng, Free State and nationwide' },
  // Quote requests are sent to this secure form function in your Adventuity Supabase project.
  quotes: {
    endpoint: 'https://sxbpjowkcpysoxurfqzo.supabase.co/functions/v1/floodline-quote',
    key: 'sb_publishable_K6kU-7Ghj5kPH-6cKP3BJg_8Htk1mmp',
  },
  // Used by the Studio's "Quote requests" tab (sign in with your Adventuity portal admin account).
  supabase: { url: 'https://sxbpjowkcpysoxurfqzo.supabase.co', key: 'sb_publishable_K6kU-7Ghj5kPH-6cKP3BJg_8Htk1mmp' },
  // Optional pricing cards on the public site. Leave empty to show "quoted per site".
  pricing: [],
  // Default report details in the Studio (editable per job).
  report: { preparedBy: 'J.K. Mokoena', initials: 'JKM', engineer: '', ecsa: '', drawingPrefix: 'ADV-FL', reportPrefix: 'ADV-FL' },
  // Optional light gate for the Studio page: SHA-256 hex of a passcode. Leave empty for no gate.
  // The Studio is shipped encrypted; the key is released only to signed-in administrators (Supabase row-level security).
  // Satellite imagery for the map and the plan drawing (Esri World Imagery). Add an ArcGIS Location Platform key for commercial use.
  imagery: { esriKey: '' },
  studio: { bundle: 'js/studio.bundle.enc?v=20261013071419', passcodeSha256: '' },
};
