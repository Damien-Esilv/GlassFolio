import { AIToolDefinition, AIExecutionContext, AIToolParametersSchema } from './types';

/**
 * AIToolRegistry - Central Singleton Registry for GlassFolio AI and MCP Tools.
 * Shared by both the In-App AI Assistant and external MCP Server integrations.
 */
class AIToolRegistry {
  private tools: Map<string, AIToolDefinition> = new Map();

  /**
   * Registers a new AI / MCP tool.
   * If a tool with the same name already exists, it is overwritten.
   */
  public registerTool<TParams = Record<string, unknown>, TResult = unknown>(
    tool: AIToolDefinition<TParams, TResult>
  ): void {
    if (!tool.name) {
      throw new Error('Tool must have a valid name');
    }
    this.tools.set(tool.name, tool as unknown as AIToolDefinition);
  }

  /**
   * Retrieves a registered tool by its unique name.
   */
  public getTool(name: string): AIToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns all registered tools.
   */
  public getAllTools(): AIToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Executes a tool with provided parameters and context.
   */
  public async executeTool(
    name: string,
    params: Record<string, unknown>,
    context: AIExecutionContext = {}
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`AI Tool '${name}' is not registered`);
    }
    return await tool.execute(params, context);
  }

  /**
   * Formats all tools for OpenAI / Groq / OpenRouter / Ollama function calling format.
   */
  public formatToolsForOpenAI(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: AIToolParametersSchema;
    };
  }> {
    return this.getAllTools().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Formats all tools for Anthropic Claude Tools format.
   */
  public formatToolsForAnthropic(): Array<{
    name: string;
    description: string;
    input_schema: AIToolParametersSchema;
  }> {
    return this.getAllTools().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  /**
   * Formats all tools for Model Context Protocol (MCP) Tools format.
   */
  public formatToolsForMCP(): Array<{
    name: string;
    description: string;
    inputSchema: AIToolParametersSchema;
  }> {
    return this.getAllTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    }));
  }

  /**
   * Clears all registered tools (used primarily for test isolation).
   */
  public clear(): void {
    this.tools.clear();
  }
}

export const aiToolRegistry = new AIToolRegistry();
