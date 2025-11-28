#!/usr/bin/env node

import { Command } from 'commander';
import {
  Context,
  MilvusVectorDatabase
} from '@zilliz/claude-context-core';
import {
  createMcpConfig,
  logConfigurationSummary,
  createEmbeddingInstance,
  logEmbeddingProviderInfo,
  SnapshotManager,
  ToolHandlers
} from '@zilliz/claude-context-mcp/api';

interface Engine {
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
  return { toolHandlers };
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
    .action(async (pathArg, opts) => {
      const { toolHandlers } = await createEngine();
      const res = await toolHandlers.handleIndexCodebase({
        path: pathArg,
        force: !!opts.force,
        splitter: opts.splitter || 'ast',
        customExtensions: opts.ext || [],
        ignorePatterns: opts.ignore || [],
      });
      printMcpResponse(res);
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

