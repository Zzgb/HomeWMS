// @ts-nocheck
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Loader2,
  Send,
  User,
  Bot,
  Package,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Store {
  id: string;
  name: string;
  desc?: string | null;
}

export default function ChatPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [aiName, setAiName] = useState("小鞠");
  const { t } = useT();

  // Regex candidate approval state
  const [pendingCandidates, setPendingCandidates] = useState<any[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  // Cache fallback timestamps per message id so they don't bounce during streaming re-renders
  const fallbackTimestamps = useRef<Map<string, Date>>(new Map());

  // Load stores and read activeStoreId from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("activeStoreId");
    const deploymentMode = localStorage.getItem("deploymentMode") || "local";

    fetch("/api/stores")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch stores");
        return res.json();
      })
      .then((data: Store[]) => {
        // 合并云端连接到stores列表（去重：跳过已在API列表中的ID）
        if (deploymentMode !== "local") {
          const raw = localStorage.getItem("cloud_connections");
          const cloudConns: { id: string; label: string; storeId?: string }[] = raw ? JSON.parse(raw) : [];
          const existingIds = new Set(data.map((s) => s.id));
          const cloudStores: Store[] = cloudConns
            .filter((c) => c.storeId && !existingIds.has(c.storeId))
            .map((c) => ({ id: c.storeId!, name: c.label }));
          data = [...data, ...cloudStores];
        }
        setStores(data);
        // Validate saved storeId exists in loaded stores
        if (saved && data.some((s: Store) => s.id === saved)) {
          setStoreId(saved);
        } else if (saved) {
          // Stale ID — clear it so the selector appears
          localStorage.removeItem("activeStoreId");
          setStoreId(null);
        }
        setLoadingStores(false);
      })
      .catch((err) => {
        setStoreError(err.message);
        setLoadingStores(false);
      });
  }, []);

  const [lang] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("language") || "zh";
    return "zh";
  });

  const chatTransport = useMemo(
    () => storeId ? new DefaultChatTransport({ api: "/api/chat", body: { storeId, language: lang } }) : undefined,
    [storeId, lang]
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
  } = useChat({
    id: storeId || undefined,
    transport: chatTransport,
  });

  // Load chat history when storeId changes
  useEffect(() => {
    if (!storeId) return;
    fetch(`/api/chat/history?storeId=${encodeURIComponent(storeId)}&limit=200`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            aiName: m.aiName,
            parts: [{ type: "text", text: m.content || "" }],
          })));
          // Extract latest aiName from assistant messages
          const lastAssistant = [...data.messages].reverse().find((m: any) => m.role === "assistant" && m.aiName);
          if (lastAssistant?.aiName) setAiName(lastAssistant.aiName);
        }
      })
      .catch(() => {});
  }, [storeId]);

  // ── Load pending regex candidates ──
  const loadCandidates = useCallback(() => {
    if (!storeId) return;
    fetch(`/api/logs?storeId=${encodeURIComponent(storeId)}&action=regex_candidate&pageSize=10`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        const pending = (data.data || []).filter((log: any) => {
          try {
            const note = log.note ? JSON.parse(log.note) : null;
            return note?.status === "pending_approval" || !note?.status;
          } catch { return true; }
        });
        setPendingCandidates(pending);
      })
      .catch(() => {});
  }, [storeId]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  // Reload candidates after each message turn (L5 may have generated new ones)
  useEffect(() => {
    if (status === "ready") {
      setTimeout(() => loadCandidates(), 1500);
    }
  }, [status]);

  async function handleApproveCandidate(logId: string, pattern: string, actionType: string) {
    setApprovingId(logId);
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(storeId!)}/regex/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, action: "approve", pattern, actionType }),
      });
      if (!res.ok) throw new Error("Failed");
      setPendingCandidates((prev) => prev.filter((c) => c.id !== logId));
      toast.success(t("regex.approved"));
    } catch (e: any) {
      console.error("[approve] Failed:", e?.message || e);
      toast.error(t("regex.approveFailed"));
    } finally { setApprovingId(null); }
  }

  async function handleRejectCandidate(logId: string) {
    setApprovingId(logId);
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(storeId!)}/regex/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, action: "reject" }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[reject] HTTP ${res.status}: ${body}`);
        throw new Error(`HTTP ${res.status}`);
      }
      setPendingCandidates((prev) => prev.filter((c) => c.id !== logId));
      toast.success(t("regex.rejected"));
    } catch (e: any) {
      console.error("[reject] Failed:", e?.message || e);
      toast.error(t("regex.rejectFailed"));
    } finally { setApprovingId(null); }
  }

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reload full history from DB (timestamps + correction messages from L5)
  const reloadHistory = useCallback(() => {
    if (!storeId) return;
    fetch(`/api/chat/history?storeId=${encodeURIComponent(storeId)}&limit=200`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            aiName: m.aiName,
            parts: [{ type: "text", text: m.content || "" }],
          })));
          const lastAssistant = [...data.messages].reverse().find((m: any) => m.role === "assistant" && m.aiName);
          if (lastAssistant?.aiName) setAiName(lastAssistant.aiName);
        }
      })
      .catch(() => {});
  }, [storeId, setMessages]);

  // After each turn completes, reload history in two stages:
  // 500ms: pick up DB timestamps (useChat streaming messages lack createdAt)
  // 3000ms: pick up L5 self-correction messages
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (!storeId) return;
    const wasLoading = prevStatusRef.current === "submitted" || prevStatusRef.current === "streaming";
    prevStatusRef.current = status;
    if (!wasLoading || status !== "ready") return;

    const t1 = setTimeout(reloadHistory, 500);
    const t2 = setTimeout(reloadHistory, 1200);
    const t3 = setTimeout(reloadHistory, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [status, storeId, reloadHistory]);

  const handleStoreSelect = useCallback((val: string) => {
    setStoreId(val);
    localStorage.setItem("activeStoreId", val);
  }, []);

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = inputValue.trim();
      if (!text || isLoading || !storeId) return;
      sendMessage({ text });
      setInputValue("");
    },
    [inputValue, isLoading, storeId, sendMessage]
  );

  // Store selector view
  if (!storeId) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <Card className="w-full max-w-md bg-background/60 backdrop-blur-md border-border/50">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center space-y-2">
              <Package className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{t("select.warehouse")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("chat.select.desc")}
              </p>
            </div>
            {loadingStores ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {t("loading.stores")}
                </span>
              </div>
            ) : storeError ? (
              <div className="text-center text-destructive text-sm py-2">
                {t("chat.error")}: {storeError}
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-sm text-muted-foreground">{t("no.warehouse")}</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">{t("settings.title")}</Link>
                </Button>
              </div>
            ) : (
              <Select onValueChange={handleStoreSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("select.warehouse") + "..."} />
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
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStore = stores.find((s) => s.id === storeId);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header with store info */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">{aiName}</h2>
          <Badge variant="secondary" className="text-xs">AI</Badge>
        </div>
        {stores.length > 0 && (
          <Select value={storeId} onValueChange={handleStoreSelect}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
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

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4">
        <div className="space-y-4 py-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="text-center space-y-2">
                <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("chat.placeholder")}
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            // Get text content from text parts
            const textContent = msg.parts
              .filter(
                (part): part is { type: "text"; text: string } =>
                  part.type === "text"
              )
              .map((part) => part.text)
              .join("");

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "flex flex-col gap-1.5 max-w-[85%]",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  {/* Role badge */}
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={
                        msg.role === "user" ? "default" : "secondary"
                      }
                      className="text-xs gap-1"
                    >
                      {msg.role === "user" ? (
                        <User className="h-3 w-3" />
                      ) : (
                        <Bot className="h-3 w-3" />
                      )}
                      {msg.role === "user" ? t("you") : ((msg as any).aiName || "小鞠")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {(() => {
                        const createdAt = (msg as any).createdAt;
                        if (createdAt) return new Date(createdAt).toLocaleString("zh-CN");
                        // Stable fallback: cache first-seen timestamp per message id
                        if (!fallbackTimestamps.current.has(msg.id)) {
                          fallbackTimestamps.current.set(msg.id, new Date());
                        }
                        return fallbackTimestamps.current.get(msg.id)!.toLocaleString("zh-CN");
                      })()}
                    </span>
                  </div>

                  {/* Text content */}
                  {(textContent || (status === "streaming" && msg.role === "assistant" && msg.id === messages[messages.length-1]?.id)) && (
                    <Card
                      className={cn(
                        "max-w-full",
                        msg.role === "user"
                          ? "bg-primary/90 text-primary-foreground backdrop-blur-sm ml-auto"
                          : "bg-card/60 backdrop-blur-sm border-border/50"
                      )}
                    >
                      <CardContent className="p-3 text-sm whitespace-pre-wrap break-words">
                        {textContent}
                        {status === "streaming" && msg.role === "assistant" && msg.id === messages[messages.length-1]?.id && (
                          <span className="animate-pulse">...</span>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            );
          })}

          {/* Placeholder bubble while waiting for first token */}
          {isLoading && messages.length > 0 && messages[messages.length-1]?.role === "user" && (
            <div className="flex gap-3 justify-start">
              <div className="flex flex-col gap-1.5 max-w-[75%] items-start">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Bot className="h-3 w-3" />
                    {aiName}
                  </Badge>
                </div>
                <Card className="w-fit max-w-[75%] bg-card/60 backdrop-blur-sm border-border/50">
                  <CardContent className="p-3 text-sm">
                    <span className="animate-pulse">...</span>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex justify-center">
              <Card className="border-destructive bg-destructive/10">
                <CardContent className="p-3 text-sm text-destructive">
                  {error.message || t("chat.error")}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Pending Regex Candidates */}
          {pendingCandidates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="secondary" className="text-xs gap-1">
                  <Bot className="h-3 w-3" />
                  AI
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t("settings.model.regex.pending")} ({pendingCandidates.length})
                </span>
              </div>
              {pendingCandidates.map((candidate: any) => {
                let note: any = {};
                try { note = candidate.note ? JSON.parse(candidate.note) : {}; } catch {}
                const pattern = note.candidate || "";
                const sourceCases = note.sourceCases || [];
                const actionType = note.actionType || "";
                return (
                  <Card key={candidate.id} className="bg-card/60 backdrop-blur-sm border-border/50">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded break-all">
                          {pattern}
                        </code>
                        {actionType && (
                          <Badge variant="outline" className="text-xs">{actionType}</Badge>
                        )}
                      </div>
                      {sourceCases.length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            {t("settings.model.regex.sourceCases")} ({sourceCases.length})
                          </summary>
                          <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                            {sourceCases.map((c: string, i: number) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={approvingId === candidate.id}
                          onClick={() => handleApproveCandidate(candidate.id, pattern, actionType)}
                        >
                          {approvingId === candidate.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          {t("settings.model.regex.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={approvingId === candidate.id}
                          onClick={() => handleRejectCandidate(candidate.id)}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("settings.model.regex.reject")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <form onSubmit={handleSend} className="flex gap-2">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              isLoading ? t("ai.thinking") : t("type.message")
            }
            disabled={isLoading}
            className="min-h-[80px] max-h-[160px] resize-none"
            rows={1}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { setTimeout(() => { isComposingRef.current = false; }, 0); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend(e as unknown as React.FormEvent);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || isLoading}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
