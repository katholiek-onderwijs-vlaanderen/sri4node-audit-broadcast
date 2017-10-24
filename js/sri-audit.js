/**
 * Created by guntherclaes on 26/11/15.
 */

var needle = require('needle');
var uuid = require('node-uuid');
var Q = require('q');
var $u = require('sri4node').utils;

var configuration = require('../../configuration.js');

var doAudit = function (db, elements, me, operation) {
  'use strict';
  var deferred = Q.defer();
  var auditItem;
  var reqOptions = {
    username: configuration.audit.username,
    password: configuration.audit.password,
    json: true
  };
  elements.forEach(function (element) {
    auditItem = {
      key: uuid.v1(),
      person: '',
      timestamp: (new Date()).toJSON(),
      component: '',
      operation: operation,
      type: (element.path.split('/'))[1],
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
  init: require('./versionsQueue').init
};
