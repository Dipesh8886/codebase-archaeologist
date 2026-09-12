import Parser from 'web-tree-sitter';
import path from 'node:path';
import { logger } from '../utils/logger.js';

/**
 * Multi-language, function-level code chunking using Tree-sitter.
 *
 * Why Tree-sitter instead of @babel/parser:
 * - Babel only parses JS/TS. Tree-sitter has grammars for Python, Go, Java,
 *   Rust, C/C++, Ruby, and more — all free, open-source (MIT/Apache), same
 *   $0 cost as Babel.
 * - This lets us ship real multi-language support at MVP instead of
 *   deferring it to post-MVP, and gives us function-level (not just
 *   file-level) chunks across every supported language, which produces
 *   much more precise citations.
 *
 * WASM grammars are loaded lazily and cached per-language so we only pay
 * the parse-init cost once per language per process.
 */

const EXT_TO_LANGUAGE = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
};

// Node types that represent a "chunkable unit" (functions, methods, classes)
// per language. Anything not covered falls back to line-based chunking.
const CHUNK_NODE_TYPES = {
  javascript: ['function_declaration', 'method_definition', 'class_declaration', 'arrow_function'],
  typescript: ['function_declaration', 'method_definition', 'class_declaration', 'interface_declaration'],
  tsx: ['function_declaration', 'method_definition', 'class_declaration', 'interface_declaration'],
  python: ['function_definition', 'class_definition'],
  go: ['function_declaration', 'method_declaration', 'type_declaration'],
  java: ['method_declaration', 'class_declaration', 'interface_declaration'],
  ruby: ['method', 'class', 'module'],
  rust: ['function_item', 'impl_item', 'struct_item'],
  c: ['function_definition', 'struct_specifier'],
  cpp: ['function_definition', 'class_specifier', 'struct_specifier'],
};

const parserCache = new Map(); // language -> Parser instance
let treeSitterInitialized = false;

async function ensureTreeSitterInit() {
  if (!treeSitterInitialized) {
    await Parser.init();
    treeSitterInitialized = true;
  }
}

async function getParserForLanguage(language) {
  if (parserCache.has(language)) return parserCache.get(language);

  await ensureTreeSitterInit();
  const parser = new Parser();

  // WASM grammar files are expected under backend/grammars/tree-sitter-<lang>.wasm
  // Download these once at build time (see scripts/fetch-grammars.sh) — they're
  // free, versioned artifacts published by the tree-sitter project on npm/GitHub.
  const wasmPath = path.resolve(process.cwd(), 'grammars', `tree-sitter-${language}.wasm`);

  try {
    const Lang = await Parser.Language.load(wasmPath);
    parser.setLanguage(Lang);
    parserCache.set(language, parser);
    return parser;
  } catch (err) {
    logger.warn(`No Tree-sitter grammar available for "${language}", falling back to line chunking`, {
      error: err.message,
    });
    return null;
  }
}

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || null;
}

/**
 * Fallback for languages without a grammar, or files a parser fails on:
 * chunk by fixed line windows with overlap, so search doesn't lose context
 * at chunk boundaries.
 */
function chunkByLines(content, filePath, { linesPerChunk = 60, overlap = 10 } = {}) {
  const lines = content.split('\n');
  const chunks = [];

  for (let start = 0; start < lines.length; start += linesPerChunk - overlap) {
    const end = Math.min(start + linesPerChunk, lines.length);
    const text = lines.slice(start, end).join('\n');
    if (text.trim().length === 0) continue;

    chunks.push({
      filePath,
      startLine: start + 1,
      endLine: end,
      text,
      kind: 'line-window',
      symbolName: null,
    });

    if (end === lines.length) break;
  }

  return chunks;
}

/**
 * Walk a Tree-sitter AST and extract top-level chunkable nodes
 * (functions, classes, methods) as individual chunks, each carrying
 * its own line range for precise citations.
 */
function extractChunksFromTree(tree, content, filePath, language) {
  const chunkTypes = new Set(CHUNK_NODE_TYPES[language] || []);
  const chunks = [];
  const lines = content.split('\n');

  function walk(node) {
    if (chunkTypes.has(node.type)) {
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const text = lines.slice(startLine - 1, endLine).join('\n');

      // Skip trivially small chunks (e.g. one-line arrow functions) —
      // not worth a separate embedding, they get swept up by their parent.
      if (text.trim().length > 20) {
        chunks.push({
          filePath,
          startLine,
          endLine,
          text,
          kind: node.type,
          symbolName: extractSymbolName(node, content),
        });
      }
      // Don't recurse into children of a captured chunk — avoids
      // duplicate nested chunks (e.g. a method inside an already-chunked class).
      return;
    }
    for (const child of node.children) walk(child);
  }

  walk(tree.rootNode);
  return chunks;
}

function extractSymbolName(node, content) {
  const nameNode = node.childForFieldName?.('name');
  if (nameNode) return content.slice(nameNode.startIndex, nameNode.endIndex);
  return null;
}

/**
 * Main entry point: chunk a single file's content.
 * Returns an array of { filePath, startLine, endLine, text, kind, symbolName }
 */
export async function chunkFile(filePath, content) {
  if (!content || content.trim().length === 0) return [];

  const language = detectLanguage(filePath);
  if (!language) {
    return chunkByLines(content, filePath);
  }

  const parser = await getParserForLanguage(language);
  if (!parser) {
    return chunkByLines(content, filePath); // no grammar available — safe fallback
  }

  try {
    const tree = parser.parse(content);
    const chunks = extractChunksFromTree(tree, content, filePath, language);

    // Files with no matched top-level constructs (e.g. a config file, or a
    // language edge case) still need coverage — fall back to line chunking.
    return chunks.length > 0 ? chunks : chunkByLines(content, filePath);
  } catch (err) {
    logger.warn(`Tree-sitter parse failed for ${filePath}, falling back to line chunking`, {
      error: err.message,
    });
    return chunkByLines(content, filePath);
  }
}

export function getSupportedLanguages() {
  return [...new Set(Object.values(EXT_TO_LANGUAGE))];
}

export { detectLanguage };
