import { NextRequest } from "next/server";
import { jsonError, jsonOk, ensureCsrf } from "@/lib/api";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!ensureCsrf(request)) {
    return jsonError("请求来源不合法", { status: 403 });
  }

  const session = await getSession();
  session.destroy();
  return jsonOk({ success: true });
}
