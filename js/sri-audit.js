/**
 * Created by guntherclaes on 26/11/15.
 */

const pMap = require('p-map');
const uuid = require('uuid/v4');

const doAudit = async function(tx, pluginConfig, sriRequest, elements, component, operation, mapping) {
  'use strict';

  await pMap(elements, async({ permalink, incoming: object, stored: stored }) => {

    //TODO: don't use own regex -> put one in sri4node in utils
    const typeString = permalink.match(/^\/(\/*.*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
    const type = typeString[1].split('/').join('_').toUpperCase();
    const doc = object;
    if (pluginConfig.omitProperties && pluginConfig.omitProperties[type]) {
      pluginConfig.omitProperties[type].forEach(property => {
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
      console.error('[sri-audit] put version to database failed for resource: ' + permalink);
      throw new sriRequest.SriError({ status: 500, errors: [{ code: 'version.queue.insert.failed', msg: 'Storage of new version in versionsQueue failed.' }] });
    }
  }, { concurrency: 1 });
};

module.exports = function(component, pluginConfig) {
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

      require('./versionsQueue').init(pluginConfig, sriConfig, db);

      sriConfig.resources.forEach(resource => {
        // audit functions should be LAST function in handler lists
        resource.afterInsert.push((tx, sriRequest, elements) => doAudit(tx, pluginConfig, sriRequest, elements, component, 'CREATE', resource));
        resource.afterUpdate.push((tx, sriRequest, elements) => doAudit(tx, pluginConfig, sriRequest, elements, component, 'UPDATE', resource));
        resource.afterDelete.push((tx, sriRequest, elements) => doAudit(tx, pluginConfig, sriRequest, elements, component, 'DELETE', resource));
      });
    }
  };

};
