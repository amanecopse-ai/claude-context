#!/usr/bin/env node

import { Command } from 'commander';
import {
  Context,
  MilvusVectorDatabase,
  COLLECTION_LIMIT_MESSAGE
} from '@zilliz/claude-context-core';
import * as fs from 'fs';
import {
  ensureAbsolutePath,
  createMcpConfig,
  logConfigurationSummary,
  createEmbeddingInstance,
  logEmbeddingProviderInfo,
  SnapshotManager,
  ToolHandlers
} from '@zilliz/claude-context-mcp/api';

interface Engine {
  context: Context;
  snapshotManager: SnapshotManager;
  toolHandlers: ToolHandlers;
}

async function createEngine(): Promise<Engine> {
  const config = createMcpConfig();
  logConfigurationSummary(config);

  const embedding = createEmbeddingInstance(config);
  logEmbeddingProviderInfo(config, embedding);

  const vectorDatabase = new MilvusVectorDatabase({
    address: config.milvusAddress,
    ...(config.milvusToken && { token: config.milvusToken })
  });

  const context = new Context({ embedding, vectorDatabase });
  const snapshotManager = new SnapshotManager();
  snapshotManager.loadCodebaseSnapshot();

  const toolHandlers = new ToolHandlers(context, snapshotManager);
  return { context, snapshotManager, toolHandlers };
}

function printMcpResponse(result: any): void {
  const pieces = Array.isArray(result?.content)
    ? result.content
        .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
        .map((c: any) => c.text)
    : [];

  const text = pieces.join('\n\n') || 'No output.';

  if (result?.isError) {
    console.error(text);
    process.exitCode = 1;
  } else {
    console.log(text);
  }
}

async function runIndex(pathArg: string, options: any): Promise<void> {
  const { context, snapshotManager } = await createEngine();
  const absolutePath = ensureAbsolutePath(pathArg);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Path '${absolutePath}' does not exist.`);
    process.exit(1);
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) {
    console.error(`Error: Path '${absolutePath}' is not a directory.`);
    process.exit(1);
  }

  const force = !!options.force;

  const currentStatus = snapshotManager.getCodebaseStatus(absolutePath);
  if (currentStatus === 'indexing') {
    console.error(`Codebase '${absolutePath}' is already being indexed.`);
    process.exit(1);
  }

  const hasIndex = await context.hasIndex(absolutePath);
  if (hasIndex && !force) {
    console.error(`Codebase '${absolutePath}' is already indexed. Use --force to re-index.`);
    process.exit(1);
  }

  const canCreate = await context.getVectorDatabase().checkCollectionLimit();
  if (!canCreate) {
    console.error(COLLECTION_LIMIT_MESSAGE);
    process.exit(1);
  }

  const customExt: string[] = options.ext || [];
  const ignorePatterns: string[] = options.ignore || [];
  if (customExt.length > 0) {
    context.addCustomExtensions(customExt);
  }
  if (ignorePatterns.length > 0) {
    context.addCustomIgnorePatterns(ignorePatterns);
  }

  snapshotManager.setCodebaseIndexing(absolutePath, 0);
  snapshotManager.saveCodebaseSnapshot();

  let lastProgress = 0;
  console.log(`[INDEX] Starting indexing for '${absolutePath}'...`);

  try {
    const stats = await context.indexCodebase(
      absolutePath,
      (progress) => {
        lastProgress = progress.percentage;
        const pct = progress.percentage.toFixed(1).padStart(6, ' ');
        process.stdout.write(`\r[INDEX] ${pct}% - ${progress.phase}`);
      },
      force
    );

    process.stdout.write('\n');
    snapshotManager.setCodebaseIndexed(absolutePath, stats);
    snapshotManager.saveCodebaseSnapshot();

    console.log(
      `[INDEX] Completed. Files: ${stats.indexedFiles}, Chunks: ${stats.totalChunks}, Status: ${stats.status}`
    );
  } catch (error: any) {
    process.stdout.write('\n');
    const message = error?.message || String(error);
    snapshotManager.setCodebaseIndexFailed(absolutePath, message, lastProgress);
    snapshotManager.saveCodebaseSnapshot();
    console.error(`[INDEX] Failed: ${message}`);
    process.exit(1);
  }
}

async function main() {
  const program = new Command();

  program
    .name('claude-context')
    .description('Claude Context CLI (index, search, status, clear)')
    .version('0.1.3');

  program
    .command('index')
    .argument('<path>', 'ABSOLUTE path to the codebase directory to index')
    .option('-f, --force', 'Force re-index even if already indexed')
    .option('-s, --splitter <splitter>', "Code splitter: 'ast' or 'langchain' (currently AST-based)", 'ast')
    .option('--ext <extension...>', 'Additional file extensions to include (e.g. .vue .svelte)')
    .option('--ignore <pattern...>', 'Additional ignore patterns (e.g. static/** *.tmp)')
    .action((pathArg, opts) => {
      runIndex(pathArg, opts).catch((err) => {
        console.error(err);
        process.exit(1);
      });
    });

  program
    .command('search')
    .argument('<path>', 'ABSOLUTE path to the indexed codebase directory')
    .argument('<query>', 'Search query')
    .option('-l, --limit <number>', 'Maximum number of results (default: 10, max: 50)')
    .option('--ext <extension...>', 'Filter results by file extension (e.g. .ts .py)')
    .action(async (pathArg, query, opts) => {
      const { toolHandlers } = await createEngine();
      const limit = opts.limit ? Number(opts.limit) : 10;
      const res = await toolHandlers.handleSearchCode({
        path: pathArg,
        query,
        limit,
        extensionFilter: opts.ext
      });
      printMcpResponse(res);
    });

  program
    .command('status')
    .argument('<path>', 'ABSOLUTE path to the codebase directory')
    .action(async (pathArg) => {
      const { toolHandlers } = await createEngine();
      const res = await toolHandlers.handleGetIndexingStatus({ path: pathArg });
      printMcpResponse(res);
    });

  program
    .command('clear')
    .argument('<path>', 'ABSOLUTE path to the codebase directory')
    .action(async (pathArg) => {
      const { toolHandlers } = await createEngine();
      const res = await toolHandlers.handleClearIndex({ path: pathArg });
      printMcpResponse(res);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

