// Unit tests for the SSE parser/translator functions in lib/providers/*.js
// Feeds fake SSE byte streams through a fake reader and checks the unified events.
import { parseOpenAISSE } from "../app/lib/providers/openai.js";
import { parseAnthropicSSE } from "../app/lib/providers/anthropic.js";
import { parseGoogleSSE } from "../app/lib/providers/google.js";
import { parseCohereSSE } from "../app/lib/providers/cohere.js";

function fakeReader(chunks) {
  // chunks: array of Uint8Array/string pieces; split mid-frame to test buffering
  let i = 0;
  const enc = new TextEncoder();
  return {
    read: async () => {
      if (i >= chunks.length) return { done: true };
      const c = chunks[i++];
      return { done: false, value: typeof c === "string" ? enc.encode(c) : c };
    },
  };
}

function splitBytes(str, sizes) {
  // split a string into byte-chunks of given sizes
  const enc = new TextEncoder();
  const bytes = enc.encode(str);
  const out = [];
  let pos = 0;
  for (const s of sizes) {
    if (pos >= bytes.length) break;
    out.push(bytes.slice(pos, pos + s));
    pos += s;
  }
  if (pos < bytes.length) out.push(bytes.slice(pos));
  return out;
}

async function collect(parser, reader) {
  const events = [];
  for await (const ev of parser(reader)) events.push(ev);
  return events;
}

let failures = 0;
function expect(name, cond, extra) {
  if (cond) console.log(`  PASS  ${name}`);
  else { console.log(`  FAIL  ${name}${extra ? " :: " + extra : ""}`); failures++; }
}

const enc = new TextEncoder;

// ---------- OpenAI ----------
{
  const stream = 'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n' +
    'data: [DONE]\n\n';
  const evs = await collect(parseOpenAISSE, fakeReader(splitBytes(stream, [30, 45, 60, 100])));
  expect("openai: role+2 deltas+done+usage", JSON.stringify(evs) === JSON.stringify([
    { type: "delta", text: "Hel" },
    { type: "delta", text: "lo" },
    { type: "done", reason: "stop" },
    { type: "usage", promptTokens: 5, completionTokens: 2 },
  ]) || JSON.stringify(evs) === JSON.stringify([
    { type: "delta", text: "Hel" },
    { type: "delta", text: "lo" },
    { type: "usage", promptTokens: 5, completionTokens: 2 },
    { type: "done", reason: "stop" },
  ]), JSON.stringify(evs));
}
{
  // usage-only final chunk (stream_options include_usage on some providers)
  const stream = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n' +
    'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\ndata: [DONE]\n\n';
  const evs = await collect(parseOpenAISSE, fakeReader([enc.encode(stream)]));
  expect("openai: usage-only chunk parsed", evs.some(e => e.type === "usage" && e.promptTokens === 7), JSON.stringify(evs));
}

// ---------- Anthropic ----------
{
  const stream =
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":21,"output_tokens":1}}}\n\n' +
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}\n\n' +
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}\n\n' +
    'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const evs = await collect(parseAnthropicSSE, fakeReader(splitBytes(stream, [64, 64, 64, 64, 64, 200])));
  expect("anthropic: one usage event with both counts", evs.filter(e => e.type === "usage").length === 1 &&
    evs.find(e => e.type === "usage").promptTokens === 21 &&
    evs.find(e => e.type === "usage").completionTokens === 9, JSON.stringify(evs));
  expect("anthropic: deltas + done", evs.filter(e => e.type === "delta").map(e => e.text).join("") === "Hi there" &&
    evs.find(e => e.type === "done")?.reason === "end_turn", JSON.stringify(evs));
}
{
  // thinking deltas
  const stream =
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"answer"}}\n\n' +
    'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const evs = await collect(parseAnthropicSSE, fakeReader([enc.encode(stream)]));
  expect("anthropic: thinking + delta", evs.some(e => e.type === "thinking" && e.text === "hmm") &&
    evs.some(e => e.type === "delta" && e.text === "answer"), JSON.stringify(evs));
}
{
  // error event
  const stream = 'event: error\ndata: {"type":"error","error":{"message":"overloaded"}}\n\n';
  const evs = await collect(parseAnthropicSSE, fakeReader([enc.encode(stream)]));
  expect("anthropic: error event", evs.length === 1 && evs[0].type === "error" && evs[0].message === "overloaded", JSON.stringify(evs));
}

// ---------- Google ----------
{
  const stream =
    'data: {"candidates":[{"content":{"parts":[{"text":"Go"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":1}}\n\n' +
    'data: {"candidates":[{"content":{"parts":[{"text":"ogle"}],"role":"model"}}]}\n\n' +
    'data: {"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":""}],"role":"model"}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":5}}\n\n';
  const evs = await collect(parseGoogleSSE, fakeReader(splitBytes(stream, [50, 90, 200])));
  expect("google: deltas joined", evs.filter(e => e.type === "delta").map(e => e.text).join("") === "Google", JSON.stringify(evs));
  expect("google: usage + done", evs.some(e => e.type === "usage" && e.completionTokens === 5) && evs.some(e => e.type === "done" && e.reason === "STOP"), JSON.stringify(evs));
}
{
  // thinking part
  const stream = 'data: {"candidates":[{"content":{"parts":[{"text":"thought","thought":true},{"text":"ans"}]}}]}\n\n';
  const evs = await collect(parseGoogleSSE, fakeReader([enc.encode(stream)]));
  expect("google: thought flag", evs.some(e => e.type === "thinking" && e.text === "thought") && evs.some(e => e.type === "delta" && e.text === "ans"), JSON.stringify(evs));
}

// ---------- Cohere ----------
{
  const stream =
    'event: stream-start\ndata: {"type":"stream-start"}\n\n' +
    'event: text-generation\ndata: {"type":"text-generation","text":"Co"}\n\n' +
    'event: text-generation\ndata: {"type":"text-generation","text":"here"}\n\n' +
    'event: stream-end\ndata: {"type":"stream-end","response":{"usage":{"input_tokens":4,"output_tokens":2}}}\n\n';
  const evs = await collect(parseCohereSSE, fakeReader(splitBytes(stream, [40, 60, 60, 150])));
  expect("cohere: deltas + usage + done", evs.filter(e => e.type === "delta").map(e => e.text).join("") === "Cohere" &&
    evs.some(e => e.type === "usage" && e.promptTokens === 4 && e.completionTokens === 2) &&
    evs.some(e => e.type === "done"), JSON.stringify(evs));
}
{
  const stream = 'event: error\ndata: {"type":"error","message":"bad key"}\n\n';
  const evs = await collect(parseCohereSSE, fakeReader([enc.encode(stream)]));
  expect("cohere: error event", evs.length === 1 && evs[0].type === "error" && evs[0].message === "bad key", JSON.stringify(evs));
}

// ---------- CRLF robustness ----------
{
  const stream = 'data: {"choices":[{"delta":{"content":"win"}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  const evs = await collect(parseOpenAISSE, fakeReader([enc.encode(stream)]));
  expect("openai: CRLF line endings", evs.some(e => e.type === "delta" && e.text === "win"), JSON.stringify(evs));
}

console.log(failures === 0 ? "\nALL PARSER TESTS PASSED" : `\n${failures} PARSER TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
