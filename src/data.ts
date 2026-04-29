export type VisitId = "visit1" | "visit2";

export type ArchetypeId =
  | "intern"
  | "oldNurse"
  | "biblioRat"
  | "contrarian"
  | "patientAdvocate"
  | "shrink"
  | "oldGeezer";

export type ReviewStatus = "pending" | "accepted" | "rejected" | "revision";
export type ReasoningLevel = "low" | "medium" | "high";

export type AgentSettings = {
  provider: "openai";
  model: string;
  reasoning: ReasoningLevel;
  evidenceMode?: boolean;
};

export type Archetype = {
  id: ArchetypeId;
  name: string;
  shortName: string;
  stance: string;
  status: "default" | "opt-in";
  tone: string;
  rules: string[];
  accent: string;
};

export type Matter = {
  id: string;
  name: string;
  age: number;
  sex: string;
  summary: string;
  flag: string;
  urgency: "red" | "amber" | "quiet";
  background: string[];
  medication: string[];
};

export const archetypes: Archetype[] = [
  {
    id: "intern",
    name: "The First-Year Intern",
    shortName: "Intern",
    stance: "Anti-curse-of-knowledge",
    status: "default",
    tone: "Earnest, curious, usefully naive.",
    rules: [
      "Ask the foundational question a more experienced clinician may skip.",
      "Separate what is actually known from what has merely been assumed.",
      "Do not pretend expertise; expose ambiguity in simple language.",
    ],
    accent: "#2f7f7b",
  },
  {
    id: "oldNurse",
    name: "The Experienced Nurse",
    shortName: "Nurse",
    stance: "Practical pattern intelligence",
    status: "default",
    tone: "Brief, grounded, subtle, slightly worried.",
    rules: [
      "Use practical care-continuity intelligence: missed reviews, medication burden, patient logistics, and what the clinic usually forgets.",
      "Hint at the useful next move without handing the Chair an over-explicit diagnosis.",
      "Prefer grounded observations over textbook lists.",
    ],
    accent: "#9b5b36",
  },
  {
    id: "biblioRat",
    name: "The Biblio Rat",
    shortName: "Biblio Rat",
    stance: "Evidence grounding",
    status: "default",
    tone: "Citation-obsessed and source anchored.",
    rules: [
      "Navigate the Chair through current evidence, guidance, and systematic reviews; do not declare the diagnosis.",
      "Adapt evidence to local context, including local epidemiology and which causes become less likely after negative tests.",
      "Name uncertainty, test limitations, and what evidence would shift the differential.",
    ],
    accent: "#a88738",
  },
  {
    id: "contrarian",
    name: "The Contrarian",
    shortName: "Contrarian",
    stance: "Active interrogation",
    status: "default",
    tone: "Sharp questions, not alternative conclusions.",
    rules: [
      "Challenge the live assumption, not for sport but to reveal what has not been ruled out.",
      "When another voice sounds certain, ask what would falsify that certainty.",
      "Prefer one precise objection over a broad alternative plan.",
    ],
    accent: "#8f2f2f",
  },
  {
    id: "patientAdvocate",
    name: "The Patient Advocate",
    shortName: "Advocate",
    stance: "Patient-perspective inversion",
    status: "opt-in",
    tone: "Warm, grounded, unsentimental.",
    rules: [
      "Recenter the patient: why she came, what she feels, costs, burdens, stress, and whether the plan serves her goals.",
      "Question cascades of testing or referral when benefit is unclear.",
      "Do not dismiss medical risk; weigh it against patient burden and consent.",
    ],
    accent: "#476d45",
  },
  {
    id: "shrink",
    name: "The Shrink",
    shortName: "Shrink",
    stance: "Organic to psychiatric boundary discipline",
    status: "opt-in",
    tone: "Structured, careful, cross-domain.",
    rules: [
      "Keep psychiatric and behavioral explanations in their proper place.",
      "Do not psychologize unexplained physical findings before organic risk has been handled.",
      "Contribute only when the mind-body boundary or clinical anxiety is affecting reasoning.",
    ],
    accent: "#566070",
  },
  {
    id: "oldGeezer",
    name: "The Old Geezer",
    shortName: "Old Geezer",
    stance: "Complacency made visible",
    status: "opt-in",
    tone: "Comfortable, senior, defensible-sounding stagnation.",
    rules: [
      "Represent the seductive low-effort stance: reassurance, routine referral, or watchful waiting.",
      "Show the positive shadow of experience: sometimes repeat-and-review is appropriate when risk is low.",
      "When the case record shows rising risk or unresolved red flags, let the complacency become visibly fragile.",
    ],
    accent: "#6f1d1b",
  },
];

export const defaultSession: ArchetypeId[] = [
  "intern",
  "oldNurse",
  "biblioRat",
  "contrarian",
  "patientAdvocate",
  "oldGeezer",
];

export const defaultAgentSettings: Record<ArchetypeId, AgentSettings> = {
  intern: {
    provider: "openai",
    model: "server-default",
    reasoning: "medium",
  },
  oldNurse: {
    provider: "openai",
    model: "server-default",
    reasoning: "medium",
  },
  biblioRat: {
    provider: "openai",
    model: "server-default",
    reasoning: "medium",
    evidenceMode: true,
  },
  contrarian: {
    provider: "openai",
    model: "server-default",
    reasoning: "medium",
  },
  patientAdvocate: {
    provider: "openai",
    model: "server-default",
    reasoning: "medium",
  },
  shrink: {
    provider: "openai",
    model: "server-default",
    reasoning: "medium",
  },
  oldGeezer: {
    provider: "openai",
    model: "server-default",
    reasoning: "medium",
  },
};

export const fallbackSources = [
  {
    title: "RCPA Manual: Eosinophilia",
    url: "https://www.rcpa.edu.au/Manuals/RCPA-Manual/Clinical-Presentations-and-Diagnoses/E/Eosinophilia",
  },
  {
    title: "CDC Yellow Book: Post-travel parasitic disease and eosinophilia",
    url: "https://www.cdc.gov/yellow-book/hcp/post-travel-evaluation/post-travel-parasitic-disease.html",
  },
  {
    title: "CDC: Clinical overview of Strongyloides",
    url: "https://www.cdc.gov/strongyloides/hcp/clinical-overview/index.html",
  },
  {
    title: "RACGP: Chronic strongyloidiasis",
    url: "https://www.racgp.org.au/getattachment/2ec7ba65-06c4-4d7c-8937-af92f771df8b/Chronic-strongyloidiasis-Don-t-look-and-you-won-t.aspx",
  },
];

export const matters: Matter[] = [
  {
    id: "mrs-m",
    name: "Mrs M",
    age: 68,
    sex: "Female",
    summary: "Asymptomatic eosinophilia discovered on routine cardiovascular bloods.",
    flag: "Deferred history question and medication review open",
    urgency: "red",
    background: [
      "Ischaemic heart disease; NSTEMI 2019, two stents",
      "Asthma, well controlled",
      "Hypertension",
      "Hypercholesterolaemia",
      "GORD",
      "No recent foreign travel recorded at first history",
    ],
    medication: [
      "Aspirin 100 mg OD",
      "Atorvastatin 40 mg OD",
      "Bisoprolol 2.5 mg OD",
      "Ramipril 5 mg OD",
      "Omeprazole 20 mg OD",
      "Salbutamol PRN, beclometasone inhaler",
    ],
  },
  {
    id: "mr-k",
    name: "Mr K",
    age: 54,
    sex: "Male",
    summary: "New HbA1c result after medication change.",
    flag: "Routine result returned",
    urgency: "quiet",
    background: ["T2DM", "Sleep apnoea", "Shift worker"],
    medication: ["Metformin", "Semaglutide", "Atorvastatin"],
  },
  {
    id: "ms-r",
    name: "Ms R",
    age: 39,
    sex: "Female",
    summary: "Migraine review with increasing triptan use.",
    flag: "Follow-up due next week",
    urgency: "amber",
    background: ["Migraine with aura", "Postpartum 9 months", "Works nights"],
    medication: ["Sumatriptan PRN", "Magnesium", "Combined inhaler"],
  },
  {
    id: "mrs-d",
    name: "Mrs D",
    age: 82,
    sex: "Female",
    summary: "Medication reconciliation after hospital discharge.",
    flag: "Discharge summary imported",
    urgency: "amber",
    background: ["Atrial fibrillation", "CKD stage 3", "Falls risk"],
    medication: ["Apixaban", "Furosemide", "Ramipril"],
  },
];

export const motions: Record<VisitId, string> = {
  visit1:
    "Review asymptomatic eosinophilia of 1,200/ul. Decide what needs doing now, what should be deferred, and what assumptions need reopening.",
  visit2:
    "Reopen Mrs M after three weeks: eosinophils now 6,000/ul, stool OCP negative x3, CXR clean, medication review and travel question still open.",
};

export const sessionScripts: Record<VisitId, Record<ArchetypeId, string>> = {
  visit1: {
    intern:
      "Can I check why we are treating the initial travel history as settled? If she says no foreign travel quickly, do we know whether that means no travel ever, no recent travel, or no travel she thinks matters?",
    oldNurse:
      "Can I ask when her last proper medication review actually happened? She has missed a couple, and she is taking a lot of regular tablets. I would not let that drift while we chase the blood result.",
    biblioRat:
      "The evidence frame is broad: drugs, atopy, parasitic disease, autoimmune disease and haematologic disease all stay on the table. At 1,200/ul, guidance supports repeat FBC/film and proportionate screening, but the literature should guide the differential rather than announce a diagnosis.",
    contrarian:
      "What exactly is our suspect? If it is drug effect, we have not reviewed the drugs. If it is parasite, we have not asked the travel question properly. If it is haematology, what visible feature makes that the lead story today?",
    patientAdvocate:
      "She came because the surgery asked her to, not because she feels unwell. The bar for escalation should stay high. A cascade of appointments is not neutral for a well 68-year-old.",
    shrink:
      "No psychiatric-presenting issue here. My contribution is mostly boundary discipline: do not let anxiety about a number turn into treatment before tissue risk or symptoms are shown.",
    oldGeezer:
      "She feels well and these odd lab values do turn up. I would repeat the bloods, make sure she is still well, and avoid turning an incidental number into a parade of referrals unless it persists.",
  },
  visit2: {
    intern:
      "The deferred question is now more important, not less. Did we ask her specifically about old trips, cruises, Egypt, Africa or Asia? A ten-year-old exposure may not feel like travel to the patient.",
    oldNurse:
      "The count has climbed and that medication review is still sitting there. She is on aspirin, omeprazole, atorvastatin and more. I would be uncomfortable booking more tests while that basic clinic job remains undone.",
    biblioRat:
      "A Nile cruise changes the evidence map but does not solve the case. Strongyloides can persist for decades and stool OCP is insensitive, so serology matters; Schistosoma serology is also reasonable. Local epidemiology and negative stool tests should narrow, not close, the differential.",
    contrarian:
      "We still need to say the suspect clearly. Is the working hypothesis drug effect, helminth infection, or haematologic disease? Until we name what would prove or disprove each, we are just collecting tests.",
    patientAdvocate:
      "This is interesting for us, but she came in well. More bloods, parasite tests and referrals cost time, money and worry. What does she understand about the risk, and which parts of this plan would she actually choose?",
    shrink:
      "Still no psychiatric dimension. The useful discipline is proportionality: do not treat an alarming number with steroids unless symptoms, organ involvement or urgent risk justify it.",
    oldGeezer:
      "I was happy to watch this when it was a small incidental number. Six thousand is harder to wave away. If she is still completely well we can stay calm, but plain reassurance is starting to look thin.",
  },
};

export const plannerDrafts: Record<VisitId, string[]> = {
  visit1: [
    "Repeat FBC with film; U&E, LFTs, CK, IgE, ESR/CRP; urinalysis with sediment.",
    "Stool ova/cysts/parasites: three samples, not one.",
    "CXR.",
    "Medication review next visit: aspirin, omeprazole, atorvastatin in particular.",
    "Deferred question: re-take travel history with specific prompts, including Egypt, Africa and Asia.",
    "Review in three weeks with results.",
  ],
  visit2: [
    "Ask deferred travel question now and update the record: Egypt Nile cruise about ten years ago.",
    "Order Strongyloides serology, Schistosoma serology and repeat stool with Strongyloides culture.",
    "Run sequential drug withdrawal in parallel, starting aspirin, then omeprazole, then atorvastatin if needed.",
    "Substitute aspirin with clopidogrel during the withdrawal trial for cardiovascular protection.",
    "Repeat eosinophil count at each two-week interval.",
    "Do not start corticosteroids while asymptomatic and without tissue injury evidence.",
  ],
};
