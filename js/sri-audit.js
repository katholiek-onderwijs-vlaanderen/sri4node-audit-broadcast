const pMap = require('p-map');
const { v4: uuid } = require('uuid');
const { cleanupDocument } = require('./utils.js');

const versionsQueue = require('./versionsQueue');

/**
 * @typedef {import('sri4node')} TSri4Node
 * @typedef {import('sri4node').TSriConfig} TSriConfig
 * @typedef {import('sri4node').TPluginConfig} TPluginConfig
 *
 * @typedef {import('./index.d.ts').TSri4NodeAuditBroadcastPluginConfig} TSri4NodeAuditBroadcastPluginConfig
 */

/**
 * This is the function that will be set as an after (insert/delete/update) hook in sri4node.
 *
 * @param {import('pg-promise').IDatabase<any>} tx database transaction from pg-promise
 * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
 * @param {import('sri4node').TSriRequest} sriRequest
 * @param {Array<{ permalink: string; incoming: Record<string, any>; stored: Record<string, any>;}>} elements
 * @param {string} component
 * @param {'CREATE' | 'UPDATE' | 'DELETE'} operation
 * @param {import('sri4node').TResourceDefinition} mapping
 * @param {TSri4Node} sri4node
 */
const doAudit = async function (
  tx,
  pluginConfig,
  sriRequest,
  elements,
  component,
  operation,
  mapping,
  sri4node,
) {
  await pMap(
    elements,
    async ({ permalink, incoming, stored }) => {
      const type = sri4node.utils.urlToTypeAndKey(permalink).type;
      const doc = cleanupDocument(pluginConfig?.omitProperties?.[type], incoming);
      /** @type {import('./index.d.ts').TSriVersionResource} */
      const auditItem = {
        key: uuid(),
        person: sriRequest.userObject ? '/persons/' + sriRequest.userObject.uuid : '',
        timestamp: new Date().toJSON(),
        component,
        operation,
        type,
        resource: permalink,
        document: doc,
      };

      try {
        await tx.any('INSERT INTO "versionsQueue" VALUES ($1, $2)', [auditItem.key, auditItem]);
      } catch (reason) {
        sri4node.error(
          `[sri-audit] doAudit(...): put version to database failed for resource: ${permalink} with error ${reason}`,
        );
        throw new sriRequest.SriError({
          status: 500,
          errors: [
            {
              code: 'version.queue.insert.failed',
              msg: 'Storage of new version in versionsQueue failed.',
            },
          ],
        });
      }
    },
    { concurrency: 1 },
  );
};

/**
 * Factory function for the sri4node audit broadcast plugin.
 *
 * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
 * @param {TSri4Node} sri4node
 * @returns {import('sri4node').TSriConfig['plugins'][0]}
 */
function sri4NodeAuditBroadcastPluginFactory(pluginConfig, sri4node) {
  const { component } = pluginConfig;

  const { SriError, debug, error } = sri4node;
  // const { typeToMapping, tableFromMapping, urlToTypeAndKey, parseResource } = sri4node.utils;

  return {
    uuid: 'f06cab52-eb87-11ee-9a22-00155d328834',
    /**
     * @param {import('sri4node').TSriConfig} sriConfig
     * @param {import('pg-promise').IDatabase<any>} db
     */
    install: async function (sriConfig, db) {
      const apiPaths = new Set(sriConfig.resources.map(({ type }) => type));
      if (
        Object.keys(pluginConfig.omitProperties ?? {}).some(
          (omitApiPath) => !apiPaths.has(omitApiPath),
        )
      ) {
        console.error(
          "sri-audit: omitProperties should not contain keys that are not matching the type of any of the api's resources.",
        );
      }

      const create = `CREATE TABLE IF NOT EXISTS "versionsQueue"
           (
              key UUID PRIMARY KEY,
              document JSONB
           );`;
      await db.query(create);

      versionsQueue.init(pluginConfig, sriConfig, db, sri4node);

      sriConfig.resources.forEach(
        (/** @type {import('sri4node').TResourceDefinition} */ resource) => {
          // audit functions should be LAST function in handler lists
          resource.afterInsert.push((tx, sriRequest, elements) =>
            doAudit(
              tx,
              pluginConfig,
              sriRequest,
              elements,
              component,
              'CREATE',
              resource,
              sri4node,
            ),
          );
          resource.afterUpdate.push((tx, sriRequest, elements) =>
            doAudit(
              tx,
              pluginConfig,
              sriRequest,
              elements,
              component,
              'UPDATE',
              resource,
              sri4node,
            ),
          );
          resource.afterDelete.push((tx, sriRequest, elements) =>
            doAudit(
              tx,
              pluginConfig,
              sriRequest,
              elements,
              component,
              'DELETE',
              resource,
              sri4node,
            ),
          );
        },
      );
    },
    close: async () => {
      versionsQueue.close();
    },
  };
}

module.exports = {
  sri4NodeAuditBroadcastPluginFactory,
};
