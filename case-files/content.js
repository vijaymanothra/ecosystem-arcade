// ============================================================
//  CASE FILES — detective cases. Each case walks through how our businesses connect end to end.
//  Businesses (names, icons, colours, groups) come from questions.js. Edit cases freely.
// ============================================================

window.CF_CONFIG = {
  title: 'CASE FILES',
  tagline: 'Connect the clues. Reveal how the ecosystem works.',
  casesPerGame: 2,          // cases solved per game
  folderChoices: 3,         // folders offered on the desk
  stepPoints: [200, 100, 0], // points for solving a step on the 1st / 2nd try / auto-revealed
  speedBonus: [[8, 100], [15, 50]], // solved within N seconds → bonus
  perfectCaseBonus: 300,
  evidenceSec: 3.2,         // how long the evidence note shows before the next clue
  idleHintSec: 25,          // nudge with a hint after this long without a move
  idleAbandonSec: 120,
  resultTimeoutSec: 60,
  leaderboardSize: 10,
  leaderboardScope: 'today', // 'today' or 'all'
  sound: true,
  ranks: [
    [0, 'Rookie', '🔰'],
    [800, 'Sleuth', '🔎'],
    [1600, 'Detective', '🕵️'],
    [2400, 'Inspector', '🎖️'],
    [3000, 'Chief Inspector', '👑'],
  ],
};

// to: business id from questions.js · clue: what the player reads · fact: evidence revealed when solved
window.CF_CASES = [
  {
    id: 'glp1', title: 'The GLP-1 Case', icon: '💉',
    patient: { icon: '👩🏽', name: 'Maya R.', tag: 'Member · 34' },
    intro: 'Maya\'s doctor prescribed a GLP-1. Weeks later she\'s on track, on the right dose, and paying in installments. How did the ecosystem get her there?',
    steps: [
      { to: 'cigna', clue: 'Maya enrolled in her employer\'s medical plan during Open Enrollment. Who covers her?',
        fact: 'Cigna Healthcare provides employer medical, dental and pharmacy coverage.' },
      { to: 'mdlive', clue: 'She booked a virtual primary care visit from her couch to talk about her weight and blood sugar. Who did she see?',
        fact: 'MDLIVE primary care covers prediabetes, type 2 diabetes, obesity and more — by video.' },
      { to: 'express', clue: 'Her plan\'s pharmacy benefit decides how the GLP-1 is covered. Who manages pharmacy benefits?',
        fact: 'Express Scripts is the pharmacy benefit manager (PBM).' },
      { to: 'enguide', clue: 'The GLP-1 arrived at her door, and a pharmacist helped her reach the right dose. Which pharmacy?',
        fact: 'EnGuide offers dose guidance, 90-day supplies and a 3-payment plan.' },
    ],
  },
  {
    id: 'rare', title: 'The Rare Disease Case', icon: '🧬',
    patient: { icon: '👨🏻', name: 'Daniel K.', tag: 'Member · 47' },
    intro: 'Daniel went from a worrying MRI to a complex treatment plan — with hospital infusions and emotional support along the way. Trace every step.',
    steps: [
      { to: 'evicore', clue: 'Daniel\'s doctor ordered an MRI. Before the plan approved it, a clinical team reviewed the request. Who?',
        fact: 'EviCore manages prior authorization for imaging, cardiology, oncology and more.' },
      { to: 'accredo', clue: 'He was diagnosed with a rare condition and needs a complex specialty medication with ongoing support. Who dispensed it?',
        fact: 'Accredo is a specialty pharmacy for complex and rare conditions.' },
      { to: 'curascript', clue: 'Some doses are given at a hospital infusion center. Who supplied the hospital with the specialty drug?',
        fact: 'CuraScript SD distributes specialty drugs to hospitals and clinics.' },
      { to: 'ebcg', clue: 'The diagnosis was stressful. Daniel started face-to-face therapy at a local office. Who helped?',
        fact: 'Evernorth Behavioral Care Group offers in-person and virtual therapy.' },
    ],
  },
  {
    id: 'fertility', title: 'The Fertility Case', icon: '🍼',
    patient: { icon: '👫', name: 'Sofia & Jordan', tag: 'Members · 31 & 33' },
    intro: 'Sofia and Jordan started fertility treatment. Injections, a trip to Chicago and a sleepless night later — who supported them?',
    steps: [
      { to: 'cigna', clue: 'First, they checked their employer health plan, claims and ID cards in the myCigna app. Whose app is it?',
        fact: 'The myCigna app shows claims, ID cards and coverage, with 24/7 support.' },
      { to: 'freedom', clue: 'Sofia was nervous about injections, so she ordered from an online fertility pharmacy with step-by-step videos. Which one?',
        fact: 'Freedom Fertility\'s MedTEACH videos teach injectable fertility medications.' },
      { to: 'vfp', clue: 'On a trip to Chicago, she needed to pick up medication in person. Which fertility pharmacy has a location there?',
        fact: 'Village Fertility Pharmacy has locations in Boston, Chicago, Phoenix and LA.' },
      { to: 'mdlive', clue: 'Anxious late one night, Sofia booked a virtual therapy session from home. Who connected her?',
        fact: 'MDLIVE offers virtual talk therapy and psychiatry.' },
    ],
  },
  {
    id: 'hospital', title: 'The Hospital Shortage Case', icon: '🏥',
    patient: { icon: '🏥', name: 'Evergreen General', tag: 'Hospital (fictional)' },
    intro: 'A busy hospital, a shortage in the infusion center and patients going home with complex prescriptions. Who kept care moving?',
    steps: [
      { to: 'curascript', clue: 'The oncology infusion center ran low on injectables. Who restocked it?',
        fact: 'CuraScript SD delivers injectables, infusions and supplies to providers.' },
      { to: 'evicore', clue: 'A patient\'s health plan required review of radiation oncology treatment. Who managed it?',
        fact: 'EviCore provides utilization management for radiation oncology.' },
      { to: 'accredo', clue: 'After discharge, the patient needed a specialty medication delivered home with care coordination. Who?',
        fact: 'Accredo coordinates approvals, refills and costs for specialty patients.' },
      { to: 'express', clue: 'The patient\'s everyday prescriptions were managed by the pharmacy benefit and mailed home. Who?',
        fact: 'Express Scripts handles pharmacy benefits and home delivery.' },
    ],
  },
  {
    id: 'midnight', title: 'The Midnight Fever Case', icon: '🌙',
    patient: { icon: '👨🏾', name: 'Arjun P.', tag: 'Member · 29' },
    intro: 'A fever at 2 a.m. on a holiday, a prescription, a claim — and a stressful month. Rebuild Arjun\'s night and what came after.',
    steps: [
      { to: 'mdlive', clue: 'At 2 a.m. on a holiday, Arjun had a sinus infection and saw a doctor by video. Who?',
        fact: 'MDLIVE urgent care is available 24/7/365 for 80+ conditions.' },
      { to: 'express', clue: 'His new prescription was covered through his pharmacy benefit. Who manages it?',
        fact: 'Express Scripts works with health plans to manage prescription benefits.' },
      { to: 'cigna', clue: 'Later, he checked the claim and his digital ID card in an app. Whose app?',
        fact: 'myCigna: claims, EOBs, ID cards and coverage in one place.' },
      { to: 'ebcg', clue: 'Work stress was hurting his relationship — he and his partner chose in-person couples counseling. Who?',
        fact: 'Evernorth Behavioral Care Group serves individuals, couples and families.' },
    ],
  },
  {
    id: 'employer', title: 'The New Employer Case', icon: '🏢',
    patient: { icon: '🏢', name: 'Northwind Co.', tag: 'Employer · 500 staff (fictional)' },
    intro: 'Northwind Co. just opened with 500 employees and wants complete health benefits. Which businesses deliver each piece?',
    steps: [
      { to: 'cigna', clue: 'Northwind needs medical and dental plans for all 500 employees. Who provides them?',
        fact: 'Cigna Healthcare offers employer medical, dental, pharmacy and behavioral benefits.' },
      { to: 'express', clue: 'It also needs a partner to manage its employees\' prescription drug benefit. Who?',
        fact: 'Express Scripts is the PBM for employers, health plans and unions.' },
      { to: 'evicore', clue: 'Its health plan wants expert clinical review of high-cost scans like MRIs and CTs. Who?',
        fact: 'EviCore uses evidence-based guidelines to review imaging requests.' },
      { to: 'mdlive', clue: 'Employees want 24/7 virtual care for urgent needs. Who?',
        fact: 'MDLIVE: urgent, primary, mental health and dermatology care by video.' },
      { to: 'ebcg', clue: 'And face-to-face therapy for employees and their families. Who?',
        fact: 'Evernorth Behavioral Care Group offers in-person and virtual therapy.' },
    ],
  },
];
