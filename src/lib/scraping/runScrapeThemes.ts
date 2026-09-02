import { execFile } from 'node:child_process';
import { z } from 'zod';

const scrapedCandidateSchema = z.object({
  sourceUrl: z.string().url(),
  headline: z.string().trim().min(1),
  summary: z.string(),
  referenceImageUrls: z.array(z.string().url()).max(2),
});

const scraperOutputSchema = z.object({
  candidates: z.array(scrapedCandidateSchema),
});

export interface ScrapedCandidate {
  sourceUrl: string;
  headline: string;
  summary: string;
  referenceImageUrls: string[];
}

function parseOutput(stdout: string): ScrapedCandidate[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return scraperOutputSchema.parse(parsed).candidates;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`runScrapeThemes: invalid scraper output: ${detail}`);
  }
}

export async function runScrapeThemes(): Promise<ScrapedCandidate[]> {
  return new Promise((resolve, reject) => {
    execFile('python3', ['scripts/scrape_themes.py'], (error, stdout, stderr) => {
      if (error || stderr.trim()) {
        const detail = stderr.trim() || error?.message || 'unknown process failure';
        reject(new Error(`runScrapeThemes: Python scraper failed: ${detail}`));
        return;
      }
      try {
        resolve(parseOutput(stdout));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}
