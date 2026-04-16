# SELF: Self‑Evolution with Language Feedback

## Summary
The SELF framework equips large language models with **meta‑skill learning** for self‑feedback and iterative self‑training.  Instead of using external data or rewards, SELF uses the model’s own responses and evaluations to create training examples and refine its behaviour【66216613174085†L11-L38】.  The system generates an initial answer, evaluates it using language feedback, and then performs self‑training by comparing the feedback with correct solutions to learn when and how to adjust its reasoning【66216613174085†L31-L38】.  Experiments show that SELF improves performance on mathematical and general reasoning tasks, demonstrating continuous self‑improvement without human intervention.  The approach highlights the potential of language‑based feedback for autonomous evolution.

## Extracted lines

```
【66216613174085†L11-L38】  Introduces the SELF framework and its use of meta‑skill learning with language feedback.
【66216613174085†L31-L38】  Explains how the model generates responses, evaluates them and self‑trains to improve.
```