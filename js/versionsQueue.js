/**
 * Created by guntherclaes on 24/10/17.
 */

const request = require('requestretry');
// const pMap = require('p-map');


const PQueue = require('p-queue');
const queue = new PQueue({ concurrency: 2 });
let pluginConfig, sriConfig, db;
const dblistener = require('./dblistener.js');

const putVersion = async function(document) {
  'use strict';

  const req = {
    url: pluginConfig.versionApiBase + '/versions/' + document.key,
    method: 'PUT',
    json: document,
    headers: pluginConfig.headers,
    auth: pluginConfig.auth
  };

  const resp = await request(req)
  const body = resp.body

  if (resp.statusCode === 201) {
    await db.any('DELETE FROM "versionsQueue" WHERE key = $1', document.key);
    console.log('[sri-audit] success');
  }
  else {
    if (body && body.errors && (body.errors.length > 0) && body.errors[0].body && body.errors[0].body.code === 'same.version') {
      await db.any('DELETE FROM "versionsQueue" WHERE key = $1', document.key);
      console.log('[sri-audit] version was same version.');
    }
    else {
      console.warn('[sri-audit] failed with status code: ' + resp.statusCode);
    }
  }
};


async function runJob(jobkey) {
  //get the latest version of the job before processing it.
  let job = await db.one('SELECT * FROM "versionsQueue" WHERE key = $1', jobkey.key);
  //run it
  await putVersion(job.document);
}



async function runListener() {
  dblistener.connect(
    'versionsQueueinserted',
    'versionsQueue', //name of table
    'key', //name of column with ID
    function(err) {
      console.log(err);
    },
    async function(job) {
      if (job != 'test') {
        queue.add(async function() {
          await runJob(job);
        });
      }
    },
    db
  );
}

async function runJobsFromDB() {
  const jobsToRun = await db.any('SELECT key FROM "versionsQueue"');
  console.log('[sri-audit] found ' + jobsToRun.length + ' versions on startup');
  for (let job of jobsToRun) {
    queue.add(async function() {
      await runJob(job);
    });
  }
}

async function installTriggers() {
  const plpgsql = `
    DO $___$
      BEGIN

      CREATE OR REPLACE FUNCTION notify_versionsQueueinserted()
        RETURNS trigger AS $$
      DECLARE
      BEGIN
        PERFORM pg_notify(
          CAST('versionsQueueinserted' AS text),
          NEW.key::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      drop trigger IF EXISTS notify_versionsQueueinserted on "versionsQueue";

      if not exists (select 1 from pg_trigger where tgname = 'notify_versionsQueueinserted') then
          CREATE TRIGGER notify_versionsQueueinserted
            AFTER INSERT ON "versionsQueue"
            FOR EACH ROW
            EXECUTE PROCEDURE notify_versionsQueueinserted();
      end if;

      END
      $___$
      LANGUAGE 'plpgsql';
    `;
  await db.query(plpgsql);
}


exports = module.exports = {

  init: async function(plugConf, sriConf, d) {
    //make these vars available.
    pluginConfig = plugConf;
    sriConfig = sriConf;
    db = d;

    console.log('[sri-audit] Start version queue');
    await installTriggers();
    runJobsFromDB();
    runListener();
  }

  // function(pluginConfig, sriConfig, db) {
  //   'use strict';
  //   let isRunning = false;
  //   const $u = sriConfig.utils

  //   const check = async function() {

  //     if (!isRunning) {
  //       console.log('[sri-audit] Start version queue');
  //       isRunning = true;

  //       try {
  //         const query = $u.prepareSQL();
  //         query.sql('SELECT * FROM "versionsQueue"');
  //         const rows = await pgExec(db, query)

  //         console.log('[sri-audit] found ' + rows.length + ' versions');
  //         await pMap(rows, row => putVersion(row.document, pluginConfig, sriConfig, db), { concurrency: 1 })

  //         console.log('[sri-audit] Done.');
  //       }
  //       catch (err) {
  //         console.error(err);
  //         console.error('[sri-audit] failed with error: ' + err);
  //       }
  //       isRunning = false;
  //     }
  //     else {
  //       console.log('[sri-audit] Still running. Not starting new.');
  //     }
  //   }

  //   setInterval(check, pluginConfig.interval);
  // }

};
