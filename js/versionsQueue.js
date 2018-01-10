/**
 * Created by guntherclaes on 24/10/17.
 */

const request = require('requestretry');
const pMap = require('p-map');
const { pgConnect, pgExec } = require('../../../sri4node/js/common.js')

const putVersion = async function (document, pluginConfig, sriConfig, db) {
  'use strict';

  const req = {
    url: pluginConfig.versionApiBase + '/versions/' + document.key,
    method: 'PUT',
    json: document,
    headers: pluginConfig.headers
    auth: pluginConfig.auth
  };

  const resp = await request(req)
  const body = resp.body

  const $u = sriConfig.utils;
  const delQuery = $u.prepareSQL('');
  delQuery.sql('DELETE FROM "versionsQueue" WHERE key = ').param(document.key);

  if (resp.statusCode === 201) {
    await pgExec(db, delQuery)
    console.log('[sri-audit] success');      
  } else {
    if (body && body.errors && body.errors[0].body.code === 'same.version') {
      await pgExec(db, delQuery)
      console.log('[sri-audit] version was same version.');
    } else {
      console.warn('[sri-audit] failed with status code: ' + resp.statusCode);
    }
  }
};



exports = module.exports = {

  init: function (pluginConfig, sriConfig, db) {
    'use strict';
    let isRunning = false;
    const $u = sriConfig.utils

    const check = async function () {

      if (!isRunning) {
        console.log('[sri-audit] Start version queue');
        isRunning = true;

        try {
          const query = $u.prepareSQL();
          query.sql('SELECT * FROM "versionsQueue"');
          const rows = await pgExec(db, query)

          console.log('[sri-audit] found ' + rows.length + ' versions');
          await pMap(rows, row => putVersion(row.document, pluginConfig, sriConfig, db), {concurrency: 1} )

          console.log('[sri-audit] Done.');
        } catch(err) {
          console.error(err);
          console.error('[sri-audit] failed with error: ' + err);
        }
        isRunning = false;
      } else{
        console.log('[sri-audit] Still running. Not starting new.');
      }
    }

    setInterval(check, pluginConfig.interval);
  }
};
