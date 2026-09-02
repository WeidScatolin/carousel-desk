import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));

import { analyzeReferenceImage } from './analyzeReferenceImage';
import { completeWithClaude } from './claudeClient';
import { completeWithNvidia } from './nvidiaClient';

describe('analyzeReferenceImage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('returns the short visual description from the selected model', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_IMAGE_ANALYSIS', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue('Foto escura, alto contraste, foco no chip.');

    // Act
    const result = await analyzeReferenceImage('https://example.com/chip.jpg');

    // Assert
    expect(result).toBe('Foto escura, alto contraste, foco no chip.');
    expect(completeWithNvidia).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/chip.jpg'),
      'meta/llama-3.2-90b-vision-instruct',
    );
  });

  test('returns null when the provider call fails', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_IMAGE_ANALYSIS', 'claude');
    vi.mocked(completeWithClaude).mockRejectedValue(new Error('vision unavailable'));

    // Act
    const result = await analyzeReferenceImage('https://example.com/chip.jpg');

    // Assert
    expect(result).toBeNull();
  });
});
