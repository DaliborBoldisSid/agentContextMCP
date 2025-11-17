/**
 * Code analyzer for analyzing relationships, call chains, and dependencies
 */

import {
  Symbol as CodeSymbol,
  Reference,
  CallSite,
  Dependency,
  CodeContext,
  CallChainNode,
  AnalysisOptions,
} from '../types/index.js';
import { SymbolIndexer } from '../indexer/index.js';
import { RipgrepUtils } from '../utils/ripgrepUtils.js';
import { FileUtils } from '../utils/fileUtils.js';

export class CodeAnalyzer {
  constructor(
    private indexer: SymbolIndexer,
    private workspacePath: string
  ) {}

  /**
   * Analyze code context for a symbol
   */
  async analyzeSymbol(
    symbolName: string,
    filePath?: string,
    options: AnalysisOptions = {}
  ): Promise<CodeContext | null> {
    const {
      includeCallers = true,
      includeCallees = true,
      contextLines = 3,
    } = options;

    // Find the symbol
    const symbols = this.indexer.findSymbols(symbolName, true);

    if (symbols.length === 0) {
      return null;
    }

    // If filePath provided, filter to that file
    let targetSymbol = symbols[0];
    if (filePath) {
      const filtered = symbols.find(s => s.location.filePath === filePath);
      if (filtered) targetSymbol = filtered;
    }

    // Get definition code
    const definitionCode = await this.getDefinitionCode(targetSymbol);

    // Find all references
    const references = await this.findReferences(symbolName, contextLines);

    // Analyze callers
    const callers: CallSite[] = [];
    if (includeCallers && (targetSymbol.type === 'function' || targetSymbol.type === 'method')) {
      const callerRefs = references.filter(ref => !ref.isDefinition);
      for (const ref of callerRefs) {
        const caller = await this.analyzeCallSite(ref);
        if (caller) callers.push(caller);
      }
    }

    // Analyze callees
    const callees: Dependency[] = [];
    if (includeCallees && definitionCode) {
      callees.push(...await this.findDependencies(targetSymbol, definitionCode));
    }

    // Find related symbols
    const relatedSymbols = await this.findRelatedSymbols(targetSymbol);

    // Get file context
    const fileContext = this.indexer.getFileContext(targetSymbol.location.filePath);

    return {
      symbol: targetSymbol,
      definition: {
        code: definitionCode || '',
        location: targetSymbol.location,
      },
      references,
      callers,
      callees,
      relatedSymbols,
      fileContext: fileContext || {
        filePath: targetSymbol.location.filePath,
        language: targetSymbol.language,
        imports: [],
        exports: [],
        mainSymbols: [],
        structure: { classes: [], functions: [], variables: [], interfaces: [] },
      },
    };
  }

  /**
   * Analyze call chain
   */
  async analyzeCallChain(
    symbolName: string,
    direction: 'callers' | 'callees' | 'both',
    maxDepth: number = 3,
    filePath?: string
  ): Promise<CallChainNode | null> {
    const symbols = this.indexer.findSymbols(symbolName, true);
    if (symbols.length === 0) return null;

    let targetSymbol = symbols[0];
    if (filePath) {
      const filtered = symbols.find(s => s.location.filePath === filePath);
      if (filtered) targetSymbol = filtered;
    }

    const visited = new Set<string>();

    if (direction === 'both') {
      // Build bidirectional tree
      const callerChain = await this.buildCallChain(targetSymbol, 'callers', maxDepth, visited);
      const calleeChain = await this.buildCallChain(targetSymbol, 'callees', maxDepth, new Set());

      return {
        symbol: targetSymbol,
        depth: 0,
        children: [...(callerChain?.children || []), ...(calleeChain?.children || [])],
      };
    }

    return this.buildCallChain(targetSymbol, direction, maxDepth, visited);
  }

  /**
   * Build call chain recursively
   */
  private async buildCallChain(
    symbol: CodeSymbol,
    direction: 'callers' | 'callees',
    maxDepth: number,
    visited: Set<string>,
    currentDepth: number = 0
  ): Promise<CallChainNode | null> {
    if (currentDepth >= maxDepth) return null;

    const symbolKey = `${symbol.location.filePath}:${symbol.name}`;
    if (visited.has(symbolKey)) return null;

    visited.add(symbolKey);

    const node: CallChainNode = {
      symbol,
      depth: currentDepth,
      children: [],
    };

    if (direction === 'callers') {
      // Find who calls this symbol
      const references = await this.findReferences(symbol.name, 1);
      const callerRefs = references.filter(ref => !ref.isDefinition);

      for (const ref of callerRefs.slice(0, 10)) { // Limit to 10 callers per level
        const callerSymbol = this.indexer.findSymbolByLocation(
          ref.location.filePath,
          ref.location.range.start.line,
          ref.location.range.start.column
        );

        if (callerSymbol) {
          const childNode = await this.buildCallChain(
            callerSymbol,
            direction,
            maxDepth,
            visited,
            currentDepth + 1
          );

          if (childNode) {
            childNode.callSite = ref.location;
            node.children.push(childNode);
          }
        }
      }
    } else {
      // Find what this symbol calls
      const definitionCode = await this.getDefinitionCode(symbol);
      if (definitionCode) {
        const dependencies = await this.findDependencies(symbol, definitionCode);

        for (const dep of dependencies.slice(0, 10)) { // Limit to 10 callees per level
          const childNode = await this.buildCallChain(
            dep.symbol,
            direction,
            maxDepth,
            visited,
            currentDepth + 1
          );

          if (childNode) {
            childNode.callSite = dep.location;
            node.children.push(childNode);
          }
        }
      }
    }

    return node;
  }

  /**
   * Find all references to a symbol
   */
  private async findReferences(symbolName: string, contextLines: number): Promise<Reference[]> {
    return await RipgrepUtils.findReferences(symbolName, this.workspacePath, {
      wholeWord: true,
      caseSensitive: true,
    });
  }

  /**
   * Get definition code for a symbol
   */
  private async getDefinitionCode(symbol: CodeSymbol): Promise<string | null> {
    try {
      const content = await FileUtils.readFileContent(symbol.location.filePath);
      const { range } = symbol.location;

      const lines = content.split('\n');
      const startLine = Math.max(0, range.start.line - 1);
      const endLine = Math.min(lines.length, range.end.line);

      return lines.slice(startLine, endLine).join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Analyze a call site to find the calling function
   */
  private async analyzeCallSite(ref: Reference): Promise<CallSite | null> {
    // Find the enclosing function/method
    const callerSymbol = this.indexer.findSymbolByLocation(
      ref.location.filePath,
      ref.location.range.start.line,
      ref.location.range.start.column
    );

    if (!callerSymbol) {
      // Create anonymous caller
      return {
        location: ref.location,
        callerSymbol: '<anonymous>',
        context: ref.context,
      };
    }

    return {
      location: ref.location,
      callerSymbol: callerSymbol.containerName
        ? `${callerSymbol.containerName}.${callerSymbol.name}`
        : callerSymbol.name,
      context: ref.context,
    };
  }

  /**
   * Find dependencies (what this symbol calls/uses)
   */
  private async findDependencies(
    symbol: CodeSymbol,
    definitionCode: string
  ): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];

    // Get file context to find imported symbols
    const fileContext = this.indexer.getFileContext(symbol.location.filePath);
    if (!fileContext) return dependencies;

    // Find function calls in the definition
    const functionCallPattern = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
    let match;

    while ((match = functionCallPattern.exec(definitionCode)) !== null) {
      const calledName = match[1];

      // Skip common built-ins
      if (['if', 'for', 'while', 'switch', 'return', 'console'].includes(calledName)) {
        continue;
      }

      // Find the called symbol
      const calledSymbols = this.indexer.findSymbols(calledName, true);

      for (const calledSymbol of calledSymbols) {
        // Check if it's in the same file or imported
        const isInSameFile = calledSymbol.location.filePath === symbol.location.filePath;
        const isImported = fileContext.imports.some(imp => imp.symbols.includes(calledName));

        if (isInSameFile || isImported) {
          dependencies.push({
            symbol: calledSymbol,
            type: 'calls',
            location: symbol.location,
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Find related symbols (parameters, return types, etc.)
   */
  private async findRelatedSymbols(symbol: CodeSymbol): Promise<CodeSymbol[]> {
    const related: CodeSymbol[] = [];

    // For methods, include the containing class
    if (symbol.containerName) {
      const containerSymbols = this.indexer.findSymbols(symbol.containerName, true);
      related.push(...containerSymbols.filter(s => s.type === 'class' || s.type === 'interface'));
    }

    // For classes, include methods
    if (symbol.type === 'class') {
      const fileSymbols = this.indexer.getFileSymbols(symbol.location.filePath);
      const methods = fileSymbols.filter(
        s => s.containerName === symbol.name && s.type === 'method'
      );
      related.push(...methods);
    }

    return related;
  }
}
