import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { completeWithNvidia } from './nvidiaClient';

describe('completeWithNvidia', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.NVIDIA_API_KEY = 'test-key';
  });

  test('returns the completion content from NVIDIA', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'hello from nvidia' } }],
    });

    const result = await completeWithNvidia('say hello');

    expect(result).toBe('hello from nvidia');
  });

  test('throws when NVIDIA returns no content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] });

    await expect(completeWithNvidia('say hello')).rejects.toThrow(
      'NVIDIA response contained no content'
    );
  });
});
