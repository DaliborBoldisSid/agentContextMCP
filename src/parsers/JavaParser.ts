/**
 * Java parser using tree-sitter
 */

import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import { BaseParser } from './BaseParser.js';
import {
  Language,
  Symbol as CodeSymbol,
  SymbolType,
  ParseResult,
} from '../types/index.js';

export class JavaParser extends BaseParser {
  language = Language.Java;

  constructor() {
    super(Java);
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
      case 'method_declaration':
        this.processMethodDeclaration(node, filePath, content, symbols);
        break;

      case 'class_declaration':
        this.processClassDeclaration(node, filePath, content, symbols);
        break;

      case 'interface_declaration':
        this.processInterfaceDeclaration(node, filePath, content, symbols);
        break;

      case 'enum_declaration':
        this.processEnumDeclaration(node, filePath, content, symbols);
        break;

      case 'field_declaration':
        this.processFieldDeclaration(node, filePath, content, symbols);
        break;

      case 'import_declaration':
        this.processImport(node, filePath, content, imports);
        break;
    }
  }

  private processMethodDeclaration(
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
      if (parent.type === 'class_declaration' || parent.type === 'interface_declaration') {
        const classNameNode = parent.childForFieldName('name');
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
    const modifiers = this.extractModifiers(node);

    symbols.push(this.createSymbol(
      name,
      SymbolType.Interface,
      node,
      filePath,
      content,
      undefined,
      modifiers
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
    const modifiers = this.extractModifiers(node);

    symbols.push(this.createSymbol(
      name,
      SymbolType.Enum,
      node,
      filePath,
      content,
      undefined,
      modifiers
    ));
  }

  private processFieldDeclaration(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: CodeSymbol[]
  ): void {
    const declaratorNode = this.findChild(node, 'variable_declarator');
    if (!declaratorNode) return;

    const nameNode = declaratorNode.childForFieldName('name');
    if (!nameNode) return;

    const name = this.extractNodeText(nameNode, content);
    const modifiers = this.extractModifiers(node);

    // Find parent class
    let containerName: string | undefined;
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'class_declaration') {
        const classNameNode = parent.childForFieldName('name');
        if (classNameNode) {
          containerName = this.extractNodeText(classNameNode, content);
          break;
        }
      }
      parent = parent.parent;
    }

    symbols.push(this.createSymbol(
      name,
      SymbolType.Property,
      node,
      filePath,
      content,
      containerName,
      modifiers
    ));
  }

  private processImport(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    imports: ParseResult['imports']
  ): void {
    const importText = this.extractNodeText(node, content);
    const match = importText.match(/import\s+(?:static\s+)?([^;]+);/);

    if (match) {
      const source = match[1].trim();
      const symbols = source.includes('*') ? ['*'] : [source.split('.').pop() || source];

      imports.push({
        source,
        symbols,
        location: this.nodeToLocation(node, filePath),
      });
    }
  }

  private extractModifiers(node: Parser.SyntaxNode): string[] {
    const modifiers: string[] = [];
    const modifierTypes = ['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized'];

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'modifiers') {
        for (let j = 0; j < child.childCount; j++) {
          const modifier = child.child(j);
          if (modifier && modifierTypes.includes(modifier.type)) {
            modifiers.push(modifier.type);
          }
        }
      }
    }

    return modifiers;
  }
}
