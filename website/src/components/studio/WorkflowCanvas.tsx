// 工作流可视化画布（可编辑）。借鉴 n8n 的节点编辑交互，但用 AO 自己的 React 栈
// (@xyflow/react + dagre)实现，绑定到 AO 的 YAML/角色模型。
// graph 转换在引擎侧（保真往返），保存走 /api/workflows/graph（带成环校验 + 用户工作流就地覆盖）。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { CheckCircle2, Loader2, Plus, Save, Trash2, Wand2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type CanvasEdge, type CanvasNode, type Role } from "@/lib/studio";
import { useRunManager } from "./RunManager";

const NODE_W = 230;
const NODE_H = 92;

type StepData = Record<string, unknown>;

/** 执行态（Phase 2 点亮）：运行工作流时按步状态给节点着色。 */
type ExecStatus = "running" | "done" | "error" | "pending";
const ExecStatusCtx = createContext<Record<string, ExecStatus>>({});

/** dagre 自动布局（rankdir LR，参考 n8n）。 */
function autoLayout(nodes: { id: string; position: { x: number; y: number } }[], edges: { source: string; target: string }[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 96, marginx: 24, marginy: 24 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return new Map(nodes.map((n) => {
    const p = g.node(n.id);
    return [n.id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 }];
  }));
}

/** 加入 source→target 后是否成环（target 已能到达 source）。 */
function wouldCycle(source: string, target: string, edges: { source: string; target: string }[]): boolean {
  if (source === target) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nx of adj.get(cur) ?? []) stack.push(nx);
  }
  return false;
}

function AOStepNode({ id, data, selected }: NodeProps<Node<StepData>>) {
  const role = String(data.role ?? "");
  const isApproval = data.type === "approval" || data.type === "human_input";
  const exec = useContext(ExecStatusCtx)[id];
  // 执行态边框优先于普通态：运行中=蓝(脉冲)、成功=绿、失败=红
  const execBorder =
    exec === "running" ? "border-blue-500 ring-2 ring-blue-500/40 animate-pulse"
    : exec === "done" ? "border-emerald-500"
    : exec === "error" ? "border-red-500 ring-2 ring-red-500/40"
    : "";
  return (
    <div
      className={`rounded-xl border bg-card px-3 py-2 shadow-sm ${execBorder || (selected ? "border-primary ring-2 ring-primary/40" : isApproval ? "border-amber-500/60" : "border-border/70")}`}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !bg-primary/60" />
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none">{String(data.emoji ?? "") || (isApproval ? "✋" : "🤖")}</span>
        <span className="truncate text-sm font-semibold">{String(data.name ?? "") || role}</span>
        {exec === "running" && <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />}
        {exec === "done" && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />}
        {exec === "error" && <XCircle className="size-3.5 shrink-0 text-red-500" />}
        {!exec && !!data.skill && <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{String(data.skill)}</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{String(data.task ?? "") || "—"}</p>
      <Handle type="source" position={Position.Right} className="!size-2.5 !bg-primary/60" />
    </div>
  );
}

const nodeTypes = { aoStep: AOStepNode };

function toRfNode(n: CanvasNode): Node<StepData> {
  return { id: n.id, type: "aoStep", position: n.position, data: { ...n.data, id: n.id } };
}

export function WorkflowCanvas({ file, name, onClose, onSaved }: { file: string; name: string; onClose: () => void; onSaved?: (newFile: string) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StepData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editable, setEditable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const idSeq = useRef(1);

  // Phase 2 执行态点亮：找本工作流最近一次运行，按步状态着色（随 SSE 实时更新）。
  const { runs } = useRunManager();
  const activeRun = useMemo(
    () => [...runs].reverse().find((r) => r.kind === "workflow" && r.source?.file === file),
    [runs, file],
  );
  const execStatus = useMemo<Record<string, ExecStatus>>(() => {
    if (!activeRun) return {};
    const map: Record<string, ExecStatus> = {};
    for (const s of activeRun.steps) {
      map[s.id] = s.status === "done" ? "done"
        : s.status === "running" ? (activeRun.state === "error" ? "error" : "running") // 失败时停在该步 → 红
        : "pending";
    }
    return map;
  }, [activeRun]);
  const isRunning = activeRun?.state === "running";

  useEffect(() => {
    let alive = true;
    api.roles().then((r) => alive && setRoles(r)).catch(() => {});
    api
      .workflowGraph(file)
      .then((g) => {
        if (!alive) return;
        const needsLayout = g.nodes.every((n) => n.position.x === 0 && n.position.y === 0);
        const pos = needsLayout ? autoLayout(g.nodes, g.edges) : null;
        setNodes(g.nodes.map((n) => toRfNode(pos ? { ...n, position: pos.get(n.id)! } : n)));
        setEdges(g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })));
        setEditable(g.editable);
        setLoaded(true);
      })
      .catch((e) => alive && setErr(e?.message || "加载失败"));
    return () => { alive = false; };
  }, [file, setNodes, setEdges]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      setEdges((eds) => {
        if (eds.some((e) => e.source === conn.source && e.target === conn.target)) return eds;
        if (wouldCycle(conn.source!, conn.target!, eds)) {
          setMsg("⚠️ 不能连成环——工作流必须是有向无环图");
          return eds;
        }
        setMsg(null);
        return addEdge({ id: `${conn.source}->${conn.target}`, source: conn.source!, target: conn.target! }, eds);
      });
    },
    [setEdges],
  );

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  const patchSelected = useCallback(
    (patch: StepData) => {
      if (!selectedId) return;
      setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [selectedId, setNodes],
  );

  const addStep = useCallback(() => {
    let id = `step_${idSeq.current++}`;
    while (nodes.some((n) => n.id === id)) id = `step_${idSeq.current++}`;
    const defaultRole = roles[0] ? `${roles[0].category}/${roles[0].id}` : "";
    const node: Node<StepData> = {
      id,
      type: "aoStep",
      position: { x: 80 + nodes.length * 24, y: 80 + nodes.length * 24 },
      data: { id, role: defaultRole, task: "" },
    };
    setNodes((nds) => [...nds, node]);
    setSelectedId(id);
  }, [nodes, roles, setNodes]);

  const relayout = useCallback(() => {
    const pos = autoLayout(nodes, edges);
    setNodes((nds) => nds.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
  }, [nodes, edges, setNodes]);

  const save = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    try {
      const outNodes: CanvasNode[] = nodes.map((n) => ({ id: n.id, position: n.position, data: { ...n.data, id: n.id } }));
      const outEdges: CanvasEdge[] = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
      const res = await api.saveWorkflowGraph({ file, name, nodes: outNodes, edges: outEdges });
      setMsg(res.overwritten ? "✅ 已保存（就地覆盖）" : `✅ 已另存为新工作流`);
      onSaved?.(res.file);
    } catch (e: any) {
      const errs = e?.errors as string[] | undefined;
      setMsg(`❌ 保存失败：${errs?.length ? errs.join("；") : e?.message || "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, file, name, onSaved]);

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  return (
    <ExecStatusCtx.Provider value={execStatus}>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-xl" onClick={stop}>
        {/* 工具栏 */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <span className="truncate text-sm font-semibold">🗺️ {name}</span>
          {loaded && !editable && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">内置模板 · 编辑后将另存为副本</span>}
          {activeRun && (
            <span className="flex items-center gap-2 rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] text-muted-foreground">
              {isRunning ? <Loader2 className="size-3 animate-spin text-blue-500" /> : activeRun.state === "error" ? <XCircle className="size-3 text-red-500" /> : <CheckCircle2 className="size-3 text-emerald-500" />}
              {isRunning ? "运行中" : activeRun.state === "error" ? "失败" : "已完成"} · 执行态已点亮
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={addStep} disabled={!loaded} title="添加步骤">
              <Plus className="size-3.5" /> 步骤
            </Button>
            <Button size="sm" variant="outline" onClick={relayout} disabled={!loaded} title="自动布局">
              <Wand2 className="size-3.5" /> 布局
            </Button>
            <Button size="sm" onClick={save} disabled={!loaded || saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {editable ? "保存" : "另存为副本"}
            </Button>
            <button onClick={onClose} className="ml-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {msg && <div className="border-b border-border/60 bg-muted/30 px-4 py-1.5 text-xs">{msg}</div>}

        <div className="relative flex flex-1 overflow-hidden">
          {err ? (
            <p className="grid h-full w-full place-items-center text-sm text-red-500">{err}</p>
          ) : !loaded ? (
            <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> 加载工作流图…</span>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={(_, n) => setSelectedId(n.id)}
                  onPaneClick={() => setSelectedId(null)}
                  deleteKeyCode={["Backspace", "Delete"]}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background />
                  <Controls showInteractive={false} />
                  <MiniMap pannable zoomable />
                </ReactFlow>
              </div>

              {/* 节点编辑侧栏 */}
              {selected && (
                <div className="w-72 shrink-0 overflow-y-auto border-l border-border/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">编辑步骤</span>
                    <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                  </div>
                  <label className="mb-1 block text-xs text-muted-foreground">步骤 id</label>
                  <div className="mb-3 truncate rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">{selected.id}</div>

                  <label className="mb-1 block text-xs text-muted-foreground">角色</label>
                  <select
                    value={String(selected.data.role ?? "")}
                    onChange={(e) => patchSelected({ role: e.target.value })}
                    className="mb-3 h-9 w-full rounded-lg border border-border/70 bg-background px-2 text-xs outline-none focus:border-primary/50"
                  >
                    {!roles.some((r) => `${r.category}/${r.id}` === selected.data.role) && (
                      <option value={String(selected.data.role ?? "")}>{String(selected.data.role ?? "(未选)")}</option>
                    )}
                    {roles.map((r) => {
                      const path = `${r.category}/${r.id}`;
                      return <option key={path} value={path}>{r.name}（{r.categoryName}）</option>;
                    })}
                  </select>

                  <label className="mb-1 block text-xs text-muted-foreground">显示名（可选）</label>
                  <input
                    value={String(selected.data.name ?? "")}
                    onChange={(e) => patchSelected({ name: e.target.value || undefined })}
                    className="mb-3 h-9 w-full rounded-lg border border-border/70 bg-background px-2.5 text-xs outline-none focus:border-primary/50"
                  />

                  <label className="mb-1 block text-xs text-muted-foreground">任务（支持 {"{{变量}}"}）</label>
                  <textarea
                    value={String(selected.data.task ?? "")}
                    onChange={(e) => patchSelected({ task: e.target.value })}
                    rows={6}
                    className="mb-3 w-full resize-y rounded-lg border border-border/70 bg-background px-2.5 py-2 text-xs outline-none focus:border-primary/50"
                  />

                  <label className="mb-1 block text-xs text-muted-foreground">skill（可选）</label>
                  <input
                    value={String(selected.data.skill ?? "")}
                    onChange={(e) => patchSelected({ skill: e.target.value || undefined })}
                    placeholder="如 test-driven-development"
                    className="mb-4 h-9 w-full rounded-lg border border-border/70 bg-background px-2.5 text-xs outline-none focus:border-primary/50"
                  />

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-red-500 hover:text-red-600"
                    onClick={() => {
                      setNodes((nds) => nds.filter((n) => n.id !== selected.id));
                      setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
                      setSelectedId(null);
                    }}
                  >
                    <Trash2 className="size-3.5" /> 删除此步骤
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </ExecStatusCtx.Provider>
  );
}
