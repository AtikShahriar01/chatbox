// Agent definitions and LLM helpers for the CEO → worker orchestration.
// Every call goes through the app's own /api/chat proxy so BYOK auth,
// provider detection, and key-scrubbing stay consistent.

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const CLASSIFY_PROMPT = `You are a task classifier for a coding-assistant app. Decide whether the user's task is SIMPLE or needs a MULTI-AGENT coding workflow.

SIMPLE = a question, chat, explanation, translation, small snippet (one function, quick fix, short script). One direct answer is enough.
COMPLEX = building/completing a whole app or feature, multi-file or multi-component work, large refactors, full implementations with several distinct parts, "build me X with Y and Z" style requests.

Also recommend what KIND of model suits the task best: "code" (a strong coding model), "fast" (a quick lightweight model), or "reason" (a strong reasoning model).

Also detect the user's language and return its code (e.g. "en", "bn", "hi").

Reply with ONLY this JSON, no other text:
{"complexity": "simple" | "complex", "reason": "<max 12 words>", "modelKind": "code"|"fast"|"reason", "language": "<iso code>"}`;

const CEO_PLAN_PROMPT = `You are the CEO of a small team of coding agents. Break the user's task into independent subtasks for your workers.

Rules:
- 2 to 6 subtasks, scaled to the size of the task. Small-but-multi-part task → 2-3. Huge app → 5-6.
- Each subtask must be independently completable by ONE agent (no agent needs another agent's output to start).
- agentRole must be one of: "coder", "reviewer", "researcher", "tester".
- Every non-trivial coding plan MUST include exactly one "reviewer" subtask at the end that verifies the others' code.
- Give each agent a SHORT, task-inspired professional name (2-3 words max, like "TodoForge", "StateSmith", "PixelPolish") that reflects what it builds — NOT generic human names. Two agents must not share a name.
- Add a "teamRationale" field: 1-2 lines explaining WHY this team of this size (why these roles, why this many agents) — the user should see the reasoning.
- Write EVERYTHING (title, description, names, rationale) in the SAME language the user wrote their task in. If the user wrote English → all English. If Bangla → all Bangla.

Reply with ONLY this JSON, no other text:
{"teamRationale": "<1-2 lines>", "subtasks": [{"id": "a1", "agentName": "<task-inspired name>", "title": "<short>", "description": "<what this agent must produce, max 40 words>", "agentRole": "coder"|"reviewer"|"researcher"|"tester"}]}`;

const ANALYZE_PROMPT = `You are the CEO of a coding-agent company. A new task arrived. BEFORE planning the team, deeply analyze the task itself.
Analyze (in the SAME language the user's task is written in):
1. What the user really wants (goal in one line)
2. Task size & complexity (small/medium/large/huge + 1 line why)
3. What skills are needed (frontend/backend/database/design/testing…)
4. Technical stack recommendation
5. Risks or tricky parts
6. How many specialist agents are needed and why

Reply with ONLY this JSON:
{"analysis": {"goal": "<1 line>", "size": "<small|medium|large|huge>", "sizeWhy": "<1 line>", "skills": ["<skill>", "..."], "stack": "<recommended stack, 1 line>", "risks": ["<risk>", "..."], "teamSize": <number 2-6>, "teamWhy": "<1 line why this size>"}}`;

// Streaming deep-analysis: the CEO "thinks out loud" into the popup while
// producing the analysis JSON.
export async function analyzeTask(cfg, userText, signal, onToken) {
  let content = "";
  try {
    content = await streamModel({
      ...cfg,
      messages: [
        { role: "system", content: ANALYZE_PROMPT },
        { role: "user", content: userText.slice(0, 6000) },
      ],
      temperature: 0.2,
      maxTokens: 1200,
      signal,
      onToken,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return null; // analysis is best-effort; planning continues without it
  }
  const parsed = parseJSONLoose(content);
  if (parsed?.analysis?.goal) return parsed.analysis;
  return null;
}

// Shared preamble every worker must produce before any work — a real
// developer introduces themselves, states their approach, plan, and ETA
// BEFORE writing a single line of code.
const INTRO_RULES = `
Mandatory structure — START your reply with these exact sections, in this order, in the user's language:
**Introduction** — 1-2 lines: who you are (your agent name), what you are responsible for.
**Approach** — 2-3 lines: how you will work (what you will examine/build/verify, in what order).
**Plan** — numbered step-by-step list of what you will do.
**ETA** — one short line with your estimated time/effort.
Then the actual work begins.`;

// The user may not be a programmer — everything around the code must be
// readable and actionable for a non-coder.
const SIMPLICITY_RULES = `
NON-CODER RULE (very important — the user may have zero programming knowledge):
- Explain EVERYTHING in plain, simple words — no jargon without a one-line plain meaning in brackets.
- Every code block must be preceded by "এই কোডটা কী করে / what this does" in 1-2 easy sentences.
- After the code, always add a "কীভাবে ব্যবহার করবেন / How to use" section: exact numbered steps (কোথায় paste করবেন, কোন file-এ রাখবেন, কী চাপবেন) so a non-coder can follow without help.
- If the user needs to install or run anything, give the exact command and say WHERE to type it (e.g. "Start menu → type cmd → paste this").
- Never assume programming background. Short sentences. Friendly tone.`;

const WORKER_PROMPTS = {
  coder: `You are a SENIOR software engineer. Your code must be production-grade: standard, verified, professional.
${INTRO_RULES}
${SIMPLICITY_RULES}
Requirements:
- Follow official language/framework conventions (naming, structure, error handling, accessibility).
- Handle edge cases, invalid input, and errors. No placeholder TODOs, no pseudo-code — complete, runnable implementations only.
- Include concise JSDoc-style comments where intent isn't obvious.
- Then the complete code in fenced blocks with file/function names.
- Then a "SELF-CHECK:" section: rigorously verify correctness (edge cases, imports, types, logic). If you find ANY issue, write "ISSUE FOUND:" then the corrected code block. If clean, write "CHECK PASSED".
- Write ALL prose (intro, plan, checks, usage) in the SAME language the user's task is written in. Code and code comments stay in English (industry standard).
Be concise — no filler.`,
  reviewer: `You are a PRINCIPAL engineer doing a final review before production release. Verify the submitted code: correctness, edge cases, missing pieces, security, performance, and standards compliance.
${INTRO_RULES}
${SIMPLICITY_RULES}
Return: a verdict line ("PASS" or "ISSUES FOUND"), then bullet points of concrete issues or confirmations in plain words a non-coder can understand, then a short "suggested fixes" section if any. Be specific and reference the code.
Write in the SAME language the user's task is written in.`,
  researcher: `You are a research agent. Gather the concepts, APIs, best practices, or data needed for your assigned subtask.
${INTRO_RULES}
${SIMPLICITY_RULES}
Return: compact bullet points with the key findings, in plain simple words. No code unless essential.
Write in the SAME language the user's task is written in.`,
  tester: `You are a QA engineer. Write test cases / usage scenarios for your assigned subtask.
${INTRO_RULES}
${SIMPLICITY_RULES}
Return: a bullet list of test cases with expected results written for a non-coder ("এটা চাপলে কী হওয়া উচিত"-style), and optional test code in a fenced block.
Write in the SAME language the user's task is written in.`,
};

// Instructions appended to coder prompts when the PC bridge is connected.
// The agent emits machine-readable TOOL actions inside its stream; the
// orchestrator executes them through the bridge and feeds results back.
export function pcToolsPrompt(workspace) {
  const ws = workspace ? `\n- WORKSPACE: all your file operations are confined to "${workspace}". Use relative paths inside it. Start by listing/reading it to inspect the existing project.` : `
- No workspace root is set: use absolute paths.`;
  return `
PC ACCESS IS CONNECTED. You can really act on the user's PC through a tool protocol.
To use a tool, output a line in EXACTLY this format (single line, JSON):
{"tool":"read_file","path":"<path>"} | {"tool":"write_file","path":"<path>","content":"<file content>"} | {"tool":"edit_file","path":"<path>","search":"<exact text to find>","replace":"<new text>"} | {"tool":"list_dir","path":"<path>"} | {"tool":"run_command","command":"<cmd>","cwd":"<optional>"} | {"tool":"grep","pattern":"<regex>","path":"<dir>"} | {"tool":"move","from":"<path>","to":"<path>"} | {"tool":"delete","path":"<path>"} | {"tool":"mkdir","path":"<path>"}
Rules:
- One tool line at a time. After a tool line, STOP — the system runs it and returns the result, then you continue.
- PREFER edit_file over write_file for changing existing files: it replaces exact text surgically (like real IDEs). search must match the file EXACTLY, character for character. Use write_file only for brand-new files.
- For write_file, the content must be the COMPLETE final file (it will be written verbatim), and JSON-escape all newlines/quotes inside "content".
- VERIFY LOOP (mandatory, exactly how a real developer works with full access): after writing/editing code, ALWAYS run_command to build/run/test it (node file.js, npm run build, python file.py…). Read the output. If it shows ANY error → fix the code with edit_file/write_file → run again. Repeat until the command succeeds. Never stop at the first error and never claim success without a successful run.
- grep lets you search code across the project before editing it.
- The user approves sensitive operations in the app; if a tool returns "denied by user", do NOT retry it — continue without that step and mention it.${ws}`;
}

const CEO_REVIEW_PROMPT = `You are the CEO of a coding-agent team. All workers have submitted their parts of the user's task.
Compile everything into ONE polished final answer for the user.

Rules:
- Combine the workers' outputs into a coherent, COMPLETE result — full code assembled where it belongs, no duplicates, nothing dropped. If the task asked for many parts, deliver every part.
- Fix anything a reviewer flagged. The final code must be production-grade: standard, verified, professional.
${SIMPLICITY_RULES}
- Write ALL prose in the SAME language the user's task is written in (English task → all English, Bangla task → all Bangla). Code and code comments stay in English.
- End with a section titled "## Next Steps" containing a numbered list (3-6 items) of what the user should do next — written so a non-coder can follow each step exactly (কোথায় যাবেন, কী paste করবেন, কী চাপবেন) — in that same language.
- Do not mention agents, orchestration, or internal process — present it as one unified answer.`;

// ---------------------------------------------------------------------------
// LLM call helper (non-streaming)
// ---------------------------------------------------------------------------

// One provider call via the app's own proxy, with a retry on transient
// provider-side overload (common on free tiers with concurrency limits).
// Returns { content, usage }. Throws on persistent errors.
export async function callModel({ apiBaseUrl, apiKey, apiModel, messages, temperature = 0.4, maxTokens = 4000, signal, retries = 2 }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Back off before retrying so a busy gateway can drain.
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      if (signal?.aborted) { const e = new Error("stopped"); e.name = "AbortError"; throw e; }
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiBaseUrl,
          apiKey,
          model: apiModel,
          messages,
          temperature,
          stream: false,
          max_tokens: maxTokens,
        }),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`API ${res.status}: ${text.slice(0, 300)}`);
        // Retry only on provider overload/rate limits (429/5xx).
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error.message || data.error.toString());
      const content = data.choices?.[0]?.message?.content || "";
      // Treat truncation as an error only when the content is useless;
      // short valid replies (e.g. a tiny JSON verdict) are fine even if the
      // provider pads and clips.
      if (!content.trim() && data.choices?.[0]?.finish_reason === "length") {
        throw new Error("Model output was truncated (max_tokens).");
      }
      const u = data.usage || {};
      return {
        content,
        usage: u.prompt_tokens || u.completion_tokens
          ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens }
          : null,
      };
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      lastErr = e;
      // Network-level failures also get retried.
      if (attempt < retries) continue;
      throw e;
    }
  }
  throw lastErr || new Error("Provider call failed");
}

// Extract the first JSON object from a model reply that may be wrapped in
// markdown fences or prose.
function parseJSONLoose(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Orchestration steps
// ---------------------------------------------------------------------------

// Streaming worker call — same body as callModel but stream:true; onToken is
// called with each delta so the UI can show the agent "typing" live.
export async function streamModel({ apiBaseUrl, apiKey, apiModel, messages, temperature = 0.4, maxTokens = 4000, signal, onToken }) {
  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      if (signal?.aborted) { const e = new Error("stopped"); e.name = "AbortError"; throw e; }
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiBaseUrl, apiKey, model: apiModel, messages, temperature,
          stream: true, max_tokens: maxTokens,
        }),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`API ${res.status}: ${text.slice(0, 300)}`);
        if ((res.status === 429 || res.status >= 500) && attempt < 2) { lastErr = err; continue; }
        throw err;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            if (json.error) throw new Error(json.error.message || "provider error");
            const d = json.choices?.[0]?.delta || {};
            const piece = d.content || "";
            if (piece) { full += piece; onToken?.(piece, full); }
          } catch (pe) {
            if (pe?.message && !/JSON/.test(pe.message)) throw pe;
          }
        }
      }
      return full;
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      lastErr = e;
      if (attempt < 2) continue;
      throw e;
    }
  }
  throw lastErr || new Error("Provider call failed");
}

// Heuristic fallback when the classifier's JSON is unusable (some models mangle
// non-Latin scripts or pad the reply with reasoning). Looks at the task text
// itself: build-verbs + multi-feature lists ⇒ complex.
function heuristicComplexity(userText) {
  const t = (userText || "").toLowerCase();
  const words = t.split(/\s+/).length;
  const buildVerbs = /(build|create|make|implement|write me|develop|design|বানাও|বানান|তৈরি|করে দাও|লিখে দাও|সম্পূর্ণ)/i.test(t);
  const featureMarkers = (t.match(/,|এবং| and /g) || []).length;
  return buildVerbs && (words > 12 || featureMarkers >= 2);
}

export async function classifyTask(cfg, userText, signal) {
  try {
    const { content } = await callModel({
      ...cfg,
      messages: [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: userText.slice(0, 4000) },
      ],
      temperature: 0,
      maxTokens: 160,
      signal,
    });
    const parsed = parseJSONLoose(content);
    if (parsed?.complexity === "simple" || parsed?.complexity === "complex") {
      // If the model said "simple" but the text screams "build me an app",
      // trust the heuristic — models sometimes skim long feature lists.
      const hc = heuristicComplexity(userText);
      const complexity = hc && parsed.complexity === "simple" ? "complex" : parsed.complexity;
      return {
        complexity,
        reason: parsed.reason || "",
        modelKind: ["code", "fast", "reason"].includes(parsed.modelKind) ? parsed.modelKind : "code",
        language: parsed.language || null,
      };
    }
  } catch (e) {
    if (e?.name === "AbortError") throw e;
  }
  // Classifier failed or replied garbage — use the heuristic, defaulting to
  // simple for anything that doesn't clearly ask to build something.
  return { complexity: heuristicComplexity(userText) ? "complex" : "simple", reason: "", modelKind: "code", language: null };
}

const ROLE_ICONS = { coder: "Code2", reviewer: "ShieldCheck", researcher: "Search", tester: "FlaskConical" };

// Build a task-inspired name when the CEO didn't provide one: pull the most
// meaningful words from the task text and suffix by role.
function fallbackName(userText, role, i) {
  const SUFFIX = { coder: "Forge", reviewer: "Check", researcher: "Scout", tester: "Probe" };
  const words = (userText || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(the|and|for|with|build|make|create|a|an|to|of|in|on|complete)$/i.test(w));
  const core = (words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("") || "Agent");
  return `${core}${SUFFIX[role] || "Forge"}${i > 0 ? i + 1 : ""}`;
}

export async function planSubtasks(cfg, userText, signal, onToken) {
  const content = await streamModel({
    ...cfg,
    messages: [
      { role: "system", content: CEO_PLAN_PROMPT },
      { role: "user", content: userText.slice(0, 6000) },
    ],
    temperature: 0.3,
    maxTokens: 3000,
    signal,
    onToken,
  });
  const parsed = parseJSONLoose(content);
  let subs = Array.isArray(parsed?.subtasks) ? parsed.subtasks : [];
  const rationale = String(parsed?.teamRationale || "").slice(0, 240);
  // Sanitize + clamp; keep the CEO's task-inspired names, generate one otherwise.
  subs = subs
    .filter((s) => s && (s.title || s.description))
    .slice(0, 6)
    .map((s, i) => ({
      id: s.id || `a${i + 1}`,
      agentName: String(s.agentName || "").slice(0, 24) || fallbackName(userText, ROLE_ICONS[s.agentRole] ? s.agentRole : "coder", i),
      title: String(s.title || `Subtask ${i + 1}`).slice(0, 80),
      description: String(s.description || "").slice(0, 400),
      agentRole: ROLE_ICONS[s.agentRole] ? s.agentRole : "coder",
      status: "pending",
      output: "",
    }));
  if (subs.length < 2) {
    // Fallback plan: coder + reviewer — the smallest safe team.
    subs = [
      { id: "a1", agentName: fallbackName(userText, "coder", 0), title: "Implement the task", description: "Produce the complete solution for the user's request.", agentRole: "coder", status: "pending", output: "" },
      { id: "a2", agentName: fallbackName(userText, "reviewer", 1), title: "Review the implementation", description: "Verify the produced code and list issues.", agentRole: "reviewer", status: "pending", output: "" },
    ];
  }
  return { subs, rationale };
}

// Detect a tool action line at the end of the agent's output.
export function extractToolAction(text) {
  if (!text) return null;
  // The tool line is the last complete JSON object on its own line.
  const lines = text.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const m = lines[i].match(/\{"tool"\s*:\s*"[^"]+"\s*(?:,[^}]*)?\}/);
    if (m) {
      try { return JSON.parse(m[0].replace(/\\n/g, "\\n")); } catch { return null; }
    }
  }
  return null;
}

// Execute one tool action through the PC bridge.
export async function execTool(action) {
  const opMap = {
    read_file: ["/file/read", (a) => ({ path: a.path })],
    write_file: ["/file/write", (a) => ({ path: a.path, content: a.content ?? "" })],
    edit_file: ["/file/edit", (a) => ({ path: a.path, search: a.search, replace: a.replace, all: a.all !== false })],
    list_dir: ["/file/list", (a) => ({ path: a.path || "~" })],
    run_command: ["/exec", (a) => ({ command: a.command, cwd: a.cwd })],
    grep: ["/grep", (a) => ({ pattern: a.pattern, path: a.path })],
    move: ["/file/move", (a) => ({ from: a.from, to: a.to })],
    delete: ["/file/delete", (a) => ({ path: a.path })],
    mkdir: ["/file/mkdir", (a) => ({ path: a.path })],
  };
  const entry = opMap[action?.tool];
  if (!entry) return { ok: false, error: `unknown tool: ${action?.tool}` };
  const [route, makeParams] = entry;
  try {
    const res = await fetch("/api/pc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chatbox-client": "chatbox-web-1",
      },
      body: JSON.stringify({ op: route, ...makeParams(action) }),
    });
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
      return { ok: false, error: "authentication required" };
    }
    return await res.json();
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Run a coder worker WITH the PC tool loop: the model streams, may emit a tool
// action, the tool runs, the result is appended, and the model continues —
// up to maxTurns. This is the real "acts on the PC" developer loop.
export async function runWorkerWithTools(cfg, subtask, userText, signal, onToken, maxTurns = 12, onFeed, workspace = "") {
  let conversation = [
    { role: "system", content: (WORKER_PROMPTS[subtask.agentRole] || WORKER_PROMPTS.coder) + pcToolsPrompt(workspace) },
    { role: "user", content: `Overall task:\n${userText.slice(0, 4000)}\n\nYour subtask (${subtask.agentRole}): ${subtask.title}\n${subtask.description}` },
  ];
  let full = "";
  for (let turn = 0; turn < maxTurns; turn++) {
    const piece = await streamModel({
      ...cfg,
      messages: conversation,
      temperature: subtask.agentRole === "coder" ? 0.3 : 0.2,
      maxTokens: 2600,
      signal,
      onToken: (_p, sofar) => onToken?.(_p, full + sofar),
    });
    full += piece;
    onToken?.("", full);
    const action = extractToolAction(piece);
    if (!action) break; // no more tools — the agent finished its answer

    // Show the PC action in the live feed (visible proof the agent is
    // really working on the user's machine).
    const summary =
      action.tool === "write_file" ? `write_file ${action.path} (${String(action.content || "").length} chars)`
      : action.tool === "edit_file" ? `edit_file ${action.path} — "${String(action.search || "").slice(0, 50)}" → "${String(action.replace || "").slice(0, 50)}"`
      : action.tool === "read_file" ? `read_file ${action.path}`
      : action.tool === "list_dir" ? `list_dir ${action.path || "~"}`
      : `run: ${String(action.command || "").slice(0, 120)}`;
    const feedLine = `\n\n[⚡ PC] ${summary}\n`;
    full += feedLine;
    onToken?.("", full);
    onFeed?.({ tool: action.tool, summary });

    const result = await execTool(action);
    const ok = result?.ok;
    const short = ok
      ? (result.stdout ? String(result.stdout).slice(0, 300) : result.content ? String(result.content).slice(0, 300) : `✓ ${result.path || "done"} ${result.bytes != null ? `(${result.bytes} bytes)` : ""}`.slice(0, 300))
      : `✗ ${result?.error || "failed"}`;
    const resultLine = `[${ok ? "✓ OK" : "✗ FAIL"}] ${short}\n`;
    full += resultLine;
    onToken?.("", full);
    onFeed?.({ tool: "result", summary: short });

    const resultStr = JSON.stringify(result).slice(0, 8000);
    conversation = [
      ...conversation,
      { role: "assistant", content: piece.slice(0, 4000) },
      { role: "user", content: `TOOL RESULT for ${action.tool}:\n${resultStr}\n\nContinue. (If this is an error, fix the code and write the file again; if it succeeded, proceed to the next step.)` },
    ];
  }
  return full.trim();
}

// Plain worker run (no PC tools) — streams normally.
export async function runWorker(cfg, subtask, userText, signal, onToken) {
  const content = await streamModel({
    ...cfg,
    messages: [
      { role: "system", content: WORKER_PROMPTS[subtask.agentRole] || WORKER_PROMPTS.coder },
      { role: "user", content: `Overall task:\n${userText.slice(0, 4000)}\n\nYour subtask (${subtask.agentRole}): ${subtask.title}\n${subtask.description}` },
    ],
    temperature: subtask.agentRole === "coder" ? 0.3 : 0.2,
    maxTokens: 2600,
    signal,
    onToken,
  });
  return content.trim();
}

// ---------------------------------------------------------------------------
// NATIVE TOOL-CALLING LOOP (ZCode-style): uses the provider's real function
// calling API instead of asking the model to embed JSON in prose. Far more
// reliable — the model structurally emits tool_calls, the bridge executes
// them, results go back as tool messages, loop repeats until done.
// ---------------------------------------------------------------------------

export const PC_TOOLS_SCHEMA = [
  { type: "function", function: { name: "list_dir", description: "List files and folders inside a directory", parameters: { type: "object", properties: { path: { type: "string", description: "folder path" } }, required: ["path"] } } },
  { type: "function", function: { name: "read_file", description: "Read a text file's full content", parameters: { type: "object", properties: { path: { type: "string", description: "file path" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create or completely overwrite a text file", parameters: { type: "object", properties: { path: { type: "string", description: "file path" }, content: { type: "string", description: "full file content" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace exact text inside an existing file (surgical edit)", parameters: { type: "object", properties: { path: { type: "string", description: "file path" }, search: { type: "string", description: "exact existing text to find" }, replace: { type: "string", description: "replacement text" } }, required: ["path", "search", "replace"] } } },
  { type: "function", function: { name: "run_command", description: "Run a shell command on the PC (build, test, run the code)", parameters: { type: "object", properties: { command: { type: "string", description: "command to run" }, cwd: { type: "string", description: "working directory" } }, required: ["command"] } } },
  { type: "function", function: { name: "grep", description: "Search a regex pattern across files in a folder", parameters: { type: "object", properties: { pattern: { type: "string", description: "regex" }, path: { type: "string", description: "folder" } }, required: ["pattern"] } } },
];

const TOOL_SUMMARY = (a) =>
  a.tool === "write_file" ? `write_file ${a.path} (${String(a.content || "").length} chars)`
  : a.tool === "edit_file" ? `edit_file ${a.path} — "${String(a.search || "").slice(0, 50)}" → "${String(a.replace || "").slice(0, 50)}"`
  : a.tool === "read_file" ? `read_file ${a.path}`
  : a.tool === "list_dir" ? `list_dir ${a.path || "~"}`
  : a.tool === "grep" ? `grep "${String(a.pattern || "").slice(0, 60)}" in ${a.path || "."}`
  : `run: ${String(a.command || "").slice(0, 120)}`;

// Raw (non-stream) call that may return tool_calls. Throws TOOLS_UNSUPPORTED
// marker if the provider rejects the tools parameter. Retries on 429/5xx —
// free tiers enforce strict per-minute request limits, so the loop must wait
// patiently instead of failing the whole agent.
async function callModelTools({ apiBaseUrl, apiKey, apiModel, messages, temperature = 0.2, signal, retries = 4 }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 429 "Maximum 8 requests within 1 minutes" → wait long enough.
      await new Promise((r) => setTimeout(r, Math.min(20000, 4000 * attempt)));
      if (signal?.aborted) { const e = new Error("stopped"); e.name = "AbortError"; throw e; }
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiBaseUrl, apiKey, model: apiModel, messages, temperature,
          stream: false, tools: PC_TOOLS_SCHEMA, tool_choice: "auto",
          max_tokens: 2600,
        }),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`API ${res.status}: ${text.slice(0, 200)}`);
        if ((res.status === 429 || res.status >= 500) && attempt < retries) { lastErr = err; continue; }
        if (res.status === 400 || res.status === 422) err.code = "TOOLS_UNSUPPORTED";
        throw err;
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error.message || "provider error");
      const msg = data.choices?.[0]?.message || {};
      return msg; // { content, tool_calls? }
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      lastErr = e;
      if (attempt < retries) continue;
      throw e;
    }
  }
  throw lastErr || new Error("provider call failed");
}

// The ZCode-style loop for one agent: native tool_calls ↔ bridge execution.
export async function runWorkerNativeTools(cfg, subtask, userText, signal, onFeed, maxTurns = 15, workspace = "") {
  const ws = workspace ? `\n- WORKSPACE: the project folder is "${workspace}". Work with relative paths inside it. Start by listing it.` : "";
  const messages = [
    { role: "system", content: `${WORKER_PROMPTS[subtask.agentRole] || WORKER_PROMPTS.coder}\n\nYou have REAL tools to act on the user's PC. Work like a real developer: inspect first, create/edit files, then run commands to VERIFY your work; if a command shows errors, fix the files and run again until it succeeds. Write prose in the user's language; code in English.${ws}` },
    { role: "user", content: `Overall task:\n${userText.slice(0, 4000)}\n\nYour subtask (${subtask.agentRole}): ${subtask.title}\n${subtask.description}` },
  ];
  let transcript = ""; // popup feed text
  const emit = (line) => {
    transcript += (transcript ? "\n" : "") + line;
    onFeed?.(transcript);
  };
  emit(`**Introduction**\nআমি ${subtask.agentName || "agent"} — আমার কাজ: ${subtask.title}`);
  for (let turn = 0; turn < maxTurns; turn++) {
    const msg = await callModelTools({ ...cfg, messages, signal });
    if (msg.tool_calls?.length) {
      // Show what the model is doing, then execute each tool call.
      messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { args = { _raw: tc.function?.arguments }; }
        const action = { tool: tc.function?.name, ...args };
        emit(`[⚡ PC] ${TOOL_SUMMARY(action)}`);
        const result = await execTool(action);
        const short = result?.ok
          ? (result.stdout ? String(result.stdout).slice(0, 400) : result.content ? String(result.content).slice(0, 400) : `✓ ${result.path || result.from || "done"}${result.replacements != null ? ` (${result.replacements} replacements)` : ""}${result.bytes != null ? ` (${result.bytes} bytes)` : ""}`)
          : `✗ ${result?.error || "failed"}`;
        emit(`[${result?.ok ? "✓ OK" : "✗ FAIL"}] ${short}`);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 8000) });
      }
      continue; // next turn with results in context
    }
    // Final text answer
    if (msg.content) emit(`[📝 RESULT]\n${msg.content}`);
    return transcript;
  }
  emit("[⚠] reached the tool-turn limit");
  return transcript;
}

// Parse a coder's raw output into the structured story the popup shows:
// plan bullets, code blocks, a self-check verdict, optional found-issue +
// corrected code. Anything unparsed falls back to "notes + one code block".
export function parseWorkerStory(raw, role) {
  if (!raw) return { intro: "", notes: "", code: "", verdict: "", issue: "", fixedCode: "" };
  const codeBlocks = [...raw.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  // Pull the agent's self-introduction block (Introduction → until Plan ends).
  const introM = raw.match(/\**\s*Introduction\s*\**\s*:?\s*\n([\s\S]*?)(?=\**\s*Approach\s*\**|\**\s*Plan\s*\**|$)/i);
  const intro = introM ? introM[1].trim().slice(0, 500) : "";
  const notes = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (role !== "coder") {
    return { intro, notes, code: codeBlocks[0] || "", verdict: "", issue: "", fixedCode: "" };
  }
  const vm = raw.match(/SELF[- ]?CHECK\s*:?\s*([\s\S]*?)(?=\nISSUE FOUND|$)/i);
  const im = raw.match(/ISSUE FOUND\s*:?\s*([\s\S]*?)(?=```|$)/i);
  const verdict = vm ? vm[1].trim().slice(0, 400) : "";
  const issue = im ? im[1].trim().slice(0, 400) : "";
  // If an issue was declared, the last code block is the corrected version.
  const fixedCode = issue && codeBlocks.length > 1 ? codeBlocks[codeBlocks.length - 1] : "";
  const code = fixedCode ? codeBlocks.slice(0, -1).join("\n\n") : codeBlocks.join("\n\n");
  return { intro, notes, code, verdict, issue, fixedCode };
}

export async function compileFinal(cfg, userText, subtasks, signal) {
  const submissions = subtasks
    .map((s) => `### [${s.agentRole}] ${s.title} (status: ${s.status})\n${s.status === "failed" ? "(this agent failed — work around it)" : s.output}`)
    .join("\n\n");
  const { content } = await callModel({
    ...cfg,
    messages: [
      { role: "system", content: CEO_REVIEW_PROMPT },
      { role: "user", content: `User's original task:\n${userText.slice(0, 16000)}\n\nWorkers' submissions:\n${submissions.slice(0, 60000)}` },
    ],
    temperature: 0.4,
    maxTokens: 8000,
    signal,
  });
  return content.trim();
}

export { ROLE_ICONS };
