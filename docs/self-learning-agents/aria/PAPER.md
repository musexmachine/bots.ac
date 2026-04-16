# Enabling Self‑Improving Agents to Learn at Test Time with Human‑in‑the‑Loop Guidance (ARIA)

## Summary
ARIA is a framework for test‑time adaptation where a language agent identifies its own uncertainty and solicits help from a human expert when needed.  The agent contains a **coordinator** that monitors confidence scores and triggers a **Guidance Agent** to query a human when uncertainty exceeds a threshold【491655523103906†L0-L138】.  Human feedback is incorporated into a **timestamped knowledge base**, which can be updated during deployment to improve future decisions【491655523103906†L0-L138】.  Experiments demonstrate improved adaptability in dynamic settings such as customer due diligence tasks for TikTok Pay.  ARIA illustrates how human‑in‑the‑loop guidance can enable safe test‑time learning without model retraining.

## Extracted lines

```
【491655523103906†L0-L138】  Describes the ARIA framework, including uncertainty detection, human guidance and knowledge base updates.
```