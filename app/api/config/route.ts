import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAuth } from "@/lib/auth-helpers";
import { getAllConfigs, updateConfigs, CONFIG_KEYS } from "@/lib/config";

export const runtime = "nodejs";

/**
 * 获取所有配置（敏感值脱敏）
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const configs = await getAllConfigs();
    
    // 脱敏处理：API Key 只显示前后几位
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(configs)) {
      if (key === "OPENAI_API_KEY" && value) {
        // 只显示前 6 位和后 4 位
        if (value.length > 10) {
          sanitized[key] = `${value.slice(0, 6)}...${value.slice(-4)}`;
        } else {
          sanitized[key] = "***";
        }
      } else {
        sanitized[key] = value;
      }
    }
    
    return jsonOk(sanitized);
  } catch (error) {
    console.error("Failed to get configs", error);
    return jsonError("获取配置失败", { status: 500 });
  }
}

const updateConfigSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  SITE_URL: z.string().url().optional(),
  RATE_AI_INPUT: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  RATE_AI_OUTPUT: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  MODEL_NAME: z.string().min(1).optional(),
});

/**
 * 批量更新配置
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("response" in auth) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("请求体格式错误", { status: 400 });
  }

  let updates: z.infer<typeof updateConfigSchema>;
  try {
    updates = updateConfigSchema.parse(body);
  } catch (error) {
    return jsonError("配置格式错误", { status: 400 });
  }

  // 过滤掉空值
  const filteredUpdates: Partial<Record<(typeof CONFIG_KEYS)[number], string>> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== "") {
      filteredUpdates[key as (typeof CONFIG_KEYS)[number]] = value;
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return jsonError("没有需要更新的配置", { status: 400 });
  }

  try {
    await updateConfigs(filteredUpdates);
    return jsonOk({ updated: Object.keys(filteredUpdates) });
  } catch (error) {
    console.error("Failed to update configs", error);
    return jsonError("更新配置失败", { status: 500 });
  }
}

