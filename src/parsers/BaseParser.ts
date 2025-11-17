/**
 * Base parser class using tree-sitter
 */

import Parser from 'tree-sitter';
import {
  Language,
  LanguageParser,
  ParseResult,
  Symbol as CodeSymbol,
  SymbolType,
  Location,
  Reference,
} from '../types/index.js';
import { FileUtils } from '../utils/fileUtils.js';

export abstract class BaseParser implements LanguageParser {
  protected parser: Parser;
  abstract language: Language;

  constructor(languageModule: any) {
    this.parser = new Parser();
    this.parser.setLanguage(languageModule);
  }

  /**
   * Parse file and extract symbols
   */
  async parse(filePath: string, content: string): Promise<ParseResult> {
    try {
      const tree = this.parser.parse(content);
      const symbols: CodeSymbol[] = [];
      const imports: ParseResult['imports'] = [];
      const exports: CodeSymbol[] = [];

      // Walk the AST
      this.walkTree(tree.rootNode, filePath, content, symbols, imports, exports);

      return {
        symbols,
        imports,
        exports,
      };
    } catch (error: any) {
      return {
        symbols: [],
        imports: [],
        exports: [],
        errors: [error.message],
      };
    }
  }

  /**
   * Walk the AST tree and extract symbols
   */
  protected abstract walkTree(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[],
    imports: ParseResult['imports'],
    exports: CodeSymbol[]
  ): void;

  /**
   * Find references to a symbol in content
   */
  findReferences(symbol: string, content: string): Reference[] {
    const references: Reference[] = [];
    const lines = content.split('\n');
    const regex = new RegExp(`\\b${this.escapeRegex(symbol)}\\b`, 'g');

    lines.forEach((line, index) => {
      let match;
      while ((match = regex.exec(line)) !== null) {
        references.push({
          location: {
            filePath: '',
            range: {
              start: { line: index + 1, column: match.index },
              end: { line: index + 1, column: match.index + symbol.length },
            },
          },
          context: line,
          isDefinition: false,
          isWrite: false,
        });
      }
    });

    return references;
  }

  /**
   * Extract signature from symbol
   */
  extractSignature(symbol: CodeSymbol, content: string): string {
    const { range } = symbol.location;
    const lines = content.split('\n');
    const startLine = Math.max(0, range.start.line - 1);
    const endLine = Math.min(lines.length, range.end.line);

    return lines.slice(startLine, endLine).join('\n');
  }

  /**
   * Helper: Create symbol from node
   */
  protected createSymbol(
    name: string,
    type: SymbolType,
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    containerName?: string,
    modifiers?: string[]
  ): CodeSymbol {
    const location = this.nodeToLocation(node, filePath);
    const signature = this.extractNodeText(node, content);

    return {
      name,
      type,
      location,
      containerName,
      signature,
      modifiers,
      language: this.language,
    };
  }

  /**
   * Helper: Convert tree-sitter node to location
   */
  protected nodeToLocation(node: Parser.SyntaxNode, filePath: string): Location {
    return {
      filePath,
      range: {
        start: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
        },
        end: {
          line: node.endPosition.row + 1,
          column: node.endPosition.column,
        },
      },
    };
  }

  /**
   * Helper: Extract text from node
   */
  protected extractNodeText(node: Parser.SyntaxNode, content: string): string {
    return content.substring(node.startIndex, node.endIndex);
  }

  /**
   * Helper: Find child node by type
   */
  protected findChild(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child?.type === type) return child;
    }
    return null;
  }

  /**
   * Helper: Find all children by type
   */
  protected findChildren(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
    const children: Parser.SyntaxNode[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child?.type === type) children.push(child);
    }
    return children;
  }

  /**
   * Helper: Get node text by field name
   */
  protected getFieldText(node: Parser.SyntaxNode, fieldName: string, content: string): string | null {
    const fieldNode = node.childForFieldName(fieldName);
    return fieldNode ? this.extractNodeText(fieldNode, content) : null;
  }

  /**
   * Helper: Escape regex special characters
   */
  protected escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Helper: Check if node has modifier
   */
  protected hasModifier(node: Parser.SyntaxNode, modifier: string): boolean {
    const parent = node.parent;
    if (!parent) return false;

    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child?.type === modifier) return true;
    }

    return false;
  }
}
