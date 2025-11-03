import type { NextRequest } from "next/server";
import { jsonError, ensureCsrf } from "./api";
import { getSession } from "./session";

export async function requireAuth(request?: NextRequest) {
  const session = await getSession();

  if (!session.userId) {
    return { session, response: jsonError("请先登录", { status: 401 }) } as const;
  }

  if (request && request.method !== "GET" && !ensureCsrf(request)) {
    return { session, response: jsonError("请求来源不合法", { status: 403 }) } as const;
  }

  return { session } as const;
}
