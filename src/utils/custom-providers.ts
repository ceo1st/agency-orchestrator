/**
 * "自定义供应商" —— 让用户在 Studio 里自己加任意 OpenAI 兼容 API endpoint，不用等
 * AO 加代码支持。连接信息（api_key/base_url/model）复用 web/server.js 现有的
 * .local/web-keys.json 存法（跟内置 provider 一模一样，同一个 provider id 当 key）；
 * 这里只管"展示用的元数据"（名称/备注/官网链接），因为 web-keys.json 只存密钥类字段。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface CustomProviderMeta {
  id: string;
  name: string;
  note?: string;
  homepageUrl?: string;
  createdAt: number;
}

/** 小写字母开头，小写字母/数字/连字符，2-31 位——跟内置 provider id 风格一致，避免和 YAML 里手写的 provider 值冲突。 */
const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;

export function validateCustomProviderId(id: string, reserved: ReadonlySet<string>): string | null {
  if (!ID_RE.test(id)) return '标识只能用小写字母、数字、连字符，且以字母开头（2-31 位）';
  if (reserved.has(id)) return '这个标识已被占用（内置 provider 或已存在的自定义供应商）';
  return null;
}

export function readCustomProviders(path: string): CustomProviderMeta[] {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeCustomProviders(path: string, list: CustomProviderMeta[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(list, null, 2), 'utf-8');
}

/** 新增一个自定义供应商。调用前应已用 validateCustomProviderId 校验过 id。 */
export function addCustomProvider(
  path: string,
  meta: Omit<CustomProviderMeta, 'createdAt'>,
): CustomProviderMeta[] {
  const list = readCustomProviders(path);
  list.push({ ...meta, createdAt: Date.now() });
  writeCustomProviders(path, list);
  return list;
}

export function removeCustomProvider(path: string, id: string): CustomProviderMeta[] {
  const list = readCustomProviders(path).filter((p) => p.id !== id);
  writeCustomProviders(path, list);
  return list;
}

/** 更新自定义供应商的展示元数据（名称/备注/官网）。id 不可改（它是 provider 标识,被 web-keys.json 和工作流引用）。 */
export function updateCustomProvider(
  path: string,
  id: string,
  patch: Partial<Pick<CustomProviderMeta, 'name' | 'note' | 'homepageUrl'>>,
): CustomProviderMeta[] {
  const list = readCustomProviders(path);
  const item = list.find((p) => p.id === id);
  if (item) {
    if (patch.name !== undefined && patch.name.trim()) item.name = patch.name.trim();
    if (patch.note !== undefined) item.note = patch.note.trim() || undefined;
    if (patch.homepageUrl !== undefined) item.homepageUrl = patch.homepageUrl.trim() || undefined;
    writeCustomProviders(path, list);
  }
  return list;
}
