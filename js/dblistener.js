let db;

let connection;
let channelName;
let runOnNotif;
let runOnError;

async function onNotification(data) {
    try {
        console.debug('[sri-audit] Received version:', data.payload);
        if (data.payload != 'test') {
            await runOnNotif(data.payload);
        }
    }
    catch (e) {
        runOnError(e);
    }
}

function setListeners(client) {
    client.on('notification', onNotification);
    return connection.none('LISTEN $1~', channelName)
        .catch(error => {
            console.log(error); // unlikely to ever happen
        });
}

function removeListeners(client) {
    client.removeListener('notification', onNotification);
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

function reconnect(delay, maxAttempts) {
    delay = delay > 0 ? parseInt(delay) : 0;
    maxAttempts = maxAttempts > 0 ? parseInt(maxAttempts) : 1;
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            db.connect({ direct: true, onLost: onConnectionLost })
                .then(obj => {
                    connection = obj; // global connection is now available
                    resolve(obj);
                    return setListeners(obj.client);
                })
                .catch(error => {
                    console.log('[sri-audit] Error Connecting:', error);
                    if (--maxAttempts) {
                        reconnect(delay, maxAttempts)
                            .then(resolve)
                            .catch(reject);
                    }
                    else {
                        reject(error);
                    }
                });
        }, delay);
    });
}

function connect(channel, onError, onNotif, dbobj) {

    channelName = channel;
    runOnError = onError;
    runOnNotif = onNotif;
    db = dbobj;
    reconnect() // = same as reconnect(0, 1)
        .then(obj => {
            console.log('[sri-audit] Successful Initial Connection');
            // obj.done(); - releases the connection
            //sendNotifications();
        })
        .catch(error => {
            console.log('[sri-audit] Failed Initial Connection:', error);
        });
}


module.exports = {
    connect: connect
}
