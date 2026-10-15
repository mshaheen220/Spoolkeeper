export interface Tip {
  category: string;
  text: string;
}

/** fetch + JSON with the server's { error, issues } body turned into an Error. */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = Array.isArray(body.issues) ? `: ${body.issues.join(", ")}` : "";
    throw new Error((body.error ?? `Request failed with status ${res.status}`) + issues);
  }
  return body as T;
}

export async function fetchTips(): Promise<Tip[]> {
  const body = await request<{ tips: Tip[] }>("/api/tips");
  return body.tips;
}
