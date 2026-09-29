import { getPathLeaf } from "@/lib/path.js";
import { getWorkspaceKey } from "@/lib/workspaceKey.js";

/**
 * 项目别名（project alias）是纯显示文本：不参与身份隔离、路径执行或 agent 上下文。
 * 键统一为 getWorkspaceKey(workspacePath, workspaceIdentity)，即 workspaceIdentity?.trim() || workspacePath。
 * 所有展示面（侧栏、标题、command center、任务列表等）都通过 resolveWorkspaceDisplayName 取名，
 * 别名缺失时回退 tab label / 路径末段，保持旧渲染不变。
 */

/** 别名落盘前剔除的控制字符；别名经 dialog 输入，正常不会出现，这里兜底防止不可见字符破坏展示 */
const PROJECT_ALIAS_CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export const PROJECT_ALIAS_MAX_LENGTH = 100;

export type ProjectAliasMap = Record<string, string> | undefined;

/** 归一化别名草稿：剔除控制字符、去首尾空白、截断到最大长度；结果为空串表示「清除别名」 */
function normalizeProjectAliasDraft(draft: string): string {
  return draft.replace(PROJECT_ALIAS_CONTROL_CHARS, "").trim().slice(0, PROJECT_ALIAS_MAX_LENGTH);
}

/**
 * 以单个键更新别名映射：空归一化结果删除键，非空覆盖。
 * 必须基于调用方读到的最新 settings 合并，禁止整表覆盖写回。
 */
export function upsertProjectAlias(
  current: ProjectAliasMap,
  workspacePath: string,
  workspaceIdentity: string | null | undefined,
  aliasDraft: string,
): Record<string, string> {
  const next = { ...(current ?? {}) };
  const key = getWorkspaceKey(workspacePath, workspaceIdentity);
  const alias = normalizeProjectAliasDraft(aliasDraft);
  if (alias) {
    next[key] = alias;
  } else {
    delete next[key];
  }
  return next;
}

export interface ResolveWorkspaceDisplayNameParams {
  workspacePath: string;
  workspaceIdentity?: string | null;
  /** tab.label（labelFromPath 结果）；缺省时回退路径末段 */
  label?: string | null;
  aliases?: ProjectAliasMap;
}

/** 解析 workspace 的展示名：别名优先，其次 tab label，最后路径末段 */
export function resolveWorkspaceDisplayName({
  workspacePath,
  workspaceIdentity,
  label,
  aliases,
}: ResolveWorkspaceDisplayNameParams): string {
  const alias = aliases?.[getWorkspaceKey(workspacePath, workspaceIdentity)]?.trim();
  if (alias) {
    return alias;
  }
  const trimmedLabel = label?.trim();
  if (trimmedLabel) {
    return trimmedLabel;
  }
  return getPathLeaf(workspacePath);
}
