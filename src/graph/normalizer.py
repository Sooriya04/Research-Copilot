import re
from typing import Dict, List, Optional, Set, Tuple

# ── Canonical ML Entity Dictionary & Aliases ──────────────────────────────────
CANONICAL_ALIASES: Dict[str, str] = {
    # Fine-tuning & PEFT
    "low-rank adaptation": "LoRA",
    "low rank adaptation": "LoRA",
    "lora": "LoRA",
    "qlora": "QLoRA",
    "quantized low-rank adaptation": "QLoRA",
    "peft": "Parameter-Efficient Fine-Tuning",
    "parameter-efficient fine-tuning": "Parameter-Efficient Fine-Tuning",
    "parameter efficient fine-tuning": "Parameter-Efficient Fine-Tuning",
    "parameter efficient fine tuning": "Parameter-Efficient Fine-Tuning",
    "prefix-tuning": "Prefix Tuning",
    "prefix tuning": "Prefix Tuning",
    "prompt-tuning": "Prompt Tuning",
    "prompt tuning": "Prompt Tuning",
    "adapter": "Adapter Layers",
    "adapters": "Adapter Layers",
    
    # Architectures & Attention
    "transformer": "Transformer",
    "transformers": "Transformer",
    "transformer architecture": "Transformer",
    "transformer model": "Transformer",
    "transformer models": "Transformer",
    "self-attention": "Self-Attention Mechanism",
    "self attention": "Self-Attention Mechanism",
    "self attention mechanism": "Self-Attention Mechanism",
    "multi-head attention": "Multi-Head Attention",
    "multihead attention": "Multi-Head Attention",
    "flashattention": "FlashAttention",
    "flash-attention": "FlashAttention",
    "flash attention": "FlashAttention",
    "flashattention-2": "FlashAttention-2",
    "mamba": "Mamba State Space Model",
    "state space model": "State Space Models (SSM)",
    "state space models": "State Space Models (SSM)",
    "ssm": "State Space Models (SSM)",
    "mixture of experts": "Mixture of Experts (MoE)",
    "mixture-of-experts": "Mixture of Experts (MoE)",
    "moe": "Mixture of Experts (MoE)",
    "rope": "Rotary Position Embedding (RoPE)",
    "rotary position embedding": "Rotary Position Embedding (RoPE)",
    "rotary embeddings": "Rotary Position Embedding (RoPE)",
    "swiglu": "SwiGLU Activation",
    
    # Alignment & Training
    "reinforcement learning from human feedback": "RLHF",
    "rlhf": "RLHF",
    "direct preference optimization": "DPO",
    "dpo": "DPO",
    "ppo": "Proximal Policy Optimization (PPO)",
    "proximal policy optimization": "Proximal Policy Optimization (PPO)",
    "knowledge distillation": "Knowledge Distillation",
    "chain-of-thought": "Chain-of-Thought (CoT)",
    "chain of thought": "Chain-of-Thought (CoT)",
    "cot": "Chain-of-Thought (CoT)",
    "retrieval-augmented generation": "Retrieval-Augmented Generation (RAG)",
    "retrieval augmented generation": "Retrieval-Augmented Generation (RAG)",
    "rag": "Retrieval-Augmented Generation (RAG)",
    
    # Quantization
    "quantization": "Model Quantization",
    "awq": "AWQ Quantization",
    "gptq": "GPTQ Quantization",
    
    # Benchmarks & Datasets
    "glue": "GLUE",
    "glue benchmark": "GLUE",
    "superglue": "SuperGLUE",
    "superglue benchmark": "SuperGLUE",
    "mmlu": "MMLU Benchmark",
    "gsm8k": "GSM8K",
    "humaneval": "HumanEval",
    "human-eval": "HumanEval",
    "imagenet": "ImageNet",
    "cifar-10": "CIFAR-10",
    "cifar10": "CIFAR-10",
    "cifar-100": "CIFAR-100",
    "squad": "SQuAD",
    "squad 2.0": "SQuAD 2.0",
    "ms coco": "MS COCO",
    "coco": "MS COCO",
    "wmt 2014": "WMT 2014",
    "wmt14": "WMT 2014",
    "wikitext-103": "WikiText-103",
    "wikitext": "WikiText-103",
}

# Generic words that should never become standalone entity nodes
STOP_ENTITIES: Set[str] = {
    "computer science", "artificial intelligence", "machine learning", "deep learning",
    "natural language processing", "information retrieval", "topic modeling", "software engineering",
    "empirical method", "benchmark evaluation", "general benchmark", "general",
    "method", "methods", "dataset", "datasets", "benchmark", "benchmarks",
    "analysis", "study", "studies", "overview", "survey", "surveys", "research",
    "framework", "frameworks", "system", "systems", "technique", "techniques",
    "approach", "approaches", "model", "models", "evaluation", "evaluations",
    "experiment", "experiments", "task", "tasks", "performance", "impact",
    "results", "paper", "papers", "algorithm", "algorithms", "training",
}

# ── Regex patterns for Heuristic Extraction Fallback ───────────────────────────
HEURISTIC_METHOD_PATTERNS = [
    (re.compile(r"\b(lora|low-rank adaptation|low rank adaptation)\b", re.I), "LoRA"),
    (re.compile(r"\b(qlora|quantized low-rank adaptation)\b", re.I), "QLoRA"),
    (re.compile(r"\b(peft|parameter-efficient fine-tuning|parameter efficient fine-tuning)\b", re.I), "Parameter-Efficient Fine-Tuning"),
    (re.compile(r"\b(flashattention-?2?|flash attention)\b", re.I), "FlashAttention"),
    (re.compile(r"\b(transformer architecture|transformer models?|self-attention mechanism|multi-head attention)\b", re.I), "Transformer Architecture"),
    (re.compile(r"\b(mamba|state space models?|\bssm\b)\b", re.I), "Mamba State Space Model"),
    (re.compile(r"\b(mixture-of-experts|mixture of experts|\bmoe\b)\b", re.I), "Mixture of Experts (MoE)"),
    (re.compile(r"\b(rotary position embeddings?|\brope\b)\b", re.I), "Rotary Position Embedding (RoPE)"),
    (re.compile(r"\b(retrieval-augmented generation|\brag\b)\b", re.I), "Retrieval-Augmented Generation (RAG)"),
    (re.compile(r"\b(chain-of-thought|\bcot\b|thought reasoning)\b", re.I), "Chain-of-Thought (CoT)"),
    (re.compile(r"\b(reinforcement learning from human feedback|\brlhf\b)\b", re.I), "RLHF"),
    (re.compile(r"\b(direct preference optimization|\bdpo\b)\b", re.I), "DPO"),
    (re.compile(r"\b(knowledge distillation)\b", re.I), "Knowledge Distillation"),
    (re.compile(r"\b(model quantization|\bawq\b|\bgptq\b)\b", re.I), "Model Quantization"),
    (re.compile(r"\b(selfcheckgpt)\b", re.I), "SelfCheckGPT"),
    (re.compile(r"\b(belief tree propagation|\bbtprop\b)\b", re.I), "Belief Tree Propagation"),
    (re.compile(r"\b(self-reflection|self reflection)\b", re.I), "Self-Reflection"),
    (re.compile(r"\b(self-consistency|self consistency)\b", re.I), "Self-Consistency"),
    (re.compile(r"\b(cross-model consistency|cross model consistency)\b", re.I), "Cross-Model Consistency"),
    (re.compile(r"\b(faithfulness verification)\b", re.I), "Faithfulness Verification"),
    (re.compile(r"\b(fact-checking|fact checking)\b", re.I), "Fact-Checking"),
]

HEURISTIC_DATASET_PATTERNS = [
    (re.compile(r"\b(glue benchmark|\bglue\b)\b", re.I), "GLUE Benchmark"),
    (re.compile(r"\b(superglue benchmark|\bsuperglue\b)\b", re.I), "SuperGLUE Benchmark"),
    (re.compile(r"\b(\bmmlu\b|massive multitask language understanding)\b", re.I), "MMLU Benchmark"),
    (re.compile(r"\b(\bgsm8k\b|grade school math)\b", re.I), "GSM8K"),
    (re.compile(r"\b(humaneval|human-eval)\b", re.I), "HumanEval"),
    (re.compile(r"\b(imagenet|image-net)\b", re.I), "ImageNet"),
    (re.compile(r"\b(squad|squad 2\.0)\b", re.I), "SQuAD"),
    (re.compile(r"\b(ms coco|\bcoco\b)\b", re.I), "MS COCO"),
    (re.compile(r"\b(wmt 2014|\bwmt14\b)\b", re.I), "WMT 2014"),
    (re.compile(r"\b(wikitext-103|wikitext)\b", re.I), "WikiText-103"),
    (re.compile(r"\b(cifar-100?)\b", re.I), "CIFAR-10"),
    (re.compile(r"\b(truthfulqa)\b", re.I), "TruthfulQA"),
    (re.compile(r"\b(halueval)\b", re.I), "HaluEval"),
    (re.compile(r"\b(factscore)\b", re.I), "FactScore"),
    (re.compile(r"\b(wikibio)\b", re.I), "WikiBio"),
    (re.compile(r"\b(faithdial)\b", re.I), "FaithDial"),
]

HEURISTIC_TASK_PATTERNS = [
    (re.compile(r"\b(language model(ing)?|text generation)\b", re.I), "Language Modeling"),
    (re.compile(r"\b(fine-tuning|instruction tuning)\b", re.I), "Fine-Tuning"),
    (re.compile(r"\b(question answering|\bqa\b)\b", re.I), "Question Answering"),
    (re.compile(r"\b(machine translation)\b", re.I), "Machine Translation"),
    (re.compile(r"\b(mathematical reasoning|math reasoning)\b", re.I), "Mathematical Reasoning"),
    (re.compile(r"\b(code generation|program synthesis)\b", re.I), "Code Generation"),
    (re.compile(r"\b(image classification)\b", re.I), "Image Classification"),
    (re.compile(r"\b(hallucination detection|mitigating hallucination)\b", re.I), "Hallucination Detection"),
    (re.compile(r"\b(fact verification|factual consistency)\b", re.I), "Fact Verification"),
]


def normalize_entity(name: str) -> str:
    """Normalize entity name to canonical form using alias dictionary."""
    if not name or not isinstance(name, str):
        return ""
    clean = name.strip()
    lower = clean.lower()
    if lower in STOP_ENTITIES or len(clean) < 2:
        return ""
    return CANONICAL_ALIASES.get(lower, clean)


def extract_heuristic_entities(text: str) -> Dict[str, List[str]]:
    """Deterministic zero-token heuristic entity extractor scanning text against canonical ML patterns and title structures."""
    if not text:
        return {"methods": [], "datasets": [], "tasks": [], "metrics": []}

    methods: Set[str] = set()
    datasets: Set[str] = set()
    tasks: Set[str] = set()

    for pattern, canonical in HEURISTIC_METHOD_PATTERNS:
        if pattern.search(text):
            methods.add(canonical)

    for pattern, canonical in HEURISTIC_DATASET_PATTERNS:
        if pattern.search(text):
            datasets.add(canonical)

    for pattern, canonical in HEURISTIC_TASK_PATTERNS:
        if pattern.search(text):
            tasks.add(canonical)

    # Dynamic extraction from Title syntax (e.g. 'Method: Subtitle' or 'X via Method' or 'X through Method')
    first_line = text.split("\n")[0] if "\n" in text else text
    if first_line.upper().startswith("TITLE:"):
        first_line = first_line[6:].strip()

    # Pattern A: Leading distinctive brand/method before colon (e.g. 'SelfCheckGPT: Zero-Resource...')
    m_colon = re.match(r"^([A-Za-z0-9\-\s]{3,28}):", first_line)
    if m_colon:
        cand = m_colon.group(1).strip()
        if not any(w in cand.lower() for w in ["survey", "overview", "towards", "on the", "analysis"]):
            methods.add(cand)

    # Pattern B: Method indicated by prepositions 'via', 'through', 'using' (e.g. 'via Belief Tree Propagation')
    m_prep = re.search(r"\b(?:via|through|using)\s+([A-Za-z0-9\-\s]{3,45})(?:$|[\(\,\:])", first_line, re.I)
    if m_prep:
        cand = m_prep.group(1).strip()
        cand = re.sub(r"^(fine-grained|coarse-grained|probabilistic|efficient|novel|robust)\s+", "", cand, flags=re.I)
        if len(cand) >= 3 and not any(w in cand.lower() for w in ["llm", "large language model", "neural"]):
            methods.add(cand.title())

    return {
        "methods": sorted(list(methods)),
        "datasets": sorted(list(datasets)),
        "tasks": sorted(list(tasks)),
        "metrics": [],
    }
