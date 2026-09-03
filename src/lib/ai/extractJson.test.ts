import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { extractJsonBlock, parseJsonResponse } from './extractJson';

describe('extractJsonBlock', () => {
  test('extracts a JSON object wrapped in prose', () => {
    // Arrange / Act
    const result = extractJsonBlock('Here is the analysis:\n\n{"a":1,"b":2}\n\nLet me know if you need more.');

    // Assert
    expect(result).toBe('{"a":1,"b":2}');
  });

  test('extracts a JSON array wrapped in prose', () => {
    // Arrange / Act
    const result = extractJsonBlock('Sure, here you go: [1, 2, 3] — hope that helps!');

    // Assert
    expect(result).toBe('[1, 2, 3]');
  });

  test('handles nested objects and braces inside string values', () => {
    // Arrange
    const raw = 'Result: {"note":"uses { and } inside a string","child":{"x":1}} done';

    // Act
    const result = extractJsonBlock(raw);

    // Assert
    expect(JSON.parse(result)).toEqual({ note: 'uses { and } inside a string', child: { x: 1 } });
  });

  test('handles escaped quotes inside string values', () => {
    // Arrange
    const raw = String.raw`prefix {"quote":"she said \"hi\""} suffix`;

    // Act
    const result = extractJsonBlock(raw);

    // Assert
    expect(JSON.parse(result)).toEqual({ quote: 'she said "hi"' });
  });

  test('throws when no JSON object or array is present', () => {
    // Arrange / Act / Assert
    expect(() => extractJsonBlock('no json here at all')).toThrow(/no JSON object or array found/);
  });

  test('throws when brackets never balance', () => {
    // Arrange / Act / Assert
    expect(() => extractJsonBlock('{"a": 1')).toThrow(/unbalanced JSON/);
  });
});

describe('parseJsonResponse', () => {
  const schema = z.object({ name: z.string() });

  test('extracts, parses and validates in one step', () => {
    // Arrange / Act
    const result = parseJsonResponse('Sure: {"name":"ok"}', schema, 'testCall');

    // Assert
    expect(result).toEqual({ name: 'ok' });
  });

  test('names the failing call when JSON parsing fails', () => {
    // Arrange / Act / Assert
    expect(() => parseJsonResponse('nothing to see here', schema, 'testCall')).toThrow(
      /no JSON object or array found/,
    );
  });

  test('names the failing call when schema validation fails', () => {
    // Arrange / Act / Assert
    expect(() => parseJsonResponse('{"name": 42}', schema, 'testCall')).toThrow(/testCall/);
  });
});
