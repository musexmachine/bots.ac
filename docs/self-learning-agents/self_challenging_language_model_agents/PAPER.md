# Self‑Challenging Language Model Agents

## Summary
This paper introduces a **Self‑Challenging** framework that enables an agent to generate its own high‑quality tasks for training.  The agent plays two roles: **challenger** and **executor**.  In the challenger role it interacts with available tools and synthesizes a new task defined by an instruction, a verification function, solution examples and failure cases—collectively called a **Code‑as‑Task** representation【229118134633891†L19-L33】.  In the executor role the agent uses reinforcement learning and the verification feedback to solve the task and refine its behaviour【229118134633891†L31-L37】.  Experiments on multi‑turn tool‑use benchmarks (M3ToolEval and TauBench) show that this self‑task generation leads to more than a two‑fold improvement for an 8‑B parameter Llama model with only self‑generated data【229118134633891†L35-L37】.  The approach highlights how agents can autonomously create and learn from tasks, which may inspire automatic agent‑creator components.

## Extracted lines

```
【229118134633891†L19-L33】  Describes the challenger role and the Code‑as‑Task representation.
【229118134633891†L31-L37】  The agent uses RL to execute tasks and shows improvements on benchmarks.
【229118134633891†L35-L37】  Reports more than a two‑fold improvement over baselines using self‑generated data.
```