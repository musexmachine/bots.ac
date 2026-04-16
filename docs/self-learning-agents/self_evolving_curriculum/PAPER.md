# Self‑Evolving Curriculum for LLM Reasoning (SEC)

## Summary
The **Self‑Evolving Curriculum (SEC)** framework proposes an automatic method to select training problems during reinforcement‑learning fine‑tuning of large language models.  Rather than using a random or manually designed curriculum, SEC formulates curriculum selection as a non‑stationary multi‑armed bandit problem where each problem category (difficulty level or type) is treated as an arm【33768150905667†L21-L29】.  At each RL step the curriculum policy samples problem categories that maximise the model’s expected learning gain, estimated via advantage values, and updates the curriculum using TD(0)【33768150905667†L31-L40】.  Experiments on planning, inductive reasoning and mathematics domains show that SEC improves generalisation to harder out‑of‑distribution tasks and yields better skill balance than random or reverse curricula【33768150905667†L21-L45】.  While useful for RL fine‑tuning, SEC is less directly applicable to our agent runtime because it focuses on training regimes rather than runtime self‑evolution.

## Extracted lines

```
【33768150905667†L21-L29】  Curriculum selection is cast as a multi‑armed bandit problem over problem categories.
【33768150905667†L31-L40】  The curriculum policy is updated using TD(0) and advantage values.
【33768150905667†L21-L45】  Experimental results show improved generalisation and skill balance.
```