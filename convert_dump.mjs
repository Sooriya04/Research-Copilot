import fs from "fs";
import path from "path";

const dumpPath = "E:\\Projects\\Research-Copilot\\research_papers_dump.json";
const rawData = JSON.parse(fs.readFileSync(dumpPath, "utf-8"));

console.log(`Loaded ${rawData.length} items from research_papers_dump.json`);

const nodes = [];
const edges = [];

const paperNodeIds = [];
const authorNodeIds = [];
const taskNodeIds = [];
const seenAuthorIds = new Set();
const seenTaskIds = new Set();




for (const item of rawData) {
  // Filter out tables or empty titles if any
  if (!item.title || item.title.startsWith("Table ")) continue;

  const paperId = `paper:${item.source || "lit"}:${item.id || Math.random().toString(36).slice(2, 8)}`;
  paperNodeIds.push(paperId);

  // Parse authors
  let authors = [];
  if (Array.isArray(item.authors)) {
    authors = item.authors;
  } else if (typeof item.authors === "string" && item.authors.startsWith("[")) {
    try {
      authors = JSON.parse(item.authors);
    } catch {
      authors = [];
    }
  }

  // Parse tasks / tags
  const tasks = Array.isArray(item.tasks) ? item.tasks : [];
  const tags = [
    item.source ? item.source.toUpperCase() : "RESEARCH",
    ...(item.frameworks || []),
    ...tasks.slice(0, 4),
  ].filter(Boolean);

  let complexity = "moderate";
  if ((item.citation_count ?? 0) > 100) complexity = "complex";
  else if ((item.citation_count ?? 0) < 10) complexity = "simple";

  nodes.push({
    id: paperId,
    name: item.title,
    type: "article",
    summary: item.abstract || `Research paper from ${item.source || "scientific literature"}. Citations: ${item.citation_count || 0}.`,
    filePath: item.pdf_url || item.url || "",
    tags,
    complexity,
    knowledgeMeta: {
      category: item.source ? item.source.toUpperCase() : "Literature",
      content: item.abstract || item.title,
    },
  });

  // Authors
  for (const author of authors) {
    const authorName = String(author).trim();
    if (!authorName || authorName === "null") continue;
    const authorId = `author:${authorName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

    if (!seenAuthorIds.has(authorId)) {
      seenAuthorIds.add(authorId);
      authorNodeIds.push(authorId);
      nodes.push({
        id: authorId,
        name: authorName,
        type: "entity",
        summary: `Researcher / Author on ${item.title}`,
        tags: ["author", "researcher"],
        complexity: "simple",
      });
    }

    edges.push({
      source: authorId,
      target: paperId,
      type: "authored_by",
      direction: "forward",
      weight: 0.9,
    });
  }

  // Tasks / Topics
  for (const task of tasks) {
    const taskName = String(task).trim();
    if (!taskName) continue;
    const taskId = `topic:${taskName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

    if (!seenTaskIds.has(taskId)) {
      seenTaskIds.add(taskId);
      taskNodeIds.push(taskId);
      nodes.push({
        id: taskId,
        name: taskName,
        type: "topic",
        summary: `Research Domain & Task: ${taskName}`,
        tags: ["task", "domain", "topic"],
        complexity: "moderate",
      });
    }

    edges.push({
      source: paperId,
      target: taskId,
      type: "exemplifies",
      direction: "forward",
      weight: 0.8,
    });
  }
}

// Cross link papers that share authors or tasks
for (let i = 0; i < nodes.length; i++) {
  if (nodes[i].type !== "article") continue;
  for (let j = i + 1; j < nodes.length; j++) {
    if (nodes[j].type !== "article") continue;
    const commonTags = nodes[i].tags.filter((t) => nodes[j].tags.includes(t) && t !== "RESEARCH");
    if (commonTags.length >= 2) {
      edges.push({
        source: nodes[i].id,
        target: nodes[j].id,
        type: "builds_on",
        direction: "forward",
        weight: 0.85,
      });
    }
  }
}

const layers = [
  {
    id: "layer:papers",
    name: "Scientific Papers",
    description: "Published research papers and preprints on Speech Spoofing, ASV, and AI Deepfakes",
    nodeIds: paperNodeIds,
  },
  {
    id: "layer:authors",
    name: "Authors & Key Researchers",
    description: "Researchers and scientists contributing to the papers",
    nodeIds: authorNodeIds,
  },
  {
    id: "layer:topics",
    name: "Research Domains & Tasks",
    description: "Key focus areas, benchmarks, and challenge tracks",
    nodeIds: taskNodeIds,
  },
];

const knowledgeGraph = {
  version: "1.0.0",
  kind: "knowledge",
  project: {
    name: "Research Copilot: Audio & Voice Spoofing Dataset",
    languages: ["Python", "Go", "LaTeX"],
    frameworks: ["PyTorch", "ASVspoof", "SpeechRecognition", "ResNet"],
    description: "Interactive research knowledge graph constructed from research_papers_dump.json containing ASVspoof challenges, voice deepfake detection, and countermeasure benchmarks.",
    analyzedAt: new Date().toISOString(),
    gitCommitHash: "research-dump-v1",
  },
  nodes,
  edges,
  layers,
  tour: [
    {
      order: 1,
      title: "ASVspoof Challenge Overview",
      description: "Explore the community challenge papers for speech synthesis and voice conversion spoofing countermeasures.",
      nodeIds: paperNodeIds.slice(0, 3),
    },
    {
      order: 2,
      title: "Key Authors & Research Groups",
      description: "View top contributing researchers across the ASVspoof community.",
      nodeIds: authorNodeIds.slice(0, 4),
    },
  ],
};

const outputPaths = [
  "E:\\Projects\\Understand-Anything\\understand-anything-plugin\\packages\\dashboard\\public\\knowledge-graph.json",
  "E:\\Projects\\Understand-Anything\\understand-anything-plugin\\packages\\dashboard\\dist\\knowledge-graph.json",
  "E:\\Projects\\Research-Copilot\\.ua\\knowledge-graph.json",
];

for (const p of outputPaths) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(knowledgeGraph, null, 2), "utf-8");
  console.log(`Saved knowledge graph to ${p}`);
}

console.log(`\nSuccessfully created Knowledge Graph with ${nodes.length} nodes and ${edges.length} edges!`);
