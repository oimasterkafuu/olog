import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "./config";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  error: null;
}

export interface ApiFailure {
  ok: false;
  data: null;
  error: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function jsonOk<T>(data: T, init?: ResponseInit) {
  const body: ApiSuccess<T> = { ok: true, data, error: null };
  return NextResponse.json(body, init);
}

export function jsonError(message: string, init?: ResponseInit) {
  const body: ApiFailure = { ok: false, data: null, error: message };
  const status = init?.status ?? 400;
  return NextResponse.json(body, { ...init, status });
}

export async function ensureCsrf(request: NextRequest): Promise<boolean> {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const siteUrl = await getConfig("SITE_URL");

  if (!siteUrl) {
    return true;
  }

  const allowed = [siteUrl, siteUrl.replace(/\/$/, "")];
  const isAllowed = (value: string | null) => Boolean(value && allowed.some((url) => value.startsWith(url)));

  return isAllowed(origin) || isAllowed(referer);
}
