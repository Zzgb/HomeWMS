// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, ScrollText, Filter, AlertTriangle } from "lucide-react";

interface Store {
  id: string;
  name: string;
  desc?: string | null;
}

interface LogEntry {
  id: string;
  storeId: string;
  itemId?: string | null;
  item?: { id: string; name: string } | null;
  action: string;
  qty?: number | null;
  fromSpot?: string | null;
  toSpot?: string | null;
  note?: string | null;
  createdAt: string;
}

interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
  "": "全部操作",
  in: "入库",
  out: "出库",
  move: "移动",
  adjust: "调整",
  check: "盘点",
  rename: "改名",
};

const ACTION_OPTIONS = [
  { value: "", label: "全部操作" },
  { value: "in", label: "入库" },
  { value: "out", label: "出库" },
  { value: "move", label: "移动" },
  { value: "adjust", label: "调整" },
  { value: "check", label: "盘点" },
  { value: "rename", label: "改名" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function ActionBadge({ action }: { action: string }) {
  const variantMap: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    in: "default",
    out: "destructive",
    move: "secondary",
    adjust: "outline",
    check: "secondary",
    rename: "default",
  };
  return (
    <Badge variant={variantMap[action] ?? "default"} className="text-xs">
      {ACTION_LABELS[action] ?? action}
    </Badge>
  );
}

export default function LogsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 50;

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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

  // Fetch logs
  const fetchLogs = useCallback(() => {
    if (!storeId) return;

    setLoadingLogs(true);
    setLogsError(null);

    const params = new URLSearchParams({
      storeId,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (actionFilter) params.set("action", actionFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    fetch(`/api/logs?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch logs");
        return res.json();
      })
      .then((data: LogsResponse) => {
        setLogs(data.data ?? []);
        setTotalPages(data.totalPages ?? 1);
        setLoadingLogs(false);
      })
      .catch((err) => {
        setLogsError(err.message);
        setLoadingLogs(false);
      });
  }, [storeId, page, actionFilter, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleStoreSelect = useCallback((val: string) => {
    setStoreId(val);
    localStorage.setItem("activeStoreId", val);
    setPage(1);
    setActionFilter("");
    setFromDate("");
    setToDate("");
  }, []);

  const handleApplyFilters = useCallback(() => {
    setPage(1);
    fetchLogs();
  }, [fetchLogs]);

  // Store selector view
  if (!storeId) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <Card className="w-full max-w-md bg-background/60 backdrop-blur-md border-border/50">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center space-y-2">
              <ScrollText className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">选择仓库</h2>
              <p className="text-sm text-muted-foreground">
                选择一个仓库查看操作日志
              </p>
            </div>
            {loadingStores ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  加载仓库中...
                </span>
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-2">
                暂无仓库，请在设置中创建
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
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">操作日志</h1>
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

      {/* Filter bar */}
      <Card className="bg-background/60 backdrop-blur-md border-border/50">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">操作</Label>
              <Select
                value={actionFilter}
                onValueChange={(v: string) => setActionFilter(v)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">开始日期</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-xs w-[160px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">结束日期</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-xs w-[160px]"
              />
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleApplyFilters}
              className="h-8"
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              筛选
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card className="bg-background/60 backdrop-blur-md border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            操作记录
            {logs.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (第 {page} 页 / 共 {totalPages} 页)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载日志中...</span>
            </div>
          ) : logsError ? (
            <div className="flex items-center justify-center py-12 text-destructive gap-1.5">
              <AlertTriangle className="h-5 w-5" />
              <span>加载日志失败：{logsError}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ScrollText className="h-8 w-8 mb-2" />
              <p className="text-sm">暂无操作记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>物品</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>目标</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={log.action} />
                      </TableCell>
                      <TableCell>{log.item?.name ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {log.qty ?? "-"}
                      </TableCell>
                      <TableCell>{log.fromSpot ?? "-"}</TableCell>
                      <TableCell>{log.toSpot ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {log.note ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {logs.length > 0 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
