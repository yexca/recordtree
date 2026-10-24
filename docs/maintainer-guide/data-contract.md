# Data Contract

This document describes the workbook RecordTree imports and the rules that keep the database in step with it.

## Excel Workbook

RecordTree imports one source: the Record Tree Excel export (`.xlsx` or `.xlsm`). The active sheet has one header row with these columns, each named by its logical field or its export header:

| Field | Export header |
| --- | --- |
| `actor_raw` | `声优` |
| `delivery_date` | `配信日期` |
| `title` | `标题` |
| `entry_date` | `录入日期` |
| `note` | `备注` |
| `upload_title` | `上传标题` |
| `duplicate_search_raw` | `重复检索` |
| `source_name` | `来源` |
| `mega_json` | `MEGA` |
| `size_raw` | `容量` |

Every column must be present. Extra columns are ignored and reported in import notes. Each row needs a value for `actor_raw`, `title`, `upload_title`, `source_name`, and `mega_json`.

Dates may be typed Excel date cells or ISO-like strings. Blank dates become null. Invalid dates are row-level import errors.

## MEGA JSON

Each row's `mega_json` is a JSON object whose `property` field is a non-empty list of link items. Other root fields, such as `FileNames`, `total`, and `FormattedSize`, are ignored. The export writes `null` for a row whose files have no MEGA links yet; that row imports as a record group without links, which search reports as `unknown`.

Each `property` item is an object with:

- `Link`: required MEGA URL
- `Size`: required non-negative integer byte count or numeric string
- `Type`: optional; either an extension (`mp4`, `.MP4`) or a full file name (`[actor][date][title][date].mp4`). The extension becomes the link's file type, lower-case with a leading dot. A full file name is also kept as the link's file name.
- `FormattedSize`: optional human-readable size

String values may contain raw control characters such as line breaks, and surrounding whitespace is trimmed. Malformed JSON, a root that is neither an object nor `null`, a missing or empty `property`, a missing `Link`, or an invalid `Size` produce row-level import errors.

## Import Synchronization

An import treats the workbook as the complete library and makes the database match it in one transaction:

- Every valid row is a live record group. Rows with the same `source_key` merge into one group that lists the links of all of them in row order.
- A MEGA URL has one link row for the life of the database, so download status follows the URL. A URL that appears in more than one row stays on the first row, and each repeat is a `duplicate_url` import error.
- A row updates the existing group that owns the most of its URLs. A row whose URLs are all unknown updates an unclaimed group with the same `source_key`, and otherwise creates a group. Editing a row's metadata, such as its source, keeps the group id and its download history.
- Group metadata and each listed link's order, file name, file type, and sizes are updated in place. A link listed under another row moves to that row's group.
- Groups and links the workbook no longer lists are marked deleted (`is_deleted = 1`) and keep their download history. A later workbook that lists them again restores them.
- Actors and sources without live record groups are removed, except actors marked as favorites.

Row-level errors do not stop an import, and a row that fails to parse counts as absent. A workbook without any valid row fails the import and leaves the database unchanged.

`source_key` is a hash of the normalized actor, delivery date, title, entry date, upload title, and source name.

## Schema Version

`schema_meta` stores the schema version. RecordTree upgrades a database at or above `OLDEST_SUPPORTED_SCHEMA_VERSION` in place when it opens it. It rejects an older database; move that file aside and import the workbook into a new database.

## Download Status Values

Download rows and items use these status values:

- `planned`
- `running`
- `completed`
- `failed`
- `blocked`
- `cancelled`
- `interrupted`

Search and stats derive record-level labels from active links:

- `all`: every active link has a `completed` download item
- `partial`: some active links are completed
- `none`: no active links are completed
- `unknown`: no active links exist
