const originalFetch = require('node-fetch');
const fetch = require('fetch-retry')(originalFetch);

const PQueue = require('p-queue');
const queue = new PQueue({ concurrency: 2 });
const dblistener = require('./dblistener.js');

/**
 * @typedef {import('sri4node')} TSri4Node
 * @typedef {import('sri4node').TSriConfig} TSriConfig
 * @typedef {import('sri4node').TPluginConfig} TPluginConfig
 */

 let pluginConfig, db;
 /** @type {TSri4Node} */
 let sri4node;



const putVersion = async function (document) {
  'use strict';

  try {
    const resp = await fetch(pluginConfig.versionApiBase + '/versions/' + document.key, {
      method: 'PUT',
      body: JSON.stringify(document),
      headers: {
        ...pluginConfig.headers,
        'content-type': 'application/json; charset=utf-8',
        'Authorization': 'Basic ' + Buffer.from(pluginConfig.auth.user + ":" +  pluginConfig.auth.pass).toString('base64'),
      },

      // retry options
      retryDelay: function(attempt, error, response) {
        return Math.pow(2, attempt) * 500; // 500, 1000, 2000, 4000
      },
      retryOn: function(attempt, error, response) {
        // retry on any network error, or 5xx status codes
        if (error !== null || response.status >= 500) {
          console.log(`retrying, attempt number ${attempt + 1}`);
          return true;
        }
      }
    });

    const body = resp.headers.get('content-type') === 'application/json; charset=utf-8'
    ? await resp.json()
    : await resp.text()

    if (resp.status === 201 || resp.status === 200) {
      await db.any('DELETE FROM "versionsQueue" WHERE key = $1', document.key);
      sri4node.debug('sri-audit', '[putVersion] success');
    } else {
      if (body && body.errors && body.errors.some(({code}) => code === 'same.version')) {
        await db.any('DELETE FROM "versionsQueue" WHERE key = $1', document.key);
        sri4node.debug('sri-audit', '[sri-audit] version was same version.');
      } else {
        sri4node.error(`[putVersion] WARNING: putting doc with key ${document.key} failed with status code: ${resp.statusCode}`, body && body.errors ? JSON.stringify(body.errors, null, 2) : '');
      }
    }
  } catch (error) {
    sri4node.error('Could not connect to the /versions Api! Make sure the versions queue does not get stuck!', error);
    return;
  }
};


async function runJob(jobkey) {
  try {
    //get the item from the DB
    let job = await db.one('SELECT * FROM "versionsQueue" WHERE key = $1', jobkey);
    //run it
    await putVersion(job.document);
  } catch (ex) {
    sri4node.error('[sri-audit] WARNING: failed to handle ' + jobkey + " error: " + ex.message);
  }
}



async function runListener() {
  dblistener.connect(
    'versionsQueueinserted',
    function (err) {
      sri4node.debug('sri-audit', err);
    },
    async function (job) {
      if (job != 'test') {
        queue.add(async function () {
          await runJob(job);
        });
      }
    },
    db,
    sri4node,
  );
}

async function runJobsFromDB() {
  const jobsToRun = await db.any('SELECT key FROM "versionsQueue"');
  sri4node.debug('sri-audit', '[sri-audit] found ' + jobsToRun.length + ' versions on startup');
  for (let job of jobsToRun) {
    queue.add(async function () {
      await runJob(job.key);
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

  /**
   * 
   * @param {*} plugConf 
   * @param {TSriConfig} sriConf 
   * @param {*} d 
   * @param {TSri4Node} pSri4node 
   */
  init: async function (plugConf, sriConf, d, pSri4node) {
    //make these vars available.
    pluginConfig = plugConf;
    db = d;
    sri4node = pSri4node;

    sri4node.debug('sri-audit', '[init] Start version queue');
    await installTriggers();
    runJobsFromDB();
    runListener();
  }

};
