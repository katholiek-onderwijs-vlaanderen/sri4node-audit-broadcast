let db;

let connection;
let channelName;
let runOnNotif;
let runOnError;

async function onNotification(data) {
  try {
    console.debug('[sri-audit] Received version:', data.payload);
    if (data.payload !== 'test') {
      await runOnNotif(data.payload);
    }
  } catch (e) {
    runOnError(e);
  }
}

function setListeners(client) {
  client.on('notification', onNotification);
  return connection.none('LISTEN $1~', channelName)
    .catch((error) => {
      console.log(error); // unlikely to ever happen
    });
}

function removeListeners(client) {
  client.removeListener('notification', onNotification);
}

function reconnect(pDelay, pMaxAttempts) {
  const delay = pDelay > 0 ? parseInt(pDelay, 10) : 0;
  const maxAttempts = pMaxAttempts > 0 ? parseInt(pMaxAttempts, 10) : 1;
  let remainingAttempts = maxAttempts;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      db.connect({ direct: true, onLost: onConnectionLost })
        .then((obj) => {
          connection = obj; // global connection is now available
          resolve(obj);
          return setListeners(obj.client);
        })
        .catch((error) => {
          console.log('[sri-audit] Error Connecting:', error);
          remainingAttempts -= 1;
          if (remainingAttempts > 0) {
            reconnect(delay, maxAttempts)
              .then(resolve)
              .catch(reject);
          } else {
            reject(error);
          }
        });
    }, delay);
  });
}

function onConnectionLost(err, e) {
  console.log('[sri-audit] Connectivity Problem:', err);
  connection = null; // prevent use of the broken connection
  removeListeners(e.client);
  reconnect(5000, 20) // retry 20 times, with 5-second intervals
    .then(() => {
      console.log('[sri-audit] Successfully Reconnected');
    })
    .catch(() => {
      // failed after 10 attempts
      console.log('[sri-audit] Connection Lost Permanently');
      process.exit(); // exiting the process
    });
}

function connect(channel, onError, onNotif, dbobj) {
  channelName = channel;
  runOnError = onError;
  runOnNotif = onNotif;
  db = dbobj;
  reconnect() // = same as reconnect(0, 1)
    .then((/* obj */) => {
      console.log('[sri-audit] Successful Initial Connection');
      // obj.done(); - releases the connection
      // sendNotifications();
    })
    .catch((error) => {
      console.log('[sri-audit] Failed Initial Connection:', error);
    });
}

module.exports = {
  connect,
};
