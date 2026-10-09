import { describe, it, expect, beforeEach } from 'vitest';
import { aiToolRegistry } from '../../../../src/services/ai/aiToolRegistry';
import { AIToolDefinition } from '../../../../src/services/ai/types';

describe('aiToolRegistry', () => {
  beforeEach(() => {
    aiToolRegistry.clear();
  });

  it('registers and retrieves a tool by name', () => {
    const dummyTool: AIToolDefinition = {
      name: 'test_tool',
      description: 'A test tool for unit tests',
      parameters: {
        type: 'object',
        properties: {
          val: { type: 'string', description: 'value' },
        },
      },
      execute: async (params) => ({ received: params }),
    };

    aiToolRegistry.registerTool(dummyTool);

    const retrieved = aiToolRegistry.getTool('test_tool');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('test_tool');
    expect(retrieved?.description).toBe('A test tool for unit tests');
  });

  it('executes a registered tool correctly', async () => {
    const calcTool: AIToolDefinition<{ a: number; b: number }, { sum: number }> = {
      name: 'add_numbers',
      description: 'Adds two numbers',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'first' },
          b: { type: 'number', description: 'second' },
        },
      },
      execute: async (params) => ({ sum: params.a + params.b }),
    };

    aiToolRegistry.registerTool(calcTool);

    const result = await aiToolRegistry.executeTool('add_numbers', { a: 10, b: 32 });
    expect(result).toEqual({ sum: 42 });
  });

  it('throws when executing an unknown tool', async () => {
    await expect(aiToolRegistry.executeTool('non_existent', {})).rejects.toThrow(
      "AI Tool 'non_existent' is not registered"
    );
  });

  it('correctly formats tools for OpenAI and MCP schemas', () => {
    aiToolRegistry.registerTool({
      name: 'sample_tool',
      description: 'Sample description',
      parameters: {
        type: 'object',
        properties: {
          foo: { type: 'string', description: 'bar' },
        },
      },
      execute: async () => 'ok',
    });

    const openAITools = aiToolRegistry.formatToolsForOpenAI();
    expect(openAITools).toHaveLength(1);
    expect(openAITools[0].type).toBe('function');
    expect(openAITools[0].function.name).toBe('sample_tool');

    const mcpTools = aiToolRegistry.formatToolsForMCP();
    expect(mcpTools).toHaveLength(1);
    expect(mcpTools[0].name).toBe('sample_tool');
    expect(mcpTools[0].inputSchema.properties.foo).toBeDefined();
  });
});
