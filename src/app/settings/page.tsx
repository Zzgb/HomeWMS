// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_MEMORY_SIZE } from "@/lib/constants";
import { cn } from "@/lib/utils";
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
  { value: "ja", label: "日本語" },
];

const TASK_TYPES = [{ value: "check_stock", label: "自动盘点" }];

export default function SettingsPage() {
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
        if (data?.customPrompt !== undefined) {
          setCustomPrompt(data.customPrompt);
        }
        setLoadingConfig(false);
      })
      .catch(() => setLoadingConfig(false));
  }, [storeId]);

  // Load tasks when storeId changes
  useEffect(() => {
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
    setSavingModel(true);
    try {
      await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: modelToSave, customPrompt: customPrompt || null }),
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
        setWhTestResult({ success: false, message: "保存失败", error: saveData.error || "未知错误" });
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
      setWhTestResult({ success: false, message: "保存失败", error: e?.message || String(e) });
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
    setSavingMemory(true);
    try {
      await fetch(`/api/settings/${encodeURIComponent(storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memorySize }),
      });
    } catch {
      // Ignore
    } finally {
      setSavingMemory(false);
    }
  }, [storeId, memorySize]);

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
          <h1 className="text-xl font-semibold">设置</h1>
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

      <Tabs defaultValue="model" className="space-y-4">
        <TabsList>
          <TabsTrigger value="model" className="gap-1.5">
            <Bot className="h-4 w-4" />
            模型
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1.5">
            <Wrench className="h-4 w-4" />
            仓库管理
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5">
            <Brain className="h-4 w-4" />
            记忆策略
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            定时任务
          </TabsTrigger>
          <TabsTrigger value="language" className="gap-1.5">
            <Globe className="h-4 w-4" />
            语言
          </TabsTrigger>
        </TabsList>

        {/* Model tab */}
        <TabsContent value="model" className="space-y-4">
          <Card className="bg-background/60 backdrop-blur-md border-border/50">
            <CardHeader>
              <CardTitle className="text-base">
                AI 模型配置
              </CardTitle>
              <CardDescription>
                选择 AI 服务商和模型用于对话助手。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingConfig ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载配置中...
                </div>
              ) : (
                <>
                  {config.modelId && (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">当前</Badge>
                      <span className="text-muted-foreground">
                        {config.modelId}
                      </span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>服务商</Label>
                      <Select
                        value={selectedProvider}
                        onValueChange={handleProviderChange}
                      >
                        <SelectTrigger className="w-full max-w-xs">
                          <SelectValue placeholder="选择服务商..." />
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
                      <Label>模型</Label>
                      <Select
                        value={selectedModel}
                        onValueChange={setSelectedModel}
                        disabled={!selectedProvider}
                      >
                        <SelectTrigger className="w-full max-w-xs">
                          <SelectValue placeholder="选择模型..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(MODELS_BY_PROVIDER[selectedProvider] ?? []).map(
                            (m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            )
                          )}
                          <SelectItem value="__custom__">自定义模型...</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedModel === "__custom__" && (
                      <div className="space-y-2">
                        <Label>自定义模型 ID</Label>
                        <Input
                          placeholder="例如：deepseek/deepseek-v4-pro"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          className="max-w-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          输入格式：服务商/模型名，如 openai/gpt-4o-mini
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom-prompt">自定义提示词</Label>
                    <textarea
                      id="custom-prompt"
                      rows={6}
                      className="flex w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="加载中..."
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">自定义 AI 助手的系统提示词。留空则使用系统默认。</p>
                  </div>

                  <Button
                    onClick={handleSaveModel}
                    disabled={!selectedModel || savingModel}
                  >
                    {savingModel && (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    )}
                    <Check className="h-4 w-4 mr-1.5" />
                    保存模型
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
              {stores.length} 个仓库
            </h3>
            <Button size="sm" onClick={openCreateWarehouse}>
              <Plus className="h-4 w-4 mr-1" />
              添加仓库
            </Button>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            配置文件：warehouses.json（项目根目录）
          </p>

          {stores.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Wrench className="h-8 w-8 mb-2" />
                <p className="text-sm">
                  暂无仓库，请创建第一个。
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
                          <CardDescription>暂无连接信息</CardDescription>
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
                <DialogTitle>删除仓库</DialogTitle>
                <DialogDescription>
                  确定要删除这个仓库吗？此操作不可撤销，所有关联的库存数据将被永久删除。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteConfirmId && handleDeleteWarehouse(deleteConfirmId)
                  }
                >
                  删除
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
                  {editingWarehouse ? "编辑仓库" : "添加仓库"}
                </DialogTitle>
                <DialogDescription>
                  {editingWarehouse
                    ? "更新 PostgreSQL 连接信息"
                    : "配置 PostgreSQL 数据库连接创建新仓库"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="wh-name">仓库名称</Label>
                  <Input
                    id="wh-name"
                    value={whFormName}
                    onChange={(e) => setWhFormName(e.target.value)}
                    placeholder="例如：主仓库"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-host">主机</Label>
                  <Input
                    id="wh-host"
                    value={whFormHost}
                    onChange={(e) => setWhFormHost(e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-port">端口</Label>
                  <Input
                    id="wh-port"
                    value={whFormPort}
                    onChange={(e) => setWhFormPort(e.target.value)}
                    placeholder="5432"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-user">用户名</Label>
                  <Input
                    id="wh-user"
                    value={whFormUser}
                    onChange={(e) => setWhFormUser(e.target.value)}
                    placeholder="postgres"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-password">密码</Label>
                  <Input
                    id="wh-password"
                    type="password"
                    value={whFormPassword}
                    onChange={(e) => setWhFormPassword(e.target.value)}
                    placeholder="输入密码"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-database">数据库名</Label>
                  <Input
                    id="wh-database"
                    value={whFormDatabase}
                    onChange={(e) => setWhFormDatabase(e.target.value)}
                    placeholder="输入数据库名"
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
                    <span>{whTestResult.success ? whTestResult.message || "连接成功" : whTestResult.error || whTestResult.message || "连接失败"}</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setWarehouseDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTestConnection}
                  disabled={whTestLoading}
                >
                  {whTestLoading && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  测试连接
                </Button>
                <Button
                  onClick={handleSaveWarehouse}
                  disabled={!whFormName.trim() || savingWarehouse}
                >
                  {savingWarehouse && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  保存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Memory tab */}
        <TabsContent value="memory" className="space-y-4">
          <Card className="bg-background/60 backdrop-blur-md border-border/50">
            <CardHeader>
              <CardTitle className="text-base">记忆设置</CardTitle>
              <CardDescription>
                控制 AI 在上下文中记住多少条历史消息。数值越高提供的上下文越多，但会增加 token 消耗。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingConfig ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载配置中...
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>短期记忆条数</Label>
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

                  <Button onClick={handleSaveMemory} disabled={savingMemory}>
                    {savingMemory && (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    )}
                    <Check className="h-4 w-4 mr-1.5" />
                    保存
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
              {tasks.length} 个定时任务
            </h3>
            <Button size="sm" onClick={openCreateTask}>
              <Plus className="h-4 w-4 mr-1" />
              添加任务
            </Button>
          </div>

          {loadingTasks ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  加载任务中...
                </span>
              </CardContent>
            </Card>
          ) : tasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calendar className="h-8 w-8 mb-2" />
                <p className="text-sm">
                  暂无定时任务，创建一个来自动化盘点。
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
                          {TASK_TYPES.find(t => t.value === task.type)?.label ?? task.type}
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
                          ? `上次：${new Date(task.lastRun).toLocaleString()}`
                          : "从未执行"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={task.enabled}
                        onCheckedChange={() => handleTaskToggle(task)}
                      />
                      <Label className="text-xs text-muted-foreground">
                        {task.enabled ? "启用" : "禁用"}
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
                <DialogTitle>删除任务</DialogTitle>
                <DialogDescription>
                  确定要删除这个定时任务吗？
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteTaskId(null)}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteTaskId && handleDeleteTask(deleteTaskId)
                  }
                >
                  删除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create/Edit task dialog */}
          <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingTask ? "编辑任务" : "添加任务"}
                </DialogTitle>
                <DialogDescription>
                  为该仓库安排一个自动化任务。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="task-type">类型</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger id="task-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-cron">执行周期</Label>
                  <Input
                    id="task-cron"
                    value={taskCron}
                    onChange={(e) => setTaskCron(e.target.value)}
                    placeholder="e.g. 0 9 * * *"
                  />
                  <p className="text-xs text-muted-foreground">
                    标准 cron 格式：分钟 小时 日 月 星期
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="task-enabled"
                    checked={taskEnabled}
                    onCheckedChange={setTaskEnabled}
                  />
                  <Label htmlFor="task-enabled">已启用</Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setTaskDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSaveTask}
                  disabled={!taskCron.trim() || savingTask}
                >
                  {savingTask && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  {editingTask ? "保存更改" : "创建"}
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
                AI 回复语言
              </CardTitle>
              <CardDescription>
                选择 AI 助手的回复语言。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>语言</Label>
                <Select
                  value={language}
                  onValueChange={handleLanguageChange}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
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
