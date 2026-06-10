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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Search, Package, AlertTriangle, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

interface Store {
  id: string;
  name: string;
  desc?: string | null;
}

interface StockItem {
  id: string;
  itemId: string;
  item: { id: string; name: string; category?: string | null };
  spotId: string;
  spot: { id: string; name: string };
  qty: number;
  status: string;
  expiryDate?: string | null;
  updatedAt: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("zh-CN");
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    normal: "正常",
    damaged: "损坏",
    expired: "过期",
  };
  return map[status] ?? status;
}

function StatusBadge({ status, expiryDate }: { status: string; expiryDate?: string | null }) {
  const isExpired = status === "normal" && expiryDate && new Date(expiryDate) < new Date();
  const displayStatus = isExpired ? "expired" : status;

  if (displayStatus === "normal" && !expiryDate) return null;

  const variant =
    displayStatus === "damaged"
      ? "destructive"
      : displayStatus === "expired"
        ? "secondary"
        : "default";
  return <Badge variant={variant}>{statusLabel(displayStatus)}</Badge>;
}

export default function InventoryPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);

  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  // Filter dialog
  const [checkOpen, setCheckOpen] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDays, setFilterDays] = useState("");
  const [dialogKeyword, setDialogKeyword] = useState("");
  const [dialogStatus, setDialogStatus] = useState("");
  const [dialogDays, setDialogDays] = useState("");
  const hasActiveFilter = !!(filterKeyword || filterStatus || filterDays);

  // Create item dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createQty, setCreateQty] = useState("");
  const [createSpot, setCreateSpot] = useState("");
  const [createStatus, setCreateStatus] = useState("normal");
  const [createExpiry, setCreateExpiry] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  // Edit item dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Edit stock dialog
  const [editStockOpen, setEditStockOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<StockItem | null>(null);
  const [editStockQty, setEditStockQty] = useState(0);
  const [editStockStatus, setEditStockStatus] = useState("normal");
  const [editStockExpiry, setEditStockExpiry] = useState("");
  const [editStockSaving, setEditStockSaving] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState<{ id: string; name: string; type: "item" | "stock" } | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

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

  const fetchInventory = useCallback(() => {
    if (!storeId) return;
    setLoadingInventory(true);
    setInventoryError(null);

    fetch(`/api/inventory?storeId=${encodeURIComponent(storeId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch inventory");
        return res.json();
      })
      .then((data: StockItem[]) => {
        setInventory(data);
        setLoadingInventory(false);
      })
      .catch((err) => {
        setInventoryError(err.message);
        setLoadingInventory(false);
      });
  }, [storeId]);

  // Fetch inventory when storeId changes
  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleStoreSelect = useCallback((val: unknown) => {
    setStoreId(val as string);
    localStorage.setItem("activeStoreId", val as string);
  }, []);

  // Create item
  const handleCreateItem = async () => {
    if (!storeId || !createName.trim()) return;
    setCreateSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, name: createName.trim(), category: createCategory.trim() || undefined, desc: createDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "创建失败");

      // If qty and spot provided, also create initial stock
      const qty = Number(createQty) || 0;
      if (qty > 0 && createSpot.trim()) {
        await fetch("/api/inventory", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            id: data.itemId,
            qty,
            spotId: createSpot.trim(),
            status: createStatus,
            expiryDate: createExpiry || null,
          }),
        });
      }

      setCreateOpen(false);
      setCreateName("");
      setCreateCategory("");
      setCreateDesc("");
      setCreateQty("");
      setCreateSpot("");
      setCreateStatus("normal");
      setCreateExpiry("");
      fetchInventory();
    } catch (err: any) {
      alert(err.message || "创建物品失败");
    } finally {
      setCreateSaving(false);
    }
  };

  // Edit item
  const openEditItem = (item: StockItem) => {
    setEditingItem(item);
    setEditName(item.item.name);
    setEditCategory(item.item.category || "");
    setEditDesc("");
    setEditOpen(true);
  };

  const handleEditItem = async () => {
    if (!storeId || !editingItem) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          id: editingItem.itemId,
          name: editName.trim() || undefined,
          category: editCategory.trim() || undefined,
          desc: editDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "更新失败");
      setEditOpen(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err: any) {
      alert(err.message || "更新物品失败");
    } finally {
      setEditSaving(false);
    }
  };

  // Edit stock
  const openEditStock = (item: StockItem) => {
    setEditingStock(item);
    setEditStockQty(item.qty);
    setEditStockStatus(item.status);
    setEditStockExpiry(item.expiryDate ? item.expiryDate.slice(0, 10) : "");
    setEditStockOpen(true);
  };

  const handleEditStock = async () => {
    if (!storeId || !editingStock) return;
    setEditStockSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          id: editingStock.id,
          qty: editStockQty,
          status: editStockStatus,
          expiryDate: editStockExpiry || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "更新失败");
      setEditStockOpen(false);
      setEditingStock(null);
      fetchInventory();
    } catch (err: any) {
      alert(err.message || "更新库存失败");
    } finally {
      setEditStockSaving(false);
    }
  };

  // Delete
  const openDelete = (item: StockItem, type: "item" | "stock") => {
    setDeletingTarget({
      id: type === "item" ? item.itemId : item.id,
      name: type === "item" ? item.item.name : `${item.item.name} @ ${item.spot.name}`,
      type,
    });
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!storeId || !deletingTarget) return;
    setDeleteSaving(true);
    try {
      const res = await fetch(
        `/api/inventory?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(deletingTarget.id)}&type=${deletingTarget.type}`
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "删除失败");
      setDeleteOpen(false);
      setDeletingTarget(null);
      fetchInventory();
    } catch (err: any) {
      alert(err.message || "删除失败");
    } finally {
      setDeleteSaving(false);
    }
  };

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
                选择一个仓库查看库存
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

  // Client-side filtered inventory
  const filteredInventory = inventory.filter((item) => {
    if (filterKeyword && !item.item.name.toLowerCase().includes(filterKeyword.toLowerCase())) return false;
    if (filterStatus) {
      const isExpiredByDate = item.status === "normal" && item.expiryDate && new Date(item.expiryDate) < new Date();
      if (filterStatus === "expired" && !(item.status === "expired" || isExpiredByDate)) return false;
      if (filterStatus === "damaged" && item.status !== "damaged") return false;
      if (filterStatus === "normal" && (item.status !== "normal" || isExpiredByDate)) return false;
    }
    if (filterDays) {
      const days = Number(filterDays);
      if (days > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        if (new Date(item.updatedAt) >= cutoff) return false;
      }
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">库存</h1>
          {currentStore && (
            <p className="text-sm text-muted-foreground">
              {currentStore.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
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
          {/* Refresh button */}
                  {/* Refresh */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchInventory} disabled={loadingInventory}>
            <RefreshCw className={cn("h-4 w-4", loadingInventory && "animate-spin")} />
          </Button>
          {/* New item button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreateName(""); setCreateCategory(""); setCreateDesc("");
              setCreateQty(""); setCreateSpot(""); setCreateStatus("normal"); setCreateExpiry("");
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            新增物品
          </Button>
          <Dialog open={checkOpen} onOpenChange={(open) => {
            if (open) { setDialogKeyword(filterKeyword); setDialogStatus(filterStatus); setDialogDays(filterDays); }
            setCheckOpen(open);
          }}>
            <DialogTrigger className={cn(
              "inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground",
              hasActiveFilter ? "border-primary text-primary bg-primary/10 hover:bg-primary/20" : "border-input bg-background"
            )}>
              <Search className="h-4 w-4 mr-1.5" />
              {hasActiveFilter ? `筛选(${filteredInventory.length}/${inventory.length})` : "筛选"}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>筛选库存</DialogTitle>
                <DialogDescription>按条件过滤库存列表。</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="filter-keyword">物品名称</Label>
                  <Input id="filter-keyword" placeholder="关键字..." value={dialogKeyword} onChange={(e) => setDialogKeyword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-status">状态</Label>
                  <Select value={dialogStatus} onValueChange={(v) => setDialogStatus(v as string)}>
                    <SelectTrigger id="filter-status"><SelectValue placeholder="全部" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部</SelectItem>
                      <SelectItem value="normal">正常</SelectItem>
                      <SelectItem value="damaged">损坏</SelectItem>
                      <SelectItem value="expired">过期</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-days">未更新天数</Label>
                  <Input id="filter-days" type="number" placeholder="不填则不过滤" value={dialogDays} onChange={(e) => setDialogDays(e.target.value)} />
                  <p className="text-xs text-muted-foreground">只显示超过该天数未更新的物品。</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setFilterKeyword(""); setFilterStatus(""); setFilterDays("");
                  setDialogKeyword(""); setDialogStatus(""); setDialogDays("");
                  setCheckOpen(false);
                }}>
                  清除筛选
                </Button>
                <Button onClick={() => {
                  setFilterKeyword(dialogKeyword); setFilterStatus(dialogStatus); setFilterDays(dialogDays);
                  setCheckOpen(false);
                }}>
                  应用
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Inventory table */}
      <Card className="bg-background/60 backdrop-blur-md border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            库存列表
            {inventory.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {filterKeyword || filterStatus
                  ? `(筛选 ${filteredInventory.length}/${inventory.length} 项)`
                  : `(共 ${inventory.length} 项)`}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInventory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载库存中...</span>
            </div>
          ) : inventoryError ? (
            <div className="flex items-center justify-center py-12 text-destructive gap-1.5">
              <AlertTriangle className="h-5 w-5" />
              <span>加载库存失败：{inventoryError}</span>
            </div>
          ) : inventory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="h-8 w-8 mb-2" />
              <p className="text-sm">暂无库存物品</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>物品</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>位置</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>保质期</TableHead>
                    <TableHead>最后更新</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.item.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.item.category || "-"}
                      </TableCell>
                      <TableCell>{item.spot.name}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} expiryDate={item.expiryDate} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.expiryDate
                          ? new Date(item.expiryDate).toLocaleDateString("zh-CN")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(item.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditItem(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditStock(item)}
                          >
                            <Package className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => openDelete(item, "item")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Item Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增物品</DialogTitle>
            <DialogDescription>添加一个新物品到仓库。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">物品名称 *</Label>
              <Input id="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="例如：螺丝刀" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-category">分类</Label>
                <Input id="create-category" value={createCategory} onChange={(e) => setCreateCategory(e.target.value)} placeholder="例如：工具" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-qty">初始数量</Label>
                <Input id="create-qty" type="number" min={0} value={createQty} onChange={(e) => setCreateQty(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-spot">存放位置</Label>
              <Input id="create-spot" value={createSpot} onChange={(e) => setCreateSpot(e.target.value)} placeholder="例如：储物间" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-status">状态</Label>
                <Select value={createStatus} onValueChange={(v) => setCreateStatus(v as string)}>
                  <SelectTrigger id="create-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">正常</SelectItem>
                    <SelectItem value="damaged">损坏</SelectItem>
                    <SelectItem value="expired">过期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-expiry">保质期（可选）</Label>
                <input
                  key={`create-date-${createOpen}`}
                  type="date"
                  defaultValue=""
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  onChange={(e) => setCreateExpiry(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-desc">描述</Label>
              <Input id="create-desc" value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder="可选的描述信息" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateItem} disabled={createSaving || !createName.trim()}>
              {createSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑物品</DialogTitle>
            <DialogDescription>修改物品基本信息。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">物品名称</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">分类</Label>
              <Input
                id="edit-category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">描述</Label>
              <Input
                id="edit-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditItem} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Stock Dialog */}
      <Dialog open={editStockOpen} onOpenChange={setEditStockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑库存</DialogTitle>
            <DialogDescription>
              {editingStock && `${editingStock.item.name} @ ${editingStock.spot.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stock-qty">数量</Label>
              <Input
                id="stock-qty"
                type="number"
                min={0}
                value={editStockQty}
                onChange={(e) => setEditStockQty(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-status">状态</Label>
              <Select value={editStockStatus} onValueChange={(v) => setEditStockStatus(v as string)}>
                <SelectTrigger id="stock-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">正常</SelectItem>
                  <SelectItem value="damaged">损坏</SelectItem>
                  <SelectItem value="expired">过期</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-expiry">保质期</Label>
              <input
                key={`stock-date-${editStockOpen}`}
                type="date"
                defaultValue=""
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                onChange={(e) => setEditStockExpiry(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">可选，留空表示无保质期限制</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStockOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditStock} disabled={editStockSaving}>
              {editStockSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除 {deletingTarget?.type === "item" ? "物品" : "库存"} "{deletingTarget?.name}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSaving}>
              {deleteSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
