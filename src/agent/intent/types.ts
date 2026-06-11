export type Intent =
  | { type: "query"; keyword?: string }
  | { type: "mutate"; action: "consume" | "stockIn" | "move" | "delete"; keyword: string; qty?: number; target?: string }
  | { type: "restructure"; keyword: string; splits?: { newName: string; qty: number }[] }
  | { type: "rename"; newName: string }
  | { type: "chat" };
