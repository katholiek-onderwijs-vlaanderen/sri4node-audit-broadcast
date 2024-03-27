/**
 * @fileoverview Exports the sri-audit module as an ESM module.
 */
const { cleanupDocument, sri4NodeAuditBroadcastPluginFactory } = await import('./sri-audit.js');

export { cleanupDocument, sri4NodeAuditBroadcastPluginFactory };
