import type { Accent } from './tokens';

// ----- Todos -----------------------------------------------------------

export type ApiTodo = {
  id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  due_at: string | null;
  tags: string[];
  visibility: string;
  created_at: string;
  updated_at: string;
};

const tagAccent: Record<string, Accent> = {
  home: 'sage',
  kids: 'amber',
  errands: 'stone',
  work: 'sky',
  alert: 'rust',
};

export function todoAccent(t: ApiTodo): Accent {
  for (const tag of t.tags) {
    const a = tagAccent[tag];
    if (a) return a;
  }
  return 'stone';
}

export async function fetchTodos(
  fetchFn: typeof fetch = fetch,
  params: { done?: boolean; limit?: number } = {},
): Promise<ApiTodo[]> {
  const q = new URLSearchParams();
  if (params.done !== undefined) q.set('done', String(params.done));
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  const url = '/api/todos' + (q.size ? `?${q.toString()}` : '');
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`fetchTodos failed: HTTP ${res.status}`);
  const data = (await res.json()) as { todos: ApiTodo[] };
  return data.todos;
}

export async function patchTodo(
  id: string,
  patch: { done?: boolean; title?: string; tags?: string[]; due_at?: string | null },
): Promise<ApiTodo> {
  const res = await fetch(`/api/todos/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patchTodo failed: HTTP ${res.status}`);
  return (await res.json()) as ApiTodo;
}

export async function createTodo(body: {
  title: string;
  tags?: string[];
  due_at?: string;
  visibility?: 'wall' | 'personal' | 'household';
}): Promise<ApiTodo> {
  const res = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createTodo failed: HTTP ${res.status}`);
  return (await res.json()) as ApiTodo;
}

// ----- Shopping --------------------------------------------------------

export type ApiShoppingItem = {
  id: string;
  name: string;
  qty: string | null;
  store: string | null;
  aisle: string | null;
  bought: boolean;
  purchased_at: string | null;
  visibility: string;
  created_at: string;
};

export async function fetchShopping(
  fetchFn: typeof fetch = fetch,
  params: { bought?: boolean; limit?: number } = {},
): Promise<ApiShoppingItem[]> {
  const q = new URLSearchParams();
  if (params.bought !== undefined) q.set('bought', String(params.bought));
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  const url = '/api/shopping' + (q.size ? `?${q.toString()}` : '');
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`fetchShopping failed: HTTP ${res.status}`);
  const data = (await res.json()) as { items: ApiShoppingItem[] };
  return data.items;
}

export async function patchShopping(
  id: string,
  patch: { bought?: boolean; name?: string; qty?: string | null; aisle?: string | null },
): Promise<ApiShoppingItem> {
  const res = await fetch(`/api/shopping/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patchShopping failed: HTTP ${res.status}`);
  return (await res.json()) as ApiShoppingItem;
}
