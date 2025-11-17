/**
 * MCP Tools for code context analysis
 */

import {
  GetCodeContextInput,
  GetCodeContextOutput,
  FindSymbolInput,
  FindSymbolOutput,
  GetFileContextInput,
  GetFileContextOutput,
  AnalyzeCallChainInput,
  AnalyzeCallChainOutput,
  CallChainNode,
} from '../types/index.js';
import { SymbolIndexer } from '../indexer/index.js';
import { CodeAnalyzer } from '../analyzer/index.js';
import { CacheManager } from '../cache/index.js';

export class CodeContextTools {
  private codeContextCache: CacheManager<GetCodeContextOutput>;
  private symbolSearchCache: CacheManager<FindSymbolOutput>;
  private fileContextCache: CacheManager<GetFileContextOutput>;

  constructor(
    private indexer: SymbolIndexer,
    private analyzer: CodeAnalyzer
  ) {
    this.codeContextCache = new CacheManager(100, 10 * 60 * 1000); // 10 min TTL
    this.symbolSearchCache = new CacheManager(100, 10 * 60 * 1000);
    this.fileContextCache = new CacheManager(50, 15 * 60 * 1000); // 15 min TTL
  }

  /**
   * Get comprehensive code context for a symbol
   */
  async getCodeContext(input: GetCodeContextInput): Promise<GetCodeContextOutput> {
    const { symbol, filePath, options = {} } = input;
    const startTime = Date.now();

    // Check cache
    const cacheKey = `${symbol}:${filePath || 'any'}:${JSON.stringify(options)}`;
    const cached = this.codeContextCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          analysisTimeMs: Date.now() - startTime,
        },
      };
    }

    try {
      const context = await this.analyzer.analyzeSymbol(symbol, filePath, options);

      if (!context) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found${filePath ? ` in file '${filePath}'` : ''}`,
          metadata: {
            totalReferences: 0,
            totalCallers: 0,
            totalCallees: 0,
            analysisTimeMs: Date.now() - startTime,
          },
        };
      }

      const output: GetCodeContextOutput = {
        success: true,
        context,
        metadata: {
          totalReferences: context.references.length,
          totalCallers: context.callers.length,
          totalCallees: context.callees.length,
          analysisTimeMs: Date.now() - startTime,
        },
      };

      // Cache the result
      this.codeContextCache.set(cacheKey, output);

      return output;
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to analyze symbol: ${error.message}`,
        metadata: {
          totalReferences: 0,
          totalCallers: 0,
          totalCallees: 0,
          analysisTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Find symbols by name or pattern
   */
  async findSymbol(input: FindSymbolInput): Promise<FindSymbolOutput> {
    const { query, type = 'all', searchOptions = {} } = input;
    const startTime = Date.now();

    // Check cache
    const cacheKey = `${query}:${type}:${JSON.stringify(searchOptions)}`;
    const cached = this.symbolSearchCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          searchTimeMs: Date.now() - startTime,
        },
      };
    }

    try {
      let symbols = this.indexer.findSymbols(query, !searchOptions.regex);

      // Filter by type if specified
      if (type !== 'all') {
        symbols = symbols.filter(s => s.type === type);
      }

      // Limit results
      const maxResults = searchOptions.maxResults || 100;
      symbols = symbols.slice(0, maxResults);

      const output: FindSymbolOutput = {
        success: true,
        symbols,
        metadata: {
          totalMatches: symbols.length,
          searchTimeMs: Date.now() - startTime,
        },
      };

      // Cache the result
      this.symbolSearchCache.set(cacheKey, output);

      return output;
    } catch (error: any) {
      return {
        success: false,
        error: `Search failed: ${error.message}`,
        metadata: {
          totalMatches: 0,
          searchTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Get file context (imports, exports, structure)
   */
  async getFileContext(input: GetFileContextInput): Promise<GetFileContextOutput> {
    const { filePath } = input;

    // Check cache
    const cached = this.fileContextCache.get(filePath);
    if (cached) return cached;

    try {
      const context = this.indexer.getFileContext(filePath);

      if (!context) {
        // File not indexed, index it now
        await this.indexer.indexFile(filePath);
        const newContext = this.indexer.getFileContext(filePath);

        if (!newContext) {
          return {
            success: false,
            error: `Failed to parse file '${filePath}'`,
          };
        }

        const output: GetFileContextOutput = {
          success: true,
          context: newContext,
        };

        this.fileContextCache.set(filePath, output);
        return output;
      }

      const output: GetFileContextOutput = {
        success: true,
        context,
      };

      this.fileContextCache.set(filePath, output);
      return output;
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to get file context: ${error.message}`,
      };
    }
  }

  /**
   * Analyze call chain
   */
  async analyzeCallChain(input: AnalyzeCallChainInput): Promise<AnalyzeCallChainOutput> {
    const { symbol, filePath, direction, maxDepth = 3 } = input;
    const startTime = Date.now();

    try {
      const chain = await this.analyzer.analyzeCallChain(symbol, direction, maxDepth, filePath);

      if (!chain) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          metadata: {
            totalNodes: 0,
            maxDepth: 0,
            analysisTimeMs: Date.now() - startTime,
          },
        };
      }

      const totalNodes = this.countNodes(chain);

      return {
        success: true,
        chain,
        metadata: {
          totalNodes,
          maxDepth,
          analysisTimeMs: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Call chain analysis failed: ${error.message}`,
        metadata: {
          totalNodes: 0,
          maxDepth: 0,
          analysisTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Count total nodes in call chain
   */
  private countNodes(node: CallChainNode): number {
    let count = 1;
    for (const child of node.children) {
      count += this.countNodes(child);
    }
    return count;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.codeContextCache.clear();
    this.symbolSearchCache.clear();
    this.fileContextCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    codeContext: ReturnType<CacheManager<GetCodeContextOutput>['getStats']>;
    symbolSearch: ReturnType<CacheManager<FindSymbolOutput>['getStats']>;
    fileContext: ReturnType<CacheManager<GetFileContextOutput>['getStats']>;
  } {
    return {
      codeContext: this.codeContextCache.getStats(),
      symbolSearch: this.symbolSearchCache.getStats(),
      fileContext: this.fileContextCache.getStats(),
    };
  }
}
