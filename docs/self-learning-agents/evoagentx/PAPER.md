# EvoAgentX: An Automated Framework for Evolving Agentic Workflows

**Source**: arXiv preprint `2507.03616` (Y. Wang et al., 2025).  The paper introduces **EvoAgentX**, an open‑source platform designed to automate the generation, execution and evolutionary optimisation of multi‑agent workflows.  Multi‑agent systems (MAS) allow large language models and specialised tools to collaborate on complex tasks, but existing MAS frameworks rely on manually configured workflows and lack built‑in support for dynamic evolution.  EvoAgentX addresses this gap by providing a modular architecture with five layers—basic components, agent, workflow, evolving and evaluation—and by integrating three optimisation algorithms (TextGrad, AFlow and MIPRO) to iteratively refine agent prompts, tool configurations and workflow topologies.  The platform demonstrates significant performance improvements on multi‑hop reasoning (HotPotQA), code generation (MBPP), mathematical problem solving (MATH) and real‑world tasks (GAIA) through automatic workflow evolution.  The full text extracted from the PDF is included below for reference.

```
EvoAgentX: An Automated Framework for Evolving Agentic Workflows
    Yingxu Wang1
    Siwei Liu2
    Jinyuan Fang3
    Zaiqiao Meng3*
    1Mohamed bin Zayed University of Artificial Intelligence
    2University of Aberdeen
    3University of Glasgow
    yingxv.wang@gmail.com, siwei.liu@abdn.ac.uk
    j.fang.2@research.gla.ac.uk, zaiqiao.meng@glasgow.ac.uk
    Abstract
    Multi-agent systems (MAS) have emerged as a
    powerful paradigm for orchestrating large lan-
    guage models (LLMs) and specialized tools to
    collaboratively address complex tasks. How-
    ever, existing MAS frameworks often require
    manual workflow configuration and lack native
    support for dynamic evolution and performance
    optimization. In addition, many MAS optimiza-
    tion algorithms are not integrated into a unified
    framework. In this paper, we present EvoA-
    gentX, an open-source platform that automates
    the generation, execution, and evolutionary op-
    timization of multi-agent workflows. EvoA-
    gentX employs a modular architecture consist-
    ing of five core layers: the basic components,
    agent, workflow, evolving, and evaluation lay-
    ers. Specifically, within the evolving layer,
    EvoAgentX integrates three MAS optimization
    algorithms, TextGrad, AFlow, and MIPRO, to
    iteratively refine agent prompts, tool config-
    urations, and workflow topologies. We eval-
    uate EvoAgentX on HotPotQA, MBPP, and
    MATH for multi-hop reasoning, code gener-
    ation, and mathematical problem solving, re-
    spectively, and further assess it on real-world
    tasks using GAIA. Experimental results show
    that EvoAgentX consistently achieves signifi-
    cant performance improvements, including a
    7.44% increase in HotPotQA F1, a 10.00% im-
    provement in MBPP pass@1, a 10.00% gain in
    MATH solve accuracy, and an overall accuracy
    improvement of up to 20.00% on GAIA. The
    source code is available at: https://github.
    com/EvoAgentX/EvoAgentX.
    1
    Introduction
    Multi-agent systems (MAS) are emerging as a pow-
    erful paradigm for orchestrating large language
    models (LLMs) and specialized tools to solve com-
    plex tasks collaboratively (Hong et al., 2023; Gao
    et al., 2024; Fang et al., 2025). By coordinating
    multiple agents with distinct capabilities, such as
    planning, reasoning, or code generation, MAS de-
    compose intricate problems into controllable sub-
    tasks and assign them to agents capable of solving
    them (Yuan et al., 2024; Zhang et al., 2025a). This
    flexible and modular architecture makes MAS well-
    suited for addressing complex real-world problems.
    As a result, MAS have been widely deployed in
    applications such as multi-hop question answer-
    ing (Hong et al., 2023), software engineering au-
    tomation (Li et al., 2023), code generation (Liu
    et al., 2025), mathematical problem solving (Gao
    et al., 2024), and dialogue systems (Shi et al.,
    2024).
    ...
```
