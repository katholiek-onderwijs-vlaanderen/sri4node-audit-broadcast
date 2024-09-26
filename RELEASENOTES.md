# Release Notes

cfr. [keepachangelog.com](https://keepachangelog.com/en/1.1.0/)

- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.

## [Unreleased]

### Added

- automatically remove properties that are not defined in the schema (or add an option to make it behave this way)

### Changed

### Deprecated

### Removed

### Fixed

## [v2.3.10] - 2024-09-26

### Changed

- Improved logging: now the url is logged when rertry is attempted

## [v2.3.9] - 2024-05-17

### Fixed

- Fixed logging of status code when put to version api fails

### Security

## [v2.3.8] - 2024-05-13

### Fixed

- Fixed the prepare script in package.json, so it will work when installed as a dependency,
  and when installed locally for developement (in which case the git-hooks will be installed)

## [v2.3.7] - 2024-03-28

### Added

- A test suite
- Added prettier and lint-staged to the repo, so all staged files will be prettified on every commit
- RELEASENOTES.md
- added a close() method to the plugin, to do the cleanup (close db listener).
  When using sri4node > v2.3.34, the close function on the plugin will be closed automatically when the server is closed.

### Changed

- `const auditBroadcastSri4NodePluginFactory = require('sri4node-audit-broadcast');` has to be changed to `const { sri4NodeAuditBroadcastPluginFactory } = require('sri4node-audit-broadcast');`
- omitProperties have been improved

  - uses regex notation for matching the path now, so you can do a lot more than before.
    For simple property names, probably nothing will change

    But beware that there will be certain characters that you'll have to escape now, to avoid them being interpreted as regex special characters. (for example '\$', can best be written as '[$]' now)

  - also filters again before sending to /versions api (to fix dirty versions that have been added to the versionsQueue table earlier)

- updated dependencies
