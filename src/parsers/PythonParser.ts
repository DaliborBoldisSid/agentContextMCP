/**
 * Python parser using tree-sitter
 */

import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import { BaseParser } from './BaseParser.js';
import {
  Language,
  Symbol as CodeSymbol,
  SymbolType,
  ParseResult,
} from '../types/index.js';

export class PythonParser extends BaseParser {
  language = Language.Python;

  constructor() {
    super(Python);
  }

  protected walkTree(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[],
    imports: ParseResult['imports'],
    exports: CodeSymbol[]
  ): void {
    this.processNode(node, filePath, content, symbols, imports, exports);

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.walkTree(child, filePath, content, symbols, imports, exports);
      }
    }
  }

  private processNode(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[],
    imports: ParseResult['imports'],
    exports: CodeSymbol[]
  ): void {
    switch (node.type) {
      case 'function_definition':
        this.processFunctionDefinition(node, filePath, content, symbols);
        break;

      case 'class_definition':
        this.processClassDefinition(node, filePath, content, symbols);
        break;

      case 'assignment':
        this.processAssignment(node, filePath, content, symbols);
        break;

      case 'import_statement':
      case 'import_from_statement':
        this.processImport(node, filePath, content, imports);
        break;
    }
  }

  private processFunctionDefinition(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = this.extractNodeText(nameNode, content);

    // Check if it's a method (inside a class)
    let containerName: string | undefined;
    let symbolType = SymbolType.Function;
    let parent = node.parent;

    while (parent) {
      if (parent.type === 'class_definition') {
        const classNameNode = parent.childForFieldName('name');
        if (classNameNode) {
          containerName = this.extractNodeText(classNameNode, content);
          symbolType = SymbolType.Method;
          break;
        }
      }
      parent = parent.parent;
    }

    // Check for decorators
    const modifiers: string[] = [];
    const decoratorNodes = this.findChildren(node.parent || node, 'decorator');
    for (const decorator of decoratorNodes) {
      const decoratorText = this.extractNodeText(decorator, content);
      if (decoratorText.includes('@staticmethod')) modifiers.push('static');
      if (decoratorText.includes('@classmethod')) modifiers.push('class');
      if (decoratorText.includes('@property')) modifiers.push('property');
    }

    // Check if async
    if (this.hasModifier(node, 'async')) {
      modifiers.push('async');
    }

    symbols.push(this.createSymbol(
      name,
      symbolType,
      node,
      filePath,
      content,
      containerName,
      modifiers
    ));
  }

  private processClassDefinition(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = this.extractNodeText(nameNode, content);

    symbols.push(this.createSymbol(
      name,
      SymbolType.Class,
      node,
      filePath,
      content
    ));
  }

  private processAssignment(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const leftNode = node.childForFieldName('left');
    const rightNode = node.childForFieldName('right');

    if (!leftNode) return;

    const name = this.extractNodeText(leftNode, content);

    // Check if it's a function assignment (lambda)
    let symbolType = SymbolType.Variable;
    if (rightNode && rightNode.type === 'lambda') {
      symbolType = SymbolType.Function;
    }

    // Only add top-level assignments
    let parent = node.parent;
    let isTopLevel = true;
    while (parent) {
      if (parent.type === 'function_definition' || parent.type === 'class_definition') {
        isTopLevel = false;
        break;
      }
      parent = parent.parent;
    }

    if (isTopLevel) {
      symbols.push(this.createSymbol(
        name,
        symbolType,
        node,
        filePath,
        content
      ));
    }
  }

  private processImport(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    imports: ParseResult['imports']
  ): void {
    let source = '';
    const importedSymbols: string[] = [];

    if (node.type === 'import_statement') {
      // import module or import module as alias
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        source = this.extractNodeText(nameNode, content);
        importedSymbols.push(source);
      }
    } else if (node.type === 'import_from_statement') {
      // from module import symbol
      const moduleNode = node.childForFieldName('module_name');
      if (moduleNode) {
        source = this.extractNodeText(moduleNode, content);
      }

      // Extract imported names
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'dotted_name' || child?.type === 'identifier') {
          const symbolName = this.extractNodeText(child, content);
          if (symbolName !== source) {
            importedSymbols.push(symbolName);
          }
        }
      }
    }

    if (source) {
      imports.push({
        source,
        symbols: importedSymbols,
        location: this.nodeToLocation(node, filePath),
      });
    }
  }
}
