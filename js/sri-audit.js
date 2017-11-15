/**
 * Created by guntherclaes on 26/11/15.
 */

var needle = require('needle');
var uuid = require('node-uuid');
var Q = require('q');
var $u = require('sri4node').utils;
var config;

var doAudit = function (db, elements, me, operation) {
  'use strict';
  var deferred = Q.defer();
  var auditItem;

  elements.forEach(function (element) {
    var type = element.path.match(/^\/(\/*.*)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/);
    auditItem = {
      key: uuid.v1(),
      person: '',
      timestamp: (new Date()).toJSON(),
      component: '',
      operation: operation,
      type: type[1].split('/').join('_').toUpperCase(),
      resource: element.path,
      document: element.body
    };

    var query = $u.prepareSQL();
    query.sql('INSERT INTO "versionsQueue" VALUES (').values({
                                                               key: auditItem.key,
                                                               document: auditItem
                                                             }).sql(')');

    $u.executeSQL(db, query)
    .then(function (value) {
    }).catch(function (reason) {
      console.error('[sri-audit] put version to database failed for resource: ' + element.path);
    });

  });
  deferred.resolve();
  return deferred.promise;
};
exports = module.exports = {

  update: function (db, elements, me) {
    'use strict';
    return doAudit(db, elements, me, 'UPDATE');
  },
  delete: function (db, elements, me) {
    'use strict';
    return doAudit(db, elements, me, 'DELETE');
  },
  create: function (db, elements, me) {
    'use strict';
    return doAudit(db, elements, me, 'CREATE');
  },
  init: function(pg, inputConfig){
    config = inputConfig;
    require('./versionsQueue').init(pg, config);
  }
};
