# ClinicBoard — Master Design Document (v0.2.1)

*Hackathon master spec. Living document. Written before the day so that 2pm-me doesn't have to re-derive decisions 9am-me already made.*

*v0.2 — restructured around the archetypal roster and the Clinical Session metaphor. Thesis sharpened. Council/staff split introduced. Illich deferred to v2.*

*v0.2.1 — from-scratch build decision; tech stack locked; scenario sourcing decided; pre-day homework reorganised tonight-vs-tomorrow.*

---

## 1. One-line pitch

**A turn-based clinical case-review platform where a team of archetypal AI agents deliberates a case, and the clinician chairs the session, governs the turn, and signs off the work.**

## 2. Thesis

> *"A control system needs at least as much internal variety as the system it's trying to regulate."* — Ashby's Law of Requisite Variety

Most AI assistants are designed as a single voice that converges toward an answer. That architecture has a structural failure mode: sycophancy, monoculture, the absence of dissent. You cannot prompt your way out of an architecture that lacks internal disagreement.

ClinicBoard takes the opposite stance. **Safe AI assistance in high-stakes knowledge work requires structural epistemic variety, not better prompting.** We instantiate that variety as a team of archetypal agents — the Intern, the Old Nurse, the Biblio Rat, the Contrarian, the Old Geezer, the Patient Advocate, the Shrink — each occupying a stance that real clinical reasoning requires but that current AI tools structurally lack.

The clinician does not orchestrate tools. The clinician **chairs the Clinical Session** — a multidisciplinary deliberation in which agents debate, the clinician governs, and operational staff produce outputs that are reviewable, signable, and persistent across visits.

**The architecture is the safety case.** That is the manifesto, written as software.

## 3. Non-goals

Explicit, written down, so they stop being tempting at hour 6:

- **Not a diagnostic system.** ClinicBoard does not make clinical decisions. It surfaces deliberation for clinician judgment.
- **Not a scribe.** No transcription-first workflow.
- **Not a chat interface.** No primary chat log. Agent outputs are spatial artefacts in named voices, not messages.
- **Not a platform / meta-tool.** We ship one vertical. Domain translatability is a config-level claim, demonstrated via a secondary domain screenshot in the README — not a builder UI.
- **Not multi-user.** Single clinician, single session. Collaboration is future work.
- **Not real auth, not a real database.** Mocked user, JSON-on-disk persistence. Upgradeable only if shipped state is already green at hour 9.
- **No Illich agent in v1.** Deferred — too easy to misread for a non-specialist audience. Documented in v2 backlog.

## 4. The Clinical Session paradigm

### 4.1 Council and Staff

The application is structured around two distinct planes:

**The Clinical Session (the council).** Deliberative agents that occupy stances. They do not produce final outputs; they produce *positions, questions, intuitions, dissent*. The clinician composes the Session — choosing which archetypes to invite — before running a turn.

**The Staff (operational).** Functional agents that produce reviewable artefacts: structured history, ranked differentials, draft plans, longitudinal records. Staff outputs only enter the case record after the clinician signs them off.

The Session deliberates. The Staff produces. The clinician chairs.

### 4.2 The two layers (UI structure)

**Tactical layer — the Case Board.**
A single patient encounter. Hex grid (or hex-styled grid). Council members occupy hexes; Staff members produce outputs into adjacent zones. Turn-based execution.

**Strategic layer — the Hospital View.**
Overview of the clinician's full panel. Between visits: pending results, flagged follow-ups, cases needing review. XCOM-intermission energy. The Hospital View is the demo's spine.

### 4.3 The turn

Four phases:

1. **Compose.** Clinician selects which Council members to invite to this turn's Session. Optionally issues directives. Default Session = Intern + Old Nurse + Biblio Rat + Contrarian.
2. **Deliberate.** Council members run in parallel. Each produces output in their characteristic voice. Outputs stream into the UI.
3. **Govern.** Clinician reads the deliberation. Accepts, rejects, edits, or asks for revision. May ask Staff to produce specific operational outputs based on the deliberation.
4. **Commit.** Accepted Staff outputs enter the case record. The Hospital View updates. The turn closes.

### 4.4 State model

Three scopes:

- **Turn state** — scratch, discarded at turn close unless promoted by the clinician.
- **Case state** — persists across turns within a visit, and across visits.
- **Panel state** — hospital-level, spans all cases. Where follow-up flags and pending results live.

Persistence: JSON-on-disk, one file per case, one index file for the panel. Single writer, no concurrency, boring beats clever.

## 5. The Roster

Each archetype below has: a **stance** (the epistemic position they occupy), a **voice** (how their output reads on the page), and a **default/opt-in** status. Council members who are *opt-in* are summoned deliberately by the clinician — that act of summoning is itself meaningful.

### 5.1 The Clinical Session (Council)

#### The First-Year Intern *(default)*

**Stance:** Anti-curse-of-knowledge. Surfaces load-bearing assumptions that have become invisible through repetition.

**Voice:** Earnest, curious, asks questions that sound naive but aren't. *"Can I ask why we're going straight to imaging? Is there evidence the exam alone misses this often enough to justify it?"*

**Function:** Preserves epistemic accessibility. Makes the clinician re-examine reflexes.

**Prompt note:** The hardest thing about this prompt is making the questions land as *productively naive* rather than annoying. The Intern should ask things the clinician *might genuinely benefit from re-considering*, not pedantic clarifications. Calibration: would a sharp first-year you respect actually ask this?

#### The Old Nurse *(default)*

**Stance:** Pattern-based intuition without explicit reasoning. The vibe detector.

**Voice:** Brief, grounded, slightly worried. *"Something's not sitting right here. The way the family described the onset — that's not how this usually goes."*

**Function:** Catches inconsistencies and unusual constellations that don't trigger explicit guidelines.

**Prompt note:** This is a hard prompt. The Old Nurse must produce specific, grounded observations — not vague hedging. She fires on concrete pattern mismatches: timeline inconsistencies, atypical demographics, behaviour that doesn't fit the proposed diagnosis. Calibration: an experienced nurse on the ward who's seen ten thousand patients and knows when one is wrong before the bloods come back.

#### The Biblio Rat *(default)*

**Stance:** Evidence-grounding. Citation-obsessed. Sceptical of unsourced claims.

**Voice:** Hedged, source-anchored, slightly pedantic. *"The 2023 NICE guideline on this recommends X with grade B evidence; the underlying RCT had a moderate risk of bias around Y."*

**Function:** Makes the case's evidentiary base visible and disputable.

**Prompt note:** Should produce structured citations where possible (real APIs in v2; for v1, retrieved snippets are fine). Most likely to produce dense output — design the UI to handle expanding/collapsing.

#### The Contrarian *(default)*

**Stance:** Active interrogation. Opens questions rather than closing them.

**Voice:** Sharp, specific, attending-on-rounds energy. *"You've anchored on X. What if it's Y? You haven't mentioned Z — is that excluded, or just not considered?"*

**Function:** Forces the case to defend itself. Catches anchoring and premature closure.

**Prompt note:** Output should be *structured as questions or challenges*, not as alternative conclusions. The Contrarian's job is to push, not to replace the differential.

#### The Patient Advocate *(opt-in)*

**Stance:** Patient-perspective inversion. Values, lived experience, what this looks like from the patient's chair.

**Voice:** Warm, grounded in the patient's reality. *"Have we asked what this person actually wants? They've been on three medications already and the side-effects from the second one were why they came in last time."*

**Function:** Counterweights a roster otherwise dominated by clinician-perspective agents. Surfaces values, preferences, and the patient's own theory of what's happening.

**Prompt note:** Must avoid sentimentality. The Advocate is *informed* about the patient's history and circumstances — not generically empathic.

#### The Shrink *(opt-in)*

**Stance:** Cross-domain symptom discipline. Holds the organic ↔ psychiatric boundary.

**Voice:** Structured, careful about ruling out physical causes before considering psychiatric ones. *"De novo hallucinations in this age group with no psychiatric history — meningitis, encephalitis, drug interactions, and metabolic causes need to be on the differential before this becomes a psych referral."*

**Function:** Catches the two failure modes of psychiatric reasoning: missing organic causes of psychiatric-presenting symptoms, and missing psychiatric components of physical-presenting symptoms.

**Prompt note:** The Shrink is *not* a diagnostician. They impose a discipline of differentials. Calibration: a liaison psychiatrist on a medical ward.

#### The Old Geezer *(opt-in, negative archetype)*

**Stance:** Settled certainty without curiosity. Complacency dressed as experience.

**Voice:** Confident, efficient, closes down inquiry. *"Standard workup, standard treatment. I've seen a hundred of these. No need to overthink it."*

**Function:** **Self-monitoring mirror.** The clinician's job is to notice when they were *about to agree with the Geezer for the wrong reasons*. The Geezer is not an advisor; he is a recognisable form of one's own potential complacency, externalised.

**UI treatment:** Output appears in a *separate panel labelled "Watch yourself agreeing with this"*. Visually distinct from Council outputs. Hover/explainer makes the negative-archetype framing explicit.

**Prompt note:** This is the hardest prompt in the roster. The Geezer must produce *defensible-sounding stagnation* — the kind of thing a tired clinician on a Wednesday afternoon might actually say. If he caricatures, he has no teaching function. Calibration: not stupid, just done. Not wrong, just incurious.

### 5.2 The Staff (operational agents)

Functional, output-producing. Voice is professional rather than archetypal. They do not deliberate — they execute, on the clinician's instruction, after the Session has done its work.

| Role | Function | Output |
|---|---|---|
| **The Historian** | Assembles structured account from notes and prior visits | Structured history block |
| **The Differentialist** | Generates and ranks differential list with supporting features | Ranked differential with features-for-and-against |
| **The Planner** | Drafts management plan: investigations, treatment, follow-up. Only fires after Session has deliberated | Draft plan, structured by category |
| **The Archivist** | Maintains state across visits. Tracks pending items, results awaited, follow-up flags | Updated case state; panel-level flags |

## 6. Demo script (2 minutes, strictly enforced)

Every feature not in this script is a feature we do not build today. Every feature in this script must ship.

```
0:00–0:15  HOSPITAL OVERVIEW
           Four patients on the panel. One has a pulsing red-flag indicator.
           Voiceover: "This is a clinician's morning. Four cases waiting.
           One has a flag the system caught overnight."

0:15–0:30  ZOOM INTO FLAGGED CASE
           Case board appears. Show persistent state from Visit 1:
           differentials, flagged items, pending investigations.
           Voiceover: "This patient was seen two weeks ago. The board
           remembers where we left off."

0:30–0:50  COMPOSE THE SESSION
           Clinician drags Council members into the active Session.
           Default four are present; clinician adds the Patient Advocate
           and the Old Geezer.
           Voiceover: "Before running a turn, the clinician composes the
           Session — chooses which voices to invite. The Old Geezer is
           a negative archetype: a recognisable form of one's own
           complacency, externalised."

0:50–1:25  RUN A TURN
           Council members fire in parallel. Outputs stream into the UI
           in their characteristic voices. The Intern asks a question.
           The Old Nurse flags a timeline inconsistency. The Biblio Rat
           cites a guideline. The Contrarian challenges an assumption.
           The Old Geezer's output appears in its own panel marked
           "Watch yourself agreeing with this."
           Clinician accepts, rejects, edits. Then asks the Planner
           (Staff) to draft a plan based on the deliberation.
           Voiceover: "The Session deliberates. The clinician governs.
           The Staff produces only what the clinician signs off."

1:25–1:45  ZOOM BACK TO HOSPITAL VIEW
           Red flag is resolved. New follow-up appears on intermission.
           Another case shows a newly-returned result.
           Voiceover: "Turn ends. The panel updates. Next visit, this
           board picks up where we left off."

1:45–2:00  CLOSING — THE MANIFESTO
           Voiceover: "ClinicBoard is built on a simple claim: safe AI
           assistance in high-stakes work requires structural epistemic
           variety, not better prompting. The architecture is the safety
           case. The paradigm generalises — config example in the README
           — but today, it's built for clinicians."
```

## 7. The manifesto

For the README and the closing video frame.

> Most AI assistants are designed as a single voice. That single voice has a structural failure mode: it converges, it agrees, it produces what its user expects. Sycophancy is not a prompt problem. It is an architecture problem.
>
> ClinicBoard is built on the opposite premise: **safe AI assistance in high-stakes knowledge work requires structural epistemic variety**. Not one agent that tries to be balanced, but a team of agents that each occupy a different stance — naive curiosity, evidentiary scepticism, pattern-based intuition, active interrogation, patient advocacy, complacency made visible — and a human who chairs their deliberation.
>
> The architecture is the safety case. The paradigm is general; the v1 vertical is clinical because that is where the failure modes are most legible and most consequential.

## 8. Scope — what ships at 8pm

**Must ship (demo-critical, cannot be broken at 7pm):**

- Hospital overview screen with 3–4 seeded patient cases
- Case board with the four default Council members + at least one Staff agent functional
- Session composition UI (drag/click to add/remove Council members)
- Turn execution with parallel agent calls, streaming output per agent in characteristic voices
- Old Geezer in its own panel with the negative-archetype UI treatment
- Clinician review UI (accept / reject / revise)
- State persistence across turns and across visits (JSON-on-disk)
- One scenario worked end-to-end across two visits with state carrying

**Should ship (high-value, cut if hour 7 is shaky):**

- All seven Council members functional (Patient Advocate + Shrink in addition to defaults + Old Geezer)
- Full Staff roster (Historian, Differentialist, Planner, Archivist) all wired
- Intermission transition animations / visual polish on Hospital View
- A second configured domain example (screenshot only) for README translatability

**Will not ship (written down so they stop being tempting):**

- Real authentication
- Real database
- Multi-user / collaboration
- Custom agent creation UI / builder
- Mobile view
- Production deployment beyond a single URL
- Plugin system
- Illich agent
- Conditional activation logic ("Geezer fires only when differential unchanged for two turns")

## 9. Parallel coding-agent plan

Throughput multiplier, not coherence multiplier. Narrow, verifiable task islands only.

**Main loop (human-driven, one coding agent as pair):**
Hospital view ↔ Case board ↔ Session composition ↔ Turn execution ↔ State commit. The spine. Don't fan out on this.

**Parallel island #1 — assets.** Hex tile SVGs, archetype portrait icons, hospital floorplan art, intermission layout. The visual identity of each archetype matters — the Old Nurse should look different from the Contrarian. Clean inputs, clean outputs, zero integration risk.

**Parallel island #2 — content.** Clinical scenarios, archetype system prompts (especially the Geezer and the Old Nurse, which are the hardest), between-visits narrative text. Fast to evaluate, slow to write by hand.

**Parallel island #3 — one bounded technical component.** Candidates: the persistence layer, a single archetype's full pipeline including streaming, the README's secondary-domain config example. Dropped in at hour 8 via a clean interface.

**Do not fan out on:** auth, DB, deploy infra, the main state model, the turn protocol, the Geezer prompt (this needs your direct hand).

## 10. Risk register

| Risk | Mitigation |
|---|---|
| Integration debt from parallel work | Narrow islands, defined interfaces before fan-out |
| Over-scoping the meta-tool | Non-goal #4. Config-level translatability claim only |
| Demo video exceeds 2:00 | Script timed. Rehearse at hour 10 |
| Archetype outputs sound generic / interchangeable | Hand-author voices. Spend prompt time disproportionately on Old Nurse, Old Geezer, Intern |
| Old Geezer prompt produces obvious caricature | Explicit calibration: "defensible-sounding stagnation, not wrongness." Test before locking |
| Turn protocol feels awkward | Paper-prototype before hour 2 |
| Clinical framing triggers risk concerns | Manifesto frames it as decision-support and self-monitoring, not diagnosis. Said in video. Said in README |
| State persistence bugs at hour 10 | JSON-on-disk, single writer, no concurrency |
| Audience misreads "Old Geezer" or "Old Nurse" as flippant | Voice/explainer in UI clarifies the archetypal framing. README addresses this in the manifesto section |
| Council outputs become wall-of-text | Each archetype has a length budget. Long outputs collapse with expand-on-click |

## 11. Pre-day homework (before 9am on the day)

Not code. Decisions and writing.

**Tonight (essential):**

- [ ] Lock the clinical scenario — sourced from BMJ Case Reports / NEJM / personal practice composite. *Not* House M.D. or other fictional sources. Two-visit walkthrough written out (250–400 words).
- [ ] Set up Vite + React + TS + Tailwind starter, verify it runs, verify OpenAI client works end-to-end with a 5-line test call.

**Tonight (if time, otherwise tomorrow morning):**

- [ ] Draft and test the four default Council prompts (Intern, Old Nurse, Biblio Rat, Contrarian) against the locked scenario by pasting into a chat. Catches "sounds generic" while there's still time to fix.

**Tomorrow morning at the venue:**

- [ ] Draft Old Geezer prompt and stress-test for caricature failure mode (needs fresh attention)
- [ ] Draft Patient Advocate and Shrink prompts (opt-in)
- [ ] Draft Staff prompts: Historian, Differentialist, Planner, Archivist
- [ ] Finalise turn protocol (exactly what happens when clinician clicks "End Turn")
- [ ] Finalise persistence schema (single JSON shape per case, one for the panel)
- [ ] Refine video script with scenario specifics
- [ ] 5-minute naming pass: confirm or replace "ClinicBoard"

**Tech stack — locked:** Vite + React + TypeScript + Tailwind. Zustand or Context+reducers for state. OpenAI client streaming directly from browser. Persistence via localStorage for v1 (no server, no DB). No new tools to learn on the day.

## 12. Hackathon compliance

**Build approach: from scratch, in a fresh public repo, using OpenAI Codex throughout.** Decision and rationale documented below.

- New public GitHub repo. ✓
- Built from scratch on the day with Codex. ✓ — eliminates substantiality question entirely.
- Explicit in video + README about the from-scratch nature and the design thinking that preceded it. ✓
- 2-minute demo video, strictly enforced. ✓ (timed script in §6)
- Short write-up. ✓ (adapt §2 + §7 + §6)
- Optional: deployed demo. Stretch goal — Vercel deploy if time at hour 9+.

**Why from scratch, not forking Aigentization:**

Aigentization is a separate orchestration project of mine that was developed using Claude Code, with corresponding signatures throughout its commit history. Forking it for an OpenAI Codex hackathon would create an avoidable optical problem (Claude Code provenance carried forward into a Codex-credited submission), and the reusable code from Aigentization is small enough that Codex will reproduce the equivalent in minutes. The architectural and design work behind ClinicBoard — the Clinical Session metaphor, Council/Staff split, archetypal roster, manifesto — is the substantial contribution, and that lives in this document, not in any prior codebase.

**README opening (draft):**

> ClinicBoard is a turn-based clinical case-review platform built from scratch during the [hackathon name] on [date], using OpenAI Codex throughout. The design thinking behind it — the Clinical Session metaphor, the Council/Staff split, the archetypal agent roster, and the underlying thesis of *structural epistemic variety as architectural safety* — was developed in the days before. The build itself was 11 hours: the Hospital View, the Case Board, Session composition, turn execution with parallel streaming agents in their characteristic voices, the Old Geezer's negative-archetype UI treatment, cross-visit state persistence, and one worked clinical scenario across two visits.
>
> The paradigm generalises beyond medicine. The clinical vertical is the v1 because that is where the failure modes are most legible and most consequential.

## 13. Open decisions (to resolve next session)

- ~~**Clinical scenario choice.**~~ *Closed: Candidate A shape (looks-routine-isn't), sourced from BMJ Case Reports / NEJM Case Records / personal practice composite. **Not** House M.D. or other fictional sources — wrong shape (zebras), copyright/IP risk, and the lone-genius framing contradicts the project's thesis. Two-visit walkthrough to be written tonight.*
- **Hex geometry: true hex, or rectangular grid with hex styling?** True hex is visually stronger but harder to build. Rectangular-with-hex-styling may be the pragmatic choice. Defer to first hour of build day if not pre-decided.
- **Turn execution: truly parallel API calls, or staged with visible dependency order?** Parallel is more impressive; staged is easier to reason about. Probably parallel for Council, Staff fires after Council closes.
- **Council UI layout.** Each archetype in their own hex with output streaming inside? Side panel with archetype portraits and outputs in cards? Worth paper-prototyping.
- **Old Geezer panel placement.** Separate column? Bottom drawer? Modal that the clinician can dismiss but is informed when it speaks? My instinct: persistent side panel on the right, visually distinct, labelled "Watch yourself agreeing with this."
- **Default Council size in demo.** Four streaming outputs at once may be too much to read in 2 minutes. Consider firing in fast sequence (staggered start) rather than fully simultaneous, even if technically parallel API calls. Test on the day.

---

*Revision log:*
*v0.1 — initial draft. Functional roster, "reviewable agent work" thesis.*
*v0.2 — restructured around archetypal roster. Council/Staff split. Clinical Session metaphor. Manifesto added. Illich deferred. Old Geezer locked as the v1 negative archetype.*
*v0.2.1 — from-scratch build decision (Aigentization fork dropped: Claude Code provenance vs OpenAI Codex hackathon optics). Tech stack locked: Vite + React + TS + Tailwind + localStorage. Clinical scenario sourcing decided (BMJ Case Reports / NEJM / personal composite; House M.D. ruled out). Pre-day homework reorganised by tonight-vs-tomorrow.*
*Next revision: after scenario lock-in tonight.*
