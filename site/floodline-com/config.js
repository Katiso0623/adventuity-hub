/* Adventuity Floodline — site configuration. Edit these values, then re-upload the site. */
window.FL_CONFIG = {
  // 'za' for www.adventuity.co.za, 'intl' for www.adventuity.com (set by the build)
  market: 'intl',
  brand: {
    company: 'Adventuity (Pty) Ltd',
    short: 'Adventuity',
    product: 'Floodline',
    slogan: 'Transforming ideas into reality.',
    logo: '',                      // optional: path to your logo image, e.g. 'assets/logo.png'
  },
  // Shown on the public website only when filled in.
  contact: { phone: '082 397 6521', whatsapp: '27823976521', email: 'Nthastara@yahoo.com', area: 'Worldwide, from South Africa' },
  // Quote requests are sent to this secure form function in your Adventuity Supabase project.
  quotes: {
    endpoint: 'https://sxbpjowkcpysoxurfqzo.supabase.co/functions/v1/floodline-quote',
    key: 'sb_publishable_K6kU-7Ghj5kPH-6cKP3BJg_8Htk1mmp',
  },
  // Online payment of accepted quotes (Yoco checkout through the floodline-pay function).
  payments: { endpoint: 'https://sxbpjowkcpysoxurfqzo.supabase.co/functions/v1/floodline-pay' },
  // Public rainfall and river-flow records near a site (floodline-data function, refreshed weekly).
  data: { endpoint: 'https://sxbpjowkcpysoxurfqzo.supabase.co/functions/v1/floodline-data' },
  // Used by the Studio's "Quote requests" tab (sign in with your Adventuity portal admin account).
  supabase: { url: 'https://sxbpjowkcpysoxurfqzo.supabase.co', key: 'sb_publishable_K6kU-7Ghj5kPH-6cKP3BJg_8Htk1mmp' },
  // Optional pricing cards on the public site. Leave empty to show "quoted per site".
  pricing: [
    { name: 'Desktop flood line study', price: 'from R6 500', text: 'Single erf or small site on available terrain data: report and flood line plan in 5 working days. For building plans, due diligence and preliminary layouts.' },
    { name: 'Flood line report for approval', price: 'from R16 500', text: 'On your survey or LiDAR: full report, A3 drawings, CAD and HEC-RAS files, certified by a registered professional engineer. 10 working days from receipt of the survey.' },
    { name: 'Township, mining or large catchment', price: 'from R35 000', text: 'Townships, mines (GN 704) and large catchments with bridges, culverts and stormwater. Quoted per site.' },
    { name: 'Bridge or culvert hydraulic check', price: 'from R9 500', text: 'Flood levels, afflux and freeboard at the crossing, with inlet and outlet control. 5 working days.' },
    { name: 'Pre-purchase flood risk letter', price: 'R2 500', text: 'For buyers, estate agents and lenders: where the property lies relative to the 1:50 and 1:100 year flood lines, on a plan, in 3 working days.' },
  ],
  // Google Ads account 540-666-2849: the Google tag is loaded on every public page and each quote request fires the
  // "Request quote" conversion (conversion type ID 7883804816). Neither value is secret.
  ads: { gtagId: 'AW-18547560118', conversionLabel: 'T4zcCJChpa8dELadlYxF' },
  // Default report details in the Studio (editable per job).
  report: { preparedBy: 'J.K. Mokoena', initials: 'JKM', engineer: 'Kananelo Moloi, Pr Eng', ecsa: '202403242', drawingPrefix: 'ADV-FL', reportPrefix: 'ADV-FL' },
  // Optional light gate for the Studio page: SHA-256 hex of a passcode. Leave empty for no gate.
  // The Studio is shipped encrypted; the key is released only to signed-in administrators (Supabase row-level security).
  // Satellite imagery for the map and the plan drawing (Esri World Imagery). Add an ArcGIS Location Platform key for commercial use.
  imagery: { esriKey: '' },
  studio: { bundle: 'js/studio.bundle.enc?v=20261031093230', passcodeSha256: '' },
};
