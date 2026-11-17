import { config } from './config.js';
// Bound provider concurrency across discovery and itinerary requests. Callers own retries.
let active = 0;
export async function responsesJson(args: { name: string; schema: unknown; instructions: string; context: unknown; previousValidationError?: string; maxTokens?: number }) {
  if (!config.openaiKey) throw new Error('LLM_NOT_CONFIGURED');
  if (active >= 2) throw new Error('LLM_BUSY');
  active++;
  try {
    const response = await fetch(`${config.openaiBaseUrl}/responses`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.openaiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model: config.openaiModel, instructions: args.instructions,
        input: [{ role: 'user', content: JSON.stringify({ context: args.context, previousValidationError: args.previousValidationError || null }) }],
        text: { format: { type: 'json_schema', name: args.name, strict: true, schema: args.schema } },
        max_output_tokens: args.maxTokens || 4500, store: false }),
    });
    if (!response.ok) throw new Error(`LLM_HTTP_${response.status}`);
    const body: any = await response.json();
    const content = (Array.isArray(body.output) ? body.output : []).flatMap((o: any) => o.content || []);
    if (content.some((c: any) => c.type === 'refusal')) throw new Error('LLM_REFUSAL');
    if (body.status && body.status !== 'completed') throw new Error('LLM_INCOMPLETE');
    const text = body.output_text || content.filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
    if (typeof text !== 'string' || !text || text.length > 100000) throw new Error('LLM_NO_OUTPUT');
    try { return JSON.parse(text); } catch { throw new Error('LLM_INVALID_JSON'); }
  } finally { active--; }
}
