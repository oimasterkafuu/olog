-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "summary" TEXT,
    "coverUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" DATETIME,
    "seriesId" TEXT,
    "autoSummary" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "metaJson" JSONB NOT NULL,
    "assetHashes" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("assetHashes", "autoSummary", "contentMd", "coverUrl", "createdAt", "id", "metaJson", "publishedAt", "seriesId", "slug", "status", "summary", "title", "updatedAt") SELECT "assetHashes", "autoSummary", "contentMd", "coverUrl", "createdAt", "id", "metaJson", "publishedAt", "seriesId", "slug", "status", "summary", "title", "updatedAt" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE TABLE "new_Series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "orderJson" JSONB NOT NULL
);
INSERT INTO "new_Series" ("description", "id", "orderJson", "slug", "title") SELECT "description", "id", "orderJson", "slug", "title" FROM "Series";
DROP TABLE "Series";
ALTER TABLE "new_Series" RENAME TO "Series";
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
