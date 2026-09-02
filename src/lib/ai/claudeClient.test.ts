import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { completeWithClaude } from './claudeClient';

describe('completeWithClaude', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  test('returns the text content from Claude', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello from claude' }],
    });

    const result = await completeWithClaude('say hello');

    expect(result).toBe('hello from claude');
  });

  test('throws when Claude returns no text block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'image' }] });

    await expect(completeWithClaude('say hello')).rejects.toThrow(
      'Claude response contained no text content'
    );
  });
});
