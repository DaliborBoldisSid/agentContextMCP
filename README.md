# Code Context MCP Server

An advanced Model Context Protocol (MCP) server that provides automatic code context and relationship analysis for AI agents. This tool helps AI assistants quickly understand code structure, dependencies, and relationships without manually reading files one by one.

## Features

- **Multi-language Support**: TypeScript, JavaScript, TSX, JSX, Python, Java, and more
- **Comprehensive Code Analysis**:
  - Symbol definitions and signatures
  - All references and usages
  - Caller/callee relationships
  - Import/export tracking
  - Call chain analysis
- **Fast Performance**:
  - Tree-sitter based AST parsing
  - Ripgrep for lightning-fast reference finding
  - Intelligent caching layer
- **Rich Context**: Returns everything an AI needs to understand code relationships instantly

## Why This Tool?

When AI agents work with codebases, they often need to:
1. Find where a function is defined
2. See all places it's called from
3. Understand what it calls internally
4. Know related types, parameters, return values

Without this tool, agents must manually read files one by one. With this tool, agents get **instant, comprehensive context** about any code symbol.

## Use Cases

### 1. Function Signature Changes
**Before**: Agent updates function signature, then reads each file to update call sites.

**With Code Context MCP**: Agent sees all call sites immediately and can decide to use default parameters instead of updating every call.

### 2. Impact Analysis
**Before**: "What breaks if I change this function?" requires manual file exploration.

**With Code Context MCP**: Instantly see complete call chain and all dependents.

### 3. Understanding Vague Requests
**Before**: "Fix the authentication bug" - agent searches blindly.

**With Code Context MCP**: Agent gets file context, related functions, and structure instantly.

## Installation

```bash
npm install
npm run build
```

## MCP Configuration

Add to your MCP settings file (e.g., Claude Desktop config):

```json
{
  "mcpServers": {
    "code-context": {
      "command": "node",
      "args": ["/path/to/code-context-mcp-server/dist/index.js"],
      "env": {
        "WORKSPACE_PATH": "/path/to/your/project"
      }
    }
  }
}
```

Or run standalone:

```bash
WORKSPACE_PATH=/path/to/project node dist/index.js
```

## Available Tools

### 1. `get_code_context`

Get comprehensive context for a symbol including definition, references, callers, and callees.

**Input:**
```json
{
  "symbol": "functionName",
  "filePath": "optional/specific/file.ts",
  "options": {
    "includeCallers": true,
    "includeCallees": true,
    "maxDepth": 3,
    "contextLines": 3
  }
}
```

**Output:**
```json
{
  "success": true,
  "context": {
    "symbol": {
      "name": "functionName",
      "type": "function",
      "location": { ... },
      "signature": "function functionName(arg1: string): void",
      "language": "typescript"
    },
    "definition": {
      "code": "...",
      "location": { ... }
    },
    "references": [
      {
        "location": { ... },
        "context": "line of code with reference",
        "isDefinition": false,
        "isWrite": false
      }
    ],
    "callers": [
      {
        "location": { ... },
        "callerSymbol": "ClassName.methodName",
        "context": "..."
      }
    ],
    "callees": [
      {
        "symbol": { ... },
        "type": "calls",
        "location": { ... }
      }
    ],
    "relatedSymbols": [ ... ],
    "fileContext": {
      "imports": [ ... ],
      "exports": [ ... ],
      "structure": { ... }
    }
  },
  "metadata": {
    "totalReferences": 15,
    "totalCallers": 5,
    "totalCallees": 8,
    "analysisTimeMs": 45
  }
}
```

**Example Use:**
```
Agent: "I need to change the arguments for calculateTotal function"
*Calls get_code_context with symbol="calculateTotal"*
Agent receives: definition, all 23 call sites, what it calls internally
Agent: "I see it's called in 23 places. I'll add a default parameter instead of updating all calls."
```

### 2. `find_symbol`

Search for symbols by name or pattern.

**Input:**
```json
{
  "query": "calculate",
  "type": "function",
  "searchOptions": {
    "maxResults": 50
  }
}
```

**Output:**
```json
{
  "success": true,
  "symbols": [
    {
      "name": "calculateTotal",
      "type": "function",
      "location": { ... },
      "signature": "...",
      "language": "typescript"
    }
  ],
  "metadata": {
    "totalMatches": 12,
    "searchTimeMs": 20
  }
}
```

### 3. `get_file_context`

Get file-level context including imports, exports, and structure.

**Input:**
```json
{
  "filePath": "src/utils/math.ts"
}
```

**Output:**
```json
{
  "success": true,
  "context": {
    "filePath": "src/utils/math.ts",
    "language": "typescript",
    "imports": [
      {
        "source": "./types",
        "symbols": ["MathOptions", "Result"],
        "location": { ... }
      }
    ],
    "exports": [ ... ],
    "mainSymbols": [ ... ],
    "structure": {
      "classes": [ ... ],
      "functions": [ ... ],
      "variables": [ ... ],
      "interfaces": [ ... ]
    }
  }
}
```

### 4. `analyze_call_chain`

Analyze call chains to see relationships between functions.

**Input:**
```json
{
  "symbol": "processData",
  "direction": "both",
  "maxDepth": 3
}
```

**Output:**
```json
{
  "success": true,
  "chain": {
    "symbol": { ... },
    "depth": 0,
    "children": [
      {
        "symbol": { ... },
        "depth": 1,
        "callSite": { ... },
        "children": [ ... ]
      }
    ]
  },
  "metadata": {
    "totalNodes": 47,
    "maxDepth": 3,
    "analysisTimeMs": 120
  }
}
```

### 5. `reindex_workspace`

Force reindex the workspace after significant changes.

**Input:** `{}`

### 6. `get_index_stats`

Get statistics about the indexed codebase.

**Output:**
```json
{
  "success": true,
  "index": {
    "totalSymbols": 1523,
    "totalFiles": 243,
    "symbolsByType": {
      "function": 456,
      "class": 123,
      "method": 678,
      "variable": 266
    }
  },
  "cache": { ... },
  "supportedLanguages": ["typescript", "javascript", "python", "java"],
  "workspacePath": "/path/to/workspace"
}
```

## Example Scenarios

### Scenario 1: Modifying a Public Function

**User Request:** "Change `authenticateUser` to also accept an optional `role` parameter"

**Without Code Context MCP:**
1. Find function definition
2. Modify signature
3. Search for all usages (manual file reading)
4. Update each call site one by one

**With Code Context MCP:**
1. Call `get_code_context` with `symbol="authenticateUser"`
2. See 47 call sites instantly
3. Analyze that most don't need role
4. Add default parameter `role?: string`
5. Only update the 3 calls that need it

### Scenario 2: Understanding Complex Dependencies

**User Request:** "What happens when `saveData` is called?"

**Agent:**
```
1. get_code_context(symbol="saveData", options={ includeCallees: true, maxDepth: 2 })
2. Receives complete tree: saveData → validateData → checkSchema → ...
3. Provides clear explanation of data flow
```

### Scenario 3: Impact Analysis

**User Request:** "Is it safe to rename `formatCurrency`?"

**Agent:**
```
1. get_code_context(symbol="formatCurrency")
2. See all 8 files that reference it
3. Check if it's exported (yes)
4. Check external dependencies
5. Inform user: "It's exported in 2 places, affecting 8 files. I can safely rename with proper imports."
```

## Performance

- **Initial Index**: ~2-5 seconds for a typical project (depends on size)
- **Query Time**: 10-100ms for most operations
- **Cache Hit**: <5ms for repeated queries
- **Incremental Updates**: Files can be re-indexed individually

## Architecture

```
┌─────────────────────────────────────────┐
│         MCP Server (index.ts)           │
│  (Exposes tools via MCP protocol)       │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌─────────┐  ┌─────────┐  ┌──────────┐
│ Indexer │  │Analyzer │  │  Tools   │
│         │  │         │  │          │
│ Symbol  │  │ Call    │  │ Context  │
│ Index   │  │ Chain   │  │ Response │
└────┬────┘  └────┬────┘  └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
    ┌─────────┐      ┌──────────┐
    │ Parsers │      │ Ripgrep  │
    │ (Tree-  │      │ (Fast    │
    │ sitter) │      │ Search)  │
    └─────────┘      └──────────┘
```

## Supported Languages

- TypeScript (.ts)
- JavaScript (.js, .mjs, .cjs)
- TSX (.tsx) - React TypeScript
- JSX (.jsx) - React JavaScript
- Python (.py)
- Java (.java)

More languages can be added by implementing parsers using tree-sitter grammars.

## Requirements

- Node.js 18+
- Optional but recommended: `ripgrep` (rg) for faster searches
  - Install: `brew install ripgrep` (macOS) or `apt install ripgrep` (Linux)
  - Falls back to grep if not available

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Test with MCP inspector
npm run inspector
```

## Troubleshooting

### Slow initial indexing
- Normal for large codebases (10k+ files)
- Index is built once and cached
- Use `reindex_workspace` only when needed

### Missing references
- Ensure ripgrep is installed for best results
- Check that file types are supported
- Try `reindex_workspace` if code changed significantly

### Language not supported
- Check `get_index_stats` to see supported languages
- Implement a new parser by extending `BaseParser`

## Contributing

To add support for a new language:

1. Install tree-sitter grammar: `npm install tree-sitter-<language>`
2. Create parser in `src/parsers/<Language>Parser.ts`
3. Extend `BaseParser` class
4. Implement `walkTree` method
5. Add to `ParserFactory`

## License

MIT

## Credits

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [Ripgrep](https://github.com/BurntSushi/ripgrep)
