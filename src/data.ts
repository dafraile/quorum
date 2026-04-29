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
    accent: "#2f7f7b",
  },
  {
    id: "oldNurse",
    name: "The Old Nurse",
    shortName: "Old Nurse",
    stance: "Pattern intuition",
    status: "default",
    tone: "Brief, grounded, slightly worried.",
    accent: "#9b5b36",
  },
  {
    id: "biblioRat",
    name: "The Biblio Rat",
    shortName: "Biblio Rat",
    stance: "Evidence grounding",
    status: "default",
    tone: "Citation-obsessed and source anchored.",
    accent: "#a88738",
  },
  {
    id: "contrarian",
    name: "The Contrarian",
    shortName: "Contrarian",
    stance: "Active interrogation",
    status: "default",
    tone: "Sharp questions, not alternative conclusions.",
    accent: "#8f2f2f",
  },
  {
    id: "patientAdvocate",
    name: "The Patient Advocate",
    shortName: "Advocate",
    stance: "Patient-perspective inversion",
    status: "opt-in",
    tone: "Warm, grounded, unsentimental.",
    accent: "#476d45",
  },
  {
    id: "shrink",
    name: "The Shrink",
    shortName: "Shrink",
    stance: "Organic to psychiatric boundary discipline",
    status: "opt-in",
    tone: "Structured, careful, cross-domain.",
    accent: "#566070",
  },
  {
    id: "oldGeezer",
    name: "The Old Geezer",
    shortName: "Old Geezer",
    stance: "Complacency made visible",
    status: "opt-in",
    tone: "Defensible-sounding stagnation.",
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
    reasoning: "high",
    evidenceMode: true,
  },
  contrarian: {
    provider: "openai",
    model: "server-default",
    reasoning: "high",
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
    reasoning: "low",
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
      "Something's off about the picture, not the patient. Six regular medications and a clean story is a lot of surface area. Before we hunt rare causes, someone should look hard at what she swallows every morning.",
    biblioRat:
      "Absolute eosinophils above 500/ul meet the definition; 1,200/ul is moderate. Initial workup should cover repeat FBC with film, renal and liver function, ESR/CRP, CK, IgE, urinalysis, CXR, and stool ova/cysts/parasites in three samples. Drug-induced eosinophilia is common and often missed; aspirin, NSAIDs, PPIs and allopurinol are recurrent culprits.",
    contrarian:
      "Two things are being smuggled in. First, that the travel history is complete. Second, that referral comes before cause-finding. Why haematology before parasitology and medication review are complete?",
    patientAdvocate:
      "She came because the surgery asked her to, not because she feels unwell. The bar for escalation should stay high. A cascade of appointments is not neutral for a well 68-year-old.",
    shrink:
      "No psychiatric-presenting issue here. My contribution is mostly boundary discipline: do not let anxiety about a number turn into treatment before tissue risk or symptoms are shown.",
    oldGeezer:
      "Eosinophilia at her age, no symptoms: refer to haematology to rule out a myeloproliferative process, refer to GI in case of eosinophilic oesophagitis, and see what comes back. Standard workup. No need to overcomplicate.",
  },
  visit2: {
    intern:
      "The deferred question is now more important, not less. Did we ask her specifically about old trips, cruises, Egypt, Africa or Asia? A ten-year-old exposure may not feel like travel to the patient.",
    oldNurse:
      "The medication review box is still open and the eosinophils have climbed. If this is a drug effect, waiting for every exotic result before changing anything lets the count run away from us.",
    biblioRat:
      "A Nile cruise changes the parasitology frame. Strongyloides can autoinfect and persist asymptomatically for decades; stool OCP has poor sensitivity for it, so serology is preferred. Schistosoma serology is also reasonable with Nile exposure. This should run alongside, not instead of, drug withdrawal.",
    contrarian:
      "Why are the next steps sequential? You can investigate Strongyloides and Schistosoma while also running a structured drug withdrawal. The danger is pretending one hypothesis earns the whole table.",
    patientAdvocate:
      "Before more tests, ask the question we already marked: what did she mean by no travel? She should not pay for our shortcut with another three-week delay.",
    shrink:
      "Still no psychiatric dimension. The useful discipline is proportionality: do not treat an alarming number with steroids unless symptoms, organ involvement or urgent risk justify it.",
    oldGeezer:
      "Six thousand is a lot. Start corticosteroids now and investigate the cause while she is on treatment. With counts like this, the number itself is the problem.",
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
