/**
 * Symbol indexer for building and managing symbol index
 */

import { Symbol as CodeSymbol, SymbolIndex, FileContext } from '../types/index.js';
import { ParserFactory } from '../parsers/index.js';
import { FileUtils } from '../utils/fileUtils.js';

export class SymbolIndexer {
  private symbols: Map<string, CodeSymbol[]> = new Map();
  private fileSymbols: Map<string, CodeSymbol[]> = new Map();
  private locations: Map<string, CodeSymbol> = new Map();
  private fileContexts: Map<string, FileContext> = new Map();

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<void> {
    try {
      const content = await FileUtils.readFileContent(filePath);
      const language = FileUtils.detectLanguage(filePath);
      const parser = ParserFactory.getParser(language);

      if (!parser) {
        console.warn(`No parser available for ${filePath}`);
        return;
      }

      const parseResult = await parser.parse(filePath, content);

      // Store file symbols
      this.fileSymbols.set(filePath, parseResult.symbols);

      // Index symbols by name
      for (const symbol of parseResult.symbols) {
        const existingSymbols = this.symbols.get(symbol.name) || [];
        existingSymbols.push(symbol);
        this.symbols.set(symbol.name, existingSymbols);

        // Index by location
        const locationKey = this.getLocationKey(symbol);
        this.locations.set(locationKey, symbol);
      }

      // Store file context
      const fileContext: FileContext = {
        filePath,
        language,
        imports: parseResult.imports,
        exports: parseResult.exports,
        mainSymbols: parseResult.symbols.filter(s => !s.containerName),
        structure: {
          classes: parseResult.symbols.filter(s => s.type === 'class'),
          functions: parseResult.symbols.filter(s => s.type === 'function'),
          variables: parseResult.symbols.filter(s => s.type === 'variable'),
          interfaces: parseResult.symbols.filter(s => s.type === 'interface'),
        },
      };

      this.fileContexts.set(filePath, fileContext);
    } catch (error) {
      console.error(`Error indexing file ${filePath}:`, error);
    }
  }

  /**
   * Index multiple files
   */
  async indexFiles(filePaths: string[]): Promise<void> {
    const batchSize = 10; // Process files in batches
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      await Promise.all(batch.map(fp => this.indexFile(fp)));
    }
  }

  /**
   * Index entire directory
   */
  async indexDirectory(dirPath: string, options?: {
    includePattern?: RegExp;
    excludePattern?: RegExp;
    maxDepth?: number;
  }): Promise<void> {
    const files = await FileUtils.findSourceFiles(dirPath, options);
    await this.indexFiles(files);
  }

  /**
   * Find symbols by name
   */
  findSymbols(name: string, exactMatch: boolean = false): CodeSymbol[] {
    if (exactMatch) {
      return this.symbols.get(name) || [];
    }

    // Fuzzy match
    const results: CodeSymbol[] = [];
    const lowerName = name.toLowerCase();

    for (const [symbolName, symbols] of this.symbols.entries()) {
      if (symbolName.toLowerCase().includes(lowerName)) {
        results.push(...symbols);
      }
    }

    return results;
  }

  /**
   * Find symbol by location
   */
  findSymbolByLocation(filePath: string, line: number, column: number): CodeSymbol | undefined {
    const fileSymbols = this.fileSymbols.get(filePath) || [];

    for (const symbol of fileSymbols) {
      const { range } = symbol.location;
      if (
        line >= range.start.line &&
        line <= range.end.line &&
        (line > range.start.line || column >= range.start.column) &&
        (line < range.end.line || column <= range.end.column)
      ) {
        return symbol;
      }
    }

    return undefined;
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(filePath: string): CodeSymbol[] {
    return this.fileSymbols.get(filePath) || [];
  }

  /**
   * Get file context
   */
  getFileContext(filePath: string): FileContext | undefined {
    return this.fileContexts.get(filePath);
  }

  /**
   * Get all symbols matching a pattern
   */
  searchSymbols(pattern: RegExp, maxResults: number = 100): CodeSymbol[] {
    const results: CodeSymbol[] = [];

    for (const [name, symbols] of this.symbols.entries()) {
      if (pattern.test(name)) {
        results.push(...symbols);
        if (results.length >= maxResults) break;
      }
    }

    return results.slice(0, maxResults);
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalSymbols: number;
    totalFiles: number;
    symbolsByType: Record<string, number>;
  } {
    let totalSymbols = 0;
    const symbolsByType: Record<string, number> = {};

    for (const symbols of this.symbols.values()) {
      for (const symbol of symbols) {
        totalSymbols++;
        symbolsByType[symbol.type] = (symbolsByType[symbol.type] || 0) + 1;
      }
    }

    return {
      totalSymbols,
      totalFiles: this.fileSymbols.size,
      symbolsByType,
    };
  }

  /**
   * Clear index
   */
  clear(): void {
    this.symbols.clear();
    this.fileSymbols.clear();
    this.locations.clear();
    this.fileContexts.clear();
  }

  /**
   * Remove file from index
   */
  removeFile(filePath: string): void {
    const fileSymbols = this.fileSymbols.get(filePath) || [];

    // Remove symbols from name index
    for (const symbol of fileSymbols) {
      const symbols = this.symbols.get(symbol.name) || [];
      const filtered = symbols.filter(s => s.location.filePath !== filePath);

      if (filtered.length === 0) {
        this.symbols.delete(symbol.name);
      } else {
        this.symbols.set(symbol.name, filtered);
      }

      // Remove from location index
      const locationKey = this.getLocationKey(symbol);
      this.locations.delete(locationKey);
    }

    // Remove file symbols and context
    this.fileSymbols.delete(filePath);
    this.fileContexts.delete(filePath);
  }

  /**
   * Get the index
   */
  getIndex(): SymbolIndex {
    return {
      symbols: this.symbols,
      fileSymbols: this.fileSymbols,
      locations: this.locations,
    };
  }

  /**
   * Generate location key for indexing
   */
  private getLocationKey(symbol: CodeSymbol): string {
    const { filePath, range } = symbol.location;
    return `${filePath}:${range.start.line}:${range.start.column}`;
  }
}
