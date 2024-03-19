# sri4node-audit-broadcast

An sri4node plugin to send updated resources to an audit server.

## Requirements
* An sri4node api
* A sri-audit-broadcast server (having a /versions resource where we can store every new version of any resource handled by the current api)


## Usage

### omitProperties
If some properties are not part of the document 
(they should have been $$properties but can not be changed for backwards compatibility), 
they can be omitted with the omitProperties

```javascript
const auditBroadcastSri4NodePluginFactory = require('sri4node-audit-broadcast');


const auditBroadcastPlugin = auditBroadcastSri4NodePluginFactory(
  /** @type {TSri4NodeAuditBroadcastPluginConfig} */
  {
    baseUrl: configuration.audit.host,
    headers: {
      headerName: "value"
    },
    auth: {
      user: "username",
      pass: "password"
    },
    omitProperties: {
      {RESOURCE-TYPE}: [...{array of properties}]
    }
  },
  sri4node, // the sri4node library instance
);


/** @type {TSriConfig} */
const sriConfig = {
  plugins: [
    auditBroadcastPlugin,
  ],
  description:
    'my api to store Oompa-Loompas and their songs',
  resources: [
    require('../resources/oompaloompas.js')(),
    require('../resources/songs.js')(),
  ],

  ...,
};

// and then instantiate the sri4node server with this configuration
```
