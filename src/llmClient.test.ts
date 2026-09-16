import { extractJson, parseReviewResponse } from './llmClient';

describe('extractJson', () => {
  it('parses a clean JSON object', () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const text = '```json\n{"a": 1}\n```';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('parses JSON with leading/trailing prose', () => {
    const text = 'Here you go:\n{"a": 1}\nHope that helps!';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('parseReviewResponse', () => {
  it('maps a well-formed response', () => {
    const text = JSON.stringify({
      summary: 'Looks fine.',
      risks: ['risk one', 'risk two'],
      todoItems: ['todo one']
    });

    expect(parseReviewResponse(text)).toEqual({
      summary: 'Looks fine.',
      risks: ['risk one', 'risk two'],
      todoItems: ['todo one']
    });
  });

  it('defaults missing or malformed fields', () => {
    const text = JSON.stringify({ risks: 'not an array' });

    expect(parseReviewResponse(text)).toEqual({
      summary: '',
      risks: [],
      todoItems: []
    });
  });

  it('drops non-string entries from arrays', () => {
    const text = JSON.stringify({
      summary: 'ok',
      risks: ['valid', 42, null],
      todoItems: []
    });

    expect(parseReviewResponse(text)).toEqual({
      summary: 'ok',
      risks: ['valid'],
      todoItems: []
    });
  });
});
