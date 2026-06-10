export type Intent =
  | { type: "query"; keyword?: string }
  | { type: "mutate"; action: "consume" | "stockIn" | "move" | "delete"; keyword: string; qty?: number; target?: string }
  | { type: "rename"; newName: string }
  | { type: "chat" }
  | { type: "unknown"; reason: string };
