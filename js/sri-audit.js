/**
 * Created by guntherclaes on 26/11/15.
 */

const pMap = require('p-map');
const uuid = require('uuid/v4');
const { detailedDiff } = require("deep-object-diff");

const doAudit = async function(tx, sriRequest, elements, component, operation, mapping) {
  'use strict';

  await pMap(elements, async({ permalink, incoming: object, stored: stored }) => {

    // only send a new version if there are differences betweeen stored and incoming objects
    if (haveDifferences(stored, object, mapping)) {

      //TODO: don't use own regex -> put one in sri4node in utils
      const type = permalink.match(/^\/(\/*.*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
      const auditItem = {
        key: uuid(),
        person: sriRequest.userObject ? '/persons/' + sriRequest.userObject.uuid : '',
        timestamp: (new Date()).toJSON(),
        component: component,
        operation: operation,
        type: type[1].split('/').join('_').toUpperCase(),
        resource: permalink,
        document: object
      };
  
      try {
        await tx.any('INSERT INTO "versionsQueue" VALUES ($1, $2)', [auditItem.key, auditItem]);
      }
      catch (reason) {
        console.error('[sri-audit] put version to database failed for resource: ' + element.path);
        throw new SriError({ status: 500, errors: [{ code: 'version.queue.insert.failed', msg: 'Storage of new version in versionsQueue failed.' }] })
      }
    }
  }, { concurrency: 1 })
};

const haveDifferences = (stored, incoming, mapping) => {
  
  // force Date object for date-time incoming properties
  Object.keys(mapping.map).forEach(mapKey => {
    if (incoming[mapKey] && mapping.schema.properties[mapKey].format === 'date-time') {
      incoming[mapKey] = new Date(incoming[mapKey]);
    }
  })

  const diff = detailedDiff(stored, incoming)
  // console.log(diff)

  // exclude properties starting with $$ (eg. $$meta)
  const addedKeys = Object.keys(diff.added).filter(key => key.indexOf('$$') === -1)
  const deletedKeys = Object.keys(diff.deleted).filter(key => key.indexOf('$$') === -1)
  const updatedKeys = Object.keys(diff.updated).filter(key => key.indexOf('$$') === -1)
  // console.log(addedKeys, deletedKeys, updatedKeys)

  return updatedKeys.length > 0 || deletedKeys.length > 0 || addedKeys.length > 0;
}


module.exports = function(component, pluginConfig) {
  'use strict';

  return {
    install: async function(sriConfig, db) {

      const create = 
        `CREATE TABLE IF NOT EXISTS "versionsQueue"
           (
              key UUID PRIMARY KEY,
              document JSONB
           );`
      //INDEX IF NOT EXISTS is only supported from postgres 9.5 
      // but why do we need this index?
      //CREATE UNIQUE INDEX IF NOT EXISTS versionsQueue_key_uindex ON "versionsQueue" (key);`)
      await db.query(create);

      require('./versionsQueue').init(pluginConfig, sriConfig, db);

      sriConfig.resources.forEach(resource => {
        // audit functions should be LAST function in handler lists
        resource.afterInsert.push((tx, sriRequest, elements) => doAudit(tx, sriRequest, elements, component, 'CREATE', resource))
        resource.afterUpdate.push((tx, sriRequest, elements) => doAudit(tx, sriRequest, elements, component, 'UPDATE', resource))
        resource.afterDelete.push((tx, sriRequest, elements) => doAudit(tx, sriRequest, elements, component, 'DELETE', resource))
      })
    }
  }

};
