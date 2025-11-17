/**
 * Ripgrep-based fast reference finder
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Reference, Location, SearchOptions } from '../types/index.js';
import { FileUtils } from './fileUtils.js';

const execAsync = promisify(exec);

export class RipgrepUtils {
  /**
   * Find all references to a symbol using ripgrep
   */
  static async findReferences(
    symbol: string,
    workspacePath: string,
    options: SearchOptions = {}
  ): Promise<Reference[]> {
    const {
      caseSensitive = true,
      wholeWord = true,
      includePattern,
      excludePattern,
      maxResults = 1000,
    } = options;

    // Build ripgrep command
    const args: string[] = [
      'rg',
      '--json',
      '--line-number',
      '--column',
      '--context', '2', // Include 2 lines of context
    ];

    if (!caseSensitive) args.push('--ignore-case');
    if (wholeWord) args.push('--word-regexp');

    // File type filters
    args.push('--type-add', 'code:*.{ts,tsx,js,jsx,py,java,go,rs,c,cpp,cs,rb,php}');
    args.push('--type', 'code');

    if (includePattern) args.push('--glob', includePattern);
    if (excludePattern) args.push('--glob', `!${excludePattern}`);

    // Exclude common directories
    args.push('--glob', '!node_modules/**');
    args.push('--glob', '!dist/**');
    args.push('--glob', '!build/**');
    args.push('--glob', '!.git/**');

    args.push('--max-count', maxResults.toString());
    args.push(symbol);
    args.push(workspacePath);

    try {
      const { stdout } = await execAsync(args.join(' '));
      return this.parseRipgrepOutput(stdout, workspacePath);
    } catch (error: any) {
      // Exit code 1 means no matches found
      if (error.code === 1) {
        return [];
      }

      // ripgrep not installed - fall back to simple search
      if (error.message.includes('not found') || error.message.includes('ENOENT')) {
        console.warn('ripgrep not found, using fallback search');
        return this.fallbackSearch(symbol, workspacePath, options);
      }

      throw new Error(`Ripgrep search failed: ${error.message}`);
    }
  }

  /**
   * Parse ripgrep JSON output
   */
  private static parseRipgrepOutput(output: string, workspacePath: string): Reference[] {
    const references: Reference[] = [];
    const lines = output.trim().split('\n');

    let currentFile = '';
    let contextLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);

        if (json.type === 'match') {
          const match = json.data;
          currentFile = match.path.text;

          const location: Location = {
            filePath: currentFile,
            range: {
              start: {
                line: match.line_number,
                column: match.submatches[0]?.start || 0,
              },
              end: {
                line: match.line_number,
                column: match.submatches[0]?.end || 0,
              },
            },
          };

          references.push({
            location,
            context: match.lines.text,
            isDefinition: this.looksLikeDefinition(match.lines.text),
            isWrite: this.looksLikeWrite(match.lines.text),
          });
        }
      } catch (e) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return references;
  }

  /**
   * Heuristic to detect if a reference is a definition
   */
  private static looksLikeDefinition(line: string): boolean {
    const definitionPatterns = [
      /\b(function|const|let|var|class|interface|type|enum)\s+\w+/,
      /\w+\s*[:=]\s*(function|async|class|\()/,
      /\b(def|fn|func)\s+\w+/,
      /\bpublic|private|protected\b.*\bclass\b/,
    ];

    return definitionPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Heuristic to detect if a reference is a write operation
   */
  private static looksLikeWrite(line: string): boolean {
    const writePatterns = [
      /\w+\s*=(?!=)/,  // Assignment (but not ==)
      /\w+\s*\+=|-=|\*=|\/=/,  // Compound assignment
      /\w+\+\+|--\w+/,  // Increment/decrement
    ];

    return writePatterns.some(pattern => pattern.test(line));
  }

  /**
   * Fallback search using simple grep when ripgrep is not available
   */
  private static async fallbackSearch(
    symbol: string,
    workspacePath: string,
    options: SearchOptions
  ): Promise<Reference[]> {
    const { caseSensitive = true, wholeWord = true } = options;

    const args: string[] = ['grep', '-rn'];

    if (!caseSensitive) args.push('-i');
    if (wholeWord) args.push('-w');

    args.push(symbol);
    args.push(workspacePath);

    // Exclude common directories
    args.push('--exclude-dir=node_modules');
    args.push('--exclude-dir=dist');
    args.push('--exclude-dir=build');
    args.push('--exclude-dir=.git');

    try {
      const { stdout } = await execAsync(args.join(' '));
      return this.parseFallbackOutput(stdout, workspacePath);
    } catch (error: any) {
      if (error.code === 1) return [];
      console.error('Fallback search failed:', error);
      return [];
    }
  }

  /**
   * Parse grep output format: filename:line:content
   */
  private static parseFallbackOutput(output: string, workspacePath: string): Reference[] {
    const references: Reference[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;

      const [, filePath, lineNum, content] = match;

      references.push({
        location: {
          filePath,
          range: {
            start: { line: parseInt(lineNum), column: 0 },
            end: { line: parseInt(lineNum), column: content.length },
          },
        },
        context: content.trim(),
        isDefinition: this.looksLikeDefinition(content),
        isWrite: this.looksLikeWrite(content),
      });
    }

    return references;
  }

  /**
   * Check if ripgrep is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await execAsync('rg --version');
      return true;
    } catch {
      return false;
    }
  }
}
