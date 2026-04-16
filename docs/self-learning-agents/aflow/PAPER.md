# AFLOW: Automating Agentic Workflow Generation

## Summary
AFLOW formulates agentic workflow optimisation as a search problem over code‑represented workflows.  Nodes represent LLM calls and edges encode control flow; Monte‑Carlo Tree Search is used to explore modifications to the workflow code, guided by execution feedback【269869559216303†L28-L36】.  The system iteratively refines workflows by inserting, deleting or modifying LLM invocation nodes and preserves experience in a tree structure to avoid redundant exploration【269869559216303†L29-L35】.  Evaluations on six benchmark datasets show that AFLOW achieves a 5.7% average improvement over state‑of‑the‑art baselines and allows smaller models to outperform GPT‑4o on certain tasks while costing only 4.55% of its inference cost【269869559216303†L36-L40】.  This approach demonstrates the potential of automated search methods to optimise multi‑step agent workflows.

## Extracted lines

```
【269869559216303†L28-L36】  The workflow optimisation problem is reformulated as a search over code‑represented workflows using Monte‑Carlo Tree Search.
【269869559216303†L29-L35】  AFLOW refines workflows through code modification and stores experience in a tree structure.
【269869559216303†L36-L40】  Reports performance improvements and cost efficiency compared to baselines.
```