// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_MEMORY_SIZE } from "@/lib/constants";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Plus,
  Trash2,
  Edit,
  Check,
  AlertCircle,
  AlertTriangle,
  Wrench,
  Settings,
  Bot,
  Brain,
  Globe,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// Types
interface Store {
  id: string;
  name: string;
  desc?: string | null;
  config?: Record<string, unknown> | null;
  connected?: boolean;
  error?: string | null;
  createdAt?: string;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
}

interface Task {
  id: string;
  storeId: string;
  type: string;
  cron: string;
  lastRun?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoreConfig {
  modelId?: string;
  memorySize?: number;
  customPrompt?: string;
  summaryEnabled?: boolean;
  summaryThreshold?: number;
  summaryCount?: number;
  contextMode?: string;
  debugMode?: boolean;
}

const PROVIDERS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "openrouter", label: "OpenRouter" },
] as const;

const MODELS_BY_PROVIDER: Record<string, { value: string; label: string }[]> = {
  deepseek: [
    { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { value: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  ],
  openai: [
    { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano" },
  ],
  claude: [
    { value: "claude/claude-haiku-4-20250514", label: "Claude Haiku 4" },
    { value: "claude/claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude/claude-opus-4-20250514", label: "Claude Opus 4" },
  ],
  gemini: [
    { value: "gemini/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  openrouter: [
    { value: "openrouter/openai/gpt-4o", label: "OpenRouter GPT-4o" },
    { value: "openrouter/anthropic/claude-sonnet-4", label: "OpenRouter Claude Sonnet 4" },
    { value: "openrouter/meta-llama/llama-4", label: "OpenRouter Llama 4" },
  ],
};

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

const TASK_TYPE_KEYS: Record<string, string> = {
  check_stock: "settings.tasks.type.checkStock",
  expiry_check: "settings.tasks.type.expiryCheck",
};

export default function SettingsPage() {
  const { t } = useT();

  // 将原始数据库连接错误映射为对用户友好的翻译文本
  const translateDbError = (rawError: string): string => {
    const e = rawError.toLowerCase();
    if (e.includes("timeout") || e.includes("timed out") || e.includes("etimedout")) return t("conn.error.timeout");
    if (e.includes("econnrefused") || e.includes("refused")) return t("conn.error.refused");
    if (e.includes("enotfound") || e.includes("getaddrinfo") || e.includes("resolve")) return t("conn.error.host");
    if (e.includes("authentication failed") || e.includes("password") || e.includes("auth")) return t("conn.error.auth");
    if (e.includes("does not exist") || e.includes("database") && e.includes("not")) return t("conn.error.db");
    if (e.includes("tls") || e.includes("ssl") || e.includes("certificate")) return t("conn.error.tls");
    return rawError; // 无法识别则返回原始错误
  };

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);

  // Model tab state
  const [config, setConfig] = useState<StoreConfig>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");
  const [savingModel, setSavingModel] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [regexExpanded, setRegexExpanded] = useState(false);
  const [customRegexRules, setCustomRegexRules] = useState<any[]>([]);
  const [savingRules, setSavingRules] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState("local");
  const [deploymentReady, setDeploymentReady] = useState(false);

  // 从 localStorage 读取部署模式（避免 SSR hydration 不匹配）
  useEffect(() => {
    const saved = localStorage.getItem("deploymentMode");
    if (saved) setDeploymentMode(saved);
    setDeploymentReady(true);
  }, []);

  // Cloud mode state
  type CloudConnection = { id: string; label: string; url: string; storeId?: string; createdAt: string };
  type LlmConfigItem = { id: string; provider: string; modelId: string; apiKey: string; baseURL: string | null; label: string | null };
  const [cloudConns, setCloudConns] = useState<CloudConnection[]>([]);
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null);
  const [activeCloudConnId, setActiveCloudConnId] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  // Per-connection LLM configs: { [connId]: LlmConfigItem[] }
  const [connLlmConfigs, setConnLlmConfigs] = useState<Record<string, LlmConfigItem[]>>({});
  // LLM form state (for the currently expanded connection)
  const [llmFormId, setLlmFormId] = useState<string | null>(null);
  const [llmFormProvider, setLlmFormProvider] = useState("deepseek");
  const [llmFormModelId, setLlmFormModelId] = useState("deepseek-v4-flash");
  const [llmFormKey, setLlmFormKey] = useState("");
  const [llmFormBaseURL, setLlmFormBaseURL] = useState("");
  const [llmFormLabel, setLlmFormLabel] = useState("");
  const [savingLLM, setSavingLLM] = useState(false);
  // New connection form
  const [newConnUrl, setNewConnUrl] = useState("");
  const [connectingDb, setConnectingDb] = useState(false);

  // Warehouses tab state
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Store | null>(null);
  const [whFormName, setWhFormName] = useState("");
  const [whFormHost, setWhFormHost] = useState("localhost");
  const [whFormPort, setWhFormPort] = useState("5432");
  const [whFormUser, setWhFormUser] = useState("postgres");
  const [whFormPassword, setWhFormPassword] = useState("");
  const [whFormDatabase, setWhFormDatabase] = useState("postgres");
  const [whTestResult, setWhTestResult] = useState<{success: boolean; message: string; error?: string} | null>(null);
  const [whTestLoading, setWhTestLoading] = useState(false);
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Memory tab state
  const [memorySize, setMemorySize] = useState(DEFAULT_MEMORY_SIZE);
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  const [summaryThreshold, setSummaryThreshold] = useState(50);
  const [summaryCount, setSummaryCount] = useState(3);
  const [contextMode, setContextMode] = useState("recent");
  const [debugMode, setDebugMode] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);

  // Tasks tab state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskType, setTaskType] = useState("check_stock");
  const [taskCron, setTaskCron] = useState("");
  const [taskEnabled, setTaskEnabled] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  // Language tab state
  const [language, setLanguage] = useState("en");

  // Load stores — 始终从API加载，云端模式额外加载云端连接
  useEffect(() => {
    const savedLang = localStorage.getItem("language");
    if (savedLang) setLanguage(savedLang);

    // 始终加载本地仓库用于选择
    const saved = localStorage.getItem("activeStoreId");

    // 云端模式：只加载云端连接的仓库，不读本地 warehouses.json
    if (deploymentMode !== "local") {
      const raw = localStorage.getItem("cloud_connections");
      const conns: CloudConnection[] = raw ? JSON.parse(raw) : [];
      const cloudStores: Store[] = conns
        .filter((c) => c.storeId)
        .map((c) => ({ id: c.storeId!, name: c.label }));
      setStores(cloudStores);
      if (saved && cloudStores.some((s) => s.id === saved)) {
        setStoreId(saved);
      } else if (saved) {
        localStorage.removeItem("activeStoreId");
        setStoreId(null);
      }
      setLoadingStores(false);
    } else {
      fetch("/api/stores")
        .then((res) => (res.ok ? res.json() : []))
        .then((data: Store[]) => {
          setStores(data);
          if (saved && data.some((s: Store) => s.id === saved)) {
            setStoreId(saved);
          } else if (saved) {
            localStorage.removeItem("activeStoreId");
            setStoreId(null);
          }
          setLoadingStores(false);
        })
        .catch(() => setLoadingStores(false));
    }

    // 云端模式下加载云端连接，失效连接自动清理
    if (deploymentMode !== "local") {
      const raw = localStorage.getItem("cloud_connections");
      const conns: CloudConnection[] = raw ? JSON.parse(raw) : [];
      const validConns: CloudConnection[] = [];
      // 异步验证每个连接是否仍有效
      Promise.all(conns.map(async (c) => {
        if (!c.storeId) return;
        try {
          const res = await fetch(`/api/llm-config?storeId=${encodeURIComponent(c.storeId)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) setConnLlmConfigs((prev) => ({ ...prev, [c.id]: data }));
            validConns.push(c);
          }
        } catch {}
      })).then(() => {
        if (validConns.length < conns.length) {
          // 有失效连接，更新 localStorage
          localStorage.setItem("cloud_connections", JSON.stringify(validConns));
          // 同步更新 stores（删除失效仓库）
          setStores((prev) => prev.filter((s) => validConns.some((vc) => vc.storeId === s.id)));
        }
        setCloudConns(validConns);
        const active = localStorage.getItem("activeCloudConnId");
        if (active && validConns.some((c) => c.id === active)) {
          setActiveCloudConnId(active);
        } else if (validConns.length > 0) {
          setActiveCloudConnId(validConns[0].id);
          localStorage.setItem("activeCloudConnId", validConns[0].id);
        }
      });
    }
  }, [deploymentMode]);

  // Load config when storeId changes
  useEffect(() => {
    if (!storeId) return;
    setLoadingConfig(true);
    fetch(`/api/settings/${encodeURIComponent(storeId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data: StoreConfig) => {
        setConfig(data ?? {});
        if (data?.modelId) {
          const [provider] = (data.modelId as string).split("/");
          setSelectedProvider(provider);
          setSelectedModel(data.modelId);
        }
        if (data?.memorySize) {
          setMemorySize(data.memorySize);
        }
        if (data?.summaryEnabled !== undefined) {
          setSummaryEnabled(data.summaryEnabled);
        }
        if (data?.summaryThreshold) {
          setSummaryThreshold(data.summaryThreshold);
        }
        if (data?.summaryCount) {
          setSummaryCount(data.summaryCount);
        }
        if (data?.contextMode) {
          setContextMode(data.contextMode);
        }
        if (data?.debugMode !== undefined) {
          setDebugMode(data.debugMode);
        }
        if (data?.customPrompt !== undefined) {
          setCustomPrompt(data.customPrompt);
        }
        if (data?.customRegexRules) {
          setCustomRegexRules(data.customRegexRules.map((r: any) => ({
            ...r,
            id: r.id || `r_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          })));
        }
        setLoadingConfig(false);
      })
      .catch(() => setLoadingConfig(false));
  }, [storeId]);

  async function handleSaveRules() {
    if (!storeId) return;
    setSavingRules(true);
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customRegexRules }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch (e) {
      console.error("Save rules failed:", e);
    } finally {
      setSavingRules(false);
    }
  }

  function updateRule(ruleId: string, field: string, value: string) {
    setCustomRegexRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, [field]: value } : r))
    );
  }

  function deleteRule(ruleId: string) {
    setCustomRegexRules((prev) => prev.filter((r) => r.id !== ruleId));
  }

  function addRule(action?: string) {
    setCustomRegexRules((prev) => [
      ...prev,
      { id: `r_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, pattern: "", action: action || "query" },
    ]);
  }

  // ── Cloud connection helpers ──
  function saveCloudConns(conns: CloudConnection[]) {
    setCloudConns(conns);
    localStorage.setItem("cloud_connections", JSON.stringify(conns));
  }

  const loadLlmConfigsForConn = useCallback(async (connId: string, storeId: string) => {
    try {
      const res = await fetch(`/api/llm-config?storeId=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setConnLlmConfigs((prev) => ({ ...prev, [connId]: data }));
      }
    } catch {}
  }, []);

  const handleAddCloudConn = useCallback(async () => {
    if (!newConnUrl.trim()) return;
    setConnectingDb(true);
    try {
      const res = await fetch("/api/stores/connect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newConnUrl }),
      });
      const data = await res.json();
      if (data.success) {
        const newConn: CloudConnection = {
          id: `cloud_${Date.now()}`,
          label: "新连接",
          url: newConnUrl,
          storeId: data.storeId,
          createdAt: new Date().toISOString(),
        };
        const updated = [...cloudConns, newConn];
        saveCloudConns(updated);
        // 将新连接的仓库加入选择列表（去重）
        if (data.storeId) {
          setStores((prev) => {
            if (prev.some((s) => s.id === data.storeId)) return prev;
            return [...prev, { id: data.storeId!, name: newConn.label }];
          });
          setStoreId(data.storeId);
          localStorage.setItem("activeStoreId", data.storeId);
          await loadLlmConfigsForConn(newConn.id, data.storeId);
        }
        setActiveCloudConnId(newConn.id);
        localStorage.setItem("activeCloudConnId", newConn.id);
        setNewConnUrl("");
        setExpandedConnId(newConn.id);
      } else {
        toast.error(translateDbError(data.error) || t("conn.error.unknown"));
      }
    } catch {
      toast.error(t("conn.error.unknown"));
    } finally {
      setConnectingDb(false);
    }
  }, [newConnUrl, cloudConns, loadLlmConfigsForConn]);

  const handleDeleteCloudConn = useCallback((id: string) => {
    saveCloudConns(cloudConns.filter((c) => c.id !== id));
    if (expandedConnId === id) setExpandedConnId(null);
    if (activeCloudConnId === id) {
      const remaining = cloudConns.filter((c) => c.id !== id);
      const next = remaining[0];
      setActiveCloudConnId(next?.id || null);
      localStorage.setItem("activeCloudConnId", next?.id || "");
      if (next?.storeId) setStoreId(next.storeId);
    }
  }, [cloudConns, expandedConnId, activeCloudConnId]);

  const handleUpdateConnLabel = useCallback((id: string, newLabel: string) => {
    if (!newLabel.trim()) return;
    setCloudConns((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, label: newLabel.trim() } : c);
      localStorage.setItem("cloud_connections", JSON.stringify(updated));
      return updated;
    });
    // 同步更新 stores 下拉列表
    setStores((prev) => prev.map((s) => {
      const conn = cloudConns.find((c) => c.id === id);
      return conn && s.id === conn.storeId ? { ...s, name: newLabel.trim() } : s;
    }));
    setEditingLabelId(null);
  }, [cloudConns]);

  const handleActivateConn = useCallback(async (conn: CloudConnection) => {
    if (!conn.storeId) {
      // Re-register
      setConnectingDb(true);
      try {
        const res = await fetch("/api/stores/connect-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: conn.url }),
        });
        const data = await res.json();
        if (data.success) {
          conn = { ...conn, storeId: data.storeId };
          setCloudConns((prev) => prev.map((c) => c.id === conn.id ? conn! : c));
        } else {
          // 连接失败，清理失效配置
          toast.error(translateDbError(data.error) || t("conn.error.unknown"));
          handleDeleteCloudConn(conn.id);
          setConnectingDb(false);
          return;
        }
      } catch {
        toast.error(t("conn.error.unknown"));
        handleDeleteCloudConn(conn.id);
        setConnectingDb(false);
        return;
      } finally {
        setConnectingDb(false);
      }
    }
    setActiveCloudConnId(conn.id);
    localStorage.setItem("activeCloudConnId", conn.id);
    if (conn.storeId) {
      // 确保该连接对应的仓库在选择列表中
      setStores((prev) => {
        if (prev.some((s) => s.id === conn.storeId)) return prev;
        return [...prev, { id: conn.storeId!, name: conn.label }];
      });
      setStoreId(conn.storeId);
      localStorage.setItem("activeStoreId", conn.storeId);
      loadLlmConfigsForConn(conn.id, conn.storeId);
    }
  }, [loadLlmConfigsForConn]);

  // ── LLM config handlers (per-connection) ──
  const handleSaveLLM = useCallback(async () => {
    const connId = expandedConnId;
    const conn = cloudConns.find((c) => c.id === connId);
    const sid = conn?.storeId;
    if (!sid || !llmFormProvider || !llmFormKey.trim()) return;
    setSavingLLM(true);
    try {
      const res = await fetch(`/api/llm-config?storeId=${encodeURIComponent(sid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: llmFormId,
          provider: llmFormProvider,
          modelId: llmFormModelId,
          apiKey: llmFormKey,
          baseURL: llmFormBaseURL || undefined,
          label: llmFormLabel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // 保存失败，显示错误提示
        toast.error(data.error || "保存LLM配置失败，请检查数据库连接");
        return;
      }
      setLlmFormId(null); setLlmFormModelId("deepseek-v4-flash"); setLlmFormKey(""); setLlmFormBaseURL(""); setLlmFormLabel("");
      await loadLlmConfigsForConn(connId!, sid);
    } catch {
      toast.error("保存失败，请检查网络连接");
    } finally {
      setSavingLLM(false);
    }
  }, [expandedConnId, cloudConns, llmFormId, llmFormProvider, llmFormModelId, llmFormKey, llmFormBaseURL, llmFormLabel, loadLlmConfigsForConn]);

  const handleDeleteLLM = useCallback(async (id: string) => {
    const conn = cloudConns.find((c) => c.id === expandedConnId);
    if (!conn?.storeId) return;
    await fetch(`/api/llm-config?storeId=${encodeURIComponent(conn.storeId)}&id=${id}`, { method: "DELETE" });
    setConnLlmConfigs((prev) => ({
      ...prev,
      [expandedConnId!]: (prev[expandedConnId!] || []).filter((c) => c.id !== id),
    }));
  }, [cloudConns, expandedConnId]);

  const handleSaveDeployment = useCallback(async () => {
    if (!storeId) return;
    await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentMode }),
    });
  }, [storeId, deploymentMode]);

  const handleEditLLM = useCallback((config: LlmConfigItem) => {
    setLlmFormId(config.id);
    setLlmFormProvider(config.provider);
    setLlmFormModelId(config.modelId);
    setLlmFormKey(config.apiKey);
    setLlmFormBaseURL(config.baseURL || "");
    setLlmFormLabel(config.label || "");
  }, []);

  const handleSaveActiveConfig = useCallback(async (configId: string) => {
    const conn = cloudConns.find((c) => c.id === expandedConnId);
    if (!conn?.storeId) return;
    // Save to StoreMeta
    await fetch(`/api/settings/${encodeURIComponent(conn.storeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeLlmConfigId: configId }),
    });
    const configs = connLlmConfigs[expandedConnId!] || [];
    const active = configs.find((c: any) => c.id === configId);
    if (active) {
      await fetch(`/api/settings/${encodeURIComponent(conn.storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: `${active.provider}/${active.modelId}` }),
      });
    }
  }, [cloudConns, expandedConnId, connLlmConfigs]);

  const loadTasks = useCallback(() => {
    if (!storeId) return;
    setLoadingTasks(true);
    fetch(`/api/tasks?storeId=${encodeURIComponent(storeId)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Task[]) => {
        setTasks(data);
        setLoadingTasks(false);
      })
      .catch(() => setLoadingTasks(false));
  }, [storeId]);

  // Load tasks when storeId changes
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleStoreSelect = useCallback((value: string | null) => {
    if (!value) return;
    setStoreId(value);
    localStorage.setItem("activeStoreId", value);
  }, []);

  // Model tab handlers
  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
    const models = MODELS_BY_PROVIDER[provider];
    setSelectedModel(models?.[0]?.value ?? "");
  }, []);

  const handleSaveModel = useCallback(async () => {
    const modelToSave = selectedModel === "__custom__" ? customModelInput : selectedModel;
    if (!storeId || !modelToSave) return;

    // Compare with default: if same, save null to use system default
    const trimmed = (customPrompt || "").trim();
    let promptToSave: string | null = trimmed || null;
    if (trimmed === SYSTEM_PROMPT.trim()) {
      promptToSave = null;
    }
    // If empty, reset the textarea
    if (!trimmed) {
      setCustomPrompt(SYSTEM_PROMPT);
    }

    setSavingModel(true);
    try {
      await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: modelToSave, customPrompt: promptToSave }),
      });
    } catch {
      // Ignore
    } finally {
      setSavingModel(false);
    }
  }, [storeId, selectedModel, customPrompt]);

  // Warehouses tab handlers
  const openCreateWarehouse = useCallback(() => {
    setEditingWarehouse(null);
    setWhFormName("");
    setWhFormHost("localhost");
    setWhFormPort("5432");
    setWhFormUser("postgres");
    setWhFormPassword("");
    setWhFormDatabase("postgres");
    setWhTestResult(null);
    setWarehouseDialogOpen(true);
  }, []);

  const openEditWarehouse = useCallback((store: Store) => {
    setEditingWarehouse(store);
    setWhFormName(store.name);
    setWhFormHost(store.host ?? "localhost");
    setWhFormPort(String(store.port ?? 5432));
    setWhFormUser(store.user ?? "postgres");
    setWhFormPassword("");
    setWhFormDatabase(store.database || "postgres");
    setWhTestResult(null);
    setWarehouseDialogOpen(true);
  }, []);

  const handleTestConnection = useCallback(async () => {
    setWhTestLoading(true);
    setWhTestResult(null);
    try {
      const res = await fetch("/api/stores/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: whFormHost,
          port: parseInt(whFormPort) || 5432,
          user: whFormUser,
          password: whFormPassword,
          database: whFormDatabase,
        }),
      });
      const data = await res.json();
      setWhTestResult(data);
    } catch (e: any) {
      setWhTestResult({ success: false, message: e?.message ?? String(e), error: String(e) });
    } finally {
      setWhTestLoading(false);
    }
  }, [whFormHost, whFormPort, whFormUser, whFormPassword, whFormDatabase]);

  const handleSaveWarehouse = useCallback(async () => {
    setSavingWarehouse(true);

    // Test connection first
    try {
      const testRes = await fetch("/api/stores/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: whFormHost,
          port: parseInt(whFormPort) || 5432,
          user: whFormUser,
          password: whFormPassword,
          database: whFormDatabase,
        }),
      });
      const testData = await testRes.json();
      if (!testData.success) {
        setWhTestResult(testData);
        setSavingWarehouse(false);
        return;
      }
    } catch (e: any) {
      setWhTestResult({ success: false, message: e?.message ?? String(e), error: String(e) });
      setSavingWarehouse(false);
      return;
    }

    // Save the warehouse
    try {
      const body = {
        name: whFormName.trim(),
        host: whFormHost,
        port: parseInt(whFormPort) || 5432,
        user: whFormUser,
        password: whFormPassword,
        database: whFormDatabase,
      };

      let saveRes;
      if (editingWarehouse) {
        saveRes = await fetch(`/api/stores/${encodeURIComponent(editingWarehouse.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        saveRes = await fetch("/api/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setWhTestResult({ success: false, message: t("conn.fail"), error: saveData.error || "Unknown error" });
        setSavingWarehouse(false);
        return;
      }
      // If new warehouse created, select it
      if (!editingWarehouse && saveData.id) {
        localStorage.setItem("activeStoreId", saveData.id);
        setStoreId(saveData.id);
      }
      // Refresh stores
      const res = await fetch("/api/stores");
      const data: Store[] = await res.json();
      setStores(data);
      setSavingWarehouse(false);
      setWarehouseDialogOpen(false);
      setWhTestResult(null);
      return;
    } catch (e: any) {
      setWhTestResult({ success: false, message: t("conn.fail"), error: e?.message || String(e) });
    } finally {
      setSavingWarehouse(false);
    }
  }, [whFormName, whFormHost, whFormPort, whFormUser, whFormPassword, whFormDatabase, editingWarehouse]);

  const handleDeleteWarehouse = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/stores/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        setStores((prev) => prev.filter((s) => s.id !== id));
        if (storeId === id) {
          setStoreId(null);
          localStorage.removeItem("activeStoreId");
        }
      } catch {
        // Ignore
      }
      setDeleteConfirmId(null);
    },
    [storeId]
  );

  // Memory tab handlers
  const handleSaveMemory = useCallback(async () => {
    if (!storeId) return;
    if (contextMode !== "recent" && !summaryEnabled) {
      alert(t("settings.memory.alert"));
      return;
    }
    setSavingMemory(true);
    try {
      await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memorySize, summaryEnabled, summaryThreshold, summaryCount, contextMode, debugMode }),
      });
    } catch {
      // Ignore
    } finally {
      setSavingMemory(false);
    }
  }, [storeId, memorySize, summaryEnabled, summaryThreshold, summaryCount, contextMode, debugMode]);

  // Tasks tab handlers
  const openCreateTask = useCallback(() => {
    setEditingTask(null);
    setTaskType("check_stock");
    setTaskCron("");
    setTaskEnabled(true);
    setTaskDialogOpen(true);
  }, []);

  const openEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskType(task.type);
    setTaskCron(task.cron);
    setTaskEnabled(task.enabled);
    setTaskDialogOpen(true);
  }, []);

  const handleSaveTask = useCallback(async () => {
    if (!storeId || !taskType || !taskCron.trim()) return;
    setSavingTask(true);

    try {
      if (editingTask) {
        await fetch(`/api/tasks/${encodeURIComponent(editingTask.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: taskType,
            cron: taskCron.trim(),
            enabled: taskEnabled,
          }),
        });
      } else {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            type: taskType,
            cron: taskCron.trim(),
            enabled: taskEnabled,
          }),
        });
      }
      // Refresh tasks
      const res = await fetch(
        `/api/tasks?storeId=${encodeURIComponent(storeId)}`
      );
      const data: Task[] = await res.json();
      setTasks(data);
    } catch {
      // Ignore
    } finally {
      setSavingTask(false);
      setTaskDialogOpen(false);
    }
  }, [storeId, taskType, taskCron, taskEnabled, editingTask]);

  const handleDeleteTask = useCallback(async (id: string) => {
    try {
      await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // Ignore
    }
    setDeleteTaskId(null);
  }, []);

  const handleTaskToggle = useCallback(async (task: Task) => {
    try {
      await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !task.enabled }),
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, enabled: !t.enabled } : t
        )
      );
    } catch {
      // Ignore
    }
  }, []);

  // Language handler
  const handleLanguageChange = useCallback((value: string | null) => {
    if (!value) return;
    setLanguage(value);
    localStorage.setItem("language", value);
    window.location.reload();
  }, []);

  const currentStore = stores.find((s) => s.id === storeId);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
          {currentStore && (
            <p className="text-sm text-muted-foreground">
              {currentStore.name}
            </p>
          )}
        </div>
        {stores.length > 0 && (
          <Select value={storeId} onValueChange={handleStoreSelect}>
            <SelectTrigger className="w-[180px]">
              <SelectValue>{currentStore?.name ?? storeId}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!loadingStores && !storeId && (
        <Card className="bg-background/60 backdrop-blur-md border-border/50 border-destructive/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <AlertCircle className="h-8 w-8 text-destructive/60" />
            <p className="text-sm font-medium text-destructive/80">
              {stores.length === 0
                ? deploymentMode === "local"
                  ? "未找到仓库，请在仓库管理中添加"
                  : "未找到仓库，请添加云端数据库连接"
                : "请先选择一个仓库"}
            </p>
            {stores.length === 0 && (
              <p className="text-xs text-center max-w-md">
                {deploymentMode === "local"
                  ? "在「仓库管理」tab 中添加本地或远程 PostgreSQL 连接"
                  : "在「云端连接」卡片中输入 PostgreSQL 连接地址，验证通过后即可选择仓库"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="model" className="space-y-4">
        <TabsList>
          <TabsTrigger value="deploy" className="gap-1.5">
            <Settings className="h-4 w-4" />
            {t("settings.deploy.title")}
          </TabsTrigger>
          {deploymentMode === "local" && (
            <>
              <TabsTrigger value="model" className="gap-1.5">
                <Bot className="h-4 w-4" />
                {t("settings.model")}
              </TabsTrigger>
              <TabsTrigger value="warehouses" className="gap-1.5">
                <Wrench className="h-4 w-4" />
                {t("settings.warehouses")}
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="memory" className="gap-1.5">
            <Brain className="h-4 w-4" />
            {t("settings.memory")}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            {t("settings.tasks")}
          </TabsTrigger>
          <TabsTrigger value="language" className="gap-1.5">
            <Globe className="h-4 w-4" />
            {t("settings.language")}
          </TabsTrigger>
        </TabsList>

        {/* Deploy tab */}
        <TabsContent value="deploy" className="space-y-4">
          <Card className="bg-background/60 backdrop-blur-md border-border/50">
            <CardHeader>
              <CardTitle className="text-base">{t("settings.deploy.title")}</CardTitle>
              <CardDescription>{t("settings.deploy.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={deploymentMode} onValueChange={(v) => { setDeploymentMode(v); localStorage.setItem("deploymentMode", v); setTimeout(() => handleSaveDeployment(), 0); }}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue>
                    {{ local: t("settings.deploy.mode.local"), vercel: t("settings.deploy.mode.vercel"), docker: t("settings.deploy.mode.docker") }[deploymentMode] || deploymentMode}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">{t("settings.deploy.mode.local")}</SelectItem>
                  <SelectItem value="vercel">{t("settings.deploy.mode.vercel")}</SelectItem>
                  <SelectItem value="docker">{t("settings.deploy.mode.docker")}</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {deploymentMode !== "local" && (
            <>
              {/* Cloud connection list */}
              {cloudConns.map((conn) => {
                const isExpanded = expandedConnId === conn.id;
                const configs = connLlmConfigs[conn.id] || [];
                const providerModels: Record<string, string[]> = {
                  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
                  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1"],
                  claude: ["claude-sonnet-4-6", "claude-haiku-4-5"],
                  gemini: ["gemini-2.0-flash", "gemini-2.5-pro"],
                  openrouter: [],
                };
                return (
                  <Card key={conn.id} className="bg-background/60 backdrop-blur-md border-border/50">
                    <CardContent className="pt-4 pb-3 space-y-2">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedConnId(isExpanded ? null : conn.id)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs">{isExpanded ? "▾" : "▸"}</span>
                          {editingLabelId === conn.id ? (
                            <input
                              className="text-sm font-medium bg-background border border-primary/30 rounded px-1.5 py-0.5 w-28 focus:outline-none focus:border-primary"
                              value={editLabelValue}
                              onChange={(e) => setEditLabelValue(e.target.value)}
                              onBlur={() => handleUpdateConnLabel(conn.id, editLabelValue)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleUpdateConnLabel(conn.id, editLabelValue); if (e.key === "Escape") setEditingLabelId(null); }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="text-sm font-medium truncate cursor-text hover:text-primary/80"
                              onDoubleClick={(e) => { e.stopPropagation(); setEditingLabelId(conn.id); setEditLabelValue(conn.label); }}
                              title="双击编辑名称"
                            >{conn.label}</span>
                          )}
                          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditingLabelId(conn.id); setEditLabelValue(conn.label); }} title="编辑名称"><span className="text-xs">✎</span></Button>
                          <code className="text-xs text-muted-foreground truncate hidden sm:inline">{conn.url.slice(0, 50)}...</code>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDeleteCloudConn(conn.id); }}><span className="text-xs">✕</span></Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border/50 pt-3 space-y-3">
                          {/* LLM configs for this connection */}
                          {configs.length > 0 && (
                            <div className="space-y-1">
                              {configs.map((c) => (
                                <div key={c.id} className={`flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-xs ${llmFormId === c.id ? "bg-primary/10 border border-primary/30" : "bg-muted/30 border border-transparent hover:bg-muted/50"}`} onClick={() => handleEditLLM(c)}>
                                  <Badge variant="outline" className="font-mono text-xs">{c.provider}</Badge>
                                  <span className="font-medium">{c.modelId || c.provider}</span>
                                  {c.label && <span className="text-muted-foreground">{c.label}</span>}
                                  <code className="text-muted-foreground ml-auto mr-2">{c.apiKey.slice(0, 12)}...</code>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleSaveActiveConfig(c.id); }} title="设为活跃"><span className="text-xs">✓</span></Button>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleDeleteLLM(c.id); }}><span className="text-xs">✕</span></Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add/edit LLM */}
                          <div className="border-t border-border/50 pt-2 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">{llmFormId ? "编辑 LLM 配置" : "添加 LLM 配置"}</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">服务商</Label>
                                <Select value={llmFormProvider} onValueChange={(v) => { setLlmFormProvider(v); setLlmFormModelId(providerModels[v]?.[0] || ""); }}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                                    <SelectItem value="openai">OpenAI</SelectItem>
                                    <SelectItem value="claude">Claude</SelectItem>
                                    <SelectItem value="gemini">Gemini</SelectItem>
                                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">模型</Label>
                                {providerModels[llmFormProvider]?.length > 0 ? (
                                  <Select value={llmFormModelId} onValueChange={setLlmFormModelId}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {providerModels[llmFormProvider].map((m) => (
                                        <SelectItem key={m} value={m}>{m}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input className="h-7 text-xs" placeholder="输入模型 ID" value={llmFormModelId} onChange={(e) => setLlmFormModelId(e.target.value)} />
                                )}
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">API Key</Label>
                                <Input type="password" className="h-7 text-xs font-mono" placeholder="sk-..." value={llmFormKey} onChange={(e) => setLlmFormKey(e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">自定义端点</Label>
                                <Input className="h-7 text-xs font-mono" placeholder="默认" value={llmFormBaseURL} onChange={(e) => setLlmFormBaseURL(e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">标签</Label>
                                <Input className="h-7 text-xs" placeholder="可选" value={llmFormLabel} onChange={(e) => setLlmFormLabel(e.target.value)} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleSaveLLM} disabled={savingLLM || !llmFormKey.trim()}>
                                {savingLLM && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                保存
                              </Button>
                              {llmFormId && (
                                <Button size="sm" variant="ghost" onClick={() => { setLlmFormId(null); setLlmFormModelId("deepseek-v4-flash"); setLlmFormKey(""); }}>取消</Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Add new connection */}
              <Card className="bg-background/60 backdrop-blur-md border-border/50 border-dashed">
                <CardContent className="pt-4 pb-3">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 h-8 text-xs font-mono"
                      placeholder={t("settings.deploy.dbUrl.placeholder")}
                      value={newConnUrl}
                      onChange={(e) => setNewConnUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddCloudConn(); }}
                    />
                    <Button size="sm" className="h-8" onClick={handleAddCloudConn} disabled={connectingDb || !newConnUrl.trim()}>
                      {connectingDb && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      连接
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Model tab */}
        <TabsContent value="model" className="space-y-4">
          <Card className="bg-background/60 backdrop-blur-md border-border/50">
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.model.title")}
              </CardTitle>
              <CardDescription>
                {t("settings.model.desc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingConfig ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loading.config")}
                </div>
              ) : (
                <>
                  {config.modelId && (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">{t("settings.model.current")}</Badge>
                      <span className="text-muted-foreground">
                        {config.modelId}
                      </span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("settings.model.provider")}</Label>
                      <Select
                        value={selectedProvider}
                        onValueChange={handleProviderChange}
                      >
                        <SelectTrigger className="w-full max-w-xs">
                          <SelectValue>
                            {PROVIDERS.find((p) => p.value === selectedProvider)?.label || t("settings.model.provider.placeholder")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDERS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t("settings.model.id")}</Label>
                      <Select
                        value={selectedModel}
                        onValueChange={setSelectedModel}
                        disabled={!selectedProvider}
                      >
                        <SelectTrigger className="w-full max-w-xs">
                          <SelectValue>
                            {selectedModel === "__custom__"
                              ? t("settings.model.custom")
                              : (MODELS_BY_PROVIDER[selectedProvider] ?? []).find((m: any) => m.value === selectedModel)?.label || selectedModel || t("settings.model.id.placeholder")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(MODELS_BY_PROVIDER[selectedProvider] ?? []).map(
                            (m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            )
                          )}
                          <SelectItem value="__custom__">{t("settings.model.custom")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedModel === "__custom__" && (
                      <div className="space-y-2">
                        <Label>{t("settings.model.customId")}</Label>
                        <Input
                          placeholder={t("settings.model.customId.placeholder")}
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          className="max-w-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("settings.model.customId.desc")}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom-prompt">{t("settings.model.prompt")}</Label>
                    <textarea
                      id="custom-prompt"
                      rows={6}
                      className="flex w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder={t("settings.model.prompt.placeholder")}
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{t("settings.model.prompt.desc")}</p>
                  </div>

                  {/* Regex Rules List (Editable) */}
                  <Card className="mt-6">
                    <CardHeader
                      className="cursor-pointer select-none"
                      onClick={() => setRegexExpanded(!regexExpanded)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {t("settings.model.regex.title")}
                          </CardTitle>
                          <CardDescription>
                            {t("settings.model.regex.desc")}
                          </CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1">
                          {regexExpanded ? (
                            <>
                              <ChevronUp className="h-4 w-4" />
                              {t("settings.model.regex.collapse")}
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              {t("settings.model.regex.expand", { n: customRegexRules.length })}
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {(() => {
                        const ACTIONS = ["consume", "stockIn", "move", "delete", "restructure", "query", "chat", "rename"];
                        const displayRules = regexExpanded ? customRegexRules : customRegexRules.slice(0, 8);
                        return ACTIONS.map((action) => {
                          const groupRules = displayRules.filter((r: any) => (r.action || "query") === action);
                          if (!regexExpanded && groupRules.length === 0) return null;
                          return (
                            <div key={action} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs font-mono">{action}</Badge>
                                <span className="text-xs text-muted-foreground">{groupRules.length} rules</span>
                              </div>
                              {groupRules.map((rule: any) => (
                                <div key={rule.id} className="flex items-center gap-2">
                                  <Input
                                    className="h-8 text-xs font-mono flex-1"
                                    value={rule.pattern || ""}
                                    onChange={(e) => updateRule(rule.id, "pattern", e.target.value)}
                                    placeholder={`regex for ${action}...`}
                                  />
                                  <Select
                                    value={rule.action || "query"}
                                    onValueChange={(v) => updateRule(rule.id, "action", v)}
                                  >
                                    <SelectTrigger className="h-8 w-[110px] text-xs shrink-0">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ACTIONS.map((a) => (
                                        <SelectItem key={a} value={a}>{a}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => deleteRule(rule.id)}
                                  >
                                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                </div>
                              ))}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => addRule(action)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> {action}
                              </Button>
                            </div>
                          );
                        });
                      })()}
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button variant="outline" size="sm" onClick={() => addRule()}>
                          <Plus className="h-3 w-3 mr-1" />
                          {t("settings.model.regex.addRule")}
                        </Button>
                        <Button size="sm" onClick={handleSaveRules} disabled={savingRules}>
                          {savingRules && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          <Check className="h-3 w-3 mr-1" />
                          {t("settings.model.regex.saveRules")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Button
                    onClick={handleSaveModel}
                    disabled={!selectedModel || savingModel}
                  >
                    {savingModel && (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    )}
                    <Check className="h-4 w-4 mr-1.5" />
                    {t("settings.model.save")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Warehouses tab */}
        <TabsContent value="warehouses" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("settings.wh.count", { n: stores.length })}
            </h3>
            <Button size="sm" onClick={openCreateWarehouse}>
              <Plus className="h-4 w-4 mr-1" />
              {t("settings.wh.add")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {t("settings.wh.config")}
          </p>

          {stores.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Wrench className="h-8 w-8 mb-2" />
                <p className="text-sm">
                  {t("settings.wh.empty")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <Card key={store.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 min-w-0">
                        <CardTitle className="text-base truncate">{store.name}</CardTitle>
                        {store.host && store.database ? (
                          <CardDescription className="font-mono text-xs truncate">
                            postgresql://{store.user ?? "postgres"}@{store.host}:{store.port ?? 5432}/{store.database}
                          </CardDescription>
                        ) : (
                          <CardDescription>{t("settings.wh.noConn")}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditWarehouse(store)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmId(store.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          {/* Delete confirmation dialog */}
          <Dialog
            open={deleteConfirmId !== null}
            onOpenChange={(open) => !open && setDeleteConfirmId(null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("settings.wh.delete.title")}</DialogTitle>
                <DialogDescription>
                  {t("settings.wh.delete.confirm")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  {t("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteConfirmId && handleDeleteWarehouse(deleteConfirmId)
                  }
                >
                  {t("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create/Edit warehouse dialog */}
          <Dialog
            open={warehouseDialogOpen}
            onOpenChange={setWarehouseDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingWarehouse ? t("settings.wh.edit.title") : t("settings.wh.create.title")}
                </DialogTitle>
                <DialogDescription>
                  {editingWarehouse
                    ? t("settings.wh.edit.desc")
                    : t("settings.wh.create.desc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="wh-name">{t("settings.wh.name")}</Label>
                  <Input
                    id="wh-name"
                    value={whFormName}
                    onChange={(e) => setWhFormName(e.target.value)}
                    placeholder={t("settings.wh.name.placeholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-host">{t("settings.wh.host")}</Label>
                  <Input
                    id="wh-host"
                    value={whFormHost}
                    onChange={(e) => setWhFormHost(e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-port">{t("settings.wh.port")}</Label>
                  <Input
                    id="wh-port"
                    value={whFormPort}
                    onChange={(e) => setWhFormPort(e.target.value)}
                    placeholder="5432"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-user">{t("settings.wh.user")}</Label>
                  <Input
                    id="wh-user"
                    value={whFormUser}
                    onChange={(e) => setWhFormUser(e.target.value)}
                    placeholder="postgres"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-password">{t("settings.wh.password")}</Label>
                  <Input
                    id="wh-password"
                    type="password"
                    value={whFormPassword}
                    onChange={(e) => setWhFormPassword(e.target.value)}
                    placeholder={t("settings.wh.password.placeholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-database">{t("settings.wh.database")}</Label>
                  <Input
                    id="wh-database"
                    value={whFormDatabase}
                    onChange={(e) => setWhFormDatabase(e.target.value)}
                    placeholder={t("settings.wh.database.placeholder")}
                  />
                </div>

                {/* Test connection result */}
                {whTestResult && (
                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-md p-3 text-sm",
                      whTestResult.success
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    )}
                  >
                    {whTestResult.success ? (
                      <Check className="h-4 w-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <span>{whTestResult.success ? whTestResult.message || t("conn.success") : whTestResult.error || whTestResult.message || t("conn.fail")}</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setWarehouseDialogOpen(false)}
                >
                  {t("cancel")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTestConnection}
                  disabled={whTestLoading}
                >
                  {whTestLoading && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  {t("test.connection")}
                </Button>
                <Button
                  onClick={handleSaveWarehouse}
                  disabled={!whFormName.trim() || savingWarehouse}
                >
                  {savingWarehouse && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  {t("save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Memory tab */}
        <TabsContent value="memory" className="space-y-4">
          <Card className="bg-background/60 backdrop-blur-md border-border/50">
            <CardHeader>
              <CardTitle className="text-base">{t("settings.memory.title")}</CardTitle>
              <CardDescription>
                {t("settings.memory.desc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingConfig ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loading.config")}
                </div>
              ) : (
                <>
                  {/* Context mode selector */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.memory.contextMode")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.memory.contextMode.desc")}
                      </p>
                    </div>
                    <Select value={contextMode} onValueChange={setContextMode}>
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue>
                          {{ recent: t("settings.memory.mode.recent"), summary: t("settings.memory.mode.summary"), hybrid: t("settings.memory.mode.hybrid") }[contextMode] || contextMode}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recent">{t("settings.memory.mode.recent")}</SelectItem>
                        <SelectItem value="summary">{t("settings.memory.mode.summary")}</SelectItem>
                        <SelectItem value="hybrid">{t("settings.memory.mode.hybrid")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Short-term memory: shown for recent and hybrid */}
                  {(contextMode === "recent" || contextMode === "hybrid") && (
                    <div className="space-y-3 border-t border-border/50 pt-4 pl-3 border-l-2 border-l-primary/30">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("settings.memory.shortTerm")}</div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">{t("settings.memory.size")}</Label>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.memory.size.desc")}
                          </p>
                        </div>
                        <Input
                          type="number"
                          value={memorySize}
                          onChange={(e) => { const v = e.target.value; setMemorySize(v === "" ? 0 : Number(v)); }}
                          onBlur={() => {
                            if (memorySize < 50) setMemorySize(50);
                            if (memorySize > 2000) setMemorySize(2000);
                          }}
                          className="w-20 h-7 text-xs font-mono text-center"
                        />
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={2000}
                        step={50}
                        value={memorySize || 50}
                        onChange={(e) => setMemorySize(Number(e.target.value))}
                        className="w-full max-w-md accent-primary h-2 cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground max-w-md">
                        <span>50</span>
                        <span>2000</span>
                      </div>
                    </div>
                  )}

                  {/* Summary compression: shown for summary and hybrid */}
                  {(contextMode === "summary" || contextMode === "hybrid") && (
                    <div className="space-y-3 border-t border-border/50 pt-4 pl-3 border-l-2 border-l-primary/30">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("settings.memory.summary")}</div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">{t("settings.memory.enabled")}</Label>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.memory.enabled.desc")}
                          </p>
                        </div>
                        <Switch
                          checked={summaryEnabled}
                          onCheckedChange={setSummaryEnabled}
                        />
                      </div>

                      {summaryEnabled && (
                        <>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label className="text-sm">{t("settings.memory.threshold")}</Label>
                                <p className="text-xs text-muted-foreground">
                                  {t("settings.memory.threshold.desc")}
                                </p>
                              </div>
                              <Input
                                type="number"
                                value={summaryThreshold}
                                onChange={(e) => { const v = e.target.value; setSummaryThreshold(v === "" ? 0 : Number(v)); }}
                                onBlur={() => {
                                  if (summaryThreshold < 10) setSummaryThreshold(10);
                                  if (summaryThreshold > 500) setSummaryThreshold(500);
                                }}
                                className="w-16 h-7 text-xs font-mono text-center"
                              />
                            </div>
                            <input
                              type="range"
                              min={10}
                              max={500}
                              step={10}
                              value={summaryThreshold || 10}
                              onChange={(e) => setSummaryThreshold(Number(e.target.value))}
                              className="w-full max-w-md accent-primary h-2 cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground max-w-md">
                              <span>10</span>
                              <span>500</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label className="text-sm">{t("settings.memory.summaryCount")}</Label>
                                <p className="text-xs text-muted-foreground">
                                  {t("settings.memory.summaryCount.desc")}
                                </p>
                              </div>
                              <Input
                                type="number"
                                value={summaryCount}
                                onChange={(e) => { const v = e.target.value; setSummaryCount(v === "" ? 0 : Number(v)); }}
                                onBlur={() => {
                                  if (summaryCount < 1) setSummaryCount(1);
                                  if (summaryCount > 10) setSummaryCount(10);
                                }}
                                className="w-16 h-7 text-xs font-mono text-center"
                              />
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={10}
                              step={1}
                              value={summaryCount || 1}
                              onChange={(e) => setSummaryCount(Number(e.target.value))}
                              className="w-full max-w-md accent-primary h-2 cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground max-w-md">
                              <span>1</span>
                              <span>10</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Debug mode */}
                  <div className="border-t border-border/50 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t("settings.memory.debug")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.memory.debug.desc")}
                        </p>
                      </div>
                      <Switch
                        checked={debugMode}
                        onCheckedChange={setDebugMode}
                      />
                    </div>
                  </div>

                  {/* Chat history deletion */}
                  <div className="border-t border-border/50 pt-4">
                    <div className="space-y-1.5">
                      <Label>{t("settings.memory.chatHistory")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.memory.chatHistory.desc")}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!confirm(t("settings.memory.chatHistory.confirmCompress"))) return;
                          try {
                            const res = await fetch(`/api/messages?storeId=${encodeURIComponent(storeId)}&mode=compress`, { method: "DELETE" });
                            if (!res.ok) throw new Error("Failed");
                            alert(t("settings.memory.chatHistory.deleted"));
                          } catch {
                            alert(t("settings.memory.chatHistory.error"));
                          }
                        }}
                      >
                        {t("settings.memory.chatHistory.compressDelete")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={async () => {
                          if (!confirm(t("settings.memory.chatHistory.confirmFull"))) return;
                          try {
                            const res = await fetch(`/api/messages?storeId=${encodeURIComponent(storeId)}&mode=full`, { method: "DELETE" });
                            if (!res.ok) throw new Error("Failed");
                            alert(t("settings.memory.chatHistory.deleted"));
                          } catch {
                            alert(t("settings.memory.chatHistory.error"));
                          }
                        }}
                      >
                        {t("settings.memory.chatHistory.fullDelete")}
                      </Button>
                    </div>
                  </div>

                  <Button onClick={handleSaveMemory} disabled={savingMemory}>
                    {savingMemory && (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    )}
                    <Check className="h-4 w-4 mr-1.5" />
                    {t("save")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("settings.tasks.count", { n: tasks.length })}
            </h3>
            <Button size="sm" onClick={openCreateTask}>
              <Plus className="h-4 w-4 mr-1" />
              {t("settings.tasks.add")}
            </Button>
          </div>

          {loadingTasks ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  {t("loading.tasks")}
                </span>
              </CardContent>
            </Card>
          ) : tasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calendar className="h-8 w-8 mb-2" />
                <p className="text-sm">
                  {t("settings.tasks.empty")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map((task) => (
                <Card key={task.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <Badge variant="secondary" className="text-xs">
                          {t(TASK_TYPE_KEYS[task.type] ?? task.type)}
                        </Badge>
                        <CardTitle className="text-sm font-mono">
                          {task.cron}
                        </CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditTask(task)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTaskId(task.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {task.lastRun
                          ? `${t("settings.tasks.lastRun")}: ${new Date(task.lastRun).toLocaleString()}`
                          : t("settings.tasks.neverRun")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={task.enabled}
                        onCheckedChange={() => handleTaskToggle(task)}
                      />
                      <Label className="text-xs text-muted-foreground">
                        {task.enabled ? t("enable") : t("disable")}
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Delete task confirmation */}
          <Dialog
            open={deleteTaskId !== null}
            onOpenChange={(open) => !open && setDeleteTaskId(null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("settings.tasks.delete.title")}</DialogTitle>
                <DialogDescription>
                  {t("settings.tasks.delete.confirm")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteTaskId(null)}
                >
                  {t("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteTaskId && handleDeleteTask(deleteTaskId)
                  }
                >
                  {t("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create/Edit task dialog */}
          <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingTask ? t("settings.tasks.edit.title") : t("settings.tasks.create.title")}
                </DialogTitle>
                <DialogDescription>
                  {t("settings.tasks.create.desc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="task-type">{t("settings.tasks.type")}</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger id="task-type">
                      <SelectValue>
                        {t(TASK_TYPE_KEYS[taskType] ?? taskType)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_TYPE_KEYS).map(([value, key]) => (
                        <SelectItem key={value} value={value}>
                          {t(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-cron">{t("settings.tasks.cron")}</Label>
                  <Input
                    id="task-cron"
                    value={taskCron}
                    onChange={(e) => setTaskCron(e.target.value)}
                    placeholder={t("settings.tasks.cron.placeholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.tasks.cron.desc")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="task-enabled"
                    checked={taskEnabled}
                    onCheckedChange={setTaskEnabled}
                  />
                  <Label htmlFor="task-enabled">{t("settings.tasks.enabled")}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setTaskDialogOpen(false)}
                >
                  {t("cancel")}
                </Button>
                <Button
                  onClick={handleSaveTask}
                  disabled={!taskCron.trim() || savingTask}
                >
                  {savingTask && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  {editingTask ? t("save.changes") : t("create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Language tab */}
        <TabsContent value="language" className="space-y-4">
          <Card className="bg-background/60 backdrop-blur-md border-border/50">
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.lang.title")}
              </CardTitle>
              <CardDescription>
                {t("settings.lang.desc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>{t("settings.lang.label")}</Label>
                <Select
                  value={language}
                  onValueChange={handleLanguageChange}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue>
                      {LANGUAGE_OPTIONS.find((l: any) => l.value === language)?.label || language}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
