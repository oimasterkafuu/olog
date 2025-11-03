import { prisma } from "./db";

/**
 * 配置键列表：这些配置项将从 .env 迁移到数据库
 */
export const CONFIG_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "SITE_URL",
  "RATE_AI_INPUT",
  "RATE_AI_OUTPUT",
  "MODEL_NAME",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

/**
 * 配置缓存，避免频繁查询数据库
 */
let configCache: Map<string, string> | null = null;
let cacheInitialized = false;

/**
 * 从数据库初始化配置缓存
 * 如果数据库为空，则从 .env 读取并保存到数据库
 */
async function initializeConfigCache(): Promise<void> {
  if (cacheInitialized) {
    return;
  }

  const configs = await prisma.config.findMany();
  
  // 如果数据库中没有配置，从 .env 迁移
  if (configs.length === 0) {
    console.log("首次启动：从 .env 迁移配置到数据库");
    const newConfigs: Array<{ key: string; value: string }> = [];
    
    for (const key of CONFIG_KEYS) {
      const value = process.env[key];
      if (value) {
        newConfigs.push({ key, value });
      }
    }
    
    if (newConfigs.length > 0) {
      await prisma.config.createMany({
        data: newConfigs,
      });
      console.log(`已迁移 ${newConfigs.length} 个配置项到数据库`);
    }
    
    // 重新读取
    const freshConfigs = await prisma.config.findMany();
    configCache = new Map(freshConfigs.map((c) => [c.key, c.value]));
  } else {
    configCache = new Map(configs.map((c) => [c.key, c.value]));
  }
  
  cacheInitialized = true;
}

/**
 * 获取配置值
 * @param key 配置键
 * @returns 配置值，如果不存在则返回 undefined
 */
export async function getConfig(key: ConfigKey): Promise<string | undefined> {
  if (!cacheInitialized) {
    await initializeConfigCache();
  }
  
  return configCache?.get(key);
}

/**
 * 获取所有配置
 * @returns 配置键值对
 */
export async function getAllConfigs(): Promise<Record<string, string>> {
  if (!cacheInitialized) {
    await initializeConfigCache();
  }
  
  const result: Record<string, string> = {};
  if (configCache) {
    for (const [key, value] of configCache.entries()) {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * 更新配置值
 * @param key 配置键
 * @param value 配置值
 */
export async function updateConfig(key: ConfigKey, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  
  // 更新缓存
  if (configCache) {
    configCache.set(key, value);
  }
}

/**
 * 批量更新配置
 * @param updates 配置更新对象
 */
export async function updateConfigs(updates: Partial<Record<ConfigKey, string>>): Promise<void> {
  const entries = Object.entries(updates) as Array<[ConfigKey, string]>;
  
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx.config.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  });
  
  // 更新缓存
  if (configCache) {
    for (const [key, value] of entries) {
      configCache.set(key, value);
    }
  }
}

/**
 * 清空配置缓存（用于测试或强制重新加载）
 */
export function clearConfigCache(): void {
  configCache = null;
  cacheInitialized = false;
}

