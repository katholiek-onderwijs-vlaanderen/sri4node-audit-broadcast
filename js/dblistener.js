/**
 * @typedef {import('sri4node')} TSri4Node
 * @typedef {import('sri4node').TSriConfig} TSriConfig
 * @typedef {import('sri4node').TPluginConfig} TPluginConfig
 */

/** @type {import('pg-promise').IDatabase} */
let db;

/** @type {import('pg-promise').IConnected} */
let connection;
let channelName;
let runOnNotif;
let runOnError;
/** @type {TSri4Node} */
let sri4node;

async function onNotification(data) {
  try {
    sri4node.debug('sri-audit', `[onNotification] Received version: ${data.payload}`);
    if (data.payload != 'test') {
      await runOnNotif(data.payload);
    }
  } catch (e) {
    runOnError(e);
  }
}

function setListeners(client) {
  client.on('notification', onNotification);
  return connection.none('LISTEN $1~', channelName).catch((error) => {
    sri4node.error(error); // unlikely to ever happen
  });
}

function removeListeners(client) {
  client.removeListener('notification', onNotification);
}

function onConnectionLost(err, e) {
  sri4node.debug('sri-audit', `[onConnectionLost] Connectivity Problem: ${err}`);
  connection = null; // prevent use of the broken connection
  removeListeners(e.client);
  reconnect(5000, 20) // retry 20 times, with 5-second intervals
    .then(() => {
      sri4node.debug('sri-audit', '[onConnectionLost] Successfully Reconnected');
    })
    .catch(() => {
      // failed after 10 attempts
      sri4node.debug(
        'sri-audit',
        '[onConnectionLost] Connection Lost Permanently, shutting down...',
      );
      process.exit(); // exiting the process
    });
}

function reconnect(delay, maxAttempts) {
  delay = delay > 0 ? parseInt(delay) : 0;
  maxAttempts = maxAttempts > 0 ? parseInt(maxAttempts) : 1;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      db.connect({ direct: true, onLost: onConnectionLost })
        .then((obj) => {
          connection = obj; // global connection is now available
          resolve(obj);
          return setListeners(obj.client);
        })
        .catch((error) => {
          sri4node.debug('sri-audit', `[reconnect] Error Connecting: ${error}`);
          if (--maxAttempts) {
            reconnect(delay, maxAttempts).then(resolve).catch(reject);
          } else {
            reject(error);
          }
        });
    }, delay);
  });
}

/**
 *
 * @param {*} channel
 * @param {*} onError
 * @param {*} onNotif
 * @param {*} dbObj
 * @param {TSri4Node} pSri4node
 */
function connect(channel, onError, onNotif, dbObj, pSri4node) {
  sri4node = pSri4node;
  channelName = channel;
  runOnError = onError;
  runOnNotif = onNotif;
  db = dbObj;
  reconnect() // = same as reconnect(0, 1)
    .then((obj) => {
      pSri4node.debug('sri-audit', '[connect] Successful Initial Connection');
      // obj.done(); - releases the connection
      //sendNotifications();
    })
    .catch((error) => {
      pSri4node.debug('sri-audit', `[connect] Failed Initial Connection:${error}`);
    });
}

module.exports = {
  connect,
  close: () => {
    if (connection) {
      removeListeners(connection.client);
      connection.done();
    }
  },
};
