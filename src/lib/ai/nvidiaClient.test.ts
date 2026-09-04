import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockList = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    models: { list: mockList },
  })),
}));

describe('completeWithNvidia', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockCreate.mockReset();
    mockList.mockReset();
    mockList.mockResolvedValue({ data: [{ id: 'openai/gpt-oss-20b' }, { id: 'meta/llama-3.2-11b-vision-instruct' }] });
    process.env.NVIDIA_API_KEY = 'test-key';
  });

  test('returns the completion content from NVIDIA', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'hello from nvidia' } }],
    });

    const result = await completeWithNvidia('say hello');

    expect(result).toBe('hello from nvidia');
  });

  test('throws when NVIDIA returns no content', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] });

    await expect(completeWithNvidia('say hello')).rejects.toThrow(
      'NVIDIA response contained no content'
    );
  });

  test('checks the live catalog before calling, and never calls chat.completions for a retired model', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    mockList.mockResolvedValue({ data: [{ id: 'meta/llama-3.2-11b-vision-instruct' }] });

    await expect(completeWithNvidia('say hello', 'openai/gpt-oss-120b')).rejects.toThrow(
      'model "openai/gpt-oss-120b" is not in NVIDIA\'s current catalog',
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('does not re-list models on every call within the cache window', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'hi' } }] });

    await completeWithNvidia('one');
    await completeWithNvidia('two');

    expect(mockList).toHaveBeenCalledTimes(1);
  });
});
