/**
 * Created by guntherclaes on 26/11/15.
 */

const pMap = require('p-map');
const { v4: uuid } = require('uuid');

/**
 * @typedef {import('sri4node')} TSri4Node
 * @typedef {import('sri4node').TSriConfig} TSriConfig
 * @typedef {import('sri4node').TPluginConfig} TPluginConfig
 *
 * @typedef {import('./sri-audit.d.ts').TSri4NodeAuditBroadcastPluginConfig} TSri4NodeAuditBroadcastPluginConfig
 */

/**
 * 
 * @param {any} tx databse transaction from pg-promise
 * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
 * @param {import('sri4node').TSriRequest} sriRequest
 * @param {Array<{ permalink: string; incoming: Record<string, any>; stored: Record<string, any>;}>} elements
 * @param {string} component
 * @param {'CREATE' | 'READ' | 'UPDATE' | 'DELETE'} operation
 * @param {import('sri4node').TResourceDefinition} mapping
 * @param {TSri4Node} sri4node 
 */
const doAudit = async function(tx, pluginConfig, sriRequest, elements, component, operation, mapping, sri4node) {
  'use strict';

  await pMap(elements, async({ permalink, incoming: object, stored }) => {

    //TODO: don't use own regex -> put one in sri4node in utils
    const typeString = permalink.match(/^\/(\/*.*)\/((?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})|[\d]+)+$/);
    const type = typeString[1].split('/').join('_').toUpperCase();
    const doc = object;
    if (pluginConfig.omitProperties && pluginConfig.omitProperties[type]) {
      pluginConfig.omitProperties[type]
        .filter((property) => doc.hasOwnProperty(property)) // only if the property exists on this doc !!!
        .forEach((property) => {
          delete doc[property];
        });
    }
    const auditItem = {
      key: uuid(),
      person: sriRequest.userObject ? '/persons/' + sriRequest.userObject.uuid : '',
      timestamp: (new Date()).toJSON(),
      component: component,
      operation: operation,
      type: type,
      resource: permalink,
      document: object
    };

    try {
      await tx.any('INSERT INTO "versionsQueue" VALUES ($1, $2)', [auditItem.key, auditItem]);
    }
    catch (reason) {
      sri4node.error(`[sri-audit] doAudit(...): put version to database failed for resource: ${permalink} with error ${reason}`);
      throw new sriRequest.SriError({ status: 500, errors: [{ code: 'version.queue.insert.failed', msg: 'Storage of new version in versionsQueue failed.' }] });
    }
  }, { concurrency: 1 });
};

module.exports = function(pluginConfig, sri4node) {
  const { component } = pluginConfig;

  const { SriError, debug, error } = sri4node;
  // const { typeToMapping, tableFromMapping, urlToTypeAndKey, parseResource } = sri4node.utils;

  'use strict';

  return {
    install: async function(sriConfig, db) {

      const create =
        `CREATE TABLE IF NOT EXISTS "versionsQueue"
           (
              key UUID PRIMARY KEY,
              document JSONB
           );`;
      //INDEX IF NOT EXISTS is only supported from postgres 9.5
      // but why do we need this index?
      //CREATE UNIQUE INDEX IF NOT EXISTS versionsQueue_key_uindex ON "versionsQueue" (key);`)
      await db.query(create);

      require('./versionsQueue').init(pluginConfig, sriConfig, db, sri4node);

      sriConfig.resources.forEach((/** @type {import('sri4node').TResourceDefinition} */ resource) => {
        // audit functions should be LAST function in handler lists
        resource.afterInsert.push((tx, sriRequest, elements) => doAudit(tx, pluginConfig, sriRequest, elements, component, 'CREATE', resource, sri4node));
        resource.afterUpdate.push((tx, sriRequest, elements) => doAudit(tx, pluginConfig, sriRequest, elements, component, 'UPDATE', resource, sri4node));
        resource.afterDelete.push((tx, sriRequest, elements) => doAudit(tx, pluginConfig, sriRequest, elements, component, 'DELETE', resource, sri4node));
      });
    }
  };

};
