/** 从本地只读服务获取测试资产。 */
export async function api<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? '本地服务请求失败');
  return result as T;
}
