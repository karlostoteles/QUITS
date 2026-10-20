// Reading photos with Claude. One request per photo, structured output through a forced tool call.
const API = 'https://api.anthropic.com/v1/messages';

async function ask(env, b64, mime, text, tool, maxTokens) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-haiku-5-5',
      max_tokens: maxTokens,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text }] }],
    }),
  });
  if (!r.ok) throw new Error(`ai ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const use = (j.content || []).find(c => c.type === 'tool_use');
  return { input: use ? use.input : null, usage: j.usage };
}

const RECEIPT_TOOL = {
  name: 'record_receipt',
  description: 'Record the purchased items read from a photo of a restaurant or bar receipt.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'false if this is not a receipt or it cannot be read' },
      venue: { type: 'string', description: 'Business name printed on the receipt, or empty' },
      currency: { type: 'string', description: 'ISO 4217 code of the amounts, e.g. EUR' },
      total: { type: 'number', description: 'Grand total printed on the receipt' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            qty: { type: 'number', description: 'Units bought (1 if not printed)' },
            name: { type: 'string', description: 'Item name as printed' },
            line_total: { type: 'number', description: 'Total price of the line' },
            shared: { type: 'boolean', description: 'true only for bottles, jugs, cover charge or bread for the table, and dishes marked for 2 or more people; false for individual starters, mains, desserts, coffees and single drinks' },
            english: { type: 'string', description: 'Short plain-English description of the item, 2 to 6 words' },
          },
          required: ['qty', 'name', 'line_total'],
        },
      },
    },
    required: ['readable', 'lines', 'total'],
  },
};
const RECEIPT_PROMPT = `This is a photo of a receipt from a restaurant or bar. Read every purchased item exactly as printed, one entry per printed line, with its quantity and line total. Use only numbers printed on the receipt and never invent lines. Skip tax summaries, subtotals, payment method, change, and service lines that are not purchases. If a charge for service or cover is printed as a line, include it as a line. Give the grand total printed on the receipt. Set readable to false if the photo is not a receipt or is too blurry to read.`;

export async function readReceipt(env, b64, mime) {
  if (env.AI_MOCK === '1') return mockReceipt();
  const { input, usage } = await ask(env, b64, mime, RECEIPT_PROMPT, RECEIPT_TOOL, 2500);
  if (!input) throw new Error('ai: no result');
  const out = [];
  for (const l of (input.lines || []).slice(0, 80)) {
    const qty = Math.max(1, Math.round(Number(l.qty) || 1));
    const total = Math.round((Number(l.line_total) || 0) * 100);
    if (!l.name || total < 0) continue;
    const kind = l.shared ? 'shared' : qty > 1 ? 'each' : 'dish';
    out.push({ qty, name: String(l.name).slice(0, 48), total, kind, en: String(l.english || '').slice(0, 60) });
  }
  return { readable: !!input.readable && out.length > 0, venue: String(input.venue || '').slice(0, 48), currency: /^[A-Z]{3}$/.test(input.currency || '') ? input.currency : 'EUR', total: Math.round((Number(input.total) || 0) * 100), lines: out, usage };
}

const SIGN_TOOL = {
  name: 'record_place',
  description: 'Record the name of the place shown in a photo taken at the start of a night out.',
  input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Venue name as it would be written normally, or empty if none is clearly readable' } }, required: ['name'] },
};
const SIGN_PROMPT = 'This photo was taken at the start of a night out: a venue sign, a storefront, a menu or a group of friends. If the name of a bar or restaurant is clearly readable, give it in normal capitalization. Otherwise give an empty string.';

export async function readSign(env, b64, mime) {
  if (env.AI_MOCK === '1') return { name: 'Tasca do Beato' };
  const { input } = await ask(env, b64, mime, SIGN_PROMPT, SIGN_TOOL, 120);
  return { name: String((input && input.name) || '').slice(0, 40) };
}

function mockReceipt() {
  const L = [
    [6, 'COUVERT', 900, 'each', 'Bread, olives, butter'], [1, 'AMÊIJOAS BULHÃO PATO', 1850, 'dish', 'Clams in garlic and coriander'],
    [1, 'POLVO À LAGAREIRO', 2390, 'dish', 'Roast octopus'], [1, 'BACALHAU À BRÁS', 1550, 'dish', 'Salt cod with egg and potato'],
    [1, 'BITOQUE DA CASA', 1300, 'dish', 'Steak with a fried egg'], [1, 'ARROZ DE MARISCO 2P', 3600, 'shared', 'Seafood rice for two'],
    [1, 'PREGO NO PÃO', 950, 'dish', 'Steak sandwich'], [1, 'SALADA MISTA', 650, 'dish', 'Mixed salad'],
    [2, 'VINHO VERDE GARRAFA', 3200, 'shared', 'Vinho verde, two bottles'], [4, 'IMPERIAL', 1120, 'each', 'Draught beer'],
    [2, 'ÁGUA C/ GÁS', 440, 'each', 'Sparkling water'], [6, 'PASTEL DE NATA', 960, 'each', 'Custard tart'],
    [5, 'BICA', 550, 'each', 'Espresso'], [6, 'GINJINHA', 1200, 'each', 'Sour cherry liqueur'],
  ];
  const lines = L.map(([qty, name, total, kind, en]) => ({ qty, name, total, kind, en }));
  return { readable: true, venue: 'Tasca do Beato', currency: 'EUR', total: lines.reduce((a, l) => a + l.total, 0), lines, mock: true };
}
