const originalFetch = require('node-fetch-commonjs');
const fetch = require('fetch-retry')(originalFetch);

const PQueue = require('p-queue');
const queue = new PQueue({ concurrency: 2 });
const dblistener = require('./dblistener.js');
const { cleanupDocument } = require('./utils.js');

/**
 * @typedef {import('sri4node')} TSri4Node
 * @typedef {import('sri4node').TSriConfig} TSriConfig
 * @typedef {import('sri4node').TPluginConfig} TPluginConfig
 *
 * @typedef {import('./index.d.ts').TSri4NodeAuditBroadcastPluginConfig} TSri4NodeAuditBroadcastPluginConfig
 */

/**
 * @param {TSri4Node} sri4node
 * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
 * @param {import('./index.d.ts').TSriVersionResource} versionApiDoc
 * @returns
 */
const putVersion = async function (sri4node, pluginConfig, db, versionApiDoc) {
  try {
    const type = sri4node.utils.urlToTypeAndKey(versionApiDoc.resource).type;
    const cleanVersionApiDoc = {
      ...versionApiDoc,
      document: cleanupDocument(pluginConfig?.omitProperties?.[type], versionApiDoc.document),
    };

    const resp = await fetch(pluginConfig.versionApiBase + '/versions/' + versionApiDoc.key, {
      method: 'PUT',
      body: JSON.stringify(cleanVersionApiDoc),
      headers: {
        ...pluginConfig.headers,
        'content-type': 'application/json; charset=utf-8',
        Authorization:
          'Basic ' +
          Buffer.from(pluginConfig.auth.user + ':' + pluginConfig.auth.pass).toString('base64'),
      },

      // retry options
      retryDelay: function (attempt, _error, _response) {
        return Math.pow(2, attempt) * 500; // 500, 1000, 2000, 4000
      },
      retryOn: function (attempt, error, response) {
        // retry on any network error, or 5xx status codes
        if (error !== null || response.status >= 500) {
          console.log(
            `retrying, attempt number ${attempt + 1} caused by ${
              error
                ? error
                : `response status ${response.status} ${response.statusText}: ${response.text()}`
            }`,
          );
          return true;
        }
      },
    });

    const body =
      resp.headers.get('content-type') === 'application/json; charset=utf-8'
        ? await resp.json()
        : await resp.text();

    if (resp.status === 201 || resp.status === 200) {
      await db.any('DELETE FROM "versionsQueue" WHERE key = $1', versionApiDoc.key);
      sri4node.debug('sri-audit', '[putVersion] success');
    } else {
      if (body && body.errors && body.errors.some(({ code }) => code === 'same.version')) {
        await db.any('DELETE FROM "versionsQueue" WHERE key = $1', versionApiDoc.key);
        sri4node.debug('sri-audit', '[sri-audit] version was same version.');
      } else {
        sri4node.error(
          `[putVersion] WARNING: putting doc with key ${versionApiDoc.key} failed with status code: ${resp.status}`,
          body && body.errors ? JSON.stringify(body.errors, null, 2) : '',
        );
      }
    }
  } catch (error) {
    sri4node.error(
      'Could not connect to the /versions Api! Make sure the versions queue does not get stuck!',
      error,
    );
    return;
  }
};

/**
 *
 * @param {TSri4Node} sri4node
 * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
 * @param {*} db
 * @param {string} jobkey
 */
async function runJob(sri4node, pluginConfig, db, jobkey) {
  try {
    //get the item from the DB
    let job = await db.one('SELECT * FROM "versionsQueue" WHERE key = $1', jobkey);
    //run it
    await putVersion(sri4node, pluginConfig, db, job.document);
  } catch (ex) {
    sri4node.error('[sri-audit] WARNING: failed to handle ' + jobkey + ' error: ' + ex.message);
  }
}

/**
 *
 * @param {TSri4Node} sri4node
 * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
 * @param {*} db
 */
async function runListener(sri4node, pluginConfig, db) {
  dblistener.connect(
    'versionsQueueinserted',
    function (err) {
      sri4node.debug('sri-audit', err);
    },
    async function (job) {
      if (job != 'test') {
        queue.add(async function () {
          await runJob(sri4node, pluginConfig, db, job);
        });
      }
    },
    db,
    sri4node,
  );
}

/**
 *
 * @param {TSri4Node} sri4node
 * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
 * @param {*} db
 */
async function runJobsFromDB(sri4node, pluginConfig, db) {
  const jobsToRun = await db.any('SELECT key FROM "versionsQueue"');
  sri4node.debug('sri-audit', '[sri-audit] found ' + jobsToRun.length + ' versions on startup');
  for (let job of jobsToRun) {
    queue.add(async function () {
      await runJob(sri4node, pluginConfig, db, job.key);
    });
  }
}

/**
 *
 * @param {*} db
 */
async function installTriggers(db) {
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
   * @param {TSri4NodeAuditBroadcastPluginConfig} pluginConfig
   * @param {TSriConfig} _sriConfig
   * @param {import('pg-promise').IDatabase} db
   * @param {TSri4Node} sri4node
   */
  init: async function (pluginConfig, _sriConfig, db, sri4node) {
    sri4node.debug('sri-audit', '[init] Start version queue');
    await installTriggers(db);
    runJobsFromDB(sri4node, pluginConfig, db);
    runListener(sri4node, pluginConfig, db);
  },

  /**
   * Tries to stop the listeners and close the connection to the database.
   */
  close: async () => {
    dblistener.close();
  },
};
