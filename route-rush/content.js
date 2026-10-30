// ============================================================
//  ROUTE RUSH — edit this file to customise. No code changes needed.
//  Content source: the public websites of each business (Oct 2026).
//  Please have Comms/Compliance review before the event.
// ============================================================

window.RR_CONFIG = {
  title: 'ROUTE RUSH',
  subtitle: 'Get every request to the right business — fast!',
  hearts: 5,                 // solo: a wrong route or an expired request costs one
  maxQueue: 5,               // most requests waiting at once
  powerupChance: 0.12,       // chance a request carries a power-up
  eventDuration: 8,          // seconds a rush event lasts
  eventSpawnFactor: 0.55,    // during a rush, requests arrive this much faster
  wrongRevealMs: 1400,       // how long the correct answer is shown after a mistake
  resultTimeoutSec: 45,      // results / name / ready screens return to attract after this much inactivity
  leaderboardSize: 10,
  leaderboardScope: 'today', // 'today' (resets daily) or 'all'
  sound: true,

  // Each level unlocks more businesses on the board.
  levels: [
    { name: 'LEVEL 1', subtitle: 'The Core Four',     duration: 40, spawnEvery: 4.0, patience: 14, event: false,
      unlock: ['cigna', 'express', 'mdlive', 'curascript'] },
    { name: 'LEVEL 2', subtitle: 'Specialty & Care',  duration: 50, spawnEvery: 3.3, patience: 12, event: true,
      unlock: ['accredo', 'ebcg', 'evicore'] },
    { name: 'LEVEL 3', subtitle: 'The Full Map',      duration: 60, spawnEvery: 2.7, patience: 11, event: true,
      unlock: ['enguide', 'freedom', 'vfp'] },
  ],

  duel: {
    levelDurations: [25, 30, 35], // shorter levels, no pauses between them
    wrongPenalty: 50,             // points lost for a wrong route
    expirePenalty: 50,            // points lost when a request runs out of patience
  },
};

// Hub order on screen: first 5 = top row, last 5 = bottom row. Swap colours for official brand colours.
window.RR_BUSINESSES = [
  { id: 'cigna',      name: 'Cigna Healthcare',                short: 'Cigna Healthcare',      icon: '🛡️', color: '#1565c0',
    role: 'Health insurance: medical, dental & international plans' },
  { id: 'express',    name: 'Express Scripts',                 short: 'Express Scripts',       icon: '💊', color: '#00897b',
    role: 'Pharmacy benefit manager + everyday home delivery' },
  { id: 'accredo',    name: 'Accredo Specialty Pharmacy',      short: 'Accredo',               icon: '🧬', color: '#8e24aa',
    role: 'Specialty pharmacy for complex & rare conditions' },
  { id: 'enguide',    name: 'Evernorth EnGuide Pharmacy',      short: 'EnGuide',               icon: '💉', color: '#e65100',
    role: 'Home delivery pharmacy for GLP-1 medications' },
  { id: 'freedom',    name: 'Freedom Fertility Pharmacy',      short: 'Freedom Fertility',     icon: '🌱', color: '#d81b60',
    role: 'Online fertility pharmacy with MedTEACH injection videos' },
  { id: 'vfp',        name: 'Village Fertility Pharmacy',      short: 'Village Fertility',     icon: '🌸', color: '#a8730a',
    role: 'Fertility pharmacy with on-site pickup in Boston, Chicago, Phoenix & LA' },
  { id: 'mdlive',     name: 'MDLIVE',                          short: 'MDLIVE',                icon: '📱', color: '#2e7d32',
    role: '24/7 virtual care: urgent, primary, mental health & skin' },
  { id: 'ebcg',       name: 'Evernorth Behavioral Care Group', short: 'Behavioral Care',       icon: '🧠', color: '#3949ab',
    role: 'In-person & virtual therapy for individuals, couples & families' },
  { id: 'evicore',    name: 'EviCore',                         short: 'EviCore',               icon: '📋', color: '#c62828',
    role: 'Prior authorization & utilization management for health plans' },
  { id: 'curascript', name: 'CuraScript SD',                   short: 'CuraScript SD',         icon: '🚚', color: '#546e7a',
    role: 'Specialty drug distribution to hospitals & clinics' },
];

// to: business id that should handle it. tip: shown when a player gets it wrong (falls back to the business role).
window.RR_REQUESTS = [
  // ---------- Cigna Healthcare ----------
  { to: 'cigna', from: '🏢 Employer',   text: 'We need medical and dental plans for our 500 employees.' },
  { to: 'cigna', from: '👩 Member',     text: 'I want to buy health insurance for my family on my own.' },
  { to: 'cigna', from: '👨 Member',     text: 'Where can I see my claims and my digital ID card?', tip: 'Claims & ID cards live in the myCigna app → Cigna Healthcare' },
  { to: 'cigna', from: '👩 Member',     text: 'I\'m moving abroad for work and need international health coverage.', tip: 'Cigna Global covers 200+ countries → Cigna Healthcare' },
  { to: 'cigna', from: '🧑 Member',     text: 'Open enrollment is here — I want to compare health plans.' },
  { to: 'cigna', from: '👨 Member',     text: 'I need a dental plan that can include vision and hearing.' },
  { to: 'cigna', from: '🤝 Broker',     text: 'My client wants quotes on group health insurance.' },
  { to: 'cigna', from: '👩 Member',     text: 'Which in-network doctors does my health plan cover?' },
  { to: 'cigna', from: '🧳 Member',     text: 'I\'m retiring overseas and need international health insurance.', tip: 'Cigna Global serves expats, retirees, students & families → Cigna Healthcare' },
  { to: 'cigna', from: '🏢 Employer',   text: 'We have 40 staff working abroad and need global health plans.', tip: 'Cigna Global covers small businesses (2–149 employees) and large corporates' },
  { to: 'cigna', from: '👨 Member',     text: 'It\'s midnight — can I shop for a dental plan online right now?', tip: 'Cigna dental plans can be shopped online 24/7/365' },

  // ---------- Express Scripts ----------
  { to: 'express', from: '🏢 Employer',    text: 'We need a partner to manage our prescription drug benefit.', tip: 'Managing pharmacy benefits = the PBM → Express Scripts' },
  { to: 'express', from: '👨 Member',      text: 'Please mail my monthly cholesterol pills to my home.' },
  { to: 'express', from: '🏛️ Health plan', text: 'We want a PBM to help manage our members\' pharmacy costs.' },
  { to: 'express', from: '👩 Member',      text: 'How do I move my everyday prescription to home delivery?' },
  { to: 'express', from: '👨‍⚕️ Doctor',     text: 'I need to submit a pharmacy prior authorization through ExpressPAth.', tip: 'ExpressPAth is Express Scripts\' prior auth tool for prescribers' },
  { to: 'express', from: '🤝 Union',       text: 'Our labor union needs pharmacy benefits for its members.' },
  { to: 'express', from: '👨 Member',      text: 'My blood-pressure refill is due — send it to my house.', tip: 'Everyday (non-GLP-1) home delivery → Express Scripts Pharmacy' },
  { to: 'express', from: '🏛️ Agency',      text: 'Our federal agency needs pharmacy benefit services.' },
  { to: 'express', from: '👩 Member',      text: 'Set up automatic refills on my long-term meds, delivered home.' },
  { to: 'express', from: '🏙️ City',        text: 'Our city government needs pharmacy benefits for its employees.', tip: 'Express Scripts serves the public sector, unions, employers and health plans' },
  { to: 'express', from: '👨 Member',      text: 'Where can I track the coverage review for my prescription?', tip: 'Express Scripts calls pharmacy prior authorizations "coverage reviews"' },

  // ---------- Accredo ----------
  { to: 'accredo', from: '👩 Member',    text: 'I have a rare disease and need a complex specialty medication.' },
  { to: 'accredo', from: '👨‍⚕️ Doctor',   text: 'My patient needs a specialty therapy with ongoing support.' },
  { to: 'accredo', from: '👨 Member',    text: 'My specialty injectable for a rare condition needs careful handling.' },
  { to: 'accredo', from: '👨‍⚕️ Doctor',   text: 'I want to manage my specialty patients in MyAccredoPatients.' },
  { to: 'accredo', from: '🧪 Pharma',    text: 'We\'re launching a rare-disease drug and need a specialty PHARMACY partner.', tip: 'Dispensing to patients = Accredo. Distributing to providers = CuraScript SD' },
  { to: 'accredo', from: '👩 Member',    text: 'I need help with approvals and copay assistance for my specialty therapy.' },
  { to: 'accredo', from: '👨 Member',    text: 'Can my specialty medication be delivered to my doctor\'s office?' },
  { to: 'accredo', from: '👩 Member',    text: 'My complex condition needs dose reminders and care coordination.' },
  { to: 'accredo', from: '👨 Member',    text: 'My hemophilia medication needs refrigerated shipping to my home.', tip: 'Accredo ships refrigerated specialty meds with coolant packs' },
  { to: 'accredo', from: '👩 Member',    text: 'I have multiple sclerosis and need my specialty medication delivered.' },
  { to: 'accredo', from: '👨 Member',    text: 'I need a copay assistance program for my specialty drug.', tip: 'Accredo\'s Copay Assistance search tool → Accredo' },

  // ---------- EnGuide ----------
  { to: 'enguide', from: '👩 Member',  text: 'My doctor prescribed a GLP-1 — can I get it delivered with dosing help?', tip: 'GLP-1 home delivery + dose guidance → EnGuide' },
  { to: 'enguide', from: '👨 Member',  text: 'Can I split the cost of my GLP-1 into 3 payments?', tip: 'EnGuide\'s Extended Payment Plan = 3 equal payments' },
  { to: 'enguide', from: '👩 Member',  text: 'I\'d like a 90-day supply of my GLP-1 with free shipping.' },
  { to: 'enguide', from: '👨‍⚕️ Doctor', text: 'My patient is starting a GLP-1 and needs a pharmacy that guides them.' },
  { to: 'enguide', from: '👨 Member',  text: 'Can a pharmacist help me reach my optimal GLP-1 dose safely?' },
  { to: 'enguide', from: '👩 Member',  text: 'Can I use my GLP-1 manufacturer savings card with home delivery?' },
  { to: 'enguide', from: '👨 Member',  text: 'Remind me 7 days before my GLP-1 refill is due.', tip: 'EnGuide sends GLP-1 refill reminders 7 days and 2 days ahead' },
  { to: 'enguide', from: '👩 Member',  text: 'Can my GLP-1 pharmacist work with my doctor to help me save money?' },

  // ---------- Freedom Fertility ----------
  { to: 'freedom', from: '👩 Member',  text: 'I\'m nervous about my fertility injections — are there video guides?', tip: 'MedTEACH injection videos → Freedom Fertility' },
  { to: 'freedom', from: '👩 Member',  text: 'I want to order my fertility meds from an ONLINE pharmacy.', tip: 'Online fertility pharmacy = Freedom. On-site pickup = Village Fertility' },
  { to: 'freedom', from: '👩 Member',  text: 'I\'m freezing my eggs and need fertility preservation meds shipped.' },
  { to: 'freedom', from: '👨 Member',  text: 'Our clinic prescribed a compounded fertility medication — please ship it.' },
  { to: 'freedom', from: '👩 Member',  text: 'New fertility order — help me "Get StARTed".', tip: '"Get StARTed" is Freedom Fertility\'s onboarding' },
  { to: 'freedom', from: '👩 Member',  text: 'It\'s midnight — I want to order my fertility refills online now.' },
  { to: 'freedom', from: '👨‍⚕️ Doctor', text: 'I\'m sending a fertility prescription to "America\'s Leading Fertility Pharmacy".', tip: '"America\'s Leading Fertility Pharmacy" → Freedom Fertility' },
  // ---------- Village Fertility ----------
  { to: 'vfp', from: '👩 Member',     text: 'I\'m in Chicago — can I pick up my fertility meds in person today?', tip: 'On-site pickup in Boston, Chicago, Phoenix & LA → Village Fertility' },
  { to: 'vfp', from: '👩 Member',     text: 'Boston patient here — I\'d rather collect my IVF medication on-site.' },
  { to: 'vfp', from: '🏥 Clinic',     text: 'Our Phoenix fertility clinic wants a local fertility pharmacy partner.' },
  { to: 'vfp', from: '👨 Member',     text: 'I\'m in Los Angeles and want to pick up our fertility meds at the pharmacy.' },
  { to: 'vfp', from: '🏥 Clinic',     text: 'Our fertility clinic staff would like medication education sessions.', tip: 'Village Fertility offers education services for clinic staff' },
  { to: 'vfp', from: '👩 Member',     text: 'I\'m in Phoenix — can I pick up my IVF meds at the old Integrity Rx?', tip: 'Integrity Rx (Phoenix, LA) is now part of Village Fertility' },
  { to: 'vfp', from: '🏥 Clinic',     text: 'Our IVF nurses want continuing-education classes on fertility meds.', tip: 'Village Fertility is an approved continuing-education provider for nurses' },

  // ---------- MDLIVE ----------
  { to: 'mdlive', from: '👩 Member', text: 'It\'s 2 a.m. and I have a sinus infection — I need a doctor now.' },
  { to: 'mdlive', from: '👨 Member', text: 'I have pink eye and don\'t want to leave the house.' },
  { to: 'mdlive', from: '👩 Member', text: 'Can I see a dermatologist by video about this rash?' },
  { to: 'mdlive', from: '👨 Member', text: 'I\'d like a virtual therapy session from home tonight.', tip: 'Virtual, on-demand therapy → MDLIVE. In-person therapy → Behavioral Care Group' },
  { to: 'mdlive', from: '👩 Member', text: 'I need a virtual primary care check-up for my blood pressure.' },
  { to: 'mdlive', from: '👨 Member', text: 'Fever on a holiday weekend — can I see a doctor by video?' },
  { to: 'mdlive', from: '👩 Member', text: 'I need an ASL interpreter for my virtual doctor visit.' },
  { to: 'mdlive', from: '👪 Parent', text: 'My 14-year-old wants to talk to a therapist by video.', tip: 'MDLIVE therapy includes ages 10–17. Behavioral Care Group treats adults 18+' },
  { to: 'mdlive', from: '👨 Member', text: 'I\'d like my yearly wellness screening without leaving home.' },
  { to: 'mdlive', from: '👩 Member', text: 'I need a psychiatrist by video to talk about medication.', tip: 'MDLIVE offers virtual psychiatry. Behavioral Care Group doesn\'t offer psychiatry' },

  // ---------- Evernorth Behavioral Care Group ----------
  { to: 'ebcg', from: '👫 Couple',   text: 'My partner and I want couples counseling in person.', tip: 'In-person therapy for couples & families → Behavioral Care Group' },
  { to: 'ebcg', from: '👪 Family',   text: 'Our family needs a therapist we can visit together.' },
  { to: 'ebcg', from: '👩 Member',   text: 'I\'d like to see a therapist face-to-face at a local office.' },
  { to: 'ebcg', from: '👨 Member',   text: 'I want to find a therapist near me and book through a client portal.' },
  { to: 'ebcg', from: '👩 Member',   text: 'I\'m feeling anxious and want ongoing in-person therapy.' },
  { to: 'ebcg', from: '💍 Couple',   text: 'We\'re engaged and want pre-marital counseling in person.' },
  { to: 'ebcg', from: '👨 Member',   text: 'Burnout at work — can a Care Navigator match me with a therapist?', tip: 'Care Navigators match patients to therapists → Behavioral Care Group' },

  // ---------- EviCore ----------
  { to: 'evicore', from: '🏛️ Health plan', text: 'We need clinical review of MRI and CT scan requests.', tip: 'Prior auth & utilization management for plans → EviCore' },
  { to: 'evicore', from: '👨‍⚕️ Doctor',     text: 'I need prior authorization for my patient\'s cardiology procedure.' },
  { to: 'evicore', from: '🏛️ Health plan', text: 'Help us guide members to cost-effective sites of care.' },
  { to: 'evicore', from: '👨‍⚕️ Doctor',     text: 'Can I automate my prior authorizations with intelliPath?' },
  { to: 'evicore', from: '🏛️ Health plan', text: 'We want utilization management for radiation oncology.' },
  { to: 'evicore', from: '🏛️ Health plan', text: 'Our members are missing preventive screenings — can you do outreach?' },
  { to: 'evicore', from: '👨‍⚕️ Doctor',     text: 'I\'d like a peer-to-peer review on a sleep study request.' },
  { to: 'evicore', from: '👨‍⚕️ Doctor',     text: 'Our Epic EHR should submit medical prior authorizations automatically.', tip: 'EviCore intelliPath® connects to EHRs like Epic' },
  { to: 'evicore', from: '🏛️ Health plan', text: 'Help us manage the cost of surgical implants.', tip: 'Implant Management is part of EviCore\'s payment integrity solutions' },
  { to: 'evicore', from: '🏛️ Health plan', text: 'We need home health care coordination for our members.' },

  // ---------- CuraScript SD ----------
  { to: 'curascript', from: '🏥 Hospital', text: 'Our infusion center needs to restock specialty drugs.', tip: 'Supplying hospitals & clinics = CuraScript SD (Specialty Distribution)' },
  { to: 'curascript', from: '🏥 Clinic',   text: 'Our oncology clinic needs injectables delivered in bulk.' },
  { to: 'curascript', from: '🏥 Clinic',   text: 'We want group purchasing discounts through a GPO.', tip: 'Matrix GPO is part of CuraScript SD' },
  { to: 'curascript', from: '🧪 Pharma',   text: 'We need a DISTRIBUTOR to get our gene therapy to treatment centers.', tip: 'Distributing to providers = CuraScript SD. Dispensing to patients = Accredo' },
  { to: 'curascript', from: '🏥 Hospital', text: 'Please ship biosimilars to our hospital pharmacy department.' },
  { to: 'curascript', from: '🏥 Clinic',   text: 'Our eye clinic needs to restock its injectable medications.' },
  { to: 'curascript', from: '🏥 Hospital', text: 'We need third-party logistics for our specialty products.' },
  { to: 'curascript', from: '🧪 Pharma',   text: 'Our rare-disease drug needs a DISTRIBUTOR with stat delivery to hospitals.', tip: 'Stat delivery within hours to providers → CuraScript SD' },
  { to: 'curascript', from: '🏥 Surgery center', text: 'Our surgery center needs specialty products delivered.' },
  { to: 'curascript', from: '🏥 Clinic',   text: 'Our neurology practice wants to order specialty drugs online.' },
];

// Rush events: requests from these businesses flood in, faster, for double points.
window.RR_EVENTS = [
  { name: '🤒 FLU SEASON!',        bias: ['mdlive'] },
  { name: '📅 OPEN ENROLLMENT!',   bias: ['cigna', 'express'] },
  { name: '🧬 SPECIALTY SURGE!',   bias: ['accredo', 'curascript'] },
  { name: '🧠 WELLNESS MONTH!',    bias: ['ebcg', 'mdlive'] },
  { name: '🍼 FERTILITY WEEK!',    bias: ['freedom', 'vfp'] },
  { name: '💉 GLP-1 BOOM!',        bias: ['enguide', 'express'] },
];
