# Vision‑Zero: Scalable VLM Self‑Evolution via Multi‑Agent Self‑Play

## Summary
Vision‑Zero proposes a **label‑free, domain‑agnostic self‑play framework** for self‑evolving vision–language models (VLMs).  In this framework models play a game similar to **“Who Is the Spy”**, generating their own training data through competitive interactions on arbitrary image pairs【134457491129535†L24-L34】.  The game encourages strategic reasoning and can be generated from diverse images, including synthetic scenes, charts and real‑world photos【134457491129535†L37-L43】.  A novel **Iterative Self‑Play Policy Optimisation (Iterative‑SPO)** alternates between self‑play and reinforcement learning with verifiable rewards to avoid performance plateaus and achieve sustained improvement【134457491129535†L45-L53】.  Vision‑Zero delivers state‑of‑the‑art results on reasoning and chart QA tasks, surpassing annotation‑based methods despite requiring no human labels【134457491129535†L54-L58】.  While powerful for multimodal tasks, its direct relevance to text‑based agent platforms like our Nebula clone is limited.

## Extracted lines

```
【134457491129535†L24-L34】  Vision‑Zero trains VLMs via Who‑Is‑the‑Spy style games with label‑free data.
【134457491129535†L37-L43】  The game can be generated from arbitrary images, improving reasoning across domains.
【134457491129535†L45-L53】  Introduces Iterative Self‑Play Policy Optimisation to sustain improvement.
【134457491129535†L54-L58】  Reports state‑of‑the‑art results without human annotation.
```