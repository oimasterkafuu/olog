"use client";

import { useState, useEffect, useCallback } from "react";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";

interface ConfigValues {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  SITE_URL: string;
  RATE_AI_INPUT: string;
  RATE_AI_OUTPUT: string;
  MODEL_NAME: string;
}

export default function ConfigPage() {
  const [configs, setConfigs] = useState<Partial<ConfigValues>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // 表单状态（用于编辑）
  const [formData, setFormData] = useState<Partial<ConfigValues>>({});
  const [apiKeyChanged, setApiKeyChanged] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) {
        throw new Error("获取配置失败");
      }
      const data = await res.json();
      if (data.ok) {
        setConfigs(data.data);
        setFormData(data.data);
      }
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "加载失败" });
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    setSaving(true);
    setMessage(null);

    try {
      // 构建要更新的配置
      const updates: Partial<ConfigValues> = {};
      
      // API Key 只在用户修改时才提交
      if (apiKeyChanged && formData.OPENAI_API_KEY) {
        updates.OPENAI_API_KEY = formData.OPENAI_API_KEY;
      }
      
      // 其他字段，只提交非空且有变化的
      const fieldsToCheck: Array<keyof ConfigValues> = [
        "OPENAI_BASE_URL",
        "SITE_URL",
        "RATE_AI_INPUT",
        "RATE_AI_OUTPUT",
        "MODEL_NAME",
      ];
      
      for (const field of fieldsToCheck) {
        const value = formData[field];
        if (value && value !== configs[field]) {
          updates[field] = value;
        }
      }
      
      if (Object.keys(updates).length === 0) {
        setMessage({ type: "error", text: "没有需要更新的配置" });
        setSaving(false);
        return;
      }

      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const result = await res.json();
      
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "更新失败");
      }

      setMessage({ type: "success", text: "配置已更新" });
      setApiKeyChanged(false);
      
      // 重新加载配置
      await loadConfigs();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }, [formData, apiKeyChanged, configs]);

  // 快捷键 Ctrl/Cmd+S 保存
  useKeyboardShortcut('KeyS', () => {
    if (!saving) {
      handleSubmit();
    }
  }, { ctrl: true, meta: true });

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">系统配置</h1>
          <p className="mt-1 text-sm text-slate-500">管理 AI 服务、站点 URL 等系统级配置，修改后立即生效。</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">系统配置</h1>
        <p className="mt-1 text-sm text-slate-500">管理 AI 服务、站点 URL 等系统级配置，修改后立即生效。</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="openai-api-key" className="mb-1.5 block text-sm font-medium text-slate-700">
              OpenAI API Key
            </label>
            <input
              id="openai-api-key"
              type="password"
              placeholder={configs.OPENAI_API_KEY || "未设置"}
              value={formData.OPENAI_API_KEY || ""}
              onChange={(e) => {
                setFormData({ ...formData, OPENAI_API_KEY: e.target.value });
                setApiKeyChanged(true);
              }}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <p className="mt-1 text-xs text-slate-500">
              当前值：{configs.OPENAI_API_KEY || "未设置"}
            </p>
          </div>

          <div>
            <label htmlFor="openai-base-url" className="mb-1.5 block text-sm font-medium text-slate-700">
              OpenAI Base URL
            </label>
            <input
              id="openai-base-url"
              type="url"
              value={formData.OPENAI_BASE_URL || ""}
              onChange={(e) => setFormData({ ...formData, OPENAI_BASE_URL: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          <div>
            <label htmlFor="site-url" className="mb-1.5 block text-sm font-medium text-slate-700">
              站点 URL
            </label>
            <input
              id="site-url"
              type="url"
              value={formData.SITE_URL || ""}
              onChange={(e) => setFormData({ ...formData, SITE_URL: e.target.value })}
              placeholder="http://localhost:3000"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          <div>
            <label htmlFor="model-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              AI 模型名称
            </label>
            <input
              id="model-name"
              type="text"
              value={formData.MODEL_NAME || ""}
              onChange={(e) => setFormData({ ...formData, MODEL_NAME: e.target.value })}
              placeholder="THUDM/GLM-4-32B-0414"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rate-input" className="mb-1.5 block text-sm font-medium text-slate-700">
                AI 输入费率（元/百万 tokens）
              </label>
              <input
                id="rate-input"
                type="text"
                value={formData.RATE_AI_INPUT || ""}
                onChange={(e) => setFormData({ ...formData, RATE_AI_INPUT: e.target.value })}
                placeholder="0.27"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div>
              <label htmlFor="rate-output" className="mb-1.5 block text-sm font-medium text-slate-700">
                AI 输出费率（元/百万 tokens）
              </label>
              <input
                id="rate-output"
                type="text"
                value={formData.RATE_AI_OUTPUT || ""}
                onChange={(e) => setFormData({ ...formData, RATE_AI_OUTPUT: e.target.value })}
                placeholder="0.27"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存配置"}
            </button>
            
            <button
              type="button"
              onClick={loadConfigs}
              disabled={saving}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              重置
            </button>
            
            {message && (
              <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {message.text}
              </p>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-900">说明</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>• 配置保存在数据库中，首次启动时会自动从 .env 文件迁移</li>
          <li>• API Key 会进行脱敏显示，仅在修改时需要输入完整值</li>
          <li>• 费率用于计算 AI 调用成本，单位为元/百万 tokens</li>
          <li>• 修改配置后立即生效，无需重启服务</li>
        </ul>
      </div>
    </div>
  );
}

