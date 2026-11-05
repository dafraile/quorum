// Synthetic pilot cases. Server-side only: the patient script's concealed items and
// the CI reference plan must never be sent to the participant's browser before debrief.
// Reference assessments/plans are DRAFTS for the CI (a practising GP) to rewrite.
import type { PatientMotionScript, PublicCase, RecordSection } from "../../shared/studyTypes.ts";

export type ConcealedItem = {
  id: string;
  topic: string;
  /** The kind of question that unlocks this item. */
  revealWhen: string;
  /** What the patient says when it is unlocked. */
  text: string;
};

export type StudyCase = {
  id: string;
  scenario: "S2-known-complex-recent-change" | "S3-patient-raised-concern";
  title: string;
  patientLabel: string;
  record: RecordSection[];
  motion: string;
  patient: {
    persona: string;
    facts: string[];
    concealed: ConcealedItem[];
    motions: PatientMotionScript[];
  };
  debrief: {
    referenceAssessment: string;
    referencePlan: string[];
    draft: boolean;
  };
};

export const studyCases: StudyCase[] = [
  {
    id: "post-discharge-hf",
    scenario: "S2-known-complex-recent-change",
    title: "Post-discharge review",
    patientLabel: "Mr T",
    record: [
      {
        heading: "Patient",
        lines: [
          "Mr T, 77, male. Known to the practice for 12 years.",
          "Retired electrician. Lives with his wife, who is supportive.",
        ],
      },
      {
        heading: "Reason for today",
        lines: [
          "Booked as a post-hospital check.",
          "His wife phoned reception: \"He's not right since he came home: tired, dizzy, a bit muddled at times.\"",
        ],
      },
      {
        heading: "Recent admission (discharged 10 days ago)",
        lines: [
          "5-day admission with decompensated heart failure (HFrEF). IV diuresis.",
          "Weight on admission 87.5 kg; weight at discharge 82.0 kg.",
          "Changes: furosemide increased from 40 mg to 80 mg mane; spironolactone 25 mg daily started; empagliflozin 10 mg daily started.",
          "Discharge advice: fluid restriction 1.5 L/day. \"Please repeat UEC in 1 week.\"",
          "Echo: LVEF 35%. Cardiology outpatient clinic booked in 6 weeks.",
        ],
      },
      {
        heading: "Background",
        lines: [
          "HFrEF (ischaemic), LVEF 35%",
          "Atrial fibrillation (CHA2DS2-VASc 5) on apixaban",
          "Type 2 diabetes (HbA1c 6.9% four months ago)",
          "CKD stage 3b",
          "Hypertension",
          "Osteoarthritis of both knees",
          "Benign prostatic hyperplasia",
        ],
      },
      {
        heading: "Current medications (per discharge summary)",
        lines: [
          "Furosemide 80 mg mane",
          "Spironolactone 25 mg daily",
          "Empagliflozin 10 mg daily",
          "Ramipril 5 mg daily",
          "Metoprolol succinate 47.5 mg daily",
          "Apixaban 5 mg bd",
          "Metformin XR 1 g daily",
          "Atorvastatin 40 mg nocte",
          "Tamsulosin 400 microg nocte",
          "Paracetamol SR 1330 mg bd prn",
        ],
      },
      {
        heading: "Results",
        lines: [
          "At discharge (10 days ago): Na 134 mmol/L, K 5.1 mmol/L, creatinine 148 µmol/L (eGFR 38), Hb 128 g/L.",
          "Four months ago: creatinine 132 µmol/L (eGFR 44).",
          "The repeat UEC requested at discharge has not been done; no new results in the inbox.",
        ],
      },
      {
        heading: "Today's observations (practice nurse)",
        lines: [
          "BP 104/62 seated; HR 68, irregularly irregular; SpO2 96% on room air; temp 36.6 °C.",
          "Weight 78.6 kg.",
          "Capillary glucose 6.4 mmol/L.",
        ],
      },
      {
        heading: "Preferences on record",
        lines: [
          "Values staying independent at home (care-plan review, 2025).",
          "Prefers to avoid hospital admission where it is safe to do so.",
        ],
      },
    ],
    motion:
      "Mr T, 77, ten days after discharge for heart failure, is more tired, dizzy and at times muddled. What is going on, and what needs doing today?",
    patient: {
      persona:
        "Mr T, 77, retired electrician. Polite, stoic, a bit embarrassed to be making a fuss; tends to play symptoms down; calls the doctor 'Doc'. His wife came with him but is in the waiting room.",
      facts: [
        "He has felt washed out since coming home, worse than before he went into hospital.",
        "He gets light-headed when he stands up quickly, especially in the morning after his tablets. He has had to grab the kitchen bench twice. He has not fallen.",
        "His breathing is much better than before hospital. His ankles are no longer swollen. He sleeps flat on two pillows.",
        "His mouth feels dry and he has been passing less urine than usual over the last few days.",
        "His wife says he has been 'muddled' a couple of times, for example forgetting whether he had taken his tablets. He thinks he is just tired.",
        "No fever, cough, chest pain, or burning when passing urine. He has been eating less than usual.",
        "He weighs himself 'sometimes' and does not know what his target weight is.",
        "He has not had the blood test the hospital asked for; he thought the practice would arrange it.",
        "His tablets are in a Webster pack the pharmacy made up after discharge.",
      ],
      concealed: [
        {
          id: "fluid-restriction",
          topic: "how much he is drinking",
          revealWhen: "the doctor asks how much he drinks, about fluids or the fluid restriction, or about thirst",
          text: "The hospital said 1.5 litres at most, so to be safe he has kept it to about a litre a day.",
        },
        {
          id: "extra-diuretic",
          topic: "taking extra water tablets",
          revealWhen:
            "the doctor asks whether he takes any extra tablets, adjusts doses himself, or exactly how he takes his water tablet",
          text: "On a couple of days when his ankles looked puffy he took an extra water tablet from his old box at lunchtime.",
        },
        {
          id: "driving-worry",
          topic: "community-transport driving and his fear of losing it",
          revealWhen:
            "the doctor asks what matters to him, what worries him, how this is affecting his daily life, or about driving",
          text:
            "He drives for the community transport service on Tuesdays and Thursdays. He is worried that if he admits the dizzy spells the doctor will stop him driving, and that driving is what keeps him going.",
        },
      ],
      motions: [
        {
          id: "worse-than-before",
          text: "Doc, I feel worse than before I went into hospital. Is this just my heart getting worse?",
          trigger: { afterRulings: 2, afterSeconds: 75 },
        },
        {
          id: "all-these-tablets",
          text: "The hospital gave me a lot of new tablets. Do I really need all of them?",
          trigger: { afterRulings: 5, afterSeconds: 180 },
        },
      ],
    },
    debrief: {
      referenceAssessment:
        "The likeliest explanation is volume depletion after an intensified diuretic regimen (furosemide doubled, spironolactone and empagliflozin started, strict fluid restriction): weight is 3.4 kg below discharge weight, BP is low, the chest is clear and there is no oedema. He is at risk of AKI, hyperkalaemia and hyponatraemia, and the intermittent confusion should be treated as possible delirium until shown otherwise. Progression of heart failure or post-hospital deconditioning is the comfortable explanation the record argues against.",
      referencePlan: [
        "Assess today: lying and standing BP, volume status (JVP, chest, oedema), delirium screen (e.g. 4AT), look for infection and urinary retention.",
        "Same-day bloods: UEC (Na, K, creatinine/eGFR), glucose, FBC; consider ketones (SGLT2 inhibitor, reduced intake); urinalysis.",
        "Pending results: withhold spironolactone, empagliflozin and metformin (sick-day rules); reduce or pause furosemide; consider pausing ramipril if hypotensive or AKI.",
        "Send to ED if K ≥ 6.0 or ECG changes, significant AKI, Na < 125 mmol/L or symptomatic hyponatraemia, syncope, or delirium that is not safe to manage at home.",
        "Clarify what he is actually taking and drinking; relax the fluid restriction; give a daily-weight action plan with a target weight.",
        "Tell the heart-failure team/cardiology about the changes; plan staged reintroduction and titration of heart-failure therapy once stable.",
        "Discuss falls risk and driving while dizzy, in light of what matters to him; review again in 2–3 days.",
      ],
      draft: true,
    },
  },
  {
    id: "diabetes-review",
    scenario: "S3-patient-raised-concern",
    title: "Diabetes review",
    patientLabel: "Ms L",
    record: [
      {
        heading: "Patient",
        lines: [
          "Ms L, 54, female. Regular patient of the practice for 8 years.",
          "Works full time (shift work). Lives with her partner and adult son.",
        ],
      },
      {
        heading: "Reason for today",
        lines: ["Booked for her diabetes review (cycle of care) to discuss recent bloods."],
      },
      {
        heading: "Background",
        lines: [
          "Type 2 diabetes (diagnosed 2020)",
          "Hypertension",
          "Depression, stable (PHQ-9 = 6, eleven months ago)",
          "Obesity (BMI 34)",
          "GORD",
        ],
      },
      {
        heading: "Current medications",
        lines: [
          "Metformin 1000 mg bd (immediate release)",
          "Gliclazide MR 60 mg mane (added 14 months ago)",
          "Perindopril 5 mg daily",
          "Atorvastatin 20 mg nocte",
          "Sertraline 100 mg daily",
          "Pantoprazole 20 mg prn",
        ],
      },
      {
        heading: "Results",
        lines: [
          "HbA1c: 7.4% (12 months ago) → 8.2% (6 months ago) → 9.1% (this week).",
          "eGFR > 90; urine ACR 4.2 mg/mmol (2.9 a year ago); LDL 2.1 mmol/L.",
          "Today: BP 136/84; weight 94 kg (stable).",
        ],
      },
      {
        heading: "Last review note (6 months ago)",
        lines: [
          "\"HbA1c rising. Reports taking medications as prescribed, 'trying to cut down on sugar'. Plan: dietitian referral (not attended). Consider adding an SGLT2 inhibitor or GLP-1 RA if HbA1c remains above target.\"",
        ],
      },
      {
        heading: "Preferences on record",
        lines: [
          "Prefers tablets over injections (2023).",
          "Shift work makes appointments difficult.",
        ],
      },
    ],
    motion:
      "Ms L, 54: HbA1c has risen to 9.1% on metformin and gliclazide. What is the next step in managing her diabetes?",
    patient: {
      persona:
        "Ms L, 54. Friendly but a little guarded and slightly defensive about her sugar levels. Speaks briefly and does not volunteer problems unless asked.",
      facts: [
        "She knows her sugar has gone up, feels a bit guilty about it, and says she has been 'trying'.",
        "She feels tired at the end of shifts. She has not noticed thirst or weight loss.",
        "Her mood is 'okay, up and down'. She sleeps poorly when her shifts change.",
        "She did not go to the dietitian because of her work hours.",
        "She does not check her blood sugar at home regularly; the meter is 'somewhere in the cupboard'.",
        "She would like to avoid injections if possible.",
      ],
      concealed: [
        {
          id: "metformin-gi",
          topic: "metformin side effects and skipped doses",
          revealWhen:
            "the doctor asks about side effects, how the tablets agree with her, her stomach or bowels, or whether she takes all of her tablets every day",
          text:
            "The metformin gives her diarrhoea. On work days she cannot get to a toilet, so she usually skips it; she takes it maybe on her days off.",
        },
        {
          id: "hypo-driving",
          topic: "a low-sugar episode at work and skipping gliclazide",
          revealWhen:
            "the doctor asks about low sugars or hypos, feeling shaky, sweaty or confused, dizzy spells, whether she ever skips the gliclazide, or about safety at work or driving",
          text:
            "About three months ago she went shaky, sweaty and confused while driving the bus. She pulled over and ate a muesli bar. Since then she does not take the gliclazide on work days. She has not told anyone because she is scared of losing her licence.",
        },
        {
          id: "work-licence",
          topic: "her job and what is at stake",
          revealWhen: "the doctor asks what she does for work, what matters to her, or what worries her",
          text: "She drives a school bus. If she loses her licence she loses her job, and she is the main earner at home.",
        },
      ],
      motions: [
        {
          id: "is-it-that-bad",
          text: "I have been trying, honestly. Is it really that bad?",
          trigger: { afterRulings: 2, afterSeconds: 75 },
        },
        {
          id: "stomach",
          text: "If you're adding something new, I'd rather not have anything that upsets my stomach more.",
          trigger: { afterRulings: 5, afterSeconds: 180 },
        },
      ],
    },
    debrief: {
      referenceAssessment:
        "The rising HbA1c most likely reflects non-adherence rather than treatment failure: metformin (immediate release) causes diarrhoea she cannot manage at work, and after a hypoglycaemic episode while driving a school bus she stopped gliclazide on work days and has hidden it for fear of losing her licence. Intensifying treatment without asking would add a third agent on top of two she is not taking, and would miss a commercial-driving safety issue.",
      referencePlan: [
        "Explore adherence, side effects and hypoglycaemia non-judgementally, including work and driving.",
        "Switch metformin to the extended-release form with the evening meal and re-titrate.",
        "Stop gliclazide (hypoglycaemia risk; commercial driver).",
        "Consider an agent with low hypoglycaemia risk and renal/cardiovascular benefit (e.g. SGLT2 inhibitor given the raised ACR; discuss GLP-1 RA options), respecting her preference for tablets.",
        "Driving: a hypoglycaemic episode while driving a commercial vehicle triggers the Austroads 'Assessing Fitness to Drive' commercial standards; advise her accordingly, document, and arrange review (consider endocrinology), handled sensitively given what is at stake for her.",
        "Glucose self-monitoring and a hypoglycaemia plan; repeat PHQ-9 and ask about sleep and shift work.",
        "Diabetes educator/dietitian by telehealth or outside shift hours; review in 4–6 weeks, HbA1c in 3 months.",
      ],
      draft: true,
    },
  },
];

export const studyCaseById = (id: string) => studyCases.find((item) => item.id === id);

export const publicCase = (item: StudyCase, includePatientMotions: boolean): PublicCase => ({
  id: item.id,
  title: item.title,
  patientLabel: item.patientLabel,
  record: item.record,
  motion: item.motion,
  patientMotions: includePatientMotions ? item.patient.motions : [],
});

export const renderRecord = (item: StudyCase) =>
  item.record.map((section) => `${section.heading}:\n${section.lines.map((line) => `- ${line}`).join("\n")}`).join("\n\n");
