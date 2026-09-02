import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'node:child_process';
import { runScrapeThemes } from './runScrapeThemes';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

describe('runScrapeThemes', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  test('returns candidates parsed from the Python stdout', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((...args) => {
      const callback = args.at(-1) as ExecCallback;
      callback(null, JSON.stringify({ candidates: [{
        sourceUrl: 'https://example.com/news',
        headline: 'New chip',
        summary: 'A faster chip shipped.',
        referenceImageUrls: ['https://example.com/chip.jpg'],
      }] }), '');
      return {} as ReturnType<typeof execFile>;
    });

    // Act
    const result = await runScrapeThemes();

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.headline).toBe('New chip');
    expect(execFile).toHaveBeenCalledWith(
      'python3',
      ['scripts/scrape_themes.py'],
      expect.anything(),
    );
  });

  test('rejects with stderr when the process fails', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((...args) => {
      const callback = args.at(-1) as ExecCallback;
      callback(new Error('exit code 1'), '', 'browser launch failed');
      return {} as ReturnType<typeof execFile>;
    });

    // Act / Assert
    await expect(runScrapeThemes()).rejects.toThrow(
      'runScrapeThemes: Python scraper failed: browser launch failed',
    );
  });

  test('rejects non-empty stderr even when the process exits successfully', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((...args) => {
      const callback = args.at(-1) as ExecCallback;
      callback(null, '{"candidates":[]}', 'unexpected warning');
      return {} as ReturnType<typeof execFile>;
    });

    // Act / Assert
    await expect(runScrapeThemes()).rejects.toThrow('unexpected warning');
  });

  test('rejects malformed output at the process boundary', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((...args) => {
      const callback = args.at(-1) as ExecCallback;
      callback(null, '{"candidates":[{"headline":7}]}', '');
      return {} as ReturnType<typeof execFile>;
    });

    // Act / Assert
    await expect(runScrapeThemes()).rejects.toThrow('runScrapeThemes: invalid scraper output');
  });
});
