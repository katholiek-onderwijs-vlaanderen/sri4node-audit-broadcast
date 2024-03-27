# sri4node-audit-broadcast

An sri4node plugin to send updated resources to an audit server.

## Requirements

- An sri4node api
- A sri-audit-broadcast server (having a /versions resource where we can store every new version of any resource handled by the current api)

## Usage

```javascript
const { sri4NodeAuditBroadcastPluginFactory } = require('sri4node-audit-broadcast');


const auditBroadcastPlugin = sri4NodeAuditBroadcastPluginFactory(
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
    // read more about omitProperties below
    omitProperties: {
      {RESOURCE-TYPE}: [...{array of property regexes}]
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

### omitProperties

If some properties are not part of the document (they should have been $$properties for example but can not be changed for backwards compatibility), they can be omitted with the omitProperties object in the plugin config. This mean they will be removed from the document before sending the document to the /versions api.
omitProperties is an object with the resource type as key and an array of property path regular expressions as value. So you can omit properties at any level of the document, not just the root. Be ware that if you want to use a backslash to escape the next character in the regular expression, you need to escape it in the javascript string with another backslash. This means that `'\\.'` in the regular expression string will match a single dot (in regular JS RegExp notation this would be written as `/\./`). In order to avoid confusion, it is recommended to use the `'[.]'` notation for escaping literal characters (except for when you'd need a ^ character, then you'd really need to write `\\^`).

#### Examples on how to use omitProperties

```javascript
// for the /books resource, omit the (root) properties 'title' and 'author'
omitProperties = [
  {
    books: ['title', 'author'],
  },
];

// for the /books resource, omit all properties starting with $$ regardless of where they are in the document
omitProperties = [
  {
    books: ['^([^.]+[.])*[$][$]]$'],
  },
];

// for the /authors resource, omit all externalUrl properties inside the objects of the 'books' array
omitProperties = [
  {
    authors: ['^books[.][0-9]+[.]externalUrl$'],
  },
];
```
