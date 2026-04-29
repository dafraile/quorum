# Quorum

Quorum is a turn-based deliberation platform for high-stakes knowledge work.

Most AI assistants are a single voice. Quorum takes the opposite stance: a Session of archetypal AI agents deliberates on the Floor, the human Chair governs, and the Clerks produce only what the Chair signs off.

The v1 demo is clinical case review because the failure modes are legible and consequential. The pattern generalises to legal review, scientific peer review, editorial work, and due diligence.

## Demo

The shipped demo covers:

- The Docket with four seeded matters.
- The Floor for Mrs M's eosinophilia case.
- Session composition with default and opt-in archetypes.
- The "We have quorum" call moment.
- Staggered streamed outputs in distinct archetypal voices.
- The Old Geezer as a marked negative archetype in the same Floor grid.
- Chair review controls: accept, reject, request revision.
- Planner Clerk draft and Minutes commit.
- Visit 1 to Visit 2 state carry via localStorage.

## Run

```bash
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173`.

Build check:

```bash
npm run build
```

## Live OpenAI mode

The app runs without network access using deterministic fallback outputs. To show real model calls during the hackathon, start Vite with an OpenAI key in the server environment:

```bash
OPENAI_API_KEY=... npm run dev -- --port 5173
```

Optional:

```bash
OPENAI_MODEL=gpt-5
```

The browser calls local endpoints (`/api/runtime` and `/api/agent`). The API key stays server-side in the Vite dev process. If a live agent call times out or fails, that card falls back to the seeded voice so the demo still completes.

## Demo path

1. Open the flagged Mrs M matter from the Docket.
2. Use the case reveal to explain why the eosinophil count matters and what the architecture is meant to catch.
3. Compose the Session by drawing archetype cards from the deck.
4. Flip/tune the Biblio Rat card to show provider, model, reasoning, and evidence-search mode.
5. Call the Session.
6. Show streamed archetype outputs, including the Old Geezer as a marked negative archetype in the same Floor grid.
7. Ask an agent a follow-up from the card input.
8. Direct the Planner Clerk to draft and commit the Minutes.
9. Jump three weeks later, reveal the deferred travel question, and call the Session again.

## Runtime stance

The current demo supports both live OpenAI calls and deterministic streamed outputs, so the two-minute hackathon demo cannot fail due to network, auth, latency, rate limits, or search quality.

The runtime is intentionally shaped around a future OpenAI Responses API or Agents SDK integration: each archetype has a stable ID, promptable stance, output zone, review state, and Clerk handoff point. The Biblio Rat is the first candidate for live tool use: literature search, evidence summary, and citation trace.

Do not pitch this as diagnosis. The architecture surfaces deliberation; the Chair decides.
