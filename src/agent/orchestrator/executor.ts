import type { CallStep, ToolResult, OrchestratorOutput } from "./types";

export async function executePlan(
  tools: Record<string, any>,
  plan: CallStep[]
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

    // findItem failed entirely (empty warehouse or error)
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
