##Requirements
* An sri4node api
* A sri-audit-broadcast server


##To Start
* Run the script in your sri4node database

##Usage

###Timer
Initialize the sri4node-audit-broadcast module

###omitProperties
If some properties are not part of the document 
(they should have been $$properties but can not be changed for backwards compatibility), 
they can be omitted with the omitProperties

```javascript
var audit = require('sri4node-audit-broadcast');
audit.init(pg, {
  timeout: 10000,
  host: {
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
  }
});
```

###After read functions
Add the after read functions.


```javascript
{
  ...,
  afterupdate[audit.update],
  afterinsert[audit.create],
  afterdelete[audit.delete],
  ...
}
```
