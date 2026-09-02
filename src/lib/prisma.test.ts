import { describe, test, expect, afterEach } from 'vitest';
import { prisma } from './prisma';

describe('prisma client', () => {
  afterEach(async () => {
    await prisma.theme.deleteMany({
      where: { sourceUrl: 'https://example.com/prisma-smoke-test' },
    });
  });

  test('creates and reads a Theme row from the database', async () => {
    const created = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/prisma-smoke-test',
        summary: 'smoke test',
        headlineSuggestion: 'smoke test headline',
      },
    });

    const found = await prisma.theme.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(found.status).toBe('pending');
    expect(found.summary).toBe('smoke test');
  });
});
