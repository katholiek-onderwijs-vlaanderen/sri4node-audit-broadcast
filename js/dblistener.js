let db;

let connection;
let channelName;
let runOnNotif;
let runOnError;
let tableName;
let keyName;

async function onNotification(data) {
    try {
        console.log('Received Payload:', data.payload);
        if (data.payload != 'test') {
            let row = await db.one('SELECT * FROM $2~ where $3~ = $1', [data.payload, tableName, keyName])
            await runOnNotif(row);
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
    console.log('Connectivity Problem:', err);
    connection = null; // prevent use of the broken connection
    removeListeners(e.client);
    reconnect(5000, 20) // retry 20 times, with 5-second intervals
        .then(() => {
            console.log('Successfully Reconnected');
        })
        .catch(() => {
            // failed after 10 attempts
            console.log('Connection Lost Permanently');
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
                    console.log('Error Connecting:', error);
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

// function sendNotifications() {

//     if (connection) {
//         connection.none('NOTIFY $1~, $2', [channelName, 'test'])
//             .catch(error => {
//                 console.log('Failed to Notify:', error); // unlikely to ever happen
//             })
//     }

// }

function connect(channel, table, key, onError, onNotif, dbobj) {

    channelName = channel;
    runOnError = onError;
    runOnNotif = onNotif;
    tableName = table;
    keyName = key;
    db = dbobj;
    reconnect() // = same as reconnect(0, 1)
        .then(obj => {
            console.log('Successful Initial Connection');
            // obj.done(); - releases the connection
            //sendNotifications();
        })
        .catch(error => {
            console.log('Failed Initial Connection:', error);
        });
}


module.exports = {
    connect: connect
}
