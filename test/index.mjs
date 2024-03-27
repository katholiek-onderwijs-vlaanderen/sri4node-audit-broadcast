// mocha test suite to check if doAudit function works properly
import { assert } from 'chai';
import sinon from 'sinon';

import * as sri4node from 'sri4node';

import express from 'express'; // defazult import
import { Server } from 'http';
const { default: sleep } = await import('await-sleep');

// should be useless as of node 18 I guess
import fetch from 'node-fetch';

// require the plugin
const auditPluginCJS = await import('../js/index.js');
import * as auditPluginESM from '../js/index.mjs';

const { setByPath, cleanupDocument } = await import('../js/utils.js');

// const { default: sri4nodeAuditBroadcastPluginFactory } = await import('../js/index.js');

/**
 * Do a GET (or other operation if fetchRequestOptions is used) to the given URL, and check if the response is 200.
 * Return the parsed JSON.
 *
 * @param {string} url
 * @param {import('node-fetch').RequestInit} fetchRequestOptions
 * @param {number} expectedResponseCode (default 200)
 * @returns {Promise<Record<string, any>>}
 */
async function fetchAndCheck(url, fetchRequestOptions = undefined, expectedResponseCode = 200) {
  const apiResp = await fetch(url, fetchRequestOptions);
  if (apiResp.status !== expectedResponseCode) {
    assert.fail(
      `Expected status code ${expectedResponseCode}, got ${apiResp.status}. Response body: ${await apiResp.text()}`,
    );
  }
  try {
    const respText = await apiResp.text();
    if (respText.length > 0 && apiResp.headers.get('Content-Type')?.includes('application/json')) {
      /** @type {Record<string, any>} */
      const respJson = JSON.parse(respText);
      return respJson;
    } else {
      return JSON.parse(JSON.stringify(respText));
    }
  } catch (e) {
    const respText = await apiResp.text();
    return JSON.parse(JSON.stringify(respText));
  }
}

/**
 * The sinon spy that will be used to check if the version API was called correctly.
 * @type {import('sinon').SinonSpy}
 */
const versionApiPutHandlerSpy = sinon.spy((req, res) =>
  res.status(200).json({ key: req.params.key }),
);

/**
 * Creates an express app running on port 3000 that will serve the version API.
 * The listening Server instance will be returned, so it can be closed afterwards.
 */
async function startVersionApiServer() {
  const versionApiHttpServer = express();
  versionApiHttpServer.use(express.json());
  versionApiHttpServer.put('/versions/:key', versionApiPutHandlerSpy);
  return versionApiHttpServer.listen(3000);
}

//////////////////////////////////
// first test individual functions
//////////////////////////////////
describe('======== Unit tests ========', () => {
  describe('setByPath', () => {
    it('should set a value in an object by a path', () => {
      const obj = {};
      setByPath(obj, ['a', 'b', 'c'], 123);
      assert.deepEqual(obj, { a: { b: { c: 123 } } });
    });
    it('should also support intermediate arrays', () => {
      const obj = { a: [] };
      setByPath(obj, ['a', 2, 'c'], 123);
      assert.deepEqual(obj, { a: [undefined, undefined, { c: 123 }] });
    });
  });

  describe('cleanupDocument', () => {
    it('should remove all properties as configured in omitProperties and no more', () => {
      const dirtyDoc = {
        key: '123',
        src: 'test',
        longSrc: 'this one should be removed',
        $$something: 'this one should be removed as well',
        $$somethingElse: 'this one should NOT be removed',
      };
      const dirtyDocCopy = JSON.parse(JSON.stringify(dirtyDoc));
      const cleanDoc = cleanupDocument(['longSrc', '\\$\\$something'], dirtyDocCopy);

      // assert that dirtyDocCopy is not modified
      assert.deepEqual(dirtyDocCopy, dirtyDoc);

      assert.deepEqual(cleanDoc, {
        key: '123',
        src: 'test',
      });

      assert.deepEqual(cleanupDocument(['longSrc', '[$][$]something'], dirtyDocCopy), {
        key: '123',
        src: 'test',
      });
    });
    it('should not fail if a property in omitProperties does not exist', () => {
      const dirtyDoc = {
        key: '123',
        src: 'test',
      };
      const dirtyDocCopy = JSON.parse(JSON.stringify(dirtyDoc));
      const cleanDoc = cleanupDocument(['longSrc', '[$][$]something'], dirtyDocCopy);

      // assert that dirtyDocCopy is not modified
      assert.deepEqual(dirtyDocCopy, dirtyDoc);

      assert.deepEqual(cleanDoc, {
        key: '123',
        src: 'test',
      });
    });
    it('should leave the document untouched when omitProperties is null or not an array', () => {
      const dirtyDoc = {
        key: '123',
        src: 'test',
        longSrc: 'this one should not be removed in this test',
        $$something: 'this one should not be removed either in this test',
      };
      const dirtyDocCopy = JSON.parse(JSON.stringify(dirtyDoc));
      const cleanDoc = cleanupDocument(undefined, dirtyDocCopy);

      // assert that dirtyDocCopy is not modified
      assert.deepEqual(dirtyDocCopy, dirtyDoc);

      assert.deepEqual(cleanDoc, dirtyDoc);
    });

    it('should support regex strings to match the path(s)', () => {
      const dirtyDoc = {
        key: '123',
        src: 'test',
        longSrc: 'this one should be removed',
        longSomethingElse: 'this one should be removed',
        $$something: 'this one should be removed as well',
        $$anotherDollarProperty: 'this one should be removed as well',
        someArray: [
          { a: 1, b: 'test1', c: true },
          { a: 2, b: 'test2', c: false },
          { a: 3, b: 'test3', c: true },
        ],
      };
      const dirtyDocCopy = JSON.parse(JSON.stringify(dirtyDoc));
      const cleanDoc = cleanupDocument(
        ['long.*', '\\$\\$.*', 'someArray[.][0-9]+[.]b'],
        dirtyDocCopy,
      );

      // assert that dirtyDocCopy is not modified
      assert.deepEqual(dirtyDocCopy, dirtyDoc);

      assert.deepEqual(cleanDoc, {
        key: '123',
        src: 'test',
        someArray: [
          { a: 1, c: true },
          { a: 2, c: false },
          { a: 3, c: true },
        ],
      });

      const cleanDoc2 = cleanupDocument(
        ['long.*', '\\$\\$.*', 'someArray[.]1[.][bc]'],
        dirtyDocCopy,
      );
      assert.deepEqual(cleanDoc2, {
        key: '123',
        src: 'test',
        someArray: [{ a: 1, b: 'test1', c: true }, { a: 2 }, { a: 3, b: 'test3', c: true }],
      });

      // how to remove all properties with a certain name, regardless of how deeply they are nested
      const dirtyDoc2 = {
        a: '123',
        toremove: 'this one should be removed',
        b: 'keep this one',
        c: { d: '123', toremove: true, e: 'keep this one' },
        someArray: [
          { a: 1, b: 'test1', toremove: true },
          { a: 2, b: 'test2' },
          { a: 3, b: 'test3', toremove: 99999999 },
        ],
      };
      const cleanDoc3 = cleanupDocument(['^([^.]+[.])*toremove$'], dirtyDoc2);
      assert.deepEqual(cleanDoc3, {
        a: '123',
        b: 'keep this one',
        c: { d: '123', e: 'keep this one' },
        someArray: [
          { a: 1, b: 'test1' },
          { a: 2, b: 'test2' },
          { a: 3, b: 'test3' },
        ],
      });
    });
  });
});

/**
 * We want to make sure that both module types will behave exactly the same,
 * so we'll run the same tests for both module types.
 *
 * @param {*} pluginModule the loaded module, either the ESM module or the CJS module!
 * @param {'CJS' | 'ESM'} moduleType
 */
function runTests(pluginModule, moduleType) {
  const { sri4NodeAuditBroadcastPluginFactory } = pluginModule;

  describe(`======== Testing ${moduleType} module ========`, () => {
    // then test the integration of the plugin into an actual sri4node server
    describe('Integration tests', () => {
      /** @type {import('sri4node').TSriServerInstance} */
      let sri4nodeServerInstance;
      /** @type {Server} */
      let httpServer;

      /** @type {import('sri4node').TPluginConfig} */
      let plugin; // so we can cleanup afterwards

      /** these are the docs (as an array of tuples) that will be inserted into the database at api startup
       * It should be translated to a json object with properties 'key', 'title' and 'src'
       * @type {Array<[number, string, string]>}
       */
      const docs = [1, 2, 3, 4, 5].map((i) => [i, `Document ${i}`, `This is document ${i}`]);
      /**
       * @param {[number, string, string]} docTuple containing key, title and src
       * @returns
       */
      function docTupleToObject(docTuple) {
        return {
          key: docTuple[0],
          title: docTuple[1],
          src: docTuple[2],
        };
      }

      before(async () => {
        // express app
        const app = express();
        /**
         * @type {import('../js').TSri4NodeAuditBroadcastPluginConfig}
         */
        const pluginConfig = {
          versionApiBase: 'http://localhost:3000',
          component: 'test',
          headers: [],
          auth: {
            user: 'john',
            pass: 'johnssecret',
          },
          omitProperties: {
            '/documents': ['longSrc', '\\$\\$something'],
          },
        };

        /** @type {import('sri4node').TSriConfig} */
        const sriConfig = {
          // logdebug: {
          //   channels: 'all',
          // },
          resources: [
            {
              type: '/documents',
              metaType: 'DOCUMENT',
              schema: {
                type: 'object',
                properties: {
                  key: {
                    type: 'number',
                  },
                  title: {
                    type: 'string',
                  },
                  src: {
                    type: 'string',
                  },
                  // additionalProperties: false,
                },
                required: ['key', 'title'],
                // additionalProperties: false,
              },
              map: {
                key: {
                  column: 'key',
                },
                title: {
                  column: 'title',
                },
                src: {
                  column: 'src',
                },
              },
            },
          ],
          databaseConnectionParameters: {
            host: 'localhost',
            port: 25437,
            database: 'postgres',
            user: 'postgres',
            password: 'postgres',
            schema: 'public',
          },
          startUp: [
            async (db, _pgp) => {
              // make sure we have a table for storing our documents
              await db.none(
                `CREATE TABLE IF NOT EXISTS documents (
                  key INTEGER PRIMARY KEY,
                  title TEXT,
                  src TEXT,
                  "$$meta.created" timestamp with time zone DEFAULT now() NOT NULL,
                  "$$meta.modified" timestamp with time zone DEFAULT now() NOT NULL,
                  "$$meta.deleted" boolean DEFAULT false NOT NULL
                )`,
              );

              // make sure the table is empty (so the tests can always start from a clean slate)
              await db.none('DELETE FROM documents');

              // now insert a few documents
              const insertSql = `INSERT INTO documents (key, title, src)
              VALUES ${docs
                .map((d, i) => `(${d.map((f, j) => `\$${i * 3 + j + 1}`).join(',')})`)
                .join(',')}`;
              await db.none(insertSql, docs.flat());
            },
          ],
          plugins: [sri4NodeAuditBroadcastPluginFactory(pluginConfig, sri4node)],
        };

        // setup the sri4node server
        sri4nodeServerInstance = await sri4node.configure(app, sriConfig);
        // start listening
        httpServer = app.listen(8642);

        plugin = sriConfig.plugins[0];
      });

      after(async () => {
        try {
          httpServer.close();
        } catch (e) {
          console.error('Error while closing http server:', e);
        }

        // necessary as long as sri4node does not implement the mechanism for calling close on every plugin automatically
        try {
          plugin.close();
        } catch (e) {
          console.error('Error while closing plugin:', e);
        }

        try {
          sri4nodeServerInstance.close();
        } catch (e) {
          console.error('Error while closing sri4node server instance:', e);
        }
      });

      describe('Tests while the version api is not running', () => {
        it('api should return a resource', async () => {
          const apiResp = await fetchAndCheck('http://localhost:8642/documents/1');
          const respWithoutMeta = { ...apiResp };
          delete respWithoutMeta['$$meta'];
          assert.deepEqual(respWithoutMeta, docTupleToObject(docs[0]));
        });

        it('api should add a cleaned record to versionsQueue after UPDATE', async () => {
          const apiGetBody = await fetchAndCheck('http://localhost:8642/documents/1');

          // now put an updated version of this resource
          const docToPut = {
            ...apiGetBody,
            title: apiGetBody.title + ' [Updated]',
            // these should be removed
            longSrc: 'remove this',
            $$something: 'remove this as well',
          };
          /** same doc but without a few properties */
          const docToVersionsApi = { ...docToPut };
          delete docToVersionsApi['longSrc'];
          delete docToVersionsApi['$$something'];

          const apiPutBody = await fetchAndCheck('http://localhost:8642/documents/1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(docToPut),
          });

          const dbResp = await sri4nodeServerInstance.db.one(
            'SELECT count(*) FROM "versionsQueue"',
          );
          assert.equal(dbResp.count, 1);
          const versionDocumentFromVersionsQueueTable = (
            await sri4nodeServerInstance.db.one('SELECT document FROM "versionsQueue"')
          ).document;

          assert.deepEqual(versionDocumentFromVersionsQueueTable.document, docToVersionsApi);
        });
      });

      describe('Tests while the version api is running', () => {
        /** @type {Server} */
        let versionApiServer;
        before(async () => {
          console.log('                                 Starting version api server...');
          versionApiServer = await startVersionApiServer();
          await sleep(1000); // give the version api server some time to start and to empty the versionsQueue
        });
        after(async () => {
          console.log('                                 Stopping version api server...');
          versionApiServer.close();
        });

        it('versionsQueue should be empty by now', async () => {
          const dbResp = await sri4nodeServerInstance.db.one(
            'SELECT count(*) FROM "versionsQueue"',
          );
          assert.equal(dbResp.count, 0);
        });

        it('versionsQueue should contain a cleaned object', async () => {
          versionApiPutHandlerSpy.resetHistory();

          const docToPut = {
            ...docTupleToObject(docs[0]),
            title: docs[0][1] + ' [Updated again]',
            // these should be removed
            longSrc: 'remove this',
            $$something: 'remove this as well',
          };
          /** same doc but without a few properties */
          const docToVersionsApi = { ...docToPut };
          delete docToVersionsApi['longSrc'];
          delete docToVersionsApi['$$something'];

          const apiPutResp = await fetchAndCheck('http://localhost:8642/documents/1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(docToPut),
          });
          await sleep(200); // allow the versionsQueueu to be emptied
          // const dbResp = await sri4nodeServerInstance.db.one('SELECT count(*) FROM "versionsQueue"');
          // assert.equal(dbResp.count, 0);

          // versionApiPutHandlerSpy.calledOnce();
          // get req body from spy
          sinon.assert.calledOnce(versionApiPutHandlerSpy);
          const reqBody = versionApiPutHandlerSpy.args[0][0].body;
          assert.deepEqual(reqBody.document, docToVersionsApi);
          // console.log(JSON.stringify(reqBody, null, 2));
        });

        it('if versionsQueue table contains a dirty object, a cleaned object should be sent to /versions api', async () => {
          versionApiPutHandlerSpy.resetHistory();

          const docToPut = {
            ...docTupleToObject(docs[0]),
            title: docs[0][1] + ' [Updated again]',
            // these should be removed
            longSrc: 'remove this',
            $$something: 'remove this as well',
          };
          /** same doc but without a few properties */
          const docToVersionsApi = { ...docToPut };
          delete docToVersionsApi['longSrc'];
          delete docToVersionsApi['$$something'];

          const versionsQueueDocument = {
            key: '09c72f65-fcce-4601-bb0b-c71dc45b9258',
            type: '/documents',
            person: '',
            document: docToPut,
            resource: '/documents/1',
            component: 'test',
            operation: 'UPDATE',
            timestamp: '2024-03-27T13:35:16.651Z',
          };

          // insert a 'dirty' document into the versionsQueue
          sri4nodeServerInstance.db.none('INSERT INTO "versionsQueue" VALUES ($1, $2)', [
            versionsQueueDocument.key,
            versionsQueueDocument,
          ]);
          await sleep(200); // allow the versionsQueueu to be emptied
          // const dbResp = await sri4nodeServerInstance.db.one('SELECT count(*) FROM "versionsQueue"');
          // assert.equal(dbResp.count, 0);

          // versionApiPutHandlerSpy.calledOnce();
          // get req body from spy
          sinon.assert.calledOnce(versionApiPutHandlerSpy);
          const reqBody = versionApiPutHandlerSpy.args[0][0].body;
          assert.deepEqual(reqBody.document, docToVersionsApi);
        });
      });
    });
  });
}

if (process.env.SKIP_INTEGRATION_TESTS !== 'true') {
  // Actually define the tests to be run for both module types here
  runTests(auditPluginCJS, 'CJS');
  runTests(auditPluginESM, 'ESM');
}
