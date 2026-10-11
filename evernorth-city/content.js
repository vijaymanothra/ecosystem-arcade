// ============================================================
//  EVERNORTH CITY — settings, city layout and news events.
//  Businesses + permit questions live in questions.js (shared format with Master the Map).
// ============================================================

window.EC_CONFIG = {
  title: 'EVERNORTH CITY',
  tagline: 'Become mayor. Build a healthier city.',
  turns: 10,              // days (one build per day)
  newsEvery: 3,           // a city news event after every N days
  questionTime: 15,       // seconds per permit question
  factSec: 5,             // permit result auto-continues after this
  levelPop: [1000, 1500, 2500], // population gained for building level 1 / 2 / 3
  speedBonusMax: 500,     // extra population for a fast permit approval
  newsReward: 1500,       // population change when the city is ready for a news event…
  newsPenalty: -1000,     // …or not
  autoPickSec: 25,        // auto-pick a blueprint if nobody taps
  idleAbandonSec: 120,
  resultTimeoutSec: 60,
  leaderboardSize: 10,
  leaderboardScope: 'today', // 'today' or 'all'
  sound: true,
  ranks: [
    [0, 'Hamlet', '🏡'],
    [4000, 'Village', '🏘️'],
    [8000, 'Town', '🏙️'],
    [13000, 'City', '🌆'],
    [19000, 'Metropolis', '🌃'],
  ],
};

// 4 × 3 city blocks in reading order (back-left to front-right). 'park' and 'plaza' are decorative.
window.EC_PLOTS = [
  'cigna',   'express', 'accredo', 'enguide',
  'mdlive',  'park',    'plaza',   'evicore',
  'freedom', 'vfp',     'ebcg',    'curascript',
];

// Building style per business: tower | warehouse | lab | office | antenna | garden
window.EC_STYLES = {
  cigna: 'tower', express: 'warehouse', accredo: 'lab', enguide: 'office', freedom: 'garden',
  vfp: 'garden', mdlive: 'antenna', ebcg: 'garden', evicore: 'office', curascript: 'warehouse',
};

// Shown on blueprint cards
window.EC_ROLES = {
  cigna: 'Health insurance: medical, dental & international plans',
  express: 'Pharmacy benefit manager + home delivery',
  accredo: 'Specialty pharmacy for complex & rare conditions',
  enguide: 'Home delivery pharmacy for GLP-1 medications',
  freedom: 'Online fertility pharmacy + MedTEACH videos',
  vfp: 'Fertility pharmacy with on-site pickup',
  mdlive: '24/7 virtual care by phone or video',
  ebcg: 'In-person & virtual therapy',
  evicore: 'Prior authorization for health plans',
  curascript: 'Specialty drug distribution to hospitals',
};

// City news: if ANY business in `needs` is built, the city is ready (good outcome).
window.EC_EVENTS = [
  { icon: '🤒', needs: ['mdlive'], headline: 'FLU SEASON HITS THE CITY!',
    good: 'Citizens saw doctors by video, 24/7, with MDLIVE — no crowded waiting rooms.',
    bad: 'Without virtual care, waiting rooms overflowed.', tip: 'MDLIVE offers 24/7 virtual urgent care.' },
  { icon: '👶', needs: ['freedom', 'vfp'], headline: 'BABY BOOM IN EVERNORTH!',
    good: 'Fertility pharmacies supported families with medications, training videos and 24/7 specialists.',
    bad: 'Families had to leave the city for fertility support.', tip: 'Freedom Fertility & Village Fertility serve fertility patients.' },
  { icon: '🏢', needs: ['cigna'], headline: 'BIG EMPLOYER MOVES TO TOWN!',
    good: 'Cigna Healthcare covered the new employees with medical and dental plans.',
    bad: 'The employer couldn\'t find health plans for its people.', tip: 'Cigna Healthcare provides employer health coverage.' },
  { icon: '🏥', needs: ['curascript'], headline: 'HOSPITAL RUNS LOW ON INFUSIONS',
    good: 'CuraScript SD restocked the hospital\'s specialty drugs fast.',
    bad: 'Treatments were delayed without a specialty distributor.', tip: 'CuraScript SD distributes specialty drugs to hospitals & clinics.' },
  { icon: '🧬', needs: ['accredo'], headline: 'RARE DISEASE CASES RISE',
    good: 'Accredo delivered complex specialty medications with care at every step.',
    bad: 'Patients struggled to get complex specialty therapies.', tip: 'Accredo specializes in complex & rare conditions.' },
  { icon: '💉', needs: ['enguide'], headline: 'GLP-1 PRESCRIPTIONS SURGE',
    good: 'EnGuide pharmacists guided members to the right dose — with home delivery.',
    bad: 'Members had no dedicated GLP-1 support.', tip: 'EnGuide is Evernorth\'s GLP-1 home delivery pharmacy.' },
  { icon: '🧠', needs: ['ebcg', 'mdlive'], headline: 'STRESS SEASON AT WORK',
    good: 'Therapists helped citizens in person and by video.',
    bad: 'Citizens had nowhere to turn for therapy.', tip: 'Behavioral Care Group and MDLIVE both offer therapy.' },
  { icon: '📋', needs: ['evicore'], headline: 'MRI REQUESTS PILE UP',
    good: 'EviCore reviewed prior authorizations quickly with evidence-based guidelines.',
    bad: 'Imaging requests stalled in paperwork.', tip: 'EviCore manages prior authorization for health plans.' },
  { icon: '💊', needs: ['express'], headline: 'PRESCRIPTION COSTS SOAR',
    good: 'Express Scripts managed pharmacy benefits and mailed refills to homes.',
    bad: 'Nobody was managing the city\'s pharmacy benefits.', tip: 'Express Scripts is the pharmacy benefit manager (PBM).' },
];
