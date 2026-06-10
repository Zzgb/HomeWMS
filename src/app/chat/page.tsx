// @ts-nocheck
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Cache fallback timestamps per message id so they don't bounce during streaming re-renders
  const fallbackTimestamps = useRef<Map<string, Date>>(new Map());

  // Load stores and read activeStoreId from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("activeStoreId");

    fetch("/api/stores")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch stores");
        return res.json();
      })
      .then((data: Store[]) => {
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

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // After each turn completes, reload history to get DB timestamps
  // useChat streaming messages lack createdAt — this fills them in
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (!storeId) return;
    const wasLoading = prevStatusRef.current === "submitted" || prevStatusRef.current === "streaming";
    prevStatusRef.current = status;
    if (!wasLoading || status !== "ready") return;

    const timer = setTimeout(() => {
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
    }, 500);
    return () => clearTimeout(timer);
  }, [status, storeId]);

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
              <h2 className="text-lg font-semibold">选择仓库</h2>
              <p className="text-sm text-muted-foreground">
                选择一个仓库开始对话...
              </p>
            </div>
            {loadingStores ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  加载仓库中...
                </span>
              </div>
            ) : storeError ? (
              <div className="text-center text-destructive text-sm py-2">
                加载仓库失败：{storeError}
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-sm text-muted-foreground">还没有仓库</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">去设置页添加仓库</Link>
                </Button>
              </div>
            ) : (
              <Select onValueChange={handleStoreSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择仓库..." />
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
                  开始与仓库助手对话，例如：「我拿了3节18650电池」
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
                    "flex flex-col gap-1.5 max-w-[75%]",
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
                      {msg.role === "user" ? "你" : ((msg as any).aiName || "小鞠")}
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
                  {textContent && (
                    <Card
                      className={cn(
                        "w-fit max-w-[75%]",
                        msg.role === "user"
                          ? "bg-primary/90 text-primary-foreground backdrop-blur-sm ml-auto"
                          : "bg-card/60 backdrop-blur-sm border-border/50"
                      )}
                    >
                      <CardContent className="p-3 text-sm whitespace-pre-wrap">
                        {textContent}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            );
          })}

          {/* Error display */}
          {error && (
            <div className="flex justify-center">
              <Card className="border-destructive bg-destructive/10">
                <CardContent className="p-3 text-sm text-destructive">
                  {error.message || "对话出错"}
                </CardContent>
              </Card>
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
              isLoading ? "AI 思考中..." : "输入消息..."
            }
            disabled={isLoading}
            className="min-h-[80px] max-h-[160px] resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
