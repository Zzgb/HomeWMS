// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
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

const ACTION_KEY_MAP: Record<string, string> = {
  "": "logs.action.all",
  in: "logs.action.in",
  out: "logs.action.out",
  move: "logs.action.move",
  adjust: "logs.action.adjust",
  check: "logs.action.check",
  rename: "logs.action.rename",
  expire: "logs.action.expire",
  debug: "logs.action.debug",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function ActionBadge({ action, t }: { action: string; t: (key: string) => string }) {
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
    expire: "destructive",
    debug: "outline",
  };
  return (
    <Badge variant={variantMap[action] ?? "default"} className="text-xs">
      {t(ACTION_KEY_MAP[action] ?? action)}
    </Badge>
  );
}

export default function LogsPage() {
  const { t } = useT();
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
              <h2 className="text-lg font-semibold">{t("select.warehouse")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("logs.select.desc")}
              </p>
            </div>
            {loadingStores ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {t("loading.stores")}
                </span>
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-2">
                {t("no.warehouse")}
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
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{t("logs.title")}</h1>
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
              <Label className="text-xs">{t("logs.action")}</Label>
              <Select
                value={actionFilter}
                onValueChange={(v: string) => setActionFilter(v)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue>
                    {t(ACTION_KEY_MAP[actionFilter] || "logs.action.all")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_KEY_MAP).map(([value, key]) => (
                    <SelectItem key={value} value={value}>
                      {t(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("logs.from")}</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-xs w-[160px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("logs.to")}</Label>
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
              {t("logs.filter")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card className="bg-background/60 backdrop-blur-md border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("logs.records")}
            {logs.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({t("logs.page", { page, total: totalPages })})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{t("loading.logs")}</span>
            </div>
          ) : logsError ? (
            <div className="flex items-center justify-center py-12 text-destructive gap-1.5">
              <AlertTriangle className="h-5 w-5" />
              <span>{t("logs.error")}: {logsError}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ScrollText className="h-8 w-8 mb-2" />
              <p className="text-sm">{t("logs.noRecords")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("logs.time")}</TableHead>
                    <TableHead>{t("logs.action")}</TableHead>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead className="text-right">{t("qty")}</TableHead>
                    <TableHead>{t("logs.source")}</TableHead>
                    <TableHead>{t("logs.target")}</TableHead>
                    <TableHead>{t("logs.note")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={log.action} t={t} />
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
            {t("logs.prev")}
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
            {t("logs.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
