/**
 * Created by guntherclaes on 26/11/15.
 */

const pMap = require('p-map');
const uuid = require('node-uuid');
const { pgConnect, pgExec } = require('../../../sri4node/js/common.js')

let $u

const doAudit = async function (tx, sriRequest, elements, component, operation) { 
  'use strict';

  await pMap(elements, async ({permalink, incoming: object}) => {

      //TODO: don't use own regex -> put one in sri4node in utils
    const type = permalink.match(/^\/(\/*.*)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/);
    const auditItem = {
      key: uuid.v1(),
      person: sriRequest.userObject ? '/persons/' + sriRequest.userObject.uuid : '',
      timestamp: (new Date()).toJSON(),
      component: component,
      operation: operation,
      type: type[1].split('/').join('_').toUpperCase(),
      resource: permalink,
      document: object
    };

    const query = $u.prepareSQL();
    query.sql('INSERT INTO "versionsQueue" VALUES (').values({
                                                               key: auditItem.key,
                                                               document: auditItem
                                                             }).sql(')');
    try {
      await pgExec(tx, query)
    } catch (reason) {
      console.error('[sri-audit] put version to database failed for resource: ' + element.path);
      throw new SriError({status: 500, errors: [{ code: 'version.queue.insert.failed',  msg: 'Storage of new version in versionsQueue failed.' }]})
    }
  } , {concurrency: 1} )
};




module.exports = function (component) {
  'use strict';

  return {
    install: async function (sriConfig, db) {

      $u = sriConfig.utils

      const query = $u.prepareSQL('create versionsQueue');
      query.sql(
          `CREATE TABLE IF NOT EXISTS "versionsQueue"
           (
              key UUID PRIMARY KEY,
              document JSONB
           );`)
           //INDEX IF NOT EXISTS is only supported from postgres 9.5 
           // but why do we need this index?
           //CREATE UNIQUE INDEX IF NOT EXISTS versionsQueue_key_uindex ON "versionsQueue" (key);`)
      await pgExec(db, query)

      require('./versionsQueue').init(sriConfig, db);

      sriConfig.resources.forEach( resource => {
        // audit functions should be LAST function in handler lists
        resource.afterinsert.push((tx, sriRequest, elements) => doAudit(tx, sriRequest, elements, component, 'CREATE'))
        resource.afterupdate.push((tx, sriRequest, elements) => doAudit(tx, sriRequest, elements, component, 'UPDATE'))
        resource.afterdelete.push((tx, sriRequest, elements) => doAudit(tx, sriRequest, elements, component, 'DELETE'))
      })
    }
  }

};
