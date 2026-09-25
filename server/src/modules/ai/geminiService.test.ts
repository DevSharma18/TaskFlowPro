import { cleanJsonText } from './geminiService';

describe('cleanJsonText', () => {
  it('passes through raw clean JSON object', () => {
    const raw = '{"key":"value","count":42}';
    expect(cleanJsonText(raw)).toBe(raw);
  });

  it('passes through raw clean JSON array', () => {
    const raw = '[{"id":1},{"id":2}]';
    expect(cleanJsonText(raw)).toBe(raw);
  });

  it('extracts JSON from standard markdown code fence', () => {
    const raw = '```json\n{"suggestions":[{"id":"123"}]}\n```';
    expect(cleanJsonText(raw)).toBe('{"suggestions":[{"id":"123"}]}');
  });

  it('extracts JSON from markdown code fence with conversational preamble and postscript', () => {
    const raw = `Here is the requested breakdown:
\`\`\`json
{
  "summary": "Everything looks great.",
  "confidence": 0.95
}
\`\`\`
Let me know if you need further adjustments!`;
    const cleaned = cleanJsonText(raw);
    const parsed = JSON.parse(cleaned);
    expect(parsed.summary).toBe('Everything looks great.');
    expect(parsed.confidence).toBe(0.95);
  });

  it('extracts JSON when no code fences are present but conversational preamble exists', () => {
    const raw = 'Sure! Here is the JSON output: {"story_points": 5, "confidence": 0.8} Have a nice day!';
    const cleaned = cleanJsonText(raw);
    const parsed = JSON.parse(cleaned);
    expect(parsed.story_points).toBe(5);
  });

  it('handles multi-line arrays wrapped in plain code fences', () => {
    const raw = '```\n[\n  {"task_id": "t1"}\n]\n```';
    const cleaned = cleanJsonText(raw);
    expect(JSON.parse(cleaned)).toEqual([{ task_id: 't1' }]);
  });
});
