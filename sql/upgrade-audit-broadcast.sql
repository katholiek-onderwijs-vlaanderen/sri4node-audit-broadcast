CREATE TABLE "versionsQueue"
(
    key UUID PRIMARY KEY,
    document JSONB
);
CREATE UNIQUE INDEX versionsQueue_key_uindex ON "versionsQueue" (key);