"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Lang = "zh" | "en" | "ja";

const dict: Record<Lang, Record<string, string>> = {
  zh: {
    chat: "对话",
    inventory: "库存",
    logs: "日志",
    settings: "设置",
    "select.warehouse": "选择仓库",
    "no.warehouse": "暂无仓库，请在设置中创建",
    "loading.stores": "加载仓库中...",
    warehouse: "仓库：",
    "ai.chat": "AI 对话",
    "type.message": "输入消息...",
    "ai.thinking": "AI 思考中...",
    "chat.placeholder": "开始与仓库助手对话，例如：「我拿了3节18650电池」",
    "chat.error": "对话出错",
    you: "你",
    assistant: "助手",
    "tool.running": "执行中",
    "tool.done": "完成",
    "tool.error": "出错",
    "tool.args": "参数",
    "tool.result": "结果",
    "inventory.title": "库存",
    "stock.check": "盘点",
    "item.name": "物品",
    "item.category": "分类",
    "item.location": "位置",
    "item.qty": "数量",
    "item.status": "状态",
    "item.updated": "最后更新",
    "logs.title": "操作日志",
    "logs.action": "操作类型",
    "logs.from": "开始日期",
    "logs.to": "结束日期",
    "logs.filter": "筛选",
    "logs.prev": "上一页",
    "logs.next": "下一页",
    "settings.title": "设置",
    "settings.model": "模型",
    "settings.warehouses": "仓库管理",
    "settings.memory": "记忆策略",
    "settings.tasks": "定时任务",
    "settings.language": "语言",
    save: "保存",
    cancel: "取消",
    create: "创建",
    delete: "删除",
    edit: "编辑",
    "config.path": "配置文件：warehouses.json（项目根目录）",
  },
  en: {
    chat: "Chat",
    inventory: "Inventory",
    logs: "Logs",
    settings: "Settings",
    "select.warehouse": "Select a Warehouse",
    "no.warehouse": "No warehouses found. Create one in Settings.",
    "loading.stores": "Loading warehouses...",
    warehouse: "Warehouse:",
    "ai.chat": "AI Chat",
    "type.message": "Type a message...",
    "ai.thinking": "AI is thinking...",
    "chat.placeholder": "Start chatting with your warehouse assistant, e.g. \"I have 5 bottles of milk\"",
    "chat.error": "Chat error",
    you: "You",
    assistant: "Assistant",
    "tool.running": "Running",
    "tool.done": "Done",
    "tool.error": "Error",
    "tool.args": "Args",
    "tool.result": "Result",
    "inventory.title": "Inventory",
    "stock.check": "Stock Check",
    "item.name": "Item",
    "item.category": "Category",
    "item.location": "Location",
    "item.qty": "Qty",
    "item.status": "Status",
    "item.updated": "Last Updated",
    "logs.title": "Activity Logs",
    "logs.action": "Action",
    "logs.from": "From",
    "logs.to": "To",
    "logs.filter": "Filter",
    "logs.prev": "Prev",
    "logs.next": "Next",
    "settings.title": "Settings",
    "settings.model": "Model",
    "settings.warehouses": "Warehouses",
    "settings.memory": "Memory",
    "settings.tasks": "Tasks",
    "settings.language": "Language",
    save: "Save",
    cancel: "Cancel",
    create: "Create",
    delete: "Delete",
    edit: "Edit",
    "config.path": "Config file: warehouses.json（项目根目录）",
  },
  ja: {
    chat: "チャット",
    inventory: "在庫",
    logs: "ログ",
    settings: "設定",
    "select.warehouse": "倉庫を選択",
    "no.warehouse": "倉庫がありません。設定で作成してください。",
    "loading.stores": "読み込み中...",
    warehouse: "倉庫：",
    "ai.chat": "AI チャット",
    "type.message": "メッセージを入力...",
    "ai.thinking": "AIが考えています...",
    "chat.placeholder": "倉庫アシスタントとチャットを始める",
    "chat.error": "チャットエラー",
    you: "あなた",
    assistant: "アシスタント",
    "tool.running": "実行中",
    "tool.done": "完了",
    "tool.error": "エラー",
    "tool.args": "引数",
    "tool.result": "結果",
    "inventory.title": "在庫",
    "stock.check": "在庫チェック",
    "item.name": "アイテム",
    "item.category": "カテゴリ",
    "item.location": "場所",
    "item.qty": "数量",
    "item.status": "状態",
    "item.updated": "最終更新",
    "logs.title": "操作ログ",
    "logs.action": "操作",
    "logs.from": "開始日",
    "logs.to": "終了日",
    "logs.filter": "フィルタ",
    "logs.prev": "前へ",
    "logs.next": "次へ",
    "settings.title": "設定",
    "settings.model": "モデル",
    "settings.warehouses": "倉庫管理",
    "settings.memory": "記憶設定",
    "settings.tasks": "定期タスク",
    "settings.language": "言語",
    save: "保存",
    cancel: "キャンセル",
    create: "作成",
    delete: "削除",
    edit: "編集",
    "config.path": "設定ファイル: warehouses.json（项目根目录）",
  },
};

interface LanguageContextType {
  lang: Lang;
  t: (key: string) => string;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "zh",
  t: (k) => k,
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("language") as Lang;
    if (saved && dict[saved]) setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("language", l);
  };

  const t = (key: string) => dict[lang]?.[key] || dict.zh[key] || key;

  return (
    <LanguageContext.Provider value={{ lang, t, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
