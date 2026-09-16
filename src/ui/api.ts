/** 向本地服务请求测试资产或发送安全元数据变更。 */
export async function api<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const init: RequestInit = {
    method: options?.method ?? 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  };
  const response = await fetch(`/api${path}`, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? '本地服务请求失败');
  return result as T;
}
