// Public API for reusing MCP components without starting the MCP server

export {
  createMcpConfig,
  logConfigurationSummary,
  showHelpMessage,
  type ContextMcpConfig
} from './config.js';

export {
  createEmbeddingInstance,
  logEmbeddingProviderInfo
} from './embedding.js';

export {
  SnapshotManager
} from './snapshot.js';

export {
  SyncManager
} from './sync.js';

export {
  ToolHandlers
} from './handlers.js';

export {
  ensureAbsolutePath,
  truncateContent,
  trackCodebasePath
} from './utils.js';
