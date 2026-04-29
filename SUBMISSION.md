# Quorum Hackathon Submission

## One-line pitch

Quorum is a turn-based deliberation platform for high-stakes knowledge work: a structured Session of AI archetypes debates a matter on the Floor, the human Chair governs, and the Clerks produce only what the Chair signs off.

## What we built

Today we built a working clinical case-review demo around Mrs M, a 68-year-old patient with incidental eosinophilia on routine cardiovascular bloods. The demo starts from a Docket of pending matters, opens a flagged case, reveals the clinical scenario, lets the user compose a Session from archetype cards, calls the Session, streams multiple AI viewpoints, supports follow-up questions to individual agents, and turns the deliberation into reviewable Minutes.

The current app includes:

- A Docket view with four seeded matters and persistent visit state.
- A Mrs M case reveal with generated clinical scenario imagery.
- A tarot-inspired archetype deck for composing the Session.
- Configurable archetype cards with provider, model, reasoning, and evidence-search controls.
- Live OpenAI API mode for agent outputs when a server-side API key is present.
- Deterministic seeded fallback mode so the demo remains reliable without network access.
- A Biblio Rat archetype that can use OpenAI web search for evidence-grounded output.
- Chair controls to accept, reject, request revision, ask follow-up questions, draft a plan, and commit Minutes.
- A second-visit beat showing how unresolved questions persist across time.

## Why it matters

Most AI assistants collapse complex work into a single voice. That creates a structural safety problem in domains where mature human reasoning depends on disagreement, role separation, memory, review, and governance.

Quorum takes the opposite position: safe AI assistance in high-stakes knowledge work needs structural epistemic variety, not just a better prompt. The system deliberately separates deliberative voices from operational outputs. The Session surfaces questions, dissent, evidence, pattern recognition, and patient perspective. The Chair remains responsible for judgment. The Clerks only commit what the Chair signs off.

The clinical demo is not a diagnosis tool. It is a proof point for a broader pattern: legal review, scientific peer review, editorial decision-making, due diligence, and other domains where a single confident answer is not enough.

## Why this fits the brief

### Built at a speed that was not previously realistic

Quorum began as a detailed Markdown design document and clinical scenario. In one hackathon day, Codex helped turn that product thesis into a working React application with generated assets, live model calls, fallback runtime, local persistence, UI polish, GitHub publication, and a static public demo.

That speed matters because the domain expert could work at the level of product architecture, clinical reasoning, and demo storytelling while Codex translated the evolving specification into implementation.

### Deep model integration, not a single chatbot

The app is not a wrapper around one chat box. Each archetype has a stable stance, prompt surface, output zone, review state, and runtime settings. The interface exposes model/provider/reasoning controls as part of the product metaphor: cards can be drawn, flipped, configured, and called into a Session.

The live runtime uses OpenAI from a server-side Vite endpoint so the API key stays off the client. The Biblio Rat is wired as the first evidence-oriented archetype, with web search available for guideline and literature grounding.

### Benefits humanity

Quorum addresses a practical safety failure: single-voice AI systems can sound coherent while skipping the uncomfortable question, the dissenting frame, the evidence check, or the patient-centred concern.

In the demo case, the danger is not that the AI fails to diagnose a rare condition. The danger is that the clinical workflow accepts a neat story too early. Quorum makes the missed questions harder to skip by giving them a place, a role, and a voice.

## Demo walkthrough

1. Start on the Docket and open the flagged Mrs M matter.
2. Use the generated case image to explain the initial scenario: asymptomatic eosinophilia on routine cardiovascular bloods.
3. Compose the Session using the archetype deck.
4. Flip/configure the Biblio Rat card to show model, reasoning, and evidence-search settings.
5. Call the Session. The app displays "We have Quorum." and streams the archetype outputs.
6. Show how the Intern, Nurse, Biblio Rat, Contrarian, Advocate, Shrink, and Old Geezer occupy different reasoning roles.
7. Ask one agent a follow-up question.
8. Direct the Planner Clerk to draft the plan and commit Minutes.
9. Advance three weeks and show that unresolved questions persist into the next visit.

## Technical shape

- Frontend: React, TypeScript, Vite.
- Runtime: local Vite development middleware exposes `/api/runtime` and `/api/agent`.
- Model path: OpenAI Responses API from the server-side endpoint when `OPENAI_API_KEY` is configured.
- Fallback path: seeded deterministic scripts stream locally when live API is unavailable.
- State: localStorage for the Docket, selected archetypes, committed Minutes, and visit progression.
- Assets: generated case imagery and tarot-inspired archetype cards.
- Public demo: separate static seeded GitHub Pages build.

## Links

- Full live-code repo: https://github.com/dafraile/quorum
- Static public demo repo: https://github.com/dafraile/quorum-demo
- Static public demo: https://dafraile.github.io/quorum-demo/

## What is next

The next version would turn selected archetypes into deeper tool-using agents. The Biblio Rat should become a proper literature-review agent that searches local guidance and medical literature, summarizes uncertainty, and produces a traceable evidence packet. Additional Clerks could generate structured handover notes, patient-facing explanations, or domain-specific review artifacts.

The important product principle stays the same: the AI can deliberate, challenge, search, summarize, and draft, but the human Chair governs the record.
