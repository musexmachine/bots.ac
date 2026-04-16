# SELF‑REFINE: Iterative Refinement with Self‑Feedback

## Summary
SELF‑REFINE proposes a method where a large language model generates an initial answer to a task and then uses the same model to provide **self‑feedback** on that answer.  The model iteratively refines its output by alternately generating feedback and revisions, without any additional training or external reward signals【783782198654335†L0-L49】.  Experiments across seven tasks (including summarisation, translation and reasoning) show that iterative self‑feedback improves quality over both single‑pass generation and chain‑of‑thought approaches【783782198654335†L95-L126】.  This technique is model‑agnostic and yields consistent gains even for strong models such as GPT‑4.  It suggests a simple yet effective path for agents to improve their outputs autonomously.

## Extracted lines

```
【783782198654335†L0-L49】  Describes the iterative self‑feedback process for refining outputs.
【783782198654335†L95-L126】  Reports improvements across multiple tasks and models.
```