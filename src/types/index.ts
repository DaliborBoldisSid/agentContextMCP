/**
 * Core type definitions for the Code Context MCP Server
 */

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  filePath: string;
  range: Range;
}

export enum SymbolType {
  Function = 'function',
  Method = 'method',
  Class = 'class',
  Interface = 'interface',
  Variable = 'variable',
  Constant = 'constant',
  Property = 'property',
  Parameter = 'parameter',
  TypeAlias = 'type_alias',
  Enum = 'enum',
  Namespace = 'namespace',
  Import = 'import',
  Export = 'export',
}

export interface Symbol {
  name: string;
  type: SymbolType;
  location: Location;
  containerName?: string; // Parent class/namespace
  signature?: string; // Function signature, type definition, etc.
  documentation?: string;
  modifiers?: string[]; // public, private, static, async, etc.
  language: string;
}

export interface Reference {
  location: Location;
  context: string; // Surrounding code lines
  isDefinition: boolean;
  isWrite: boolean; // For variables
}

export interface CallSite {
  location: Location;
  callerSymbol: string;
  context: string;
  arguments?: string[]; // Parsed arguments if available
}

export interface Dependency {
  symbol: Symbol;
  type: 'calls' | 'extends' | 'implements' | 'imports' | 'uses';
  location: Location;
}

export interface CodeContext {
  symbol: Symbol;
  definition: {
    code: string;
    location: Location;
  };
  references: Reference[];
  callers: CallSite[]; // Who calls this symbol
  callees: Dependency[]; // What this symbol calls/uses
  relatedSymbols: Symbol[]; // Related parameters, return types, etc.
  fileContext: FileContext;
}

export interface FileContext {
  filePath: string;
  language: string;
  imports: {
    source: string;
    symbols: string[];
    location: Location;
  }[];
  exports: Symbol[];
  mainSymbols: Symbol[]; // Top-level functions, classes
  structure: {
    classes: Symbol[];
    functions: Symbol[];
    variables: Symbol[];
    interfaces: Symbol[];
  };
}

export interface SymbolIndex {
  symbols: Map<string, Symbol[]>; // Symbol name -> Symbol[]
  fileSymbols: Map<string, Symbol[]>; // File path -> Symbol[]
  locations: Map<string, Symbol>; // Location key -> Symbol
}

export interface ParseResult {
  symbols: Symbol[];
  imports: FileContext['imports'];
  exports: Symbol[];
  errors?: string[];
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  includePattern?: string; // Glob pattern for files to include
  excludePattern?: string; // Glob pattern for files to exclude
  maxResults?: number;
}

export interface AnalysisOptions {
  includeCallers?: boolean;
  includeCallees?: boolean;
  maxDepth?: number; // For call chain analysis
  includeTests?: boolean;
  contextLines?: number; // Lines of context around references
}

// MCP Tool Input/Output Types

export interface GetCodeContextInput {
  symbol: string;
  filePath?: string; // Optional: narrow down to specific file
  options?: AnalysisOptions;
}

export interface GetCodeContextOutput {
  success: boolean;
  context?: CodeContext;
  error?: string;
  metadata: {
    totalReferences: number;
    totalCallers: number;
    totalCallees: number;
    analysisTimeMs: number;
  };
}

export interface FindSymbolInput {
  query: string;
  type?: SymbolType | 'all';
  searchOptions?: SearchOptions;
}

export interface FindSymbolOutput {
  success: boolean;
  symbols?: Symbol[];
  error?: string;
  metadata: {
    totalMatches: number;
    searchTimeMs: number;
  };
}

export interface GetFileContextInput {
  filePath: string;
  includeSymbols?: boolean;
}

export interface GetFileContextOutput {
  success: boolean;
  context?: FileContext;
  error?: string;
}

export interface AnalyzeCallChainInput {
  symbol: string;
  filePath?: string;
  direction: 'callers' | 'callees' | 'both';
  maxDepth?: number;
}

export interface CallChainNode {
  symbol: Symbol;
  depth: number;
  children: CallChainNode[];
  callSite?: Location;
}

export interface AnalyzeCallChainOutput {
  success: boolean;
  chain?: CallChainNode;
  error?: string;
  metadata: {
    totalNodes: number;
    maxDepth: number;
    analysisTimeMs: number;
  };
}

// Language Support

export enum Language {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  TSX = 'tsx',
  JSX = 'jsx',
  Python = 'python',
  Java = 'java',
  Go = 'go',
  Rust = 'rust',
  C = 'c',
  CPP = 'cpp',
  CSharp = 'csharp',
  Ruby = 'ruby',
  PHP = 'php',
  Unknown = 'unknown',
}

export interface LanguageParser {
  language: Language;
  parse(filePath: string, content: string): Promise<ParseResult>;
  findReferences(symbol: string, content: string): Reference[];
  extractSignature(symbol: Symbol, content: string): string;
}
