# Self Rewarding Self Improving (RLSR)

## Summary
This work proposes a reinforcement learning framework where a large language model generates its own **reward signal** without access to ground‑truth data.  The model is trained on a synthetic dataset and then judges its own outputs to produce rewards for further training【417354639842700†L0-L39】.  The loop iterates between question generation, answer generation and reward assignment, enabling the model to self‑improve in domains where verifiable rewards are unavailable【417354639842700†L40-L96】.  Experiments show that Qwen 2.5 7B trained with self rewards can achieve high performance on the MIT Integration Bee benchmark.  While innovative, this approach depends heavily on the model’s initial ability to judge correctness and may not be directly applicable to our agent platform.

## Extracted lines

```
【417354639842700†L0-L39】  Introduces the self‑rewarding loop where the model generates its own reward.
【417354639842700†L40-L96】  Describes the training process and demonstrates improvements on a mathematical benchmark.
```