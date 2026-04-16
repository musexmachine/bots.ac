# EvoTest: Evolutionary Test‑Time Learning for Self‑Improving Agentic Systems

## Summary
EvoTest introduces an **evolutionary algorithm** that adapts an agent’s entire configuration (prompt, memory, hyperparameters and tool usage) between episodes without gradient‑based fine‑tuning.  The framework includes two cooperating agents: an **Actor Agent** that plays a game or performs a task, and an **Evolver Agent** that proposes revised configurations for the next run based on a fitness function that evaluates performance【866554534294018†L0-L111】.  The authors also present a new benchmark, **J‑TTL (Jericho Test‑Time Learning)**, to assess an agent’s ability to learn during test time across multiple episodes【866554534294018†L110-L145】.  EvoTest demonstrates improved performance on J‑TTL tasks, showing that evolutionary search can optimise agent configurations between trials.  This gradient‑free adaptation is promising for environments where conventional fine‑tuning is infeasible.

## Extracted lines

```
【866554534294018†L0-L111】  Describes the EvoTest framework with Actor and Evolver agents and evolutionary adaptation.
【866554534294018†L110-L145】  Introduces the J‑TTL benchmark and reports improved performance.
```