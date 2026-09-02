WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "sourceUrl"
      ORDER BY "createdAt", "id"
    ) AS keeper_id
  FROM "Theme"
), duplicates AS (
  SELECT "id", keeper_id FROM ranked WHERE "id" <> keeper_id
)
UPDATE "Post"
SET "themeId" = duplicates.keeper_id
FROM duplicates
WHERE "Post"."themeId" = duplicates."id";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "sourceUrl"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Theme"
)
DELETE FROM "Theme"
USING ranked
WHERE "Theme"."id" = ranked."id"
  AND ranked.position > 1;

CREATE UNIQUE INDEX "Theme_sourceUrl_key" ON "Theme"("sourceUrl");
