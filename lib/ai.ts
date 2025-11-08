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

interface RequestChatOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  inputHash: string;
  jsonMode?: boolean; // 是否使用 JSON 模式
}

async function requestChatCompletion(params: {
  model: string;
  prompt: string;
  maxTokens: number;
  inputHash: string;
}): Promise<ChatCompletionResponse> {
  return requestChatCompletionWithMessages({
    model: params.model,
    messages: [{ role: "user", content: params.prompt }],
    maxTokens: params.maxTokens,
    inputHash: params.inputHash,
    jsonMode: true,
  });
}

async function requestChatCompletionWithMessages(options: RequestChatOptions): Promise<ChatCompletionResponse> {
  const { model, messages, maxTokens, inputHash, jsonMode = false } = options;

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
    attachAIContext(error, { model, inputHash, prompt: JSON.stringify(messages) });
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: COMMON_CHAT_PARAMS.temperature,
    top_p: COMMON_CHAT_PARAMS.top_p,
    frequency_penalty: COMMON_CHAT_PARAMS.frequency_penalty,
    top_k: COMMON_CHAT_PARAMS.top_k,
  };

  // 仅在需要时添加 JSON 模式
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

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
    attachAIContext(error, { model, inputHash, prompt: JSON.stringify(messages) });
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error) {
    attachAIContext(error, { model, inputHash, status: response.status, prompt: JSON.stringify(messages) });
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
      prompt: JSON.stringify(messages),
    });
  }

  if (!parsed || typeof parsed !== "object") {
    console.error("AI 服务返回格式异常", { body: responseText });
    attachAIContext(new Error("AI 服务返回格式异常"), {
      model,
      inputHash,
      rawText: responseText,
      status: response.status,
      prompt: JSON.stringify(messages),
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

// ============================================================================
// 日记相关 AI 功能
// ============================================================================

const SYSTEM_PROMPT_DIARY_ASSISTANT = `你是一位温暖、善于倾听的日记助手，帮助用户记录和反思今天的生活。
今天是：${new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}

对话策略（共20轮）：
1. 开场（第1-2轮）：用简短亲切的语气打招呼，询问用户今天过得怎么样
2. 深入（第3-15轮）：根据用户分享，表达共情并追问细节、感受或反思，帮助用户更深入表达
3. 提醒（第16-18轮）：在继续深入的同时，温和提醒用户"我们还有X次对话机会"
4. 结束（第19-20轮）：感谢用户的分享，告诉用户对话即将结束，现在可以生成日记了

对话要求：
- 每次回复简洁温暖（1-3句话），不要使用列表
- 根据用户情绪调整回应：开心时共鸣，难过时安慰，困惑时引导
- 追问要自然有针对性，不要一次问太多问题
- 在第16轮后，自然地提及剩余轮次，但不要显得着急
- 在第19-20轮时，明确表达"这是我们的最后几次对话机会了，现在可以生成日记了"

注意：
- 当前轮次和剩余轮次会在消息中告知你
- 输出纯文本，保持对话式语气
- 避免说教或评判，专注于倾听和引导`;

/**
 * 生成日记文章的系统提示词
 * @param diaryDate 日记日期（YYYY-MM-DD）
 */
function getSystemPromptDiaryGenerate(diaryDate: string): string {
  const date = new Date(diaryDate);
  const formattedDate = date.toLocaleDateString("zh-CN", { 
    year: "numeric", 
    month: "long", 
    day: "numeric", 
    weekday: "long" 
  });

  return `你是专业的日记写作助手。根据用户与你的对话记录，生成一篇 400 字左右的日记文章。
这篇日记记录的日期是：${formattedDate}（${diaryDate}）

要求：
1. **只需编写日记正文内容**，不要包含标题、日期等元数据
2. 使用第一人称"我"的视角
3. 自然流畅，有个人色彩和真实感
4. 包含具体事件、细节和真实感受
5. 结构完整：可以有开头、主体、结尾的自然过渡
6. 长度控制在 350-450 字之间
7. 使用 Markdown 格式 
8. 禁止使用列表格式（- 或数字列表）
9. 以 JSON 格式输出：{"content": "日记正文"}

注意：
- 保留对话中用户分享的关键信息和情绪
- 不要编造对话中未提及的内容
- 语气要符合用户在对话中的风格（轻松/严肃/反思等）
- 日记应该读起来像用户自己写的，而不是旁观者叙述
- 直接开始正文，不要写"今天是..."、"日期：..."等标注`;
}

const SYSTEM_PROMPT_DIARY_WEEKLY = `你是专业的周记写作助手。根据用户这一周的多篇日记，生成一篇 500-600 字的周总结。

要求：
1. 使用第一人称"我"的视角
2. 提炼本周的关键主题、重要事件和整体感受
3. 可以梳理本周的变化、收获、思考或未完成的事
4. 结构完整，有一定深度和反思性
5. 长度控制在 500-600 字之间
6. 使用 Markdown 格式
7. 可以使用自然段落划分，但禁止使用列表格式
8. 以 JSON 格式输出：{"content": "周总结正文"}

注意：
- 不要简单罗列每天做了什么
- 寻找本周的线索和主题，进行归纳和思考
- 语气要有温度和深度，既总结也反思
- 如果某天的日记情绪明显，在总结中体现情绪变化`;

export interface DiaryMessage {
  role: "USER" | "ASSISTANT";
  content: string;
}

export interface DiaryChatResult extends AIUsageInfo {
  content: string;
  rawText: string;
}

export interface DiaryGenerateResult extends AIUsageInfo {
  content: string;
  rawText: string;
}

export interface DiaryWeeklySummaryResult extends AIUsageInfo {
  content: string;
  rawText: string;
}

/**
 * 生成日记开场白
 */
export async function callDiaryStart(): Promise<DiaryChatResult> {
  const inputHash = hashInput({ action: "diary_start", timestamp: Date.now() });
  const model = (await getConfig("MODEL_NAME")) || "Qwen/Qwen3-235B-A22B-Instruct-2507";

  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT_DIARY_ASSISTANT,
    },
    {
      role: "user",
      content: "嗨，我想开始写今天的日记。（这是第1轮对话）",
    },
  ];

  const completion = await requestChatCompletionWithMessages({
    model,
    messages,
    maxTokens: 256,
    inputHash,
    jsonMode: false, // 对话返回纯文本
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    attachAIContext(new Error("AI 未返回任何内容"), {
      model,
      inputHash,
      usage: completion.usage ?? undefined,
      prompt: JSON.stringify(messages),
    });
  }

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    model: completion.model,
    usage,
    inputHash,
    prompt: JSON.stringify(messages),
    content,
    rawText: content,
  };
}

/**
 * 日记对话（AI 回复用户消息）
 * @param messages 对话历史（最近 20 条消息）
 */
export async function callDiaryChat(messages: DiaryMessage[]): Promise<DiaryChatResult> {
  const inputHash = hashInput({ messages });
  const model = (await getConfig("MODEL_NAME")) || "Qwen/Qwen3-235B-A22B-Instruct-2507";

  // 计算当前轮次（用户消息数）
  const userMessageCount = messages.filter((m) => m.role === "USER").length;
  const currentRound = userMessageCount + 1;
  const maxRounds = 20;
  const remainingRounds = maxRounds - currentRound;

  // 构建标准的 messages 数组
  const chatMessages = [
    {
      role: "system",
      content: SYSTEM_PROMPT_DIARY_ASSISTANT,
    },
    ...messages.map((msg) => ({
      role: msg.role === "USER" ? "user" : "assistant",
      content: msg.content,
    })),
  ];

  // 在用户最后一条消息后添加轮次提示
  const lastUserMsgIndex = chatMessages.map((m) => m.role).lastIndexOf("user");
  if (lastUserMsgIndex !== -1) {
    let roundInfo = `（这是第${currentRound}轮对话`;
    if (remainingRounds > 0) {
      roundInfo += `，还剩${remainingRounds}轮`;
    } else {
      roundInfo += `，这是最后一轮`;
    }
    roundInfo += `）`;
    chatMessages[lastUserMsgIndex].content += `\n\n${roundInfo}`;
  }

  const completion = await requestChatCompletionWithMessages({
    model,
    messages: chatMessages,
    maxTokens: 512,
    inputHash,
    jsonMode: false, // 对话返回纯文本
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    attachAIContext(new Error("AI 未返回任何内容"), {
      model,
      inputHash,
      usage: completion.usage ?? undefined,
      prompt: JSON.stringify(chatMessages),
    });
  }

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    model: completion.model,
    usage,
    inputHash,
    prompt: JSON.stringify(chatMessages),
    content,
    rawText: content,
  };
}

/**
 * 生成日记文章（400 字）
 * @param messages 完整对话历史
 * @param diaryDate 日记日期（YYYY-MM-DD）
 */
export async function callDiaryGenerate(
  messages: DiaryMessage[], 
  diaryDate: string
): Promise<DiaryGenerateResult> {
  const conversationText = messages
    .map((msg) => `${msg.role === "USER" ? "用户" : "助手"}：${msg.content}`)
    .join("\n\n");

  const systemPrompt = getSystemPromptDiaryGenerate(diaryDate);
  const prompt = `${systemPrompt}\n\n对话记录：\n${conversationText}`;
  const inputHash = hashInput({ action: "generate", messages, diaryDate });
  const model = (await getConfig("MODEL_NAME")) || "Qwen/Qwen3-235B-A22B-Instruct-2507";

  const completion = await requestChatCompletion({
    model,
    prompt,
    maxTokens: 2048,
    inputHash,
  });

  const rawText = completion.choices[0]?.message?.content?.trim();
  if (!rawText) {
    attachAIContext(new Error("AI 未返回任何内容"), {
      model,
      inputHash,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    const jsonText = extractLargestJsonObject(rawText);
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    attachAIContext(error, {
      model,
      inputHash,
      rawText,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }

  const content = ensureString(parsed.content, "content");
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    model: completion.model,
    usage,
    inputHash,
    prompt,
    content,
    rawText,
  };
}

/**
 * 生成周总结
 * @param diaries 本周的日记数据（包含 diaryDate 和 summaryMd）
 */
export async function callDiaryWeeklySummary(
  diaries: Array<{ diaryDate: string; summaryMd: string }>
): Promise<DiaryWeeklySummaryResult> {
  const diariesText = diaries
    .map((d) => `【${d.diaryDate}】\n${d.summaryMd}`)
    .join("\n\n---\n\n");

  const prompt = `${SYSTEM_PROMPT_DIARY_WEEKLY}\n\n本周日记：\n${diariesText}`;
  const inputHash = hashInput({ action: "weekly", diaries });
  const model = (await getConfig("MODEL_NAME")) || "Qwen/Qwen3-235B-A22B-Instruct-2507";

  const completion = await requestChatCompletion({
    model,
    prompt,
    maxTokens: 2048,
    inputHash,
  });

  const rawText = completion.choices[0]?.message?.content?.trim();
  if (!rawText) {
    attachAIContext(new Error("AI 未返回任何内容"), {
      model,
      inputHash,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    const jsonText = extractLargestJsonObject(rawText);
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    attachAIContext(error, {
      model,
      inputHash,
      rawText,
      usage: completion.usage ?? undefined,
      prompt,
    });
  }

  const content = ensureString(parsed.content, "content");
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    model: completion.model,
    usage,
    inputHash,
    prompt,
    content,
    rawText,
  };
}
