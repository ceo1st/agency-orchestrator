/**
 * DAG 构建和拓扑排序
 */
import type { WorkflowDefinition, DAGNode } from '../types.js';

export interface DAG {
  nodes: Map<string, DAGNode>;
  /** 拓扑排序后的执行层级，每层内的节点可并行 */
  levels: string[][];
}

/**
 * 从 WorkflowDefinition 构建 DAG
 */
export function buildDAG(workflow: WorkflowDefinition): DAG {
  const nodes = new Map<string, DAGNode>();

  // 创建所有节点
  for (const step of workflow.steps) {
    nodes.set(step.id, {
      step,
      dependencies: step.depends_on || [],
      dependents: [],
      status: 'pending',
    });
  }

  // 构建反向依赖（谁依赖我）
  for (const [id, node] of nodes) {
    for (const dep of node.dependencies) {
      const depNode = nodes.get(dep);
      if (!depNode) {
        throw new Error(`step "${id}" 依赖不存在的 step: "${dep}"`);
      }
      depNode.dependents.push(id);
    }
  }

  // 拓扑排序 — 按层分组（同层可并行）
  const levels = topologicalLevels(nodes);

  return { nodes, levels };
}

/**
 * 拓扑排序，返回执行层级
 * 每个层级内的节点互不依赖，可并行执行
 *
 * 例如:
 *   A → B → D
 *   A → C → D
 * 结果: [[A], [B, C], [D]]
 */
function topologicalLevels(nodes: Map<string, DAGNode>): string[][] {
  const inDegree = new Map<string, number>();
  for (const [id, node] of nodes) {
    inDegree.set(id, node.dependencies.length);
  }

  const levels: string[][] = [];
  const remaining = new Set(nodes.keys());

  while (remaining.size > 0) {
    // 找出当前入度为 0 的节点
    const currentLevel: string[] = [];
    for (const id of remaining) {
      if (inDegree.get(id) === 0) {
        currentLevel.push(id);
      }
    }

    if (currentLevel.length === 0) {
      throw new Error('工作流存在循环依赖，无法拓扑排序');
    }

    // 移除本层节点，更新入度
    for (const id of currentLevel) {
      remaining.delete(id);
      const node = nodes.get(id)!;
      for (const dep of node.dependents) {
        inDegree.set(dep, inDegree.get(dep)! - 1);
      }
    }

    levels.push(currentLevel);
  }

  return levels;
}

/**
 * 格式化 DAG 为可读文本（用于 `ao plan` 命令）
 */
export function formatDAG(dag: DAG): string {
  const lines: string[] = ['执行计划:\n'];

  for (let i = 0; i < dag.levels.length; i++) {
    const level = dag.levels[i];
    const parallel = level.length > 1;

    for (let j = 0; j < level.length; j++) {
      const node = dag.nodes.get(level[j])!;
      const step = node.step;
      const prefix = parallel ? (j === 0 ? '┌' : j === level.length - 1 ? '└' : '├') : '→';
      const tag = parallel ? ' (并行)' : '';

      lines.push(`  第${i + 1}层 ${prefix} [${step.id}] ${step.role || step.type}${tag}`);

      if (node.dependencies.length > 0) {
        lines.push(`         依赖: ${node.dependencies.join(', ')}`);
      }
    }
    if (i < dag.levels.length - 1) lines.push('  │');
  }

  return lines.join('\n');
}
