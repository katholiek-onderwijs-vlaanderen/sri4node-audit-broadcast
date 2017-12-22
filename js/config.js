// main config.js file
const fs = require('fs')

const configurationFile = 'sri4node-audit-broadcast-config.json';

const config = JSON.parse(
    fs.readFileSync(configurationFile)
);

[ 'interval', 'sriUser', 'sriPassword', 'vskoApiHost' ].forEach( key => {
  if (config[key] === undefined || config[key] === '') {
    throw `Fatal error: sri4node-audit-broadcast configuration file is lacking value for ${key}.`
  }
} )

// export config
module.exports = config;
