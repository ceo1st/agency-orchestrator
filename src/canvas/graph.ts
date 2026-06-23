// 工作流 YAML ↔ 画布 graph 的双向转换（可编辑画布的核心契约）。
//
// 设计原则（防 AI 开发头号风险「往返丢字段」）：
//   - graph 节点携带**完整的 step 原始对象**（node.data）；
//   - graphToWorkflow 只重算 depends_on（来自连线）和坐标（meta.layout），其余字段原样 dump；
//   - 转换基于原始 YAML doc（不走会丢未知字段的 parseWorkflow），保留 name/agents_dir/llm/inputs 等。
//   - 坐标存进 doc.meta.layout（引擎忽略，不影响可运行性 / 校验）。
//
// 这两个函数是纯函数（string in / string out + 朴素对象），便于单测往返。

import yaml from 'js-yaml';

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasGraphNode {
  id: string;
  position: CanvasPosition;
  /** 该步骤的完整 YAML 定义（保真往返的关键：原样保留所有字段）。 */
  data: Record<string, unknown>;
}

export interface CanvasGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface CanvasGraph {
  name: string;
  nodes: CanvasGraphNode[];
  edges: CanvasGraphEdge[];
}

type RawDoc = Record<string, unknown>;
type RawStep = Record<string, unknown>;

/** YAML 文本 → 画布 graph。坐标取 meta.layout，没有则给 {0,0}（前端用 dagre 自动布局）。 */
export function workflowToGraph(yamlText: string): CanvasGraph {
  const doc = (yaml.load(yamlText) || {}) as RawDoc;
  const steps = Array.isArray(doc.steps) ? (doc.steps as RawStep[]) : [];
  const meta = (doc.meta || {}) as RawDoc;
  const layout = (meta.layout || {}) as Record<string, CanvasPosition>;

  const nodes: CanvasGraphNode[] = steps.map((step) => {
    const id = String(step.id);
    const pos = layout[id];
    return {
      id,
      position: pos && typeof pos.x === 'number' && typeof pos.y === 'number' ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      data: step,
    };
  });

  const edges: CanvasGraphEdge[] = [];
  for (const step of steps) {
    const target = String(step.id);
    const deps = Array.isArray(step.depends_on) ? (step.depends_on as unknown[]) : [];
    for (const dep of deps) {
      const source = String(dep);
      edges.push({ id: `${source}->${target}`, source, target });
    }
  }

  return { name: String(doc.name ?? 'workflow'), nodes, edges };
}

/**
 * 画布 graph → YAML 文本。以 baseYamlText 为底保留顶层字段（name/agents_dir/llm/inputs…）；
 * steps 由 graph 节点重建（保留每步全部字段），depends_on 由连线重算，坐标写进 meta.layout。
 */
export function graphToWorkflow(graph: CanvasGraph, baseYamlText: string): string {
  const doc = (yaml.load(baseYamlText) || {}) as RawDoc;

  // 入边表：target ← [sources]，保持稳定顺序（按节点出现顺序）。
  const incoming = new Map<string, string[]>();
  for (const node of graph.nodes) incoming.set(node.id, []);
  for (const edge of graph.edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge.source);
  }

  doc.steps = graph.nodes.map((node) => {
    const step: RawStep = { ...node.data, id: node.id };
    const deps = incoming.get(node.id) ?? [];
    if (deps.length > 0) step.depends_on = deps;
    else delete step.depends_on; // 没有入边就不写空数组
    return step;
  });

  // 坐标存进 meta.layout（引擎忽略）。
  const meta = (doc.meta || {}) as RawDoc;
  const layout: Record<string, CanvasPosition> = {};
  for (const node of graph.nodes) layout[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
  meta.layout = layout;
  doc.meta = meta;
  if (graph.name) doc.name = graph.name;

  return yaml.dump(doc, { lineWidth: -1, noRefs: true });
}
