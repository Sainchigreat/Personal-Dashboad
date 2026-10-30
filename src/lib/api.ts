export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let csrfToken: string | null = null;
let previewToken: string | null = null;
export function setPreviewToken(token: string | null) {
  previewToken = token;
}
export function setCsrf(token: string | null) {
  csrfToken = token;
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method || "GET";
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(previewToken ? { Authorization: `Bearer ${previewToken}` } : {}),
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(csrfToken && method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an unexpected response.");
  }
  if (!response.ok)
    throw new ApiError(
      (result as { error?: string })?.error ||
        "Unable to complete that request.",
      response.status,
    );
  return result as T;
}
