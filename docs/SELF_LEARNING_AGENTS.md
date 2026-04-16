# Self‑Learning Agent Papers Report

This report summarises key papers from the **Self‑Evolving Agents** literature with a focus on techniques that could improve an open‑source Nebula clone.  Each paper is assigned a confidence level indicating how directly its ideas might enhance our agent architecture.  **High** indicates strong relevance, **Medium** indicates moderate relevance or useful inspiration, **Low** indicates limited applicability to our project, and **Unknown** means insufficient information.

## Table of Contents

* [High confidence](#high-confidence)
  * [EvoTest](#high-evo-test-evolutionary-test-time-learning-for-self-improving-agentic-systems)
  * [SAGE](#high-self-evolving-agents-with-reflective-and-memory-augmented-abilities-sage)
  * [Mem0](#high-mem0-building-production-ready-ai-agents-with-scalable-long-term-memory)
  * [EvoAgentX](#high-evoagentx-an-automated-framework-for-evolving-agentic-workflows)

* [Medium confidence](#medium-confidence)
  * [MemInsight](#medium-meminsight-autonomous-memory-augmentation-for-llm-agents)
  * [MemoryOS](#medium-memory-os-of-ai-agent)
  * [AFLOW](#medium-aflow-automating-agentic-workflow-generation)
  * [Self‑Reasoning Language Models](#medium-self-reasoning-language-models)
  * [Self‑Challenging Language Model Agents](#medium-self-challenging-language-model-agents)
  * [Self‑Refine](#medium-self-refine-iterative-refinement-with-self-feedback)
  * [Reflexion](#medium-reflexion-language-agents-with-verbal-reinforcement-learning)
  * [SELF](#medium-self-self-evolution-with-language-feedback)
  * [ARIA](#medium-enabling-self-improving-agents-to-learn-at-test-time-with-human-in-the-loop-guidance-aria)

* [Low confidence](#low-confidence)
  * [AgentGen](#low-agentgen-enhancing-planning-abilities-for-large-language-model-based-agents-via-environment-and-task-generation)
  * [Learn‑by‑interact](#low-learn-by-interact-a-data-centric-framework-for-self-adaptive-agents-in-realistic-environments)
  * [RLSR](#low-self-rewarding-self-improving-rlsr)
  * [Self‑Evolving Curriculum](#low-self-evolving-curriculum-for-llm-reasoning-sec)
  * [Vision‑Zero](#low-vision-zero-scalable-vlm-self-evolution-via-multi-agent-self-play)


## High confidence

### [High] EvoTest: Evolutionary Test‑Time Learning for Self‑Improving Agentic Systems ([paper](research/self-learning-agents/evotest/PAPER.md))

EvoTest uses an evolutionary algorithm to adapt an agent’s prompt, memory and tool configuration between episodes.  An **Actor Agent** performs the task while an **Evolver Agent** proposes new configurations based on a fitness function【866554534294018†L0-L111】.  The authors introduce the **J‑TTL benchmark** to evaluate test‑time learning and show that evolutionary search yields improved performance without gradient‑based fine‑tuning【866554534294018†L110-L145】.  This technique could enable automatic agent‑creator functionality in our runtime, making it highly relevant.

### [High] Self‑Evolving Agents with Reflective and Memory‑Augmented Abilities (SAGE) ([paper](research/self-learning-agents/sage/PAPER.md))

SAGE combines a **reflection mechanism** with a **memory optimisation module** based on the Ebbinghaus forgetting curve【64826999719218†L18-L27】.  Three cooperating agents (User, Assistant and Checker) iteratively evaluate outputs and decide what information to retain【64826999719218†L28-L33】.  SAGE significantly improves both proprietary and open‑source models and demonstrates how reflective feedback and selective memory can drive self‑evolution【64826999719218†L93-L99】.  These ideas could inform our auto‑generated agent and memory design, so we assign high confidence.

### [High] Mem0: Building Production‑Ready AI Agents with Scalable Long‑Term Memory ([paper](research/self-learning-agents/mem0/PAPER.md))

Mem0 tackles the fixed context window problem by dynamically extracting and consolidating salient information from conversations and storing it in a scalable, graph‑structured memory【233045525579731†L8-L23】.  The architecture consistently outperforms retrieval‑augmented and full‑context baselines while reducing latency and token cost【233045525579731†L16-L37】.  Its production focus and memory management techniques make it highly relevant for our persistent compute layer.

### [High] EvoAgentX: An Automated Framework for Evolving Agentic Workflows ([paper](research/self-learning-agents/evoagentx/PAPER.md))

EvoAgentX is an open‑source platform that automates the generation, execution and evolutionary optimisation of multi‑agent workflows.  It provides a modular architecture and integrates optimisation algorithms like TextGrad, AFlow and MIPRO to refine prompts, tool configurations and workflow topologies.  Experiments show significant improvements across reasoning, code generation and real‑world tasks.  The system demonstrates an end‑to‑end workflow evolution pipeline, directly inspiring our support for auto‑generated agents.

## Medium confidence

### [Medium] MemInsight: Autonomous Memory Augmentation for LLM Agents ([paper](research/self-learning-agents/meminsight/PAPER.md))

MemInsight automatically generates semantic attributes for memory entries, enabling structured memory without human‑crafted schemas【711528554085856†L16-L33】.  It improves retrieval performance on recommendation and QA tasks【711528554085856†L21-L33】.  While not as comprehensive as Mem0, its autonomous memory augmentation could complement our memory system.

### [Medium] Memory OS of AI Agent ([paper](research/self-learning-agents/memory_os/PAPER.md))

MemoryOS proposes a hierarchical memory operating system with short‑term, mid‑term and long‑term storage, dynamic update mechanisms and integrated retrieval/generation modules【927806406737933†L24-L40】.  It improves long‑term coherence on LoCoMo benchmarks【927806406737933†L42-L47】.  The OS‑style approach offers useful design ideas but may be more complex than needed for our runtime.

### [Medium] AFLOW: Automating Agentic Workflow Generation ([paper](research/self-learning-agents/aflow/PAPER.md))

AFLOW formulates workflow optimisation as a search over code‑represented workflows.  Using Monte‑Carlo Tree Search, it iteratively refines workflows and achieves a 5.7% improvement over baselines【269869559216303†L28-L40】.  The method is promising for automatic workflow design, but it may require adaptation for our chat‑oriented agents.

### [Medium] Self‑Reasoning Language Models ([paper](research/self-learning-agents/self_reasoning_language_models/PAPER.md))

Self‑Reasoning Language Models learn to expand their own chain‑of‑thought rationales using a small set of **reasoning catalysts**【394009407742719†L18-L31】.  The model iteratively generates enriched rationales and selects the best ones【394009407742719†L108-L134】, resulting in improved reasoning performance【394009407742719†L31-L37】.  This technique could inspire internal planning improvements but focuses on offline training.

### [Medium] Self‑Challenging Language Model Agents ([paper](research/self-learning-agents/self_challenging_language_model_agents/PAPER.md))

The Self‑Challenging framework has an agent generate its own tasks and verification functions (Code‑as‑Task) before learning to solve them via reinforcement learning【229118134633891†L19-L33】.  It achieves over a two‑fold improvement on multi‑turn tool‑use benchmarks【229118134633891†L35-L37】.  This idea could inform an automatic agent‑creator, but integrating task synthesis into real‑time workflows may be challenging.

### [Medium] SELF‑REFINE: Iterative Refinement with Self‑Feedback ([paper](research/self-learning-agents/self_refine/PAPER.md))

SELF‑REFINE uses the same model to critique and refine its own outputs, iteratively improving responses without additional training【783782198654335†L0-L49】.  It shows improvements across tasks and models【783782198654335†L95-L126】.  This could enhance single‑agent reasoning but does not address long‑term adaptation.

### [Medium] Reflexion: Language Agents with Verbal Reinforcement Learning ([paper](research/self-learning-agents/reflexion/PAPER.md))

Reflexion stores natural‑language reflections on failures in episodic memory and uses them to guide future decisions【816944510090118†L20-L49】.  It offers a simple self‑improvement method and may complement other memory techniques.

### [Medium] SELF: Self‑Evolution with Language Feedback ([paper](research/self-learning-agents/self/PAPER.md))

SELF trains models to generate responses, evaluate them via language feedback and iteratively self‑train【66216613174085†L11-L38】.  It shows improvements on mathematics and general tasks【66216613174085†L31-L38】.  The approach demonstrates the potential of language‑based feedback for autonomous evolution.

### [Medium] Enabling Self‑Improving Agents to Learn at Test Time with Human‑in‑the‑Loop Guidance (ARIA) ([paper](research/self-learning-agents/aria/PAPER.md))

ARIA detects when an agent is uncertain and asks a human expert for guidance, storing feedback in a knowledge base【491655523103906†L0-L138】.  This human‑in‑the‑loop mechanism improves adaptability in dynamic tasks.  It could provide a safety fallback for auto‑generated agents, though reliance on human input limits scalability.

## Low confidence

### [Low] AgentGen: Enhancing Planning Abilities for Large Language Model based Agents via Environment and Task Generation ([paper](research/self-learning-agents/agentgen/PAPER.md))

AgentGen automatically generates diverse environments and tasks to improve planning skills【201043912280171†L10-L66】.  While useful for training strong planners, it focuses on environment synthesis rather than runtime self‑evolution, so its relevance is limited.

### [Low] Learn‑by‑interact: A Data‑Centric Framework for Self‑Adaptive Agents in Realistic Environments ([paper](research/self-learning-agents/learn_by_interact/PAPER.md))

Learn‑by‑interact synthesises agent‑environment interactions and uses them to adapt agents without human labels【957620902916032†L10-L39】.  It improves performance on several benchmarks【957620902916032†L140-L156】, but requires extensive data synthesis and offline training.

### [Low] Self Rewarding Self Improving (RLSR) ([paper](research/self-learning-agents/self_rewarding_self_improving/PAPER.md))

RLSR trains a model to generate its own reward signals without ground‑truth data【417354639842700†L0-L39】.  While this is an interesting reinforcement learning idea, its dependence on self‑judged correctness and mathematical tasks makes it less applicable to our agent runtime【417354639842700†L40-L96】.

### [Low] Self‑Evolving Curriculum for LLM Reasoning (SEC) ([paper](research/self-learning-agents/self_evolving_curriculum/PAPER.md))

The SEC method learns a curriculum policy to select training problems for RL fine‑tuning【33768150905667†L21-L45】.  It is useful for model training but not directly relevant to runtime self‑evolution.

### [Low] Vision‑Zero: Scalable VLM Self‑Evolution via Multi‑Agent Self‑Play ([paper](research/self-learning-agents/vision_zero/PAPER.md))

Vision‑Zero uses competitive self‑play to evolve vision–language models with label‑free data【134457491129535†L24-L34】.  It is specific to multimodal models and gaming environments【134457491129535†L37-L43】, so it has limited applicability to our text‑centric agent.