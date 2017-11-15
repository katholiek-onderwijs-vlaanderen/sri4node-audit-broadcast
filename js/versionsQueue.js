/**
 * Created by guntherclaes on 24/10/17.
 */

var request = require('request');
var Q = require('q');
var $u = require('sri4node').utils;
var qlimit = require('qlimit');
var limit = qlimit(1);

var putVersion = function (document, config, db) {
  'use strict';
  var d = Q.defer();
  var query = $u.prepareSQL('');
  query.sql('DELETE FROM "versionsQueue" WHERE key = ').param(document.key);
  var options = {
    url: config.host.baseUrl + '/versions/' + document.key,
    method: 'PUT',
    json: document
  };
  if(config.host.headers){
    options.headers = config.host.headers;
  }
  if(config.host.headers){
    options.auth = config.host.auth;
  }

  request(options, function (err, resp, body) {
    if (err) {
      console.warn('[sri-audit] failed with error: ' + err);
      d.resolve();
    } else if (resp.statusCode !== 201 && (body && body.errors && body.errors[0].body.code === 'same.version')) {
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
