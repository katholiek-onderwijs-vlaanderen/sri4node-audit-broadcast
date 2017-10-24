/**
 * Created by guntherclaes on 24/10/17.
 */

var needle = require('needle');
var Q = require('q');
var $u = require('sri4node').utils;
var qlimit = require('qlimit');
var limit = qlimit(1);


var putVersion = function (document, config, db) {
  'use strict';
  var d = Q.defer();
  var query = $u.prepareSQL('');
  query.sql('DELETE FROM "versionsQueue" WHERE key = ').param(document.key);
  needle.put(config.host.baseUrl + '/versions/' + document.key, document, {headers: config.host.headers, json: true}, function (err, resp) {
   if (err) {
     console.warn('[sri-audit] failed with error: ' + err);
     d.resolve();
   } else if (resp.statusCode !== 201 && resp.body.errors[0].body.code === 'same.version') {
     $u.executeSQL(db, query).then(function (result) {
       d.resolve();
       console.log('[sri-audit] version was same version.');
     }).catch(function (reason) {
       console.error(reason);
       d.resolve();
     });
   } else if (resp.statusCode !== 201) {
     console.warn('[sri-audit] failed with status code: ' + resp.statusCode);
   } else {
     $u.executeSQL(db, query).then(function (result) {
       console.log('[sri-audit] success');
       d.resolve();
     }).catch(function (reason) {
       console.error(reason);
       d.resolve();
     });
   }
   });
  return d.promise;
};

exports = module.exports = {

  init: function (pg, config) {
    'use strict';
    var isRunning = false;
    setInterval(function () {
      var db, searchPathPara, dbUrl;

      if (!isRunning) {
        console.log('[sri-audit] Start version queue');
        isRunning = true;

        //compose DB url
        dbUrl = process.env.DATABASE_URL;
        if (process.env.POSTGRES_SCHEMA) {
          searchPathPara = 'search_path=' + process.env.POSTGRES_SCHEMA + ',public&ssl=true';
          if (dbUrl.match('\\?')) {
            dbUrl += '&' + searchPathPara;
          } else {
            dbUrl += '?' + searchPathPara;
          }
        }
        console.log(dbUrl);
        $u.getConnection(pg, dbUrl)
        .then(function (database) {
          db = database;
          var query = $u.prepareSQL();
          query.sql('SELECT * FROM "versionsQueue"');
          $u.executeSQL(db, query)
          .then(function (values) {
            console.log('[sri-audit] found ' + values.rowCount + ' versions');
            Q.all(values.rows.map(limit(function (row) {
              return putVersion(row.document, config, db);
            }))).then(function () {
              console.log('[sri-audit] Done.');
              db.done();
              isRunning = false;
            });
          })
          .catch(function (reason) {
            console.error(reason);
            console.error('[sri-audit] error while fetching versions queue');
          });
        })
        .finally(function () {
          db.done();
        });

      } else{
        console.log('[sri-audit] Still running. Not starting new.');
      }
    }, config.timeout);
  }
};
