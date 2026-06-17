// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_MEMORY_SIZE } from "@/lib/constants";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
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
  AlertTriangle,
  Wrench,
  Settings,
  Bot,
  Brain,
  Globe,
  Clock,
  Calendar,
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
  const [deploymentMode, setDeploymentMode] = useState("local");
  const [llmConfigs, setLlmConfigs] = useState<Array<{ id: string; provider: string; modelId: string; apiKey: string; baseURL: string | null; label: string | null }>>([]);
  const [llmFormId, setLlmFormId] = useState<string | null>(null);
  const [llmFormProvider, setLlmFormProvider] = useState("deepseek");
  const [llmFormModelId, setLlmFormModelId] = useState("");
  const [llmFormKey, setLlmFormKey] = useState("");
  const [llmFormBaseURL, setLlmFormBaseURL] = useState("");
  const [llmFormLabel, setLlmFormLabel] = useState("");
  const [savingLLM, setSavingLLM] = useState(false);
  const [activeLlmConfigId, setActiveLlmConfigId] = useState<string | null>(null);

  // Cloud mode: DATABASE_URL
  const [dbUrl, setDbUrl] = useState("");
  const [connectingDb, setConnectingDb] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);

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

  // Load stores
  useEffect(() => {
    const saved = localStorage.getItem("activeStoreId");

    const savedLang = localStorage.getItem("language");
    if (savedLang) setLanguage(savedLang);

    fetch("/api/stores")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Store[]) => {
        setStores(data);
        // Validate saved storeId exists
        if (saved && data.some((s: Store) => s.id === saved)) {
          setStoreId(saved);
        } else if (saved) {
          localStorage.removeItem("activeStoreId");
          setStoreId(null);
        }
        setLoadingStores(false);
      })
      .catch(() => setLoadingStores(false));
  }, []);

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
        if (data?.deploymentMode !== undefined) {
          setDeploymentMode(data.deploymentMode);
        }
        setLoadingConfig(false);
      })
      .catch(() => setLoadingConfig(false));
  }, [storeId]);

  // Load LLM configs and settings when deployment mode is cloud
  useEffect(() => {
    if (!storeId || deploymentMode === "local" || !dbConnected) return;
    // Load LLM configs
    fetch(`/api/llm-config?storeId=${encodeURIComponent(storeId)}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLlmConfigs(data); })
      .catch(() => {});
    // Load settings from StoreMeta
    fetch(`/api/settings/${encodeURIComponent(storeId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.memorySize) setMemorySize(data.memorySize);
        if (data?.summaryEnabled !== undefined) setSummaryEnabled(data.summaryEnabled);
        if (data?.summaryThreshold !== undefined) setSummaryThreshold(data.summaryThreshold);
        if (data?.summaryCount !== undefined) setSummaryCount(data.summaryCount);
        if (data?.contextMode) setContextMode(data.contextMode);
        if (data?.debugMode !== undefined) setDebugMode(data.debugMode);
        if (data?.customPrompt) setCustomPrompt(data.customPrompt);
        // Load active LLM config from StoreMeta
        const activeId = data?.activeLlmConfigId;
        if (activeId) setActiveLlmConfigId(activeId);
      })
      .catch(() => {});
  }, [storeId, deploymentMode, dbConnected]);

  const handleSaveLLM = useCallback(async () => {
    if (!storeId || !llmFormProvider || !llmFormKey.trim()) return;
    setSavingLLM(true);
    try {
      await fetch(`/api/llm-config?storeId=${encodeURIComponent(storeId)}`, {
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
      setLlmFormId(null);
      setLlmFormModelId("");
      setLlmFormKey("");
      setLlmFormBaseURL("");
      setLlmFormLabel("");
      const res = await fetch(`/api/llm-config?storeId=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      if (Array.isArray(data)) setLlmConfigs(data);
    } catch {} finally {
      setSavingLLM(false);
    }
  }, [storeId, llmFormId, llmFormProvider, llmFormModelId, llmFormKey, llmFormBaseURL, llmFormLabel]);

  const handleDeleteLLM = useCallback(async (id: string) => {
    if (!storeId) return;
    await fetch(`/api/llm-config?storeId=${encodeURIComponent(storeId)}&id=${id}`, { method: "DELETE" });
    setLlmConfigs((prev) => prev.filter((c) => c.id !== id));
    if (activeLlmConfigId === id) setActiveLlmConfigId(null);
  }, [storeId, activeLlmConfigId]);

  const handleSaveDeployment = useCallback(async () => {
    if (!storeId) return;
    await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentMode }),
    });
  }, [storeId, deploymentMode]);

  const handleSaveActiveConfig = useCallback(async (configId: string) => {
    if (!storeId) return;
    setActiveLlmConfigId(configId);
    // Save active config id to StoreMeta via settings API
    await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeLlmConfigId: configId }),
    });
    // Also update modelId
    fetch(`/api/llm-config?storeId=${encodeURIComponent(storeId)}`, { method: "GET" })
      .then((r) => r.json())
      .then(async (configs) => {
        if (!Array.isArray(configs)) return;
        const active = configs.find((c: any) => c.id === configId);
        if (active) {
          await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId: `${active.provider}/${active.modelId}` }),
          });
        }
      });
  }, [storeId]);

  const handleConnectDb = useCallback(async () => {
    if (!dbUrl.trim()) return;
    setConnectingDb(true);
    try {
      const res = await fetch("/api/stores/connect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: dbUrl }),
      });
      const data = await res.json();
      if (data.success) {
        // Reload store list
        const storesRes = await fetch("/api/stores");
        const storesData = await storesRes.json();
        if (Array.isArray(storesData)) {
          setStores(storesData);
          const storeId = data.storeId || "wh_default";
          setStoreId(storeId);
          localStorage.setItem("lastStoreId", storeId);
        }
        setDbConnected(true);
      } else {
        alert(data.error || "连接失败");
      }
    } catch {
      alert("连接失败");
    } finally {
      setConnectingDb(false);
    }
  }, [dbUrl]);

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

      <Tabs defaultValue="deploy" className="space-y-4">
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
              <Select value={deploymentMode} onValueChange={(v) => { setDeploymentMode(v); setTimeout(() => handleSaveDeployment(), 0); }}>
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
            // ── Cloud mode ──
            <>
              <Card className="bg-background/60 backdrop-blur-md border-border/50">
                <CardHeader>
                  <CardTitle className="text-base">{t("settings.deploy.dbUrl")}</CardTitle>
                  <CardDescription>{t("settings.deploy.dbUrl.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 h-8 text-xs font-mono"
                      placeholder={t("settings.deploy.dbUrl.placeholder")}
                      value={dbUrl}
                      onChange={(e) => setDbUrl(e.target.value)}
                    />
                    <Button size="sm" className="h-8" onClick={handleConnectDb} disabled={connectingDb}>
                      {connectingDb && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {dbConnected ? "已连接" : "连接"}
                    </Button>
                  </div>
                  {dbConnected && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      已连接到 {currentStore?.name}
                    </p>
                  )}
                </CardContent>
              </Card>

              {dbConnected && (
                <Card className="bg-background/60 backdrop-blur-md border-border/50">
                  <CardHeader>
                    <CardTitle className="text-base">{t("settings.deploy.llm")}</CardTitle>
                    <CardDescription>{t("settings.deploy.llm.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {llmConfigs.length > 0 && (
                      <div className="space-y-1.5">
                        {llmConfigs.map((c) => (
                          <div
                            key={c.id}
                            className={`flex items-center gap-2 rounded px-3 py-2 cursor-pointer transition-colors ${
                              activeLlmConfigId === c.id
                                ? "bg-primary/10 border border-primary/30"
                                : "bg-muted/30 border border-transparent hover:bg-muted/50"
                            }`}
                            onClick={() => handleSaveActiveConfig(c.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">{c.provider}</Badge>
                                <span className="text-xs font-medium truncate">{c.modelId || c.provider}</span>
                                {c.label && <span className="text-xs text-muted-foreground">{c.label}</span>}
                                {activeLlmConfigId === c.id && (
                                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30">当前</Badge>
                                )}
                              </div>
                              <code className="text-xs text-muted-foreground">{c.apiKey.slice(0, 16)}...</code>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteLLM(c.id); }}>
                              <span className="text-xs">✕</span>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="border-t border-border/50 pt-3 space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">添加配置</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("settings.deploy.llm.provider")}</Label>
                          <Select value={llmFormProvider} onValueChange={setLlmFormProvider}>
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
                          <Label className="text-xs">Model ID</Label>
                          <Input className="h-7 text-xs" placeholder="e.g. deepseek-v4-flash" value={llmFormModelId} onChange={(e) => setLlmFormModelId(e.target.value)} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">{t("settings.deploy.llm.key")}</Label>
                          <Input type="password" className="h-7 text-xs font-mono" placeholder={t("settings.deploy.llm.key.placeholder")} value={llmFormKey} onChange={(e) => setLlmFormKey(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("settings.deploy.llm.baseURL")}</Label>
                          <Input className="h-7 text-xs font-mono" placeholder="默认" value={llmFormBaseURL} onChange={(e) => setLlmFormBaseURL(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">标签</Label>
                          <Input className="h-7 text-xs" placeholder="可选名称" value={llmFormLabel} onChange={(e) => setLlmFormLabel(e.target.value)} />
                        </div>
                      </div>
                      <Button size="sm" onClick={handleSaveLLM} disabled={savingLLM || !llmFormKey.trim()}>
                        {savingLLM && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {t("settings.deploy.llm.save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
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
