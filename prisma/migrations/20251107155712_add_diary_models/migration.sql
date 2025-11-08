-- CreateTable
CREATE TABLE "Diary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diaryDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CHATTING',
    "summaryMd" TEXT,
    "isWeeklySummary" BOOLEAN NOT NULL DEFAULT false,
    "weekIdentifier" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DiaryMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diaryId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiaryMessage_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "Diary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT,
    "diaryId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT,
    "inputHash" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "outputJson" JSONB,
    "rawText" TEXT,
    "tokenUsage" INTEGER NOT NULL,
    "cost" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIReview_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AIReview_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "Diary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AIReview" ("cost", "createdAt", "errorMessage", "id", "inputHash", "kind", "model", "ok", "outputJson", "postId", "prompt", "rawText", "tokenUsage") SELECT "cost", "createdAt", "errorMessage", "id", "inputHash", "kind", "model", "ok", "outputJson", "postId", "prompt", "rawText", "tokenUsage" FROM "AIReview";
DROP TABLE "AIReview";
ALTER TABLE "new_AIReview" RENAME TO "AIReview";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Diary_diaryDate_key" ON "Diary"("diaryDate");

-- CreateIndex
CREATE INDEX "Diary_diaryDate_idx" ON "Diary"("diaryDate");

-- CreateIndex
CREATE INDEX "Diary_weekIdentifier_idx" ON "Diary"("weekIdentifier");

-- CreateIndex
CREATE INDEX "DiaryMessage_diaryId_createdAt_idx" ON "DiaryMessage"("diaryId", "createdAt");
