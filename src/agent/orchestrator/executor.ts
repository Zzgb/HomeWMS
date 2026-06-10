import type { CallStep, ToolResult, OrchestratorOutput } from "./types";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/agent/router";

export async function executePlan(
  tools: Record<string, any>,
  plan: CallStep[],
  modelId: string
): Promise<OrchestratorOutput> {
  const results: ToolResult[] = [];

  for (const step of plan) {
    const tool = tools[step.toolName];
    if (!tool) {
      return {
        toolResults: results,
        success: false,
        errorMessage: `Tool "${step.toolName}" not found`,
      };
    }

    const args = step.argsBuilder(results);
    const attempt = await callTool(tool, step.toolName, args);
    results.push(attempt);

    // findItem fallback: no exact match. Try LLM resolution.
    if (step.toolName === "findItem" && isFallback(attempt)) {
      const keyword = args.keyword as string;
      const items = (attempt.result as any).items as any[];
      const resolved = await resolveItemName(items, keyword, modelId);

      if (resolved) {
        console.log(`[Orchestrator] Resolved "${keyword}" → "${resolved}"`);
        // Replace the fallback result with a focused single-item result
        const matched = items.find((i: any) => i.name === resolved);
        results[results.length - 1] = {
          toolName: "findItem",
          args,
          result: {
            found: true,
            keyword,
            items: [matched],
            total: 1,
            resolved: true,
          },
          success: true,
        };
        continue; // proceed to mutation step — pickName/pickSpot will match exactly now
      }

      // Can't resolve — stop, let Layer 4 present the list
      console.log(`[Orchestrator] Could not resolve "${keyword}" — stopping plan`);
      return {
        toolResults: results,
        success: false,
        errorMessage: `findItem fallback: cannot resolve "${keyword}"`,
        fallback: true,
      };
    }

    // If step failed and is the findItem step, stop
    if (!attempt.success && step.toolName === "findItem") {
      return { toolResults: results, success: false, errorMessage: "findItem failed" };
    }

    // If consume/stockIn/move/delete fails, try once with adjusted args
    if (!attempt.success && step.toolName !== "findItem") {
      const adjustedArgs = retryArgs(step.toolName, attempt);
      if (adjustedArgs) {
        const retry = await callTool(tool, step.toolName, adjustedArgs);
        results.push(retry);
      }
    }
  }

  const allSuccess = results.every((r) => r.success);
  return { toolResults: results, success: allSuccess };
}

function isFallback(tr: ToolResult): boolean {
  return (tr.result as any)?.fallback === true && Array.isArray((tr.result as any)?.items) && (tr.result as any).items.length > 0;
}

async function callTool(
  tool: any,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const result = await tool.execute(args);
    return {
      toolName,
      args,
      result,
      success: result?.success !== false,
    };
  } catch (error: any) {
    return {
      toolName,
      args,
      result: { message: error?.message || "Tool execution error" },
      success: false,
    };
  }
}

function retryArgs(
  toolName: string,
  failedResult: ToolResult
): Record<string, unknown> | null {
  const suggestions = (failedResult.result as any)?.suggestions;
  if (suggestions?.length === 1 && typeof suggestions[0] === "string") {
    return { ...failedResult.args, itemName: suggestions[0] };
  }
  return null;
}

async function resolveItemName(
  items: any[],
  keyword: string,
  modelId: string
): Promise<string | null> {
  if (!keyword || items.length === 0) return null;

  const names = items.map((i: any) => i.name);

  // Quick check: exact match (already would have been caught, but safety)
  const exact = names.find((n: string) => n.toLowerCase() === keyword.toLowerCase());
  if (exact) return exact;

  // Quick check: item name contains keyword or vice versa
  const contains = names.find((n: string) =>
    n.toLowerCase().includes(keyword.toLowerCase()) ||
    keyword.toLowerCase().includes(n.toLowerCase())
  );
  if (contains) return contains;

  // LLM resolution: map keyword to the most likely item name
  // Only for reasonable list sizes (avoid burning tokens on huge catalogs)
  if (names.length > 50) return null;

  try {
    const model = getModel(modelId);
    const { object } = await generateObject({
      model,
      schema: z.object({
        name: z.string().nullable(),
        confidence: z.enum(["high", "low"]),
      }),
      prompt: [
        `User keyword: "${keyword}"`,
        `Available items: ${names.join(", ")}`,
        `Which item name best matches the user's keyword?`,
        `- If the keyword is a Chinese translation (e.g. "鸡蛋" → "Eggs", "牛奶" → "Milk"), pick the equivalent English name.`,
        `- If no item matches, return null.`,
        `- If the match is clear, set confidence "high". If uncertain, set confidence "low".`,
      ].join("\n"),
      temperature: 0,
    });

    if (object.confidence === "high" && object.name && names.includes(object.name)) {
      return object.name;
    }
    return null;
  } catch (error) {
    console.error("[Orchestrator] Name resolution failed:", error);
    return null;
  }
}
