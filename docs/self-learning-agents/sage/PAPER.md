# Self-evolving Agents with Reflective and Memory‑augmented Abilities (SAGE)

## Summary
The SAGE framework addresses two major challenges for long‑horizon LLM agents: continuous decision‑making in dynamic environments and the lack of long‑term memory.  It introduces a **reflection mechanism** and a **memory optimisation module** based on the Ebbinghaus forgetting curve.  Three cooperating agents (User, Assistant and Checker) iteratively provide feedback and select which information to retain, enabling the system to adapt strategies over time and reduce cognitive load【64826999719218†L18-L27】.  Experiments across multiple benchmarks show that SAGE significantly improves both proprietary and open‑source models, with especially strong gains for smaller models【64826999719218†L28-L33】.  The memory optimisation mechanism selectively retains key information and discards unimportant context, improving performance while controlling memory growth【64826999719218†L93-L99】.

## Extracted lines
The following lines were extracted from the beginning of the paper for reference:

```
【64826999719218†L18-L27】  Self‑evolving Agents with Reflective and Memory‑Augmented Abilities (SAGE)…
【64826999719218†L28-L33】  …highlights the memory optimisation mechanism and experimental gains.
【64826999719218†L93-L99】  …explains how the forgetting curve helps selectively retain key information.
```