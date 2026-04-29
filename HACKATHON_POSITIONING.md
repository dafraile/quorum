# Quorum Hackathon Positioning

## Name

The current product name is **Quorum**.

`ClinicBoard` should not be used as the product name. A live healthcare product already uses the name, and the updated master spec has moved the project beyond a clinical-only product.

`Quorum` is crowded as a general software/company name, but the hackathon demo uses it as a design-pattern name: structured deliberation where one voice is not enough. If the project needs a more specific public name later, **Clinical Quorum** is the safest near-term qualifier for the v1 vertical.

This is not legal trademark clearance; it is a practical naming-risk check for a same-day hackathon.

## Judge-facing angle

The product should not be pitched as "AI diagnosis." It is not a diagnostic system.

The pitch is:

> Quorum is a deliberation architecture for high-stakes knowledge work: a Session of specialist AI archetypes debates a matter on the Floor, the human Chair governs, and the Clerks produce only what the Chair signs off. The clinical case is the proof point, not the product boundary.

The "not possible before Codex" angle has three parts:

1. **Build speed:** a domain expert can turn a detailed governance pattern written in Markdown into a working product surface in a single day.
2. **Deep model integration:** the interface is designed around multiple model-powered stances, not a single assistant trying to be balanced.
3. **Agentic extensibility:** specialist roles can become tool-using agents. The Biblio Rat is the obvious first live integration: a research Clerk/Session voice that searches evidence, summarizes uncertainty, and cites sources.

## Codex and Agents scope

Do **not** fork Codex for the hackathon build. That would shift the work from product proof to framework surgery and introduce auth/runtime risk.

Recommended implementation ladder:

1. **Today, critical path:** deterministic streamed archetype outputs with a clean runtime seam. The demo cannot fail because of network, auth, rate limits, or literature-search latency.
2. **Today, stretch:** wire the Biblio Rat to an OpenAI Responses API or Agents SDK path with web/file search, behind a fallback.
3. **After the demo:** run a true Codex SDK-backed Clerk from a Node host. This could create a literature-review artifact, inspect uploaded files, or update a case packet, but it should not run directly from the browser.

## Why the clinical scenario works

The Mrs M case demonstrates a real single-voice failure mode:

- treating the number rather than the patient;
- accepting a shallow travel history as settled;
- delaying medication review;
- escalating to specialty referral or steroids before cause-finding is complete.

The architecture does not diagnose her. The Chair does. Quorum makes the missed questions hard to skip.
