/**
 * File system utilities
 */

import { readFile, stat, readdir } from 'fs/promises';
import { join, extname, relative, resolve } from 'path';
import { Language } from '../types/index.js';

export class FileUtils {
  /**
   * Detect language from file extension
   */
  static detectLanguage(filePath: string): Language {
    const ext = extname(filePath).toLowerCase();

    const languageMap: Record<string, Language> = {
      '.ts': Language.TypeScript,
      '.tsx': Language.TSX,
      '.js': Language.JavaScript,
      '.jsx': Language.JSX,
      '.mjs': Language.JavaScript,
      '.cjs': Language.JavaScript,
      '.py': Language.Python,
      '.pyw': Language.Python,
      '.java': Language.Java,
      '.go': Language.Go,
      '.rs': Language.Rust,
      '.c': Language.C,
      '.h': Language.C,
      '.cpp': Language.CPP,
      '.cc': Language.CPP,
      '.cxx': Language.CPP,
      '.hpp': Language.CPP,
      '.cs': Language.CSharp,
      '.rb': Language.Ruby,
      '.php': Language.PHP,
    };

    return languageMap[ext] || Language.Unknown;
  }

  /**
   * Read file content with error handling
   */
  static async readFileContent(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  /**
   * Check if file exists and is accessible
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all source files in directory recursively
   */
  static async findSourceFiles(
    dirPath: string,
    options: {
      includePattern?: RegExp;
      excludePattern?: RegExp;
      maxDepth?: number;
    } = {}
  ): Promise<string[]> {
    const { includePattern, excludePattern, maxDepth = 10 } = options;
    const results: string[] = [];

    async function walk(dir: string, depth: number): Promise<void> {
      if (depth > maxDepth) return;

      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          // Skip common ignored directories
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next'].includes(entry.name)) {
              continue;
            }
            await walk(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const lang = FileUtils.detectLanguage(fullPath);

            if (lang === Language.Unknown) continue;
            if (excludePattern && excludePattern.test(fullPath)) continue;
            if (includePattern && !includePattern.test(fullPath)) continue;

            results.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
        console.error(`Error reading directory ${dir}:`, error);
      }
    }

    await walk(dirPath, 0);
    return results;
  }

  /**
   * Normalize file path to absolute path
   */
  static normalizePath(filePath: string, basePath?: string): string {
    if (!basePath) {
      return resolve(filePath);
    }
    return resolve(basePath, filePath);
  }

  /**
   * Get relative path from base
   */
  static getRelativePath(filePath: string, basePath: string): string {
    return relative(basePath, filePath);
  }

  /**
   * Extract lines from content around a specific line number
   */
  static extractContext(
    content: string,
    lineNumber: number,
    contextLines: number = 3
  ): string {
    const lines = content.split('\n');
    const start = Math.max(0, lineNumber - contextLines - 1);
    const end = Math.min(lines.length, lineNumber + contextLines);

    return lines.slice(start, end).join('\n');
  }

  /**
   * Get line and column from offset in content
   */
  static getPositionFromOffset(content: string, offset: number): { line: number; column: number } {
    const lines = content.substring(0, offset).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length,
    };
  }

  /**
   * Get offset from line and column
   */
  static getOffsetFromPosition(content: string, line: number, column: number): number {
    const lines = content.split('\n');
    let offset = 0;

    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    offset += column;
    return offset;
  }
}
