// CEO → worker orchestration engine (client-side).
// Drives the multi-agent flow and reports progress through onPhase/onSubtask
// callbacks so the UI can animate every step live.

import { classifyTask, analyzeTask, planSubtasks, runWorker, runWorkerWithTools, runWorkerNativeTools, compileFinal, parseWorkerStory, callModel } from "./agents";

const PHASES = ["classify", "plan", "workers", "review", "done"];

export async function orchestrate({ apiBaseUrl, apiKey, apiModel, userText, history = [], knownModels = [], pcAvailable = false, pcWorkspace = "", requirePlanApproval = false, signal, onUpdate, onUsage, onPlanReady }) {
  // onUpdate(state) is called with the full orchestration state object after
  // every change: { phase, subtasks, review, error, startedAt, finishedAt }
  // onUsage({ model, usage }) is called once per completed provider call so
  // the caller can record cost for each agent request.
  let cfg = { apiBaseUrl, apiKey, apiModel };
  const state = { phase: "classify", subtasks: [], review: "", nextSteps: [], error: null, startedAt: Date.now(), pcWorkspace };
  let lastEmit = 0;
  let emitTimer = null;
  const emit = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 100) {
      if (!emitTimer) emitTimer = setTimeout(() => { emitTimer = null; emit(true); }, 100);
      return;
    }
    lastEmit = now;
    onUpdate({ ...state, subtasks: state.subtasks.map((s) => ({ ...s })) });
  };

  const checkAbort = () => {
    if (signal?.aborted) { const e = new Error("stopped"); e.name = "AbortError"; throw e; }
  };

  const track = async (fn, ...args) => {
    const r = await fn(cfg, ...args);
    checkAbort();
    return r;
  };

  try {
    // [1] Classify — decides whether agents are needed at all, which kind of
    // model suits the task, and what language the user is writing in.
    const verdict = await classifyTask(cfg, userText, signal);
    checkAbort();
    state.reason = verdict.reason;
    state.modelKind = verdict.modelKind;
    state.language = verdict.language;

    // Model recommendation: if the classifier says this task needs a different
    // KIND of model and the user's provider has a better match available,
    // verify that model actually works (a quick ping) before switching, then
    // tell the user why.
    if (verdict.complexity === "complex" && verdict.modelKind) {
      const better = recommendModel(verdict.modelKind, cfg.apiModel, knownModels);
      if (better && better !== cfg.apiModel) {
        let usable = false;
        try {
          // Cheap liveness check: tiny prompt, tiny budget.
          await callModel({ ...cfg, apiModel: better, messages: [{ role: "user", content: "ping" }], temperature: 0, maxTokens: 8, signal });
          usable = true;
        } catch { usable = false; }
        if (usable) {
          cfg = { ...cfg, apiModel: better };
          state.modelNote = `Task needs a ${verdict.modelKind === "code" ? "strong coding" : verdict.modelKind === "reason" ? "deep reasoning" : "fast lightweight"} model — switched to ${better}.`;
          state.model = better;
        } else {
          state.modelNote = `Better model (${better}) isn't available right now — continuing with ${cfg.apiModel}.`;
          state.model = cfg.apiModel;
        }
      } else {
        state.modelNote = `Using ${cfg.apiModel} — best available ${verdict.modelKind === "code" ? "coding" : verdict.modelKind === "reason" ? "reasoning" : "fast"} model for this provider.`;
        state.model = cfg.apiModel;
      }
      emit();
    }

    if (verdict.complexity !== "complex") {
      state.phase = "simple";
      emit();
      return { kind: "simple", state };
    }

    // [1.5] Deep task analysis — the CEO (LLM) examines the task itself and
    // thinks out loud into a live CEO popup so the user SEES the analysis.
    const ceoSub = { id: "ceo", agentName: "CEO", agentRole: "ceo", title: "Deep task analysis", status: "working", liveText: "", output: "" };
    state.subtasks = [ceoSub];
    state.phase = "analyze";
    emit();
    state.analysis = await analyzeTask(cfg, userText, signal, (_p, full) => {
      ceoSub.liveText = full;
      emit();
    });
    checkAbort();
    ceoSub.status = "done";
    // If the analysis JSON failed to parse, keep the CEO's streamed writing
    // as the visible output instead of dropping it.
    ceoSub.output = ceoSub.liveText;
    if (!state.analysis && ceoSub.output) {
      state.analysis = { goal: "(CEO analysis — see raw notes)", teamWhy: ceoSub.output.slice(0, 200) };
    }
    emit();

    // [2] CEO plan — split into subtasks sized to the job. The analysis (if
    // any) informs the team size. The CEO popup continues streaming the plan.
    ceoSub.status = "working";
    ceoSub.liveText = "";
    ceoSub.title = "Building the team plan";
    state.phase = "plan";
    emit();
    const planText = state.analysis?.teamSize
      ? userText + `\n\n(Internal note from analysis: recommended team size ≈ ${state.analysis.teamSize} — follow it if reasonable.)`
      : userText;
    try {
      const plan = await track(planSubtasks, planText, signal, (_p, full) => {
        ceoSub.liveText = full;
        emit();
      });
      state.subtasks = [ceoSub, ...plan.subs];
      state.teamRationale = plan.rationale || "";
    } catch (e) {
      checkAbort();
      // The recommended model might be unavailable (no quota, offline, etc).
      // Fall back to the user's originally selected model and retry once.
      if (state.model && cfg.apiModel !== apiModel) {
        cfg = { ...cfg, apiModel };
        state.model = apiModel;
        state.modelNote = `Recommended model was unavailable — continuing with ${apiModel}.`;
        emit();
        const plan = await track(planSubtasks, planText, signal, (_p, full) => {
          ceoSub.liveText = full;
          emit();
        });
        state.subtasks = [ceoSub, ...plan.subs];
        state.teamRationale = plan.rationale || "";
      } else {
        throw e;
      }
    }
    checkAbort();
    // Task-inspired agent names are assigned by the CEO (with a generated
    // fallback already applied in planSubtasks). Keep the CEO as a finished
    // card so the user can always reopen its analysis/plan notes.
    ceoSub.status = "done";
    ceoSub.output = ceoSub.output || ceoSub.liveText;
    ceoSub.liveText = "";

    // [2.5] PLAN APPROVAL GATE (ZCode-style plan mode): pause so the user can
    // review the analysis + team plan. Agents only run AFTER the user presses
    // "Start agents" in the UI. Denying stops the whole run gracefully.
    if (onPlanReady && requirePlanApproval) {
      state.phase = "awaiting-approval";
      emit();
      const decision = await onPlanReady({
        analysis: state.analysis,
        teamRationale: state.teamRationale,
        subtasks: state.subtasks.map((s) => ({ ...s })),
      });
      checkAbort();
      if (decision === false) {
        state.phase = "stopped";
        state.subtasks.forEach((s) => { if (s.status === "pending") s.status = "stopped"; });
        emit();
        return { kind: "stopped", state };
      }
    }

    // [3] Workers — agents run one after another (many providers, especially
    // free tiers, reject parallel calls with hard concurrency limits). Each
    // one updates its own card live, so the UI still feels animated.
    // NOTE: the CEO card (id "ceo") is excluded — it stays "done" with its
    // analysis/plan notes for the user to reopen.
    state.phase = "workers";
    state.subtasks.forEach((s) => {
      if (s.id === "ceo") { s.status = "done"; return; }
      s.output = "";
    });
    const workers = state.subtasks.filter((s) => s.id !== "ceo");
    // Show the first as working, the rest queued until their turn.
    workers.forEach((s, i) => { if (i > 0) s.status = "pending"; });
    if (workers[0]) { workers[0].status = "working"; }
    emit();

    for (const s of workers) {
      checkAbort();
      s.status = "working";
      s.liveText = "";
      s.pcMode = pcAvailable;
      emit();
      try {
        // ZCode-style execution for coding agents when the PC bridge is up:
        // try NATIVE provider tool-calling first (most reliable, structural
        // tool_calls); if the provider rejects tools, fall back to the
        // text-protocol loop; without a bridge, plain streaming.
        if (pcAvailable && s.agentRole === "coder") {
          let out = null;
          try {
            out = await runWorkerNativeTools(cfg, s, userText, signal, (feed) => {
              s.liveText = feed;
              emit();
            }, 15, pcWorkspace);
            s.nativeTools = true;
          } catch (te) {
            if (te?.name === "AbortError") throw te;
            // Provider doesn't support tools (or another tool-call error) —
            // retry with the text-protocol loop.
            s.liveText = "";
            out = await runWorkerWithTools(cfg, s, userText, signal, (_p, full) => {
              s.liveText = full;
              emit();
            }, 12, (feed) => {
              s.lastFeed = feed;
              emit();
            }, pcWorkspace);
          }
          s.output = out;
          s.story = parseWorkerStory(out, s.agentRole);
          s.status = "done";
          onUsage?.({ model: apiModel, subtask: s });
        } else {
          // Stream the agent's writing token-by-token so the popup can show
          // it thinking/typing live like a real developer at work.
          const out = await runWorker(cfg, s, userText, signal, (_piece, full) => {
            s.liveText = full;
            emit();
          });
          s.output = out;
          s.story = parseWorkerStory(out, s.agentRole);
          s.status = "done";
          onUsage?.({ model: apiModel, subtask: s });
        }
      } catch (e) {
        if (e?.name === "AbortError") { s.status = "stopped"; throw e; }
        s.output = String(e?.message || e);
        s.status = "failed";
      }
      s.liveText = "";
      emit();
    }
    checkAbort();
    // Individual failures are already marked "failed" and tolerated.

    // [4] CEO review — compile everything into the final answer.
    state.phase = "review";
    emit();
    let review = "";
    try {
      review = await track(compileFinal, userText, state.subtasks);
    } catch (e) {
      checkAbort(); // rethrow if user stopped
      review = "";
    }
    if (!review || review.length < 40) {
      // CEO review call failed or came back empty (e.g. free-tier truncation).
      // Fall back to presenting the workers' outputs directly so the user
      // still gets the full result.
      review = state.subtasks
        .filter((s) => s.status === "done" && s.output)
        .map((s) => `### ${s.agentName ? s.agentName + " — " : ""}${s.title}\n\n${s.output}`)
        .join("\n\n---\n\n");
    }
    state.review = review;
    state.nextSteps = extractNextSteps(state.review);
    state.phase = "done";
    state.finishedAt = Date.now();
    emit();
    return { kind: "complex", state };
  } catch (e) {
    if (e?.name === "AbortError") {
      state.phase = "stopped";
      state.subtasks.forEach((s) => { if (s.status === "working") s.status = "stopped"; });
      emit();
      return { kind: "aborted", state };
    }
    state.error = String(e?.message || e);
    state.phase = "failed";
    emit();
    return { kind: "failed", state };
  }
}

// Detect whether the user's new message mentions a previous agent by name —
// "টাস্ককোর, বাটনটা নীল করো" should re-summon that agent for follow-up work.
export function matchMentionedAgent(userText, chats, activeChatId) {
  if (!userText) return null;
  // Only the current chat's orchestration states are considered.
  const chat = chats.find((c) => c.id === activeChatId);
  if (!chat) return null;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const orch = chat.messages[i].orchestration;
    if (!orch?.subtasks?.length) continue;
    for (const s of orch.subtasks) {
      if (!s.agentName) continue;
      // Match the full name or a prefix of it (>= 4 chars) as a word.
      const name = s.agentName;
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^\\p{L}])${esc}([^\\p{L}]|$)`, "u");
      if (re.test(userText)) return s;
      if (name.length >= 4) {
        const part = name.slice(0, Math.max(4, Math.ceil(name.length * 0.6)));
        const esc2 = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(^|[^\\p{L}])${esc2}`, "u").test(userText)) return s;
      }
    }
  }
  return null;
}

// Follow-up mode: a mentioned agent is re-run with the user's new instruction
// on top of its original subtask, then the CEO re-compiles the whole answer.
export async function followUp({ apiBaseUrl, apiKey, apiModel, userText, originalTask, subtask, pcAvailable = false, pcWorkspace = "", signal, onUpdate, onUsage }) {
  const cfg = { apiBaseUrl, apiKey, apiModel };
  const state = {
    phase: "workers",
    subtasks: [{ ...subtask, status: "working", liveText: "", output: "" }],
    review: "", nextSteps: [], error: null,
    startedAt: Date.now(),
    followUpOf: subtask.agentName,
  };
  let lastEmit = 0;
  const emit = () => {
    const now = Date.now();
    if (now - lastEmit < 100) return;
    lastEmit = now;
    onUpdate({ ...state, subtasks: state.subtasks.map((s) => ({ ...s })) });
  };
  emit();
  const checkAbort = () => {
    if (signal?.aborted) { const e = new Error("stopped"); e.name = "AbortError"; throw e; }
  };
  try {
    const s = state.subtasks[0];
    const runner = pcAvailable && s.agentRole === "coder" ? runWorkerWithTools : runWorker;
    const out = await runner(cfg, s, originalTask + "\n\nFOLLOW-UP REQUEST from the user (do this too):\n" + userText, signal, (_p, full) => {
      s.liveText = full;
      emit();
    }, 12, (feed) => {
      s.lastFeed = feed;
      emit();
    }, pcWorkspace);
    s.output = out;
    s.story = parseWorkerStory(out, s.agentRole);
    s.status = "done";
    s.liveText = "";
    onUsage?.({ model: apiModel, subtask: s });
    emit();

    // CEO re-compile
    state.phase = "review";
    emit();
    state.review = await compileFinal(cfg, originalTask, state.subtasks, signal);
    state.nextSteps = extractNextSteps(state.review);
    state.phase = "done";
    state.finishedAt = Date.now();
    emit();
    return { kind: "complex", state };
  } catch (e) {
    if (e?.name === "AbortError") {
      state.phase = "stopped";
      state.subtasks.forEach((x) => { if (x.status === "working") x.status = "stopped"; });
      emit();
      return { kind: "aborted", state };
    }
    state.error = String(e?.message || e);
    state.phase = "failed";
    emit();
    return { kind: "failed", state };
  }
}
export function recommendModel(modelKind, currentModel, knownModels = []) {
  if (!modelKind) return null;
  const PATTERNS = {
    code: [/coder|code|dev|starcoder|deepseek|qwen.?coder/i, /glm|claude|gpt-[45]|gemini-(1\.5|2\.5|3)?\.?pro/i],
    reason: [/reason|think|o1|o3|r1|deepseek-reasoner|opus|pro|ultra|thinker/i],
    fast: [/flash|mini|haiku|air|nano|lite|turbo|fast/i],
  };
  const prefs = PATTERNS[modelKind] || [];
  const pool = knownModels.filter((m) => m !== currentModel);
  for (const re of prefs) {
    const hit = pool.find((m) => re.test(m));
    if (hit) return hit;
  }
  return null;
}
export function extractNextSteps(markdown) {
  if (!markdown) return [];
  const m = markdown.match(/#{0,3}\s*\**\s*(?:next steps?|what to do next|follow[- ]?up)\s*\**\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\n$|$)/i);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*|^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

export { PHASES };
