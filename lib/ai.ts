import { createHash } from "crypto";
import { getConfig } from "./config";

interface Usage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
}

interface CostRates {
  inputRate: number;
  outputRate: number;
}

const SYSTEM_PROMPT_METADATA = `你是中文技术博客的编辑助手。仅以 JSON 对象输出结果，字段必须齐全且可被机器解析。
任务：
1) 从输入的中文技术文章中抽取 5–10 个高价值关键词（名词或术语，去重，避免过长短语）。
2) 当输入中声明 needsSlug=true 且提供的 currentSlug 为形如 post-时间戳 的占位值时，请基于标题与内容生成新的 slug（仅小写字母、数字与短横线，使用简洁英语）；其它情况下不要返回 slug 字段。
输出：{"keywords": string[], "slug"?: string}`;

const SYSTEM_PROMPT_SUMMARY = `你是中文技术写作编辑。仅以 JSON 对象输出结果，字段必须齐全且可被机器解析。
任务：
生成单段中文摘要（80–150 字），允许使用 Markdown 格式，但禁止列表、禁止多段、禁止换行。
输出：{"summary": string}`;

const COMMON_CHAT_PARAMS = {
  temperature: 0.7,
  top_p: 0.7,
  frequency_penalty: 0.3,
  top_k: 50,
} as const;

const MAX_TOKENS_METADATA = 8_192;
const MAX_TOKENS_SUMMARY = 8_192;

export interface PublishMetadataInput {
  title: string;
  markdown: string;
  maxKeywords?: number;
  currentSlug?: string;
  needsSlug?: boolean;
}

export interface PublishMetadataResult {
  keywords: string[];
  slug?: string;
}

export interface PublishMetadataWarning {
  type: "keywords-count";
  message: string;
}

export interface SummaryInput {
  title: string;
  markdown: string;
}

export interface SummaryResult {
  summary: string;
}

export interface AIUsageInfo {
  model: string;
  usage: Usage;
  inputHash: string;
  prompt: string;
}

export interface PublishMetadataCallResult extends AIUsageInfo {
  result: PublishMetadataResult;
  rawText: string;
  warnings: PublishMetadataWarning[];
}

export interface SummaryCallResult extends AIUsageInfo {
  result: SummaryResult;
  rawText: string;
}

function ensureArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("AI 返回的关键词格式不正确");
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error("AI 返回的关键词必须是非空字符串");
    }
    result.push(entry.trim());
  }
  return result;
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI 返回的 ${field} 不能为空`);
  }
  return value.trim();
}

function hashInput(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * 从文本中提取最大的 JSON 对象（大括号对）
 * 用于容错处理 AI 返回的带有额外文本的 JSON 响应
 * 
 * 示例：
 * - 输入: '这是一个 JSON: {"key": "value"}'
 *   输出: '{"key": "value"}'
 * 
 * - 输入: '{"key": "value"} 这是说明文本'
 *   输出: '{"key": "value"}'
 * 
 * - 输入: '{"a": {"nested": "object"}, "b": "value"}'
 *   输出: '{"a": {"nested": "object"}, "b": "value"}'
 * 
 * - 输入: '{"key": "包含 { 和 } 的字符串"}'
 *   输出: '{"key": "包含 { 和 } 的字符串"}'
 * 
 * @throws {Error} 如果未找到有效的 JSON 对象
 */
function extractLargestJsonObject(text: string): string {
  // 找到第一个 {
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) {
    throw new Error("未找到 JSON 对象起始标记");
  }

  // 从第一个 { 开始，通过括号计数找到匹配的 }
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];

    // 处理转义字符
    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    // 处理字符串边界（忽略字符串内的括号）
    if (char === '"') {
      inString = !inString;
      continue;
    }

    // 只在非字符串内统计括号
    if (!inString) {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        // 找到匹配的结束括号
        if (depth === 0) {
          return text.substring(firstBrace, i + 1);
        }
      }
    }
  }

  throw new Error("未找到匹配的 JSON 对象结束标记");
}

export interface AIErrorContext {
  model: string;
  inputHash: string;
  usage?: Usage;
  rawText?: string;
  status?: number;
  prompt?: string;
}

export interface AIErrorWithContext extends Error {
  aiContext?: AIErrorContext;
}

function attachAIContext(error: unknown, context: AIErrorContext): never {
  if (error instanceof Error) {
    (error as AIErrorWithContext).aiContext = context;
    throw error;
  }
  const wrapped = new Error("AI 调用失败");
  (wrapped as AIErrorWithContext).aiContext = context;
  throw wrapped;
}

export function extractAIContext(error: unknown): AIErrorContext | null {
  if (error && typeof error === "object" && "aiContext" in error) {
    const withCtx = error as AIErrorWithContext;
    if (withCtx.aiContext) {
      return withCtx.aiContext;
    }
  }
  return null;
}

interface ChatCompletionMessage {
  role: string;
  content?: string | null;
}

interface ChatCompletionResponse {
  model: string;
  choices: Array<{
    message?: ChatCompletionMessage;
  }>;
  usage?: Usage;
}

async function requestChatCompletion(params: {
  model: string;
  prompt: string;
  maxTokens: number;
  inputHash: string;
}): Promise<ChatCompletionResponse> {
  const { model, prompt, maxTokens, inputHash } = params;

  const apiKey = await getConfig("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("未配置 OPENAI_API_KEY，无法调用 AI 服务");
  }

  const baseUrl = await getConfig("OPENAI_BASE_URL");
  if (!baseUrl) {
    throw new Error("未配置 OPENAI_BASE_URL，无法调用 AI 服务");
  }

  let endpoint: string;
  try {
    endpoint = new URL("chat/completions", baseUrl).toString();
  } catch (error) {
    attachAIContext(error, { model, inputHash, prompt });
  }

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: maxTokens,
    temperature: COMMON_CHAT_PARAMS.temperature,
    top_p: COMMON_CHAT_PARAMS.top_p,
    frequency_penalty: COMMON_CHAT_PARAMS.frequency_penalty,
    top_k: COMMON_CHAT_PARAMS.top_k,
    response_format: { type: "json_object" },
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    attachAIContext(error, { model, inputHash, prompt });
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error) {
    attachAIContext(error, { model, inputHash, status: response.status, prompt });
  }

  let parsed: unknown = null;
  if (responseText) {
    try {
      parsed = JSON.parse(responseText) as unknown;
    } catch (parseError) {
      parsed = null;
      console.error("AI 服务返回无法解析的响应", {
        status: response.status,
        body: responseText,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
    }
  }

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in parsed && parsed.error && typeof (parsed as { error?: { message?: string } }).error?.message === "string"
        ? (parsed as { error?: { message?: string } }).error?.message ?? "AI 服务返回错误"
        : `AI 服务返回错误 (${response.status})`;
    console.error("AI chat completion failed", {
      status: response.status,
      body: responseText,
    });
    attachAIContext(new Error(message), {
      model,
      inputHash,
      rawText: responseText,
      status: response.status,
      prompt,
    });
  }

  if (!parsed || typeof parsed !== "object") {
    console.error("AI 服务返回格式异常", { body: responseText });
    attachAIContext(new Error("AI 服务返回格式异常"), {
      model,
      inputHash,
      rawText: responseText,
      status: response.status,
      prompt,
    });
  }

  return parsed as ChatCompletionResponse;
}

export async function callPublishMetadata(input: PublishMetadataInput): Promise<PublishMetadataCallResult> {
  const payload: Record<string, unknown> = {
    title: input.title,
    markdown: input.markdown,
    maxKeywords: input.maxKeywords ?? 10,
  };
  if (input.currentSlug) {
    payload.currentSlug = input.currentSlug;
  }
  if (input.needsSlug) {
    payload.needsSlug = true;
  }
  const userContent = JSON.stringify(payload);
  const prompt = `${SYSTEM_PROMPT_METADATA}\n\n${userContent}`;
  const inputHash = hashInput(payload);
  const model = (await getConfig("MODEL_NAME")) || "Qwen/Qwen3-235B-A22B-Instruct-2507";

  const completion = await requestChatCompletion({
    model,
    prompt,
    maxTokens: MAX_TOKENS_METADATA,
    inputHash,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    attachAIContext(new Error("AI 未返回任何内容"), {
      model,
      inputHash,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    // 尝试提取最大的 JSON 对象，容错处理带有额外文本的响应
    const jsonText = extractLargestJsonObject(content);
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    attachAIContext(error, {
      model,
      inputHash,
      rawText: content,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }
  let keywords: string[];
  let slug: string | undefined;
  const warnings: PublishMetadataWarning[] = [];
  try {
    keywords = ensureArrayOfStrings(parsed.keywords);
    if (keywords.length < 5 || keywords.length > 10) {
      warnings.push({ type: "keywords-count", message: "AI 返回的关键词数量不符合要求 (5-10 个)" });
    }
    if (parsed.slug !== undefined) {
      const candidate = ensureString(parsed.slug, "slug");
      if (!/^[a-z0-9-]+$/.test(candidate)) {
        throw new Error("AI 返回的 slug 不符合格式要求");
      }
      slug = candidate;
    }
  } catch (error) {
    attachAIContext(error, {
      model,
      inputHash,
      rawText: content,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const result: PublishMetadataResult = { keywords };
  if (slug) {
    result.slug = slug;
  }

  return {
    model: completion.model,
    usage,
    inputHash,
    prompt,
    result,
    rawText: content,
    warnings,
  };
}

export async function callSummary(input: SummaryInput): Promise<SummaryCallResult> {
  const payload = { title: input.title, markdown: input.markdown };
  const userContent = JSON.stringify(payload);
  const prompt = `${SYSTEM_PROMPT_SUMMARY}\n\n${userContent}`;
  const inputHash = hashInput(payload);
  const model = (await getConfig("MODEL_NAME")) || "Qwen/Qwen3-235B-A22B-Instruct-2507";

  const completion = await requestChatCompletion({
    model,
    prompt,
    maxTokens: MAX_TOKENS_SUMMARY,
    inputHash,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    attachAIContext(new Error("AI 未返回任何内容"), {
      model,
      inputHash,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    // 尝试提取最大的 JSON 对象，容错处理带有额外文本的响应
    const jsonText = extractLargestJsonObject(content);
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    attachAIContext(error, {
      model,
      inputHash,
      rawText: content,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }
  let summary: string;
  try {
    summary = ensureString(parsed.summary, "summary");
  } catch (error) {
    attachAIContext(error, {
      model,
      inputHash,
      rawText: content,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  if (/\n/.test(summary)) {
    attachAIContext(new Error("AI 摘要包含换行，已拒绝"), {
      model,
      inputHash,
      rawText: content,
      usage,
      prompt,
    });
  }

  return {
    model: completion.model,
    usage,
    inputHash,
    prompt,
    result: { summary },
    rawText: content,
  };
}

async function getAIRates(): Promise<CostRates> {
  const inputRate = Number((await getConfig("RATE_AI_INPUT")) || "0");
  const outputRate = Number((await getConfig("RATE_AI_OUTPUT")) || "0");
  return { inputRate, outputRate };
}

function calcCostFromUsage(usage: Usage, rates: CostRates): number | null {
  const promptTokens = usage.prompt_tokens ?? usage.total_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  if (rates.inputRate === 0 && rates.outputRate === 0) {
    return null;
  }

  const promptCost = (promptTokens / 1000000) * rates.inputRate;
  const completionCost = (completionTokens / 1000000) * rates.outputRate;
  const total = promptCost + completionCost;
  return Number.isFinite(total) ? Number(total.toFixed(6)) : null;
}

export async function calcCostForAI(usage: Usage): Promise<number | null> {
  return calcCostFromUsage(usage, await getAIRates());
}
