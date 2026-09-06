const fragment = location.hash.slice(1);
const token = /^[a-f0-9]{64}$/.test(fragment)
  ? fragment
  : sessionStorage.getItem("local-token") || "";
sessionStorage.setItem("local-token", token);

export function localConnectionURL(): string {
  return `${location.origin}/#${token}`;
}

export async function localAPI<T = any>(
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/" + url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Local-Token": token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error || `本地服务错误 (${response.status})`);
  return data as T;
}
