# Architecture Documentation

## Overview

The Code Context MCP Server is designed to provide AI agents with instant, comprehensive code context without requiring manual file-by-file exploration. It uses a combination of static analysis, AST parsing, and fast search tools to build and query a symbol index.

## Core Components

### 1. Parsers (`src/parsers/`)

**Purpose**: Parse source code files into Abstract Syntax Trees (AST) and extract symbols.

**Components**:
- `BaseParser.ts`: Abstract base class for all language parsers
- `TypeScriptParser.ts`: Handles TS/JS/TSX/JSX files
- `PythonParser.ts`: Handles Python files
- `JavaParser.ts`: Handles Java files
- `ParserFactory.ts`: Factory for creating appropriate parsers

**Technology**: Tree-sitter (multi-language parser framework)

**Key Operations**:
- Parse file into AST
- Extract symbols (functions, classes, methods, variables, etc.)
- Identify imports and exports
- Capture symbol signatures and metadata

### 2. Indexer (`src/indexer/`)

**Purpose**: Build and maintain a searchable index of all symbols in the codebase.

**Components**:
- `SymbolIndexer.ts`: Main indexing system

**Data Structures**:
```typescript
{
  symbols: Map<string, Symbol[]>,        // Symbol name → Symbol objects
  fileSymbols: Map<string, Symbol[]>,    // File path → Symbols in that file
  locations: Map<string, Symbol>,        // Location key → Symbol
  fileContexts: Map<string, FileContext> // File path → File context
}
```

**Key Operations**:
- Index individual files or entire directories
- Fast symbol lookup by name
- Find symbols by location (file, line, column)
- Search symbols by pattern
- Track file-level context (imports, exports, structure)

### 3. Analyzer (`src/analyzer/`)

**Purpose**: Analyze code relationships, dependencies, and call chains.

**Components**:
- `CodeAnalyzer.ts`: Main analysis engine

**Key Operations**:
- Analyze symbol context (definition + references + callers + callees)
- Find all references using ripgrep
- Build call chains (who calls what)
- Identify dependencies (what a symbol uses)
- Find related symbols (parameters, return types, container classes)

**Algorithm for Call Chain**:
```
buildCallChain(symbol, direction, maxDepth):
  if maxDepth reached or symbol visited:
    return null

  mark symbol as visited
  node = { symbol, depth, children: [] }

  if direction == 'callers':
    for each reference to symbol:
      find containing function
      recursively build chain for caller
      add to children

  if direction == 'callees':
    extract function calls from symbol's definition
    for each called function:
      recursively build chain for callee
      add to children

  return node
```

### 4. Tools (`src/tools/`)

**Purpose**: Expose high-level tools for MCP consumption.

**Components**:
- `CodeContextTools.ts`: MCP tool implementations with caching

**Available Tools**:
1. `get_code_context`: Comprehensive symbol analysis
2. `find_symbol`: Symbol search
3. `get_file_context`: File-level context
4. `analyze_call_chain`: Call chain analysis
5. `reindex_workspace`: Force reindex
6. `get_index_stats`: Index statistics

**Caching Strategy**:
- Code context cache: 10-minute TTL, 100 entries max
- Symbol search cache: 10-minute TTL, 100 entries max
- File context cache: 15-minute TTL, 50 entries max
- LRU eviction when cache is full

### 5. Utilities (`src/utils/`)

**Purpose**: Common utilities for file operations and search.

**Components**:
- `fileUtils.ts`: File system operations, language detection
- `ripgrepUtils.ts`: Fast reference finding using ripgrep

**Language Detection**:
```
.ts → TypeScript
.tsx → TSX
.js/.mjs/.cjs → JavaScript
.jsx → JSX
.py → Python
.java → Java
```

**Reference Finding Strategy**:
1. Try ripgrep (if available) - extremely fast
2. Fall back to grep if ripgrep not found
3. Parse results into Reference objects with context

### 6. Cache (`src/cache/`)

**Purpose**: Performance optimization through caching.

**Components**:
- `CacheManager.ts`: Generic LRU cache with TTL

**Features**:
- Time-to-live (TTL) for automatic expiration
- Least Recently Used (LRU) eviction
- Hit tracking for statistics
- Configurable max size

### 7. Main Server (`src/index.ts`)

**Purpose**: MCP server entry point that ties everything together.

**Responsibilities**:
- Initialize all components
- Handle MCP protocol communication
- Manage workspace indexing
- Route tool calls to appropriate handlers
- Error handling and logging

**Startup Sequence**:
```
1. Initialize SymbolIndexer
2. Initialize CodeAnalyzer (with indexer + workspace path)
3. Initialize CodeContextTools (with indexer + analyzer)
4. Setup MCP request handlers
5. On first tool call: Index workspace
6. Handle subsequent tool calls with cached index
```

## Data Flow

### Example: get_code_context("functionName")

```
1. MCP Request received by Server
2. Server checks if workspace is indexed
   - If not: Index entire workspace first
3. Server calls CodeContextTools.getCodeContext()
4. CodeContextTools checks cache
   - If cached: Return immediately
5. CodeContextTools calls CodeAnalyzer.analyzeSymbol()
6. CodeAnalyzer:
   a. Finds symbol in SymbolIndexer
   b. Gets definition code from file
   c. Calls RipgrepUtils to find all references
   d. For each reference, identifies caller function
   e. Extracts dependencies from definition code
   f. Finds related symbols (class members, etc.)
   g. Gets file context from SymbolIndexer
7. CodeAnalyzer returns complete CodeContext object
8. CodeContextTools caches result
9. Result serialized to JSON
10. MCP Response sent to client
```

## Performance Considerations

### Indexing
- **Initial index**: O(n) where n = number of files
- **Incremental index**: O(1) per file
- **Optimization**: Batch processing (10 files at a time)
- **Trade-off**: Memory vs. speed (keep entire index in memory)

### Searching
- **Symbol lookup by name**: O(1) via Map
- **Symbol lookup by location**: O(m) where m = symbols in file (typically small)
- **Pattern search**: O(n) where n = total symbols (mitigated by max results limit)
- **Reference finding**: O(1) via ripgrep (extremely fast)

### Caching
- **Cache lookup**: O(1)
- **Cache eviction**: O(n) where n = cache size (infrequent)
- **Expiration**: Lazy (checked on access)

## Scalability

### Memory Usage
- **Symbol index**: ~1-2KB per symbol
- **Typical project** (1000 symbols): ~2MB
- **Large project** (10,000 symbols): ~20MB
- **Cache overhead**: Negligible (~1-5MB)

### Time Complexity
| Operation | Time Complexity | Typical Time |
|-----------|----------------|--------------|
| Initial index | O(n files) | 2-5 seconds |
| Symbol lookup | O(1) | <1ms |
| Reference find | O(log n) | 10-50ms |
| Code context | O(r) where r = refs | 20-100ms |
| Call chain | O(d^b) where d=depth, b=branching | 50-500ms |

### Optimization Strategies
1. **Lazy indexing**: Only index on first tool call
2. **Caching**: Reduce repeated analysis
3. **Ripgrep**: External tool optimized for search
4. **Tree-sitter**: Fast, incremental parsing
5. **Batch processing**: Index multiple files in parallel

## Extensibility

### Adding New Languages

1. **Install tree-sitter grammar**:
   ```bash
   npm install tree-sitter-<language>
   ```

2. **Create parser** (`src/parsers/<Language>Parser.ts`):
   ```typescript
   export class LanguageParser extends BaseParser {
     language = Language.YourLanguage;

     constructor() {
       super(YourLanguageGrammar);
     }

     protected walkTree(node, filePath, content, symbols, imports, exports) {
       // Implement AST walking logic
     }
   }
   ```

3. **Update ParserFactory**:
   ```typescript
   case Language.YourLanguage:
     parser = new LanguageParser();
     break;
   ```

4. **Update FileUtils** for language detection

### Adding New Tools

1. **Define types** in `src/types/index.ts`:
   ```typescript
   export interface YourToolInput { ... }
   export interface YourToolOutput { ... }
   ```

2. **Implement in CodeContextTools**:
   ```typescript
   async yourTool(input: YourToolInput): Promise<YourToolOutput> {
     // Implementation
   }
   ```

3. **Add handler in main server**:
   ```typescript
   case 'your_tool':
     return await this.handleYourTool(args);
   ```

4. **Add tool definition** to `getToolDefinitions()`

## Error Handling

### Strategy
- **Graceful degradation**: Continue on parse errors
- **Error isolation**: Per-file errors don't break indexing
- **Logging**: Console.error for debugging (MCP stderr)
- **Result objects**: Always return success/error structure

### Common Errors
- **File not found**: Return empty result
- **Parse error**: Log and skip file
- **Unsupported language**: Warn and skip
- **Ripgrep not found**: Fall back to grep

## Security Considerations

- **File access**: Limited to WORKSPACE_PATH
- **No execution**: Only static analysis
- **No network**: Fully offline tool
- **Input validation**: Symbol names sanitized for regex

## Future Enhancements

1. **Watch mode**: Auto-reindex on file changes
2. **Incremental indexing**: Only reindex changed files
3. **Semantic analysis**: Type inference, data flow
4. **Cross-repository**: Index dependencies (node_modules)
5. **LSP integration**: Use existing language servers
6. **Persistent cache**: Save index to disk
7. **More languages**: Go, Rust, C++, C#, Ruby, PHP
8. **Graph database**: Store relationships in Neo4j
9. **Fuzzy search**: Better symbol matching
10. **Documentation extraction**: Parse JSDoc/docstrings
