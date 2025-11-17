/**
 * TypeScript/JavaScript parser using tree-sitter
 */

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import { BaseParser } from './BaseParser.js';
import {
  Language,
  Symbol as CodeSymbol,
  SymbolType,
  ParseResult,
} from '../types/index.js';

export class TypeScriptParser extends BaseParser {
  language: Language;

  constructor(language: Language = Language.TypeScript) {
    const isTSX = language === Language.TSX;
    const languageModule = language === Language.JavaScript || language === Language.JSX
      ? JavaScript
      : isTSX
      ? TypeScript.tsx
      : TypeScript.typescript;

    super(languageModule);
    this.language = language;
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
      case 'function_declaration':
      case 'function_signature':
        this.processFunctionDeclaration(node, filePath, content, symbols);
        break;

      case 'arrow_function':
      case 'function':
        this.processArrowFunction(node, filePath, content, symbols);
        break;

      case 'method_definition':
      case 'method_signature':
        this.processMethodDefinition(node, filePath, content, symbols);
        break;

      case 'class_declaration':
        this.processClassDeclaration(node, filePath, content, symbols);
        break;

      case 'interface_declaration':
        this.processInterfaceDeclaration(node, filePath, content, symbols);
        break;

      case 'type_alias_declaration':
        this.processTypeAlias(node, filePath, content, symbols);
        break;

      case 'enum_declaration':
        this.processEnumDeclaration(node, filePath, content, symbols);
        break;

      case 'variable_declarator':
        this.processVariableDeclarator(node, filePath, content, symbols);
        break;

      case 'lexical_declaration':
      case 'variable_declaration':
        this.processVariableDeclaration(node, filePath, content, symbols);
        break;

      case 'import_statement':
        this.processImport(node, filePath, content, imports);
        break;

      case 'export_statement':
        this.processExport(node, filePath, content, symbols, exports);
        break;

      case 'namespace_declaration':
      case 'module_declaration':
        this.processNamespace(node, filePath, content, symbols);
        break;
    }
  }

  private processFunctionDeclaration(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = this.extractNodeText(nameNode, content);
    const modifiers = this.extractModifiers(node.parent);

    const isAsync = this.hasModifier(node, 'async');
    if (isAsync && !modifiers.includes('async')) {
      modifiers.push('async');
    }

    symbols.push(this.createSymbol(
      name,
      SymbolType.Function,
      node,
      filePath,
      content,
      undefined,
      modifiers
    ));
  }

  private processArrowFunction(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    // Arrow functions are usually assigned to variables
    // We handle them in variable_declarator
  }

  private processMethodDefinition(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = this.extractNodeText(nameNode, content);
    const modifiers = this.extractModifiers(node);

    // Find parent class
    let containerName: string | undefined;
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'class_declaration' || parent.type === 'class_body') {
        const classNode = parent.type === 'class_body' ? parent.parent : parent;
        const classNameNode = classNode?.childForFieldName('name');
        if (classNameNode) {
          containerName = this.extractNodeText(classNameNode, content);
          break;
        }
      }
      parent = parent.parent;
    }

    symbols.push(this.createSymbol(
      name,
      SymbolType.Method,
      node,
      filePath,
      content,
      containerName,
      modifiers
    ));
  }

  private processClassDeclaration(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = this.extractNodeText(nameNode, content);
    const modifiers = this.extractModifiers(node);

    symbols.push(this.createSymbol(
      name,
      SymbolType.Class,
      node,
      filePath,
      content,
      undefined,
      modifiers
    ));
  }

  private processInterfaceDeclaration(
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
      SymbolType.Interface,
      node,
      filePath,
      content,
      undefined,
      ['export']
    ));
  }

  private processTypeAlias(
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
      SymbolType.TypeAlias,
      node,
      filePath,
      content
    ));
  }

  private processEnumDeclaration(
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
      SymbolType.Enum,
      node,
      filePath,
      content
    ));
  }

  private processVariableDeclarator(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const nameNode = node.childForFieldName('name');
    const valueNode = node.childForFieldName('value');

    if (!nameNode) return;

    const name = this.extractNodeText(nameNode, content);

    // Check if it's a function
    let symbolType = SymbolType.Variable;
    if (valueNode) {
      // Check for various function types including React functional components
      if (valueNode.type === 'arrow_function' ||
          valueNode.type === 'function' ||
          valueNode.type === 'function_expression' ||
          // Check if it looks like a React component (starts with capital letter)
          (valueNode.type === 'arrow_function' && /^[A-Z]/.test(name))) {
        symbolType = SymbolType.Function;
      }
    }

    // Get modifiers from parent (const, let, var)
    const modifiers: string[] = [];
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'lexical_declaration' || parent.type === 'variable_declaration') {
        const firstChild = parent.child(0);
        if (firstChild) {
          modifiers.push(firstChild.text);
        }
        break;
      }
      parent = parent.parent;
    }

    symbols.push(this.createSymbol(
      name,
      symbolType,
      node,
      filePath,
      content,
      undefined,
      modifiers
    ));
  }

  private processVariableDeclaration(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    // Handled by variable_declarator
  }

  private processImport(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    imports: ParseResult['imports']
  ): void {
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) return;

    const source = this.extractNodeText(sourceNode, content).replace(/['"]/g, '');
    const importedSymbols: string[] = [];

    // Extract imported symbols
    const clauseNode = node.childForFieldName('clause') || this.findChild(node, 'import_clause');
    if (clauseNode) {
      this.extractImportedSymbols(clauseNode, content, importedSymbols);
    }

    imports.push({
      source,
      symbols: importedSymbols,
      location: this.nodeToLocation(node, filePath),
    });
  }

  private extractImportedSymbols(node: Parser.SyntaxNode, content: string, symbols: string[]): void {
    if (node.type === 'identifier') {
      symbols.push(this.extractNodeText(node, content));
    } else if (node.type === 'named_imports' || node.type === 'namespace_import') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type !== '{' && child.type !== '}' && child.type !== ',') {
          this.extractImportedSymbols(child, content, symbols);
        }
      }
    } else if (node.type === 'import_specifier') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        symbols.push(this.extractNodeText(nameNode, content));
      }
    } else {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          this.extractImportedSymbols(child, content, symbols);
        }
      }
    }
  }

  private processExport(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[],
    exports: CodeSymbol[]
  ): void {
    // Extract exported symbols
    const declarationNode = node.childForFieldName('declaration');
    if (declarationNode) {
      // Direct export like: export function foo() {}
      const nameNode = declarationNode.childForFieldName('name');
      if (nameNode) {
        const name = this.extractNodeText(nameNode, content);
        const exportSymbol = symbols.find(s => s.name === name);
        if (exportSymbol) {
          exports.push(exportSymbol);
        }
      }
    }
  }

  private processNamespace(
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
      SymbolType.Namespace,
      node,
      filePath,
      content
    ));
  }

  private extractModifiers(node: Parser.SyntaxNode | null): string[] {
    if (!node) return [];

    const modifiers: string[] = [];
    const modifierTypes = ['public', 'private', 'protected', 'static', 'readonly', 'async', 'export'];

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && modifierTypes.includes(child.type)) {
        modifiers.push(child.type);
      }
    }

    return modifiers;
  }
}
