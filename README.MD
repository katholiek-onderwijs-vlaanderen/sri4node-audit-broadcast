##Requirements
* An sri4node api
* A sri-audit-broadcast server


##To Start
* Run the script in your sri4node database

##Usage

###Timer
Initialize the sri4node-audit-broadcast module

```javascript
var audit = require('sri4node-audit-broadcast');
audit.init(pg, {
  timeout: 10000,
  host: configuration.audit.host
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

