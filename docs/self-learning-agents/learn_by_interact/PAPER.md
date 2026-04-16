# Learn‑by‑interact: A Data‑Centric Framework for Self‑Adaptive Agents in Realistic Environments

## Summary
Learn‑by‑interact is a data‑centric framework that synthesizes agent‑environment interactions and uses them to adapt LLM agents to new environments without human annotations.  The system constructs tasks via a backward construction process and collects **interaction trajectories** to build a dataset of environment behaviours【957620902916032†L10-L39】.  Agents then extract instructions from the trajectories and learn to adapt through self‑interactions.  Experiments on benchmarks such as SWE‑bench, WebArena and OSWorld show improvements up to 12.2% in in‑context learning and 19.5% when training with the Codestral‑22B model【957620902916032†L140-L156】.  The method demonstrates that generating synthetic interaction data can help agents generalise to realistic environments.

## Extracted lines

```
【957620902916032†L10-L39】  Summarises the data synthesis and adaptation pipeline using backward construction and interaction trajectories.
【957620902916032†L140-L156】  Reports experimental improvements on multiple benchmarks.
```