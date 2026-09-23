export interface OptionalSchema {
  optional(): unknown;
  describe(text: string): OptionalSchema;
  int(): OptionalSchema;
  min(value: number): OptionalSchema;
  positive(): OptionalSchema;
  nonnegative(): OptionalSchema;
}

export interface SchemaBuilder {
  object(shape: Record<string, unknown>): unknown;
  readonly enum: (values: readonly [string, ...string[]]) => OptionalSchema;
  string(): OptionalSchema;
  number(): OptionalSchema;
  boolean(): OptionalSchema;
  array(value: unknown): OptionalSchema;
}

export interface TextComponentConstructor {
  new (text: string, paddingX: number, paddingY: number): unknown;
}

export interface ToolContext {
  readonly sessionManager?: { getSessionId?(): string };
  readonly invokeTool?: (
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal; onUpdate?: unknown },
  ) => Promise<unknown>;
}

export interface CustomMessagePayload {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly attribution: "agent";
}
export interface BeforeAgentStartEvent {
  readonly prompt: string;
}
/**
 * Fired before a tool executes; the handler may block it via ToolCallEventResult.
 * `input` is the raw execution arguments (shape varies by toolName).
 */
export interface ToolCallEvent {
  readonly type: "tool_call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
}
export interface ToolCallEventResult {
  /** If true, block the tool from executing. */
  readonly block?: boolean;
  /** Reason for blocking, returned to the LLM as the failure. */
  readonly reason?: string;
}

export interface ToolDefinition {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: unknown;
  readonly strict?: boolean;
  readonly loadMode?: "discoverable" | "essential";
  readonly execute: (
    toolCallId: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: unknown,
    context?: ToolContext,
  ) => Promise<unknown>;
}

export interface ExtensionAPI {
  readonly zod: SchemaBuilder;
  readonly pi: { readonly Text: TextComponentConstructor; readonly InteractiveMode?: unknown };
  registerTool(tool: ToolDefinition): void;
  registerMessageRenderer(
    customType: string,
    renderer: (_message: unknown, _options: unknown, theme: { fg(color: "accent" | "dim", text: string): string }) => unknown,
  ): void;
  on(event: string, handler: (event: unknown) => unknown): void;
}
