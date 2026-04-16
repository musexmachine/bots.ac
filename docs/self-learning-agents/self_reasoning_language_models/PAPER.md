# Self‑Reasoning Language Models (SRLM)

## Summary
Self‑Reasoning Language Models (SRLM) aim to **self‑unfold their own reasoning chains** and iteratively improve performance.  The framework uses a small set of **reasoning catalyst examples** that demonstrate how to expand short chain‑of‑thought rationales into longer, richer reasoning sequences【394009407742719†L18-L31】.  During fine‑tuning the model alternates between generating enriched rationales for its own outputs and selecting the best ones, using selectors that do not require verifiable answers【394009407742719†L108-L134】.  Experiments on reasoning benchmarks such as MMLU, GSM8K, ARC‑C and HellaSwag show that SRLM provides an average improvement of over +2.5 points and up to +7.89 points with extended sampling【394009407742719†L31-L37】.  The approach demonstrates that models can learn to improve their own reasoning with minimal extra data.

## Extracted lines

```
【394009407742719†L18-L31】  The abstract introduces the concept of self‑generated reasoning catalyst data.
【394009407742719†L31-L37】  Reports performance improvements across benchmarks.
【394009407742719†L108-L134】  Describes the iterative process of generating enriched reasoning candidates and selecting them for further training.
```