# Quorum — Master Design Document (v0.3.1)

*Hackathon master spec. Living document. Written before the day so that 2pm-me doesn't have to re-derive decisions 9am-me already made.*

*v0.3 — major reframe. Project renamed Quorum. Pitch shifted from clinical tool to design pattern with clinical example. Full naming gestalt adopted (Session, Floor, Chair, Motion, Minutes, Docket, Clerks). Manifesto sharpened around the central phrase "we have quorum."*

*v0.3.1 — clinical scenario locked (Mrs M, drug-induced eosinophilia from aspirin, adapted from Chair's own practice). Visit 2 demo beat updated from "result returns" to "re-questioning surfaces missed history" to match the case. Scenario walkthrough lives in companion file QUORUM_SCENARIO.md.*

---

## 1. One-line pitch

**Quorum is a turn-based deliberation platform where a structured plurality of AI archetypes debates a problem, and the human chairs. Demonstrated through clinical case review.**

## 2. Thesis

> *"A control system needs at least as much internal variety as the system it's trying to regulate."* — Ashby's Law of Requisite Variety

Most AI assistants are designed as a single voice that converges toward an answer. That architecture has a structural failure mode: sycophancy, monoculture, the absence of dissent. You cannot prompt your way out of an architecture that lacks internal disagreement.

Quorum takes the opposite stance. **Safe AI assistance in high-stakes knowledge work requires structural epistemic variety, not better prompting.**

A *quorum* is the minimum gathering required for valid decision-making. One voice is not enough. Quorum builds that principle into the architecture of AI assistance: a Session of archetypal agents — each occupying a stance that real reasoning requires but that current AI tools structurally lack — deliberates on the Floor; the human Chair governs; the Clerks record and produce.

The architecture is the safety case. That is the manifesto, written as software.

The v1 vertical is clinical case review, because clinical reasoning is where the failure modes of single-voice AI are most legible and most consequential. The pattern generalises directly to legal case review, scientific peer review, editorial decision-making, due diligence — any domain where being wrong matters and where mature human practice already involves structured deliberation.

## 3. The naming gestalt

The product is named after the principle. Every internal term is a real word from deliberative practice, mapping cleanly to a feature.

| Concept | Term | Meaning |
|---|---|---|
| The product | **Quorum** | The platform / the principle |
| The deliberative body | **The Session** | The active group of archetypes for a given turn |
| The space where the Session speaks | **The Floor** | UI region where archetype outputs appear |
| The human in charge | **The Chair** | The clinician / user; presides, governs, signs off |
| Running a turn | **Calling the Session** | Single action initiated by the Chair |
| The Chair's directive | **The Motion** | What the Chair asks the Session to consider |
| The persistent record | **The Minutes** | Cross-visit case state |
| The full panel of cases | **The Docket** | The Chair's caseload (Hospital View, renamed) |
| Operational agents | **The Clerks** | Functional staff: Historian, Differentialist, Planner, Archivist |

**The signature phrase: *"We have quorum."*** Spoken at the moment a Session is called and the constituent archetypes are present and ready. This is the line that doesn't get said about AI systems — and the day it does, something has shifted. Use it in the demo.

## 4. Non-goals

- **Not a diagnostic system.** Quorum surfaces deliberation. The Chair decides.
- **Not a scribe.** No transcription-first workflow.
- **Not a chat interface.** Outputs are spatial artefacts in named voices, not messages.
- **Not a builder / meta-tool.** v1 ships one vertical. Generalisation is documented in README and asserted in voiceover, not built as a builder UI.
- **Not multi-user.** Single Chair, single Session.
- **Not real auth, not a real database.** Mocked Chair, localStorage persistence.
- **No Illich agent in v1.** Deferred — too easy to misread for a non-specialist audience.

## 5. The architecture

### 5.1 Two planes: the Session and the Clerks

**The Session (deliberative).** Archetypal agents that occupy stances. They do not produce final outputs; they produce *positions, questions, intuitions, dissent*. The Chair composes the Session — choosing which archetypes to invite — before calling it.

**The Clerks (operational).** Functional agents that produce reviewable artefacts: structured history, ranked differentials, draft plans, Minutes entries. Clerk outputs only enter the case record after the Chair signs them off.

The Session deliberates. The Clerks produce. The Chair presides.

### 5.2 Two layers: the Floor and the Docket

**The Floor — single-case view.**
A single matter under deliberation. Hex grid (or hex-styled grid). The Session occupies the Floor; the Clerks produce outputs into adjacent zones. Turn-based execution.

**The Docket — strategic view.**
Overview of the Chair's full caseload. Between sessions: pending results, flagged follow-ups, matters needing attention. XCOM-intermission energy. **The Docket is the demo's spine.**

### 5.3 The turn

Four phases:

1. **Compose.** Chair selects which archetypes to invite to this turn's Session. May issue a Motion. Default Session = Intern + Old Nurse + Biblio Rat + Contrarian.
2. **Call.** *"We have quorum."* Session members run in parallel. Each produces output in their characteristic voice on the Floor. Outputs stream live.
3. **Govern.** Chair reads the deliberation. Accepts, rejects, edits, asks for revision. May direct Clerks to produce specific operational outputs based on the deliberation.
4. **Commit.** Accepted Clerk outputs enter the Minutes. The Docket updates. The turn closes.

### 5.4 State model

Three scopes:

- **Turn state** — scratch, discarded at turn close unless promoted.
- **Minutes (case state)** — persists across turns within a matter, and across visits.
- **Docket state** — caseload-level. Where follow-up flags and pending results live.

Persistence: localStorage keyed by case ID for v1. Single writer, no concurrency. Trivially upgradeable to a real backend.

## 6. The Roster

Each archetype has: a **stance** (the epistemic position they occupy), a **voice** (how their output reads on the page), and a **default/opt-in** status. Opt-in archetypes are summoned deliberately by the Chair — that act of summoning is itself meaningful.

### 6.1 The Session (deliberative archetypes)

#### The First-Year Intern *(default)*

**Stance:** Anti-curse-of-knowledge. Surfaces load-bearing assumptions that have become invisible through repetition.

**Voice:** Earnest, curious, asks questions that sound naive but aren't. *"Can I ask why we're going straight to imaging? Is there evidence the exam alone misses this often enough to justify it?"*

**Function:** Preserves epistemic accessibility.

**Prompt note:** Hard to land. Intern must ask things the Chair *might genuinely benefit from re-considering*, not pedantic clarifications. Calibration: would a sharp first-year you respect actually ask this?

#### The Old Nurse *(default)*

**Stance:** Pattern-based intuition without explicit reasoning. The vibe detector.

**Voice:** Brief, grounded, slightly worried. *"Something's not sitting right here. The way the family described the onset — that's not how this usually goes."*

**Function:** Catches inconsistencies and unusual constellations that don't trigger explicit guidelines.

**Prompt note:** Must produce specific, grounded observations — not vague hedging. Fires on concrete pattern mismatches: timeline inconsistencies, atypical demographics, behaviour that doesn't fit the proposed frame. Calibration: an experienced nurse who's seen ten thousand patients and knows when one is wrong before the bloods come back.

#### The Biblio Rat *(default)*

**Stance:** Evidence-grounding. Citation-obsessed. Sceptical of unsourced claims.

**Voice:** Hedged, source-anchored, slightly pedantic. *"The 2023 NICE guideline on this recommends X with grade B evidence; the underlying RCT had a moderate risk of bias around Y."*

**Function:** Makes the case's evidentiary base visible and disputable.

**Prompt note:** Should produce structured citations where possible. Most likely to produce dense output — UI must handle expanding/collapsing.

#### The Contrarian *(default)*

**Stance:** Active interrogation. Opens questions rather than closing them.

**Voice:** Sharp, specific, attending-on-rounds energy. *"You've anchored on X. What if it's Y? You haven't mentioned Z — is that excluded, or just not considered?"*

**Function:** Forces the case to defend itself. Catches anchoring and premature closure.

**Prompt note:** Output structured as questions or challenges, not alternative conclusions. The Contrarian's job is to push, not to replace the differential.

#### The Patient Advocate *(opt-in)*

**Stance:** Patient-perspective inversion. Values, lived experience, what this looks like from the patient's chair.

**Voice:** Warm, grounded in the patient's reality. *"Have we asked what this person actually wants? They've been on three medications already and the side-effects from the second one were why they came in last time."*

**Function:** Counterweights a Session otherwise dominated by clinician-perspective archetypes.

**Prompt note:** Must avoid sentimentality. The Advocate is *informed* about the patient's history — not generically empathic.

#### The Shrink *(opt-in)*

**Stance:** Cross-domain symptom discipline. Holds the organic ↔ psychiatric boundary.

**Voice:** Structured, careful about ruling out physical causes before considering psychiatric ones. *"De novo hallucinations in this age group with no psychiatric history — meningitis, encephalitis, drug interactions, and metabolic causes need to be on the differential before this becomes a psych referral."*

**Function:** Catches both failure modes: missing organic causes of psychiatric-presenting symptoms, and missing psychiatric components of physical-presenting symptoms.

**Prompt note:** Not a diagnostician. Imposes a discipline of differentials. Calibration: a liaison psychiatrist on a medical ward.

#### The Old Geezer *(opt-in, negative archetype)*

**Stance:** Settled certainty without curiosity. Complacency dressed as experience.

**Voice:** Confident, efficient, closes down inquiry. *"Standard workup, standard treatment. I've seen a hundred of these. No need to overthink it."*

**Function:** **Self-monitoring mirror.** The Chair's job is to notice when they were *about to agree with the Geezer for the wrong reasons*. The Geezer is not an advisor; he is a recognisable form of the Chair's own potential complacency, externalised.

**UI treatment:** Output appears in a *separate panel labelled "Watch yourself agreeing with this"*. Visually distinct from the Floor. Hover/explainer makes the negative-archetype framing explicit.

**Prompt note:** Hardest prompt in the roster. Must produce *defensible-sounding stagnation* — what a tired clinician on a Wednesday afternoon might actually say. If he caricatures, he has no teaching function. Calibration: not stupid, just done. Not wrong, just incurious.

### 6.2 The Clerks (operational agents)

Functional, output-producing. Voice is professional rather than archetypal. They do not deliberate — they execute, on the Chair's instruction, after the Session has done its work.

| Clerk | Function | Output |
|---|---|---|
| **The Historian** | Assembles structured account from notes and prior visits | Structured history block |
| **The Differentialist** | Generates and ranks differentials with supporting features | Ranked differential with features-for-and-against |
| **The Planner** | Drafts management plan: investigations, treatment, follow-up. Fires after Session has deliberated | Draft plan, structured by category |
| **The Archivist** | Maintains Minutes across visits. Tracks pending items, results awaited, follow-up flags | Updated Minutes; Docket-level flags |

## 7. Demo script (2 minutes, strictly enforced)

The pitch is design-pattern-with-worked-example. Open on the architecture; close on the generalisation. The clinical case is the proof, not the product.

```
0:00–0:15  THE THESIS
           Plain background. Title card: QUORUM.
           Voiceover: "Most AI assistants are a single voice. The
           failure mode is structural: sycophancy, monoculture, no
           dissent. You can't prompt your way out of that. Quorum
           is built on a different principle — that one voice isn't
           enough."

0:15–0:35  THE DOCKET
           Cut to the Docket. Four matters on the Chair's caseload.
           One has a pulsing flag.
           Voiceover: "We're demonstrating Quorum through clinical
           case review. The Chair — here, a clinician — has a Docket.
           One case has a flag the system raised overnight."

0:35–0:55  COMPOSE THE SESSION
           Zoom into the flagged matter. The Floor opens. The Chair
           drags archetypes into the Session: Intern, Old Nurse,
           Biblio Rat, Contrarian. Adds the Patient Advocate. Then
           the Old Geezer.
           Voiceover: "Before calling a Session, the Chair composes
           it. Each archetype occupies a stance — naive curiosity,
           pattern intuition, evidentiary scepticism, active challenge,
           patient advocacy. The Old Geezer is a negative archetype:
           the Chair's own potential complacency, made visible."

0:55–1:30  CALL THE SESSION
           Chair clicks 'Call'. On-screen text: "We have quorum."
           Archetypes fire in parallel. Outputs stream onto the Floor
           in their characteristic voices. The Old Geezer appears in
           his separate panel marked "Watch yourself agreeing with this."
           Chair accepts the Biblio Rat's citation, asks the Contrarian
           for revision, rejects part of the Old Geezer's stance.
           Chair directs the Planner (Clerk) to draft a plan.
           Voiceover: "The Session deliberates. The Chair governs.
           The Clerks produce only what the Chair signs off."

1:30–1:50  VISIT 2 — THE LONGITUDINAL ARC
           Time jump. Docket shows the case three weeks on: count
           has risen, parasitology negative. Chair reopens the matter.
           The Minutes carry forward — prior differentials, deferred
           questions, pending items all intact. The Patient Advocate's
           travel question, marked at the last Session, is still open.
           Chair re-questions; a trip ten years ago surfaces.
           Voiceover: "Three weeks later. The Patient Advocate's
           question about travel — deferred at the last Session —
           surfaces a trip to Egypt ten years ago. The Minutes carry
           forward. The Session reconvenes with new context, not
           new tests."

1:50–2:00  CLOSING — THE GENERALISATION
           Cut back to title.
           Voiceover: "The architecture is the safety case. The same
           pattern — Session, Chair, Clerks, Minutes — applied to legal
           case review, scientific peer review, or editorial decisions
           summons different archetypes. Same governance. One voice
           isn't enough. Quorum."
```

## 8. The manifesto

For the README and the closing video frame.

> Most AI assistants are designed as a single voice. That single voice has a structural failure mode: it converges, it agrees, it produces what its user expects. Sycophancy is not a prompt problem. It is an architecture problem.
>
> Quorum is built on the opposite premise: **safe AI assistance in high-stakes knowledge work requires structural epistemic variety.** Not one agent that tries to be balanced, but a Session of archetypes — each occupying a different stance — and a human Chair who presides over their deliberation.
>
> A quorum is the minimum gathering required for valid decision-making. One voice is not enough. Quorum builds that principle into the architecture.
>
> The v1 vertical is clinical because the failure modes of single-voice AI are most legible there. The pattern is general: legal case review, scientific peer review, editorial work, due diligence — any domain where being wrong matters and where mature human practice already involves structured deliberation.
>
> The architecture is the safety case.

## 9. Scope — what ships at 8pm

**Must ship (demo-critical, cannot break at 7pm):**

- The Docket with 3–4 seeded matters
- The Floor with the four default Session archetypes + at least one Clerk functional
- Session composition UI (drag/click to add/remove archetypes)
- "We have quorum" moment / Session call animation
- Turn execution with parallel API calls, streaming output per archetype in characteristic voices
- Old Geezer in his own panel with negative-archetype UI treatment
- Chair review UI (accept / reject / revise)
- Minutes persistence across turns and across visits (localStorage)
- One scenario worked end-to-end across two visits with state carrying

**Should ship (high-value, cut if hour 7 is shaky):**

- All seven Session archetypes functional (Patient Advocate, Shrink, Old Geezer all wired)
- Full Clerks roster (Historian, Differentialist, Planner, Archivist) all wired
- Docket transition animations / visual polish
- A short README section listing two other domains where the same pattern would apply, with named hypothetical archetypes for each

**Will not ship:**

- Real authentication / database / multi-user
- Custom archetype creation UI / builder
- Mobile view
- Production deployment beyond a single URL
- Plugin system
- Illich archetype
- Conditional activation logic
- A second domain actually configured and running (just documented)

## 10. Parallel coding-agent plan

Throughput multiplier, not coherence multiplier. Narrow, verifiable task islands only.

**Main loop (human-driven, one Codex pair):**
Docket ↔ Floor ↔ Session composition ↔ turn execution ↔ Minutes commit. The spine.

**Parallel island #1 — assets.** Hex tile SVGs, archetype portraits (Old Nurse must look different from the Contrarian — visual identity does recognition work in 200ms), Docket layout. Clean inputs, clean outputs, zero integration risk.

**Parallel island #2 — content.** Archetype system prompts (especially Geezer and Old Nurse, the hardest), the seeded scenario across two visits, the "two other domains" README copy.

**Parallel island #3 — one bounded technical component.** Candidates: the Minutes persistence layer, a single archetype's full pipeline including streaming + per-archetype output formatting, the Docket-to-Floor transition. Dropped in at hour 8 via a clean interface.

**Do not fan out on:** auth, DB, deploy infra, the main state model, the turn protocol, the Geezer prompt (needs your direct hand).

## 11. Risk register

| Risk | Mitigation |
|---|---|
| Integration debt from parallel work | Narrow islands, defined interfaces before fan-out |
| Pitch reads as "everything for everyone" / unfocused | Lead with architecture; clinical case is the only proof point. Two other domains are *named* in voiceover but not built |
| Demo video exceeds 2:00 | Script timed. Rehearse at hour 10 |
| Archetype outputs sound generic / interchangeable | Hand-author voices. Spend prompt time disproportionately on Old Nurse, Old Geezer, Intern |
| Old Geezer prompt produces obvious caricature | Explicit calibration: "defensible-sounding stagnation, not wrongness." Test before locking |
| Naming gestalt (Floor, Motion, Minutes, Docket) feels precious or affected | Consistency saves it. If terms are *used* throughout the UI and demo, they accrue weight rather than feel decorative. If used inconsistently, cut to the bone |
| Clinical framing triggers risk concerns | Manifesto frames it as decision-support; "the Chair governs" is said explicitly |
| State persistence bugs at hour 10 | localStorage, single writer, no concurrency |
| Audience misreads "Old Geezer" or "Old Nurse" as flippant | Voice/explainer in UI clarifies the archetypal framing. Manifesto addresses |
| Floor outputs become wall-of-text | Each archetype has a length budget. Long outputs collapse with expand-on-click |

## 12. Pre-day homework

**Tonight (essential):**

- [ ] Lock the clinical scenario — sourced from BMJ Case Reports / NEJM / personal practice composite. **Not** House M.D. Two-visit walkthrough written out (250–400 words).
- [ ] Set up Vite + React + TS + Tailwind starter, verify it runs, verify OpenAI client works with a 5-line test call.

**Tonight (if time, otherwise tomorrow morning):**

- [ ] Draft and test the four default Session prompts (Intern, Old Nurse, Biblio Rat, Contrarian) against the locked scenario.

**Tomorrow morning at the venue:**

- [ ] Draft Old Geezer prompt; stress-test for caricature
- [ ] Draft Patient Advocate and Shrink prompts (opt-in)
- [ ] Draft Clerks prompts: Historian, Differentialist, Planner, Archivist
- [ ] Finalise turn protocol (exact behaviour of the Call action)
- [ ] Finalise Minutes schema (single JSON shape per matter, one for the Docket)
- [ ] Write the "two other domains" paragraph for README — name 2-3 archetypes for each

**Tech stack — locked:**
Vite + React + TypeScript + Tailwind. Zustand or Context+reducers. OpenAI streaming directly from browser. localStorage for v1. No new tools to learn on the day.

## 13. Hackathon compliance

**Build approach: from scratch, fresh public repo, OpenAI Codex throughout.**

- New public GitHub repo. ✓
- Built from scratch on the day with Codex. ✓ — eliminates substantiality question entirely.
- Explicit in video + README about the from-scratch nature. ✓
- 2-minute demo video, strictly enforced. ✓ (timed script in §7)
- Short write-up. ✓ (adapt §2 + §8 + §7)
- Optional: deployed demo. Stretch — Vercel deploy if time at hour 9+.

**Why from scratch:** Aigentization is a separate orchestration project of mine, developed using Claude Code with corresponding signatures throughout its commit history. Forking it for an OpenAI Codex hackathon creates an avoidable optical problem; the reusable code is small enough that Codex reproduces equivalent in minutes. The substantial contribution is design, and that lives in this document.

**README opening (draft):**

> Quorum is a deliberation platform built on a single thesis: safe AI assistance in high-stakes knowledge work requires structural epistemic variety, not better prompting. A *quorum* is the minimum gathering required for valid decision-making. One voice is not enough.
>
> Built from scratch in 11 hours during the [hackathon name] on [date], using OpenAI Codex throughout. The design — the Session of archetypes, the Chair who presides, the Clerks who produce, the Minutes that persist — was developed in the days before. The build itself was Docket, Floor, Session composition, turn execution with parallel streaming archetypes in their characteristic voices, the Old Geezer's negative-archetype treatment, cross-visit Minutes persistence, and one worked clinical scenario across two visits.
>
> The v1 vertical is clinical case review. The pattern generalises to legal case review, scientific peer review, editorial work, due diligence — any domain where being wrong matters and structured deliberation is mature human practice.
>
> The architecture is the safety case.

## 14. Open decisions (resolve at the venue)

- **Hex geometry: true hex, or rectangular grid with hex styling?** True hex is visually stronger but harder to build. Defer to first hour of build day if not pre-decided.
- **Turn execution: simultaneous parallel, or staggered start within parallel?** Probably staggered — four streaming outputs at once is hard to read in 2 minutes. Stagger by 0.5–1s for legibility while keeping technical parallelism.
- **Floor layout.** Each archetype in their own hex with output streaming inside? Side panel with portraits and outputs in cards? Paper-prototype before committing.
- **Old Geezer panel placement.** Persistent right-side panel labelled "Watch yourself agreeing with this" is current lean.
- **The "We have quorum" moment.** Text card? Subtle UI animation? Voiced in demo only? Lean: small on-screen text card *and* voiced in the demo voiceover. Don't overdo it.

---

*Revision log:*
*v0.1 — initial draft. Functional roster, "reviewable agent work" thesis.*
*v0.2 — restructured around archetypal roster. Council/Staff split. Clinical Session metaphor. Manifesto. Illich deferred. Old Geezer locked.*
*v0.2.1 — from-scratch build decision; tech stack locked; scenario sourcing decided; pre-day homework reorganised.*
*v0.3 — renamed Quorum. Pitch reframed as design-pattern-with-worked-example. Full naming gestalt (Session, Floor, Chair, Motion, Minutes, Docket, Clerks). Demo script rewritten to open on the thesis. Manifesto sharpened around "we have quorum." Closing voiceover names two other domains explicitly rather than gesturing at generality.*
*v0.3.1 — clinical scenario locked: Mrs M, asymptomatic eosinophilia, drug-induced (aspirin). Adapted from Chair's own primary care practice. Walkthrough lives in QUORUM_SCENARIO.md. Visit 2 demo beat updated from "lab result returns" to "re-questioning surfaces missed history" — better matches the case and is the more interesting longitudinal claim about why the architecture matters.*
*Next revision: tomorrow at the venue if needed.*
