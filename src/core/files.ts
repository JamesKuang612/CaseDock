import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { CoreError } from './schema.js';

/** 计算内容摘要，用于用例版本、幂等请求和证据完整性。 */
export function digest(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

/** 将对象键按字典序序列化，使 JSON 字段顺序不影响幂等判断。 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 判断文件系统错误码，避免把权限错误误判为文件不存在。 */
export function isFsError(error: unknown, code: string) {
  return (error as NodeJS.ErrnoException)?.code === code;
}

/** 将工作区相对路径解析为绝对路径，同时拒绝越界和符号链接。 */
export async function safePath(root: string, path: string): Promise<string> {
  if (isAbsolute(path)) throw new CoreError('UNSAFE_PATH', '需要工作区内的相对路径');
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || /[:\x00]/.test(rel))
    throw new CoreError('UNSAFE_PATH', '路径不在允许的工作区内');
  let cursor = root;
  for (const part of rel.split(/[\\/]/)) {
    cursor = join(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new CoreError('UNSAFE_PATH', '工作区数据路径不允许符号链接');
    } catch (error) {
      if (!isFsError(error, 'ENOENT')) throw error;
    }
  }
  return target;
}

/** 有界读取文件，避免将错误的大型附件作为用例或 JSON 加载。 */
export async function readBounded(path: string, limit = 4 * 1024 * 1024): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new CoreError('FILE_SIZE', `需要不超过 ${limit} 字节的普通文件`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/** 使用同目录临时文件和原子替换，避免读者看到写到一半的数据。 */
export async function atomicWrite(path: string, data: string | Buffer) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** 在工作区级互斥锁内修改状态，防止多个 Agent 或 CLI 丢失并发写入。 */
export async function withWriteLock<T>(root: string, work: () => Promise<T>): Promise<T> {
  const directory = await safePath(root, '.casedock');
  await mkdir(directory, { recursive: true });
  const lock = await safePath(root, '.casedock/write.lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if (isFsError(error, 'EEXIST'))
      throw new CoreError(
        'BUSY',
        '工作区正在写入。稍后重试；异常退出遗留的锁需确认无进程写入后人工移除。',
      );
    throw error;
  }
  try {
    return await work();
  } finally {
    await rm(lock, { recursive: true });
  }
}

/** 读取可选文本；仅允许不存在的文件返回 null。 */
export async function optionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isFsError(error, 'ENOENT')) return null;
    throw error;
  }
}

/** 从当前目录向上寻找 CaseDock 资产库标记，避免依赖工具源码所在位置。 */
export async function findWorkspace(start: string): Promise<string> {
  let cursor = await realpath(start);
  while (true) {
    if ((await optionalText(join(cursor, 'casedock.yaml'))) !== null) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor)
      throw new CoreError(
        'WORKSPACE_NOT_FOUND',
        '找不到 casedock.yaml。请进入测试资产目录、使用 --root 指定目录，或先运行 casedock init。',
      );
    cursor = parent;
  }
}
