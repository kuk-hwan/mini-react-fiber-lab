export interface Score {
  id: number;
  name: string;
  attempts: number;
  pairs: number;
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let value: T & { error?: string };
  try {
    value = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error('API 서버를 연결할 수 없어요. 별도 터미널에서 npm run server를 실행하세요.');
  }
  if (!response.ok) throw new Error(value.error ?? `API 오류 ${response.status}`);
  return value;
}
