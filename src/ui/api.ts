/** 请求本地数据；写请求临时取得会话令牌，服务重启后不使用旧凭证。 */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    const sessionResponse = await fetch('/api/session');
    if (!sessionResponse.ok) throw new Error('无法连接本地服务');
    headers['X-CaseDock-Token'] = (await sessionResponse.json()).token;
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? '本地服务请求失败');
  return result as T;
}
