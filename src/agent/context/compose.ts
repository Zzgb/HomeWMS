import type { ModelMessage } from "ai";

export function wrapContext(messages: ModelMessage[]): ModelMessage[] {
  return [
    {
      role: "system",
      content: "⬇️ BEGIN REFERENCE CONTEXT — may be wrong. DB results above are authoritative.",
    },
    ...messages,
    {
      role: "system",
      content: "⬆️ END REFERENCE CONTEXT",
    },
  ];
}
