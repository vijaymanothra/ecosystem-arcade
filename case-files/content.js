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
  {
    id: 'family', title: 'The Family Wellness Case', icon: '👪',
    patient: { icon: '👪', name: 'The Ortiz Family', tag: 'Members · family of 4' },
    intro: 'A teenager who needs someone to talk to, a parent burning out at work, and a monthly refill. Which businesses kept the whole family well?',
    steps: [
      { to: 'cigna', clue: 'The family used the Find a Doctor directory to check which providers their health plan covers. Whose directory?',
        fact: 'Cigna Healthcare members can find in-network doctors and facilities and check coverage in myCigna.' },
      { to: 'mdlive', clue: 'Their 15-year-old wanted to talk to a therapist by video. Which business offers therapy for ages 10–17?',
        fact: 'MDLIVE family care includes ages 10–17. Evernorth Behavioral Care Group treats adults 18+.' },
      { to: 'ebcg', clue: 'Mom wanted therapy for work stress and burnout, and a Care Navigator matched her with a therapist. Who?',
        fact: 'Evernorth Behavioral Care Group\'s Care Navigators match patients by needs, specialty, schedule and personality.' },
      { to: 'express', clue: 'Dad set up automatic refills so his long-term medication is mailed home. Which pharmacy?',
        fact: 'Express Scripts Pharmacy home delivery: register, order, set up automatic refills, choose how to pay.' },
    ],
  },
  {
    id: 'clinic', title: 'The Oncology Clinic Case', icon: '🔬',
    patient: { icon: '🏥', name: 'Riverbend Oncology', tag: 'Community clinic (fictional)' },
    intro: 'A community cancer clinic wants better drug prices, faster approvals and support for patients at home. Follow the paper trail.',
    steps: [
      { to: 'curascript', clue: 'The clinic joined Matrix GPO for group purchasing prices. Which business is Matrix\'s exclusive specialty distributor, shipping the drugs to the clinic?',
        fact: 'Matrix GPO uses CuraScript SD as its exclusive provider of specialty distribution services.' },
      { to: 'evicore', clue: 'A patient\'s health plan requires prior authorization for medical oncology. The clinic\'s EHR now submits it automatically with intelliPath®. Whose tool?',
        fact: 'EviCore intelliPath® is free of charge for EviCore-managed patients.' },
      { to: 'accredo', clue: 'Another patient needs a specialty cancer medication delivered home, plus help finding copay assistance. Which pharmacy?',
        fact: 'Accredo\'s Copay Assistance search tool helps patients find financial help for their medication.' },
      { to: 'ebcg', clue: 'An adult patient wants in-person therapy to cope with their diagnosis. Who provides it?',
        fact: 'Evernorth Behavioral Care Group offers in-person and virtual therapy for adults, couples and families.' },
    ],
  },
  {
    id: 'preserve', title: 'The Fertility Preservation Case', icon: '❄️',
    patient: { icon: '👩🏻', name: 'Hana L.', tag: 'Member · 30' },
    intro: 'Hana decided to preserve her fertility. Medications to order, a trip to Phoenix and a weekend infection. Who was on her team?',
    steps: [
      { to: 'cigna', clue: 'Hana checked her coverage and digital ID card in the myCigna app. Whose app?',
        fact: 'myCigna: claims, EOBs, ID cards and coverage, with 24/7 support.' },
      { to: 'freedom', clue: 'She ordered her fertility preservation medications from "America\'s Leading Fertility Pharmacy", whose "Get StARTed" team prepared her order. Which one?',
        fact: 'Freedom Fertility works directly with each patient\'s fertility center and healthcare team.' },
      { to: 'vfp', clue: 'Visiting Phoenix, she needed to pick up a medication on-site at a former Integrity Rx location. Which pharmacy?',
        fact: 'Village Fertility Pharmacy merged Village Fertility (Boston, Chicago) with Integrity Rx (Phoenix, Los Angeles).' },
      { to: 'mdlive', clue: 'On a Sunday she got a urinary tract infection and saw a doctor by video. Who?',
        fact: 'MDLIVE urgent care treats 80+ non-emergency conditions, including UTIs in women 18+.' },
    ],
  },
  {
    id: 'healthplan', title: 'The Health Plan Case', icon: '🏛️',
    patient: { icon: '🏛️', name: 'Lakeside Health Plan', tag: 'Health plan (fictional)' },
    intro: 'A regional health plan wants smarter approvals, lower drug costs, virtual care and specialty support for its members. Who does what?',
    steps: [
      { to: 'evicore', clue: 'The plan wants utilization management for sleep studies and musculoskeletal care. Who?',
        fact: 'EviCore\'s utilization management covers radiology, cardiovascular, sleep, musculoskeletal, oncology and more.' },
      { to: 'express', clue: 'It also wants a PBM to help manage its members\' pharmacy costs. Who?',
        fact: 'Express Scripts works with health plans and employers to manage prescription benefits.' },
      { to: 'mdlive', clue: 'Members should be able to see a doctor by video 24/7/365, including holidays. Who?',
        fact: 'More than 50 million people have MDLIVE as part of their health insurance benefit.' },
      { to: 'accredo', clue: 'Members with hemophilia need a specialty pharmacy that ships refrigerated medication. Who?',
        fact: 'Accredo ships refrigerated medications in specialized packaging with coolant packs.' },
    ],
  },
  {
    id: 'launch', title: 'The Rare Drug Launch Case', icon: '🧊',
    patient: { icon: '🧪', name: 'Helix Bio', tag: 'Drug manufacturer (fictional)' },
    intro: 'A drug maker is launching a temperature-sensitive rare-disease therapy. It has to reach hospitals and patients, and be covered. Trace the launch.',
    steps: [
      { to: 'curascript', clue: 'Hospitals need the drug fast. Helix picks a distributor with stat delivery within hours and a cryogenic freezer in Memphis. Who?',
        fact: 'CuraScript SD\'s rare disease program delivers in all 50 states, Puerto Rico and Guam.' },
      { to: 'accredo', clue: 'Patients who take it at home need a specialty pharmacy to dispense it and coordinate approvals and refills. Who?',
        fact: 'Accredo dispenses to patients. CuraScript SD distributes to providers.' },
      { to: 'express', clue: 'A prescriber submits a pharmacy prior authorization for the drug through ExpressPAth. Whose tool?',
        fact: 'ExpressPAth is Express Scripts\' prior authorization tool for prescribers.' },
      { to: 'cigna', clue: 'A patient\'s employer coverage, including medical and pharmacy benefits, comes from which health plan?',
        fact: 'Cigna Healthcare offers employer medical, dental, pharmacy, behavioral and voluntary benefits.' },
    ],
  },
  {
    id: 'checkup', title: 'The Check-Up Case', icon: '🩺',
    patient: { icon: '👨🏿', name: 'Marcus T.', tag: 'Member · 52' },
    intro: 'Marcus bought his own plan, finally booked a check-up and found out why he\'s always tired. Rebuild his year.',
    steps: [
      { to: 'cigna', clue: 'Marcus bought an individual plan with $0 virtual care and $0 preventive care. Who sells it?',
        fact: 'Cigna individual medical plans offer $0 virtual and preventive care (some exceptions apply).' },
      { to: 'mdlive', clue: 'He booked a once-a-year Wellness Screening by video, then had labs at Quest. Who ran the visit?',
        fact: 'MDLIVE Wellness Screenings include a health risk assessment and lab work at LabCorp or Quest.' },
      { to: 'evicore', clue: 'His doctor ordered a sleep study. Before the plan approved it, a clinical team reviewed it. Who?',
        fact: 'Sleep is one of EviCore\'s utilization management programs for health plans.' },
      { to: 'express', clue: 'His new everyday blood-pressure prescription is now mailed to his home. Which pharmacy?',
        fact: 'Express Scripts Pharmacy is Evernorth\'s everyday home delivery pharmacy.' },
    ],
  },
];
