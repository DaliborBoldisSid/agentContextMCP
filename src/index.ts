#!/usr/bin/env node

/**
 * Code Context MCP Server
 * Provides automatic code context and relationship analysis for AI agents
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { SymbolIndexer } from './indexer/index.js';
import { CodeAnalyzer } from './analyzer/index.js';
import { CodeContextTools } from './tools/index.js';
import { ParserFactory } from './parsers/index.js';
import {
  GetCodeContextInput,
  FindSymbolInput,
  GetFileContextInput,
  AnalyzeCallChainInput,
} from './types/index.js';

/**
 * Main MCP Server class
 */
class CodeContextServer {
  private server: Server;
  private indexer: SymbolIndexer;
  private analyzer: CodeAnalyzer;
  private tools: CodeContextTools;
  private workspacePath: string;
  private isIndexed: boolean = false;

  constructor() {
    this.workspacePath = process.env.WORKSPACE_PATH || process.cwd();

    this.server = new Server(
      {
        name: 'code-context-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize components
    this.indexer = new SymbolIndexer();
    this.analyzer = new CodeAnalyzer(this.indexer, this.workspacePath);
    this.tools = new CodeContextTools(this.indexer, this.analyzer);

    this.setupHandlers();
    this.setupErrorHandling();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Ensure workspace is indexed before any operation
      if (!this.isIndexed) {
        await this.indexWorkspace();
      }

      switch (name) {
        case 'get_code_context':
          return await this.handleGetCodeContext(args as any as GetCodeContextInput);

        case 'find_symbol':
          return await this.handleFindSymbol(args as any as FindSymbolInput);

        case 'get_file_context':
          return await this.handleGetFileContext(args as any as GetFileContextInput);

        case 'analyze_call_chain':
          return await this.handleAnalyzeCallChain(args as any as AnalyzeCallChainInput);

        case 'reindex_workspace':
          return await this.handleReindexWorkspace();

        case 'get_index_stats':
          return await this.handleGetIndexStats();

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Get tool definitions for MCP
   */
  private getToolDefinitions(): Tool[] {
    return [
      {
        name: 'get_code_context',
        description: 'Get comprehensive code context for a symbol including definition, references, callers, callees, and related code. This is the main tool for understanding code relationships.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'The symbol name (function, class, variable, etc.) to analyze',
            },
            filePath: {
              type: 'string',
              description: 'Optional: specific file path to narrow down the search',
            },
            options: {
              type: 'object',
              properties: {
                includeCallers: {
                  type: 'boolean',
                  description: 'Include functions/methods that call this symbol (default: true)',
                },
                includeCallees: {
                  type: 'boolean',
                  description: 'Include functions/methods that this symbol calls (default: true)',
                },
                maxDepth: {
                  type: 'number',
                  description: 'Maximum depth for relationship analysis (default: 3)',
                },
                contextLines: {
                  type: 'number',
                  description: 'Number of context lines around references (default: 3)',
                },
              },
            },
          },
          required: ['symbol'],
        },
      },
      {
        name: 'find_symbol',
        description: 'Search for symbols by name or pattern across the codebase. Useful for discovering available functions, classes, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (symbol name or pattern)',
            },
            type: {
              type: 'string',
              enum: ['function', 'method', 'class', 'interface', 'variable', 'all'],
              description: 'Filter by symbol type (default: all)',
            },
            searchOptions: {
              type: 'object',
              properties: {
                caseSensitive: {
                  type: 'boolean',
                  description: 'Case-sensitive search (default: false)',
                },
                regex: {
                  type: 'boolean',
                  description: 'Use regex pattern matching (default: false)',
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum number of results (default: 100)',
                },
              },
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_file_context',
        description: 'Get file-level context including imports, exports, and main symbols. Useful for understanding file structure and dependencies.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Path to the file',
            },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'analyze_call_chain',
        description: 'Analyze call chains to see who calls a function (callers) or what a function calls (callees). Useful for impact analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'The symbol name to analyze',
            },
            filePath: {
              type: 'string',
              description: 'Optional: specific file path',
            },
            direction: {
              type: 'string',
              enum: ['callers', 'callees', 'both'],
              description: 'Direction of call chain analysis',
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth to traverse (default: 3)',
            },
          },
          required: ['symbol', 'direction'],
        },
      },
      {
        name: 'reindex_workspace',
        description: 'Force reindex the entire workspace. Use this after significant code changes.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_index_stats',
        description: 'Get statistics about the indexed codebase (number of files, symbols, etc.)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * Index workspace on startup
   */
  private async indexWorkspace(): Promise<void> {
    if (this.isIndexed) return;

    console.error(`[Code Context MCP] Indexing workspace: ${this.workspacePath}`);
    const startTime = Date.now();

    try {
      await this.indexer.indexDirectory(this.workspacePath, {
        excludePattern: /(node_modules|\.git|dist|build|coverage)/,
        maxDepth: 10,
      });

      const stats = this.indexer.getStats();
      console.error(
        `[Code Context MCP] Indexed ${stats.totalFiles} files with ${stats.totalSymbols} symbols in ${Date.now() - startTime}ms`
      );

      this.isIndexed = true;
    } catch (error) {
      console.error('[Code Context MCP] Indexing failed:', error);
      throw error;
    }
  }

  /**
   * Handle get_code_context tool call
   */
  private async handleGetCodeContext(input: GetCodeContextInput) {
    const result = await this.tools.getCodeContext(input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Handle find_symbol tool call
   */
  private async handleFindSymbol(input: FindSymbolInput) {
    const result = await this.tools.findSymbol(input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Handle get_file_context tool call
   */
  private async handleGetFileContext(input: GetFileContextInput) {
    const result = await this.tools.getFileContext(input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Handle analyze_call_chain tool call
   */
  private async handleAnalyzeCallChain(input: AnalyzeCallChainInput) {
    const result = await this.tools.analyzeCallChain(input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Handle reindex_workspace tool call
   */
  private async handleReindexWorkspace() {
    console.error('[Code Context MCP] Reindexing workspace...');
    this.indexer.clear();
    this.tools.clearCaches();
    this.isIndexed = false;

    await this.indexWorkspace();

    const stats = this.indexer.getStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Workspace reindexed successfully',
            stats,
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle get_index_stats tool call
   */
  private async handleGetIndexStats() {
    const indexStats = this.indexer.getStats();
    const cacheStats = this.tools.getCacheStats();
    const supportedLanguages = ParserFactory.getSupportedLanguages();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            index: indexStats,
            cache: cacheStats,
            supportedLanguages,
            workspacePath: this.workspacePath,
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[Code Context MCP] Server error:', error);
    };

    process.on('SIGINT', async () => {
      console.error('[Code Context MCP] Shutting down...');
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('[Code Context MCP] Server started successfully');
    console.error(`[Code Context MCP] Workspace: ${this.workspacePath}`);
    console.error('[Code Context MCP] Supported languages:', ParserFactory.getSupportedLanguages().join(', '));
  }
}

// Start the server
const server = new CodeContextServer();
server.start().catch((error) => {
  console.error('[Code Context MCP] Failed to start server:', error);
  process.exit(1);
});
