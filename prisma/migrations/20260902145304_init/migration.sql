-- CreateEnum
CREATE TYPE "ThemeStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('generating', 'pending_approval', 'scheduled', 'published', 'rejected', 'error');

-- CreateEnum
CREATE TYPE "SlideTemplate" AS ENUM ('cover', 'evidence', 'framework');

-- CreateEnum
CREATE TYPE "ImageSource" AS ENUM ('stock', 'scraped');

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "headlineSuggestion" TEXT NOT NULL,
    "status" "ThemeStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'generating',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "instagramPostId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slide" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "template" "SlideTemplate" NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "imageUrl" TEXT,
    "cloudinaryPublicId" TEXT,
    "imageSource" "ImageSource" NOT NULL DEFAULT 'stock',
    "sourceImageUrl" TEXT,
    "imageDeletedAt" TIMESTAMP(3),

    CONSTRAINT "Slide_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
