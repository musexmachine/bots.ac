# Memory OS of AI Agent

## Summary
MemoryOS introduces a **memory operating system** for AI agents, inspired by memory management in computer operating systems.  The proposed architecture consists of hierarchical storage units (short‑term, mid‑term and long‑term), dynamic update mechanisms and retrieval/generation modules【927806406737933†L24-L40】.  Short‑term memories follow a FIFO principle based on dialogue chains, while mid‑term to long‑term updates use a segmented paging strategy【927806406737933†L31-L40】.  The system integrates storage, updating, retrieval and response generation to maintain long‑term coherence and personalization over extended dialogues【927806406737933†L30-L43】.  Experiments on the LoCoMo benchmark show that MemoryOS improves F1 and BLEU‑1 scores by around 49% and 46% over baselines on GPT‑4o‑mini【927806406737933†L42-L47】.  This work highlights a comprehensive approach to memory management and could inspire robust memory modules in our agent runtime.

## Extracted lines

```
【927806406737933†L24-L40】  Describes the hierarchical memory architecture and dynamic updates.
【927806406737933†L30-L43】  The system integrates storage, updating, retrieval and generation to ensure coherence.
【927806406737933†L42-L47】  Reports improvements in F1 and BLEU‑1 on the LoCoMo benchmark.
```