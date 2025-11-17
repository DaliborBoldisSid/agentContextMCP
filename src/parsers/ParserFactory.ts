/**
 * Factory for creating language parsers
 */

import { Language, LanguageParser } from '../types/index.js';
import { TypeScriptParser } from './TypeScriptParser.js';
import { PythonParser } from './PythonParser.js';
import { JavaParser } from './JavaParser.js';
import { FileUtils } from '../utils/fileUtils.js';

export class ParserFactory {
  private static parserCache: Map<Language, LanguageParser> = new Map();

  /**
   * Get parser for a specific language
   */
  static getParser(language: Language): LanguageParser | null {
    // Check cache first
    if (this.parserCache.has(language)) {
      return this.parserCache.get(language)!;
    }

    let parser: LanguageParser | null = null;

    switch (language) {
      case Language.TypeScript:
        parser = new TypeScriptParser(Language.TypeScript);
        break;

      case Language.JavaScript:
        parser = new TypeScriptParser(Language.JavaScript);
        break;

      case Language.TSX:
        parser = new TypeScriptParser(Language.TSX);
        break;

      case Language.JSX:
        parser = new TypeScriptParser(Language.JSX);
        break;

      case Language.Python:
        parser = new PythonParser();
        break;

      case Language.Java:
        parser = new JavaParser();
        break;

      // TODO: Add more language parsers as needed
      // case Language.Go:
      //   parser = new GoParser();
      //   break;

      default:
        return null;
    }

    // Cache the parser
    if (parser) {
      this.parserCache.set(language, parser);
    }

    return parser;
  }

  /**
   * Get parser for a file path
   */
  static getParserForFile(filePath: string): LanguageParser | null {
    const language = FileUtils.detectLanguage(filePath);
    return this.getParser(language);
  }

  /**
   * Check if language is supported
   */
  static isLanguageSupported(language: Language): boolean {
    return this.getParser(language) !== null;
  }

  /**
   * Get all supported languages
   */
  static getSupportedLanguages(): Language[] {
    return [
      Language.TypeScript,
      Language.JavaScript,
      Language.TSX,
      Language.JSX,
      Language.Python,
      Language.Java,
    ];
  }

  /**
   * Clear parser cache
   */
  static clearCache(): void {
    this.parserCache.clear();
  }
}
