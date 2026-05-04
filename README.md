# Quorum

Quorum is a turn-based deliberation platform for high-stakes knowledge work.

Most AI assistants are a single voice. Quorum takes the opposite stance: a Session of archetypal AI agents deliberates on the Floor, the human Chair governs, and the Clerks produce only what the Chair signs off.

The app supports both clinical-facing review and general thinking sessions. Clinical input is kept local until the local anonymizer has approved the text for live model calls.

## Demo Video

[![Quorum demo video](https://img.youtube.com/vi/l1OfnIDQYUI/hqdefault.jpg)](https://www.youtube.com/watch?v=l1OfnIDQYUI)

[Watch the Quorum demo video](https://www.youtube.com/watch?v=l1OfnIDQYUI).

## Current App

The current product surface includes:

- A workspace intake for clinical cases or general problems.
- Local clinical text anonymization with a privacy preflight before live API use.
- Persistent Sessions stored in IndexedDB with localStorage fallback and JSON backup/import.
- Session composition with default, opt-in, and custom archetype cards.
- The "We have quorum" call moment.
- Live OpenAI calls when a server-side API key is present.
- Deterministic fallback outputs when live calls are unavailable.
- A Lounge for routing follow-up turns between archetypes.
- Chair review controls: accept, reject, request revision, and reroll.
- Clerk summaries, signed records, and an action log.
- An eosinophilia seed case for debugging the clinical workflow.

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

The app runs without network access using deterministic fallback outputs. To enable real model calls, start Vite with an OpenAI key in the server environment:

```bash
OPENAI_API_KEY=... npm run dev -- --port 5173
```

Optional:

```bash
OPENAI_MODEL=gpt-5.5
```

The browser calls local endpoints (`/api/runtime`, `/api/agent`, `/api/lounge`, and `/api/clerk`). The API key stays server-side in the Vite dev process. If a live call times out or fails, the affected card falls back to a deterministic local response.

## Working Flow

1. Choose Clinical or Thinking mode.
2. Paste the case, problem, decision, draft, or question.
3. Create the Session.
4. Run the local anonymizer for clinical text and resolve residual preflight flags before enabling live calls.
5. Draw and tune archetype cards.
6. Call the Session and review the archetype outputs.
7. Ask direct follow-ups or route a Lounge turn between archetypes.
8. Accept, reject, reroll, or request revision.
9. Ask the Clerk to summarize key actions and commit the signed record.

## Runtime stance

The current app supports both live OpenAI calls and deterministic local outputs, so sessions remain usable during network, auth, latency, rate limit, or search-quality failures.

The runtime is intentionally shaped around a future OpenAI Responses API or Agents SDK integration: each archetype has a stable ID, promptable stance, output zone, review state, and Clerk handoff point. The Biblio Rat is the first candidate for live tool use: literature search, evidence summary, and citation trace.

## Anonymization stance

The current clinical privacy path is a local browser free-text preflight. It redacts common identifiers, flags residual risk, and blocks live clinical calls until reviewed text is approved. The Microsoft [Tools for Health Data Anonymization](https://github.com/microsoft/Tools-for-Health-Data-Anonymization) project remains the intended backend adapter target for proper FHIR/DICOM anonymization.

## License

Quorum is licensed under the [Apache License 2.0](LICENSE).

Do not pitch this as diagnosis. The architecture surfaces deliberation; the Chair decides.
