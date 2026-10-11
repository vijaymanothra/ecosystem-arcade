// ============================================================
//  THE HEALTH JOURNEY — board game settings, board layout and event cards.
//  Businesses + challenge questions live in questions.js (shared format with Master the Map).
// ============================================================

window.HJ_CONFIG = {
  title: 'THE HEALTH JOURNEY',
  kicker: 'A BOARD GAME THROUGH THE CIGNA GROUP',
  tagline: 'Roll the dice · Take on challenges · Collect all 10 stamps',
  maxRounds: { 1: 12, 2: 10, 3: 8, 4: 7 }, // game also ends when someone reaches the finish
  questionTime: 20,       // seconds per challenge
  correctCoins: 100,      // coins for a correct answer
  speedBonusMax: 50,      // extra coins for answering fast
  finishBonus: 300,       // coins for reaching the finish
  stampBonus: 50,         // end-of-game coins per passport stamp
  factSec: 6,             // result card auto-continues after this
  autoRollSec: 20,        // roll automatically if nobody taps (keeps the game moving)
  idleAbandonSec: 120,    // nobody touched the screen for this long → back to lobby
  resultTimeoutSec: 60,
  leaderboardSize: 10,
  leaderboardScope: 'today', // 'today' or 'all'
  sound: true,
};

// Player tokens (up to 4)
window.HJ_PLAYERS = [
  { token: '🦊', name: 'Fox',   color: '#ff8a3d' },
  { token: '🐼', name: 'Panda', color: '#3ee6ff' },
  { token: '🐯', name: 'Tiger', color: '#ffd23f' },
  { token: '🐸', name: 'Frog',  color: '#2ee59d' },
];

// One zone per board row (6 spaces each), drawn as themed bands
window.HJ_ZONES = [
  { name: 'Enrollment Plaza', icon: '🏛️', color: '#1565c0', decor: ['🏢', '🏦', '🌳', '⛲'] },
  { name: 'Pharmacy Row',     icon: '💊', color: '#00897b', decor: ['🏪', '📦', '🚚', '🌲'] },
  { name: 'Family Gardens',   icon: '🌸', color: '#d81b60', decor: ['🌷', '🌳', '🎠', '🌻'] },
  { name: 'Clinic District',  icon: '🏥', color: '#c62828', decor: ['🏥', '🔬', '🚑', '🌴'] },
  { name: 'Wellness Heights', icon: '⛰️', color: '#7b4dff', decor: ['🏔️', '🌄', '🧘', '🎈'] },
];

// The board, in order (30 spaces = 5 rows × 6). Business ids come from questions.js.
// Special spaces: start, finish, boost, setback, mystery
window.HJ_BOARD = [
  'start',   'cigna',      'mystery', 'express',  'mdlive',  'boost',
  'cigna',   'setback',    'accredo', 'enguide',  'mystery', 'express',
  'freedom', 'vfp',        'boost',   'ebcg',     'mdlive',  'setback',
  'evicore', 'curascript', 'freedom', 'accredo',  'mystery', 'enguide',
  'vfp',     'ebcg',       'boost',   'evicore',  'curascript', 'finish',
];

// Event cards for special spaces — each one teaches something.
window.HJ_EVENTS = {
  boost: [
    { icon: '🚀', title: 'Express Delivery!',   text: 'Your Express Scripts home delivery arrived right on time — no pharmacy line.', move: 3 },
    { icon: '📱', title: '2 a.m. Video Visit',  text: 'MDLIVE got you a doctor by video in minutes — available 24/7/365.', move: 2 },
    { icon: '⚡', title: 'Fast-Track Approval', text: 'EviCore intelliPath® automated your prior authorization.', move: 3 },
    { icon: '📦', title: '90-Day Supply',       text: 'EnGuide shipped a 90-day GLP-1 supply with free standard shipping.', move: 2 },
    { icon: '🎥', title: 'MedTEACH Pro',        text: 'Freedom Fertility\'s MedTEACH videos made your injections easy.', move: 2 },
  ],
  setback: [
    { icon: '⏰', title: 'Missed Refill',          text: 'You ran out of medication! Tip: Accredo and EnGuide send refill reminders.', move: -2 },
    { icon: '🚑', title: 'ER for Pink Eye?',       text: 'That was a long wait. Tip: MDLIVE treats 80+ conditions by video.', move: -2 },
    { icon: '📅', title: 'Missed Open Enrollment', text: 'Cigna Open Enrollment runs Nov 1 – Dec 15 in most states.', move: -3 },
    { icon: '🗂️', title: 'Lost ID Card',           text: 'Tip: your digital ID card lives in the myCigna app.', move: -1 },
  ],
  mystery: [
    { icon: '🩺', title: 'Check-up Champion', text: 'You kept up with your preventive check-ups!', coins: 150 },
    { icon: '🎲', title: 'Roll Again!',       text: 'Smooth care coordination — take another turn.', again: true },
    { icon: '📮', title: 'Free Stamp!',       text: 'A colleague explained one of our businesses to you.', stamp: true },
    { icon: '🤝', title: 'Team Health Day',   text: 'Everyone on the journey gets +100 coins!', allCoins: 100 },
    { icon: '✨', title: 'Double Down',       text: 'Your next challenge is worth DOUBLE coins!', double: true },
  ],
};
