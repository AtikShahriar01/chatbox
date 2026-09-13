"use client";

import { useStore, PROMPT_SUGGESTIONS } from "@/lib/store";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, AlertCircle, User, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import EmptyState from "./EmptyState";
import StopButton from "./StopButton";
import { computeCost } from "@/lib/pricing";
import { estimateMessagesTokens, estimateTokens } from "@/lib/tokenizer";
import { orchestrate, followUp, matchMentionedAgent } from "@/lib/orchestrator";
import { useIde } from "@/lib/ide-store";
import { useUi } from "@/lib/ui-store";

// Run the autonomous agent from the chat: the assistant bubble becomes a live
// mission-control card (status + steps + files written), every file the agent
// writes is captured for the code-output window, and the final summary +
// full file contents are posted back into the chat.
async function runAgentInChat({ chatId, asstId, text, replaceMessage, pushToast, orchCtrl }) {
  const store = useStore.getState();
  const ide = useIde.getState();
  const setView = useUi.getState().setView;

  const filesWritten = []; // [{path, content}]
  const statusRef = { text: "🚀 এজেন্ট শুরু করছি…" };
  const todosRef = { list: [] }; // live checklist published by the agent
  const paint = (extra = {}) => {
    replaceMessage(chatId, asstId, {
      thinking: false, streaming: true, model: store.apiModel,
      agentRun: {
        status: statusRef.text,
        steps: stepsRef.slice(-6),
        files: filesWritten.map((f) => f.path.split(/[\\/]/).pop()),
        todos: todosRef.list,
        done: false,
      },
      ...extra,
    });
  };
  const stepsRef = [];

  // open the IDE so the user SEES the workspace working (switcher, no reload)
  setView("ide");

  const { createAgent } = await import("@/lib/agent-engine");
  const agent = createAgent();
  window.__chatAgent = agent;

  const task = await agent.run(
    {
      apiBaseUrl: store.apiBaseUrl, apiKey: store.apiKey, apiModel: store.apiModel,
      workspace: ide.bridge?.workspace || "",
      goal: text,
      onStatus: (s) => { statusRef.text = s; paint(); },
      onUsage: (modelId, usage) => {
        try { store.recordUsage(modelId, { promptTokens: usage?.promptTokens, completionTokens: usage?.completionTokens }, 0); } catch {}
      },
    },
    (ev) => {
      if (ev.type === "tool") {
        stepsRef.push(`🛠️ ${ev.tool}`);
        paint();
      } else if (ev.type === "todo") {
        todosRef.list = ev.todos;
        paint();
      }
    }
  );

  // Re-read the LIVE task record from the store — run() may return the initial
  // shape; the store copy has the final status/files/todos.
  const liveTask = useIde.getState().tasks.find((t) => t.id === task.id) || task;

  // Collect everything the agent wrote (read back from disk for the real content)
  const fileContents = [];
  for (const p of (liveTask.files || []).slice(0, 8)) {
    try {
      const { default: pcFetch } = await import("@/lib/pc");
      const r = await pcFetch("/file/read", { path: p });
      if (r?.ok) fileContents.push({ path: p, content: r.content, deleted: false });
    } catch {}
  }

  // Final chat presentation: summary + per-file output blocks.
  // If the provider died mid-run but the work is verifiably on disk, count
  // the task as DONE — the user cares about results, not protocol.
  let effStatus = liveTask.status;
  let summary = task.summary || task.error || "";
  if (effStatus !== "completed" && fileContents.length > 0) {
    effStatus = "completed";
    summary = summary
      ? summary + " (মডেল শেষ মেসেজে আটকেছিল, কিন্তু কাজ যাচাই করা গেছে ✅)"
      : "সব ধাপ সফলভাবে সম্পন্ন হয়েছে (ফাইল যাচাই করা) ✅";
  }
  const fileBlocks = fileContents.length
    ? "\n\n" + fileContents.map((f) => `**📄 ${f.path.split(/[\\/]/).pop()}**\n\`\`\`\n${String(f.content).slice(0, 1500)}\n\`\`\``).join("\n\n")
    : "";
  replaceMessage(chatId, asstId, {
    thinking: false, streaming: false,
    content: `🤖 **Agent task ${effStatus === "completed" ? "সম্পন্ন ✅" : "শেষ — " + effStatus}**\n\n${summary || (effStatus === "completed" ? "কাজ সম্পন্ন হয়েছে।" : "কাজটি শেষ হয়নি।")}${fileBlocks}`,
    agentRun: {
      status: effStatus === "completed" ? "✅ সম্পন্ন" : "❌ ব্যর্থ",
      steps: stepsRef.slice(-6),
      files: filesWritten.map((f) => f.path.split(/[\\/]/).pop()),
      todos: todosRef.list,
      done: true, status2: effStatus,
    },
    webSources: null,
  });
  return { ok: liveTask.status === "completed" };
}

export default function ChatPanel() {
  const chats = useStore((s) => s.chats);
  const activeChatId = useStore((s) => s.activeChatId);
  const setActive = useStore((s) => s.setActive);
  const createChat = useStore((s) => s.createChat);
  const addMessage = useStore((s) => s.addMessage);
  const replaceMessage = useStore((s) => s.replaceMessage);
  const setChatTitleIfEmpty = useStore((s) => s.setChatTitleIfEmpty);
  const truncateMessagesAfter = useStore((s) => s.truncateMessagesAfter);
  const systemPrompt = useStore((s) => s.systemPrompt);
  const maxContext = useStore((s) => s.maxContextMessages);
  const temperature = useStore((s) => s.temperature);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);
  const apiKey = useStore((s) => s.apiKey);
  const apiModel = useStore((s) => s.apiModel);
  const fallbackModel = useStore((s) => s.fallbackModel);
  const markModelUsed = useStore((s) => s.markModelUsed);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const pushToast = useStore((s) => s.pushToast);
  const modelPricing = useStore((s) => s.modelPricing);
  const recordUsage = useStore((s) => s.recordUsage);
  const previewUsage = useStore((s) => s.previewUsage);
  const accumulateChatCost = useStore((s) => s.accumulateChatCost);
  const chatLanguage = useStore((s) => s.chatLanguage) || "en";

  const [busy, setBusy] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const scrollRef = useRef(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef(null);
  const streamStartRef = useRef(0);
  const flushTimerRef = useRef(null);
  const pendingFlushRef = useRef(null);
  const capturedUsageRef = useRef(null);
  const capturedCostRef = useRef(null);
  const orchAbortRef = useRef(null);
  const planApprovalRef = useRef(null); // { resolve } while awaiting plan approval

  const chat = useMemo(() => chats.find((c) => c.id === activeChatId) || null, [chats, activeChatId]);

  // Smooth auto-scroll: new messages glide into view (rAF-synced). While
  // streaming we only scroll if the user is already near the bottom, so
  // reading older messages is never yanked around. The last message's
  // content/reasoning lengths are in deps so streaming output follows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 260;
      if (busy && !nearBottom) return;
      el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" });
    });
  }, [chat?.messages?.length, busy, chat?.id, chat?.messages?.[chat?.messages?.length - 1]?.content?.length, chat?.messages?.[chat?.messages?.length - 1]?.reasoning?.length]);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) setActive(chats[0].id);
  }, [activeChatId, chats.length, setActive]);

  // Orphan recovery: after a page reload no stream can still be running, so
  // any message stuck in thinking/streaming state would hang forever. Runs
  // reactively on chats (persisted state rehydrates after mount — skipHydration
  // — so the first populated chats snapshot is where recovery happens).
  useEffect(() => {
    const st = useStore.getState();
    let dirty = false;
    const chatsPatched = st.chats.map((c) => {
      if (!c.messages?.some((m) => m.thinking || m.streaming)) return c;
      dirty = true;
      return {
        ...c,
        messages: c.messages.map((m) =>
          m.thinking || m.streaming
            ? { ...m, thinking: false, streaming: false, stopped: true, content: m.content || "" }
            : m
        ),
      };
    });
    if (dirty) useStore.setState({ chats: chatsPatched });
  }, [chats]);

  const send = async (text, images = []) => {
    if (inFlightRef.current) return;
    let id = chat?.id;
    if (!id) { id = createChat(); setActive(id); }
    return sendInChat(id, text, images);
  };

  const stop = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    if (orchAbortRef.current) {
      try { orchAbortRef.current.abort(); } catch {}
      orchAbortRef.current = null;
    }
    // A coding-agent run may be live (runAgentInChat) — agent-engine exposes
    // stop() via the window handle; without this the Stop button does nothing
    // until the agent finishes.
    try { window.__chatAgent?.stop?.(); } catch {}
    // If we were waiting for plan approval, resolve it as denied.
    if (planApprovalRef.current) {
      try { planApprovalRef.current.resolve(false); } catch {}
      planApprovalRef.current = null;
    }
  };

  const flushPending = (finalize = false) => {
    if (!pendingFlushRef.current) return;
    const { chatId, msgId, text, reasoning, usage, elapsedMs, stopped, estPromptTokens, webSources, reasoningMs } = pendingFlushRef.current;
    // When reasoning is streaming (no content yet) show a live "Thinking"
    // status with the reasoning length so slow reasoning models feel alive
    // instead of an eternal skeleton.
    const liveThinking = !finalize && !text && !!reasoning;
    replaceMessage(chatId, msgId, {
      content: text, reasoning, usage, elapsedMs,
      streaming: !finalize, thinking: finalize ? false : (!text && !reasoning ? true : false),
      liveThinking, stopped, estPromptTokens, reasoningMs: reasoningMs ?? null,
      ...(webSources ? { webSources } : {}),
    });
    if (finalize) pendingFlushRef.current = null;
  };

  const sendInChat = async (chatId, text, images = []) => {
    if (inFlightRef.current) return;
    // Budget hard-limit (§8): block a new request once the enforced monthly
    // budget is reached, with a clear message instead of silently spending.
    if (useStore.getState().isOverBudget()) {
      const b = useStore.getState().monthlyBudgetUSD;
      pushToast({ type: "warning", message: `মাসিক বাজেট শেষ ($${b}). Settings → Usage-তে enforce বন্ধ করুন বা বাজেট বাড়ান।` });
      const id2 = useStore.getState().createChat();
      setActive(id2);
      addMessage(id2, { id: "msg_" + Math.random().toString(36).slice(2), role: "user", content: text });
      addMessage(id2, { id: "msg_" + Math.random().toString(36).slice(2), role: "assistant", content: "", error: "Monthly budget reached", errorDetail: `Enforced limit $${b} reached. Disable enforcement or raise the budget in Settings.` });
      return;
    }
    inFlightRef.current = true;
    setBusy(true);

    // For vision: convert images to data URLs to send in user content
    const userContent = images.length
      ? [{ type: "text", text }, ...images.map((img) => ({ type: "image_url", image_url: { url: img } }))]
      : text;
    const userMsg = { id: "msg_" + Math.random().toString(36).slice(2), role: "user", content: text, images };
    addMessage(chatId, userMsg);
    setChatTitleIfEmpty(chatId, text.slice(0, 40) + (text.length > 40 ? "…" : ""));

    const freshChats = useStore.getState().chats;
    const targetChat = freshChats.find((c) => c.id === chatId);
    // History = everything EXCEPT the user message we just added (it is
    // appended explicitly at the end below — otherwise the model receives
    // the same user turn twice).
    const recentMessages = (targetChat?.messages || []).slice(0, -1).slice(-maxContext * 2);

    // OpenAI format messages with content as string OR array.
    // The selected chat language is injected as a hard rule so the AI
    // replies in that language for the whole conversation.
    const LANG_RULES = {
      "en-US": "Always reply in English (professional, natural American/British tone).",
      "bn-BD": "Always reply fully in Bangla (বাংলা) — every sentence, natural native tone. Code stays English.",
      "es-ES": "Always reply in Spanish (natural, professional tone).",
      "zh-CN": "Always reply in Chinese (中文, natural professional tone). Code stays English.",
      "fr-FR": "Always reply in French (natural, professional tone).",
      "hi-IN": "Always reply in Hindi (हिन्दी, natural tone). Code stays English.",
      "ar-SA": "Always reply in Arabic (العربية, natural professional tone). Code stays English.",
    };
    const langRule = LANG_RULES[chatLanguage] || "";
    const finalSystem = (langRule
      ? `${systemPrompt || "You are a helpful assistant."}\n\nLANGUAGE RULE (must follow): ${langRule}`
      : (systemPrompt || "You are a helpful assistant."))
      + (useStore.getState().buildMemoryPrompt("") || "");
    let messagesForApi = [
      { role: "system", content: finalSystem },
      ...recentMessages.map((m) => {
        if (m.images && m.images.length && m.role === "user") {
          return { role: m.role, content: [{ type: "text", text: m.content }, ...m.images.map((img) => ({ type: "image_url", image_url: { url: img } }))] };
        }
        return { role: m.role, content: m.content };
      }),
      { role: "user", content: userContent },
    ];
    let webSources = null;

    const asstId = "msg_" + Math.random().toString(36).slice(2);
    // new request → drop the previous run's checklist from the floating panel
    useIde.getState().clearLiveTodos();
    // Estimate input tokens up-front so the badge shows an `in` count from the
    // first frame of streaming, even for providers that never report usage.
    const estPromptTokens = estimateMessagesTokens(messagesForApi);
    addMessage(chatId, { id: asstId, role: "assistant", content: "", model: apiModel, thinking: true, estPromptTokens });
    streamStartRef.current = performance.now();

    // ------------------------------------------------------------------
    // Web search (ChatGPT-style 🌐): when the toggle is on, fetch live
    // results first and inject them as grounded context so the model can
    // answer current-event / factual questions with citations.
    // ------------------------------------------------------------------
    if (webSearch) {
      try {
        replaceMessage(chatId, asstId, { thinking: true, searchStatus: "Searching the web…" });
        const sr = await fetch("/api/web-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text.slice(0, 300) }),
        }).then((r) => r.json());
        if (sr?.ok && sr.results?.length) {
          const sources = sr.results.map((r) => ({ title: r.title, url: r.url }));
          const contextBlock = sr.results
            .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet ? "Snippet: " + r.snippet + "\n" : ""}${r.pageText ? "Content: " + r.pageText : ""}`)
            .join("\n\n");
          messagesForApi = [
            ...messagesForApi.slice(0, -1),
            {
              role: "system",
              content: `Fresh web search results for "${sr.query}" (today: ${new Date().toDateString()}):\n\n${contextBlock}\n\nUse these results to answer the user's last message. Cite sources inline as [1], [2] matching the numbers above. If the results don't contain the answer, say so honestly.`,
            },
            messagesForApi[messagesForApi.length - 1],
          ];
          webSources = sources;
          replaceMessage(chatId, asstId, { thinking: true, searchStatus: `Read ${sources.length} sources — writing answer…`, webSources: sources });
        } else {
          replaceMessage(chatId, asstId, { thinking: true, searchStatus: null });
        }
      } catch {
        replaceMessage(chatId, asstId, { thinking: true, searchStatus: null });
      }
    }

    // ------------------------------------------------------------------
    // Multi-agent orchestration: mention a previous agent's name to re-summon
    // it for follow-up work; otherwise classify the task size first. Big
    // coding tasks go to the CEO → workers flow; everything else streams
    // directly.
    // ------------------------------------------------------------------
    const noKeyNeededEarly = apiBaseUrl.includes("11434") || apiBaseUrl.includes("ollama") || apiBaseUrl.includes("1234") || apiBaseUrl.includes("lm-studio") || apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1");
    // Web-search answers are simple grounded Q&A — never route them into the
    // heavy CEO → workers orchestration.
    if ((apiKey || noKeyNeededEarly) && !webSources) {
      const orchCtrl = new AbortController();
      orchAbortRef.current = orchCtrl;
      let result;
      try {
        // Check the PC bridge before starting: coding agents act on the real
        // machine only when the bridge is connected.
        let pcAvailable = false;
        try {
          const r = await fetch("/api/pc", { method: "POST", headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" }, body: JSON.stringify({ op: "status" }) });
          pcAvailable = !!(await r.json())?.ok;
        } catch {}

        // Did the user mention a previous agent by name? → follow-up mode.
        const allChats = useStore.getState().chats;
        const mentioned = matchMentionedAgent(text, allChats, chatId);

        // ------------------------------------------------------------------
        // BIG CODING TASK → hand the whole job to the autonomous agent in the
        // IDE. The chat bubble stays LIVE: every agent action streams into it
        // as status + the files the agent writes open in a code window.
        // Detection is heuristic (cheap, no extra LLM call): file/op keywords.
        // NOTE: every pattern needs an explicit .test(text) — a bare `regexA ||
        // regexB` is always truthy (regex objects are truthy), which used to
        // route EVERY message into the agent flow whenever the bridge was up.
        // ------------------------------------------------------------------
        const CODEY = /\b(create|build|make|write|banao|bana|koro|likho|fix|debug|implement|add|delete|remove|refactor)\b[^.?!]{0,80}\b(file|folder|app|page|function|component|script|api|code|project|calculator|game|website|html|css|js|javascript|python|folder)\b/i.test(text)
          || /\b(folder|file)\b\s+(banao|koro|likho|create|delete|edit)/i.test(text)
          || /agent-demo|calculator|snake|todo|dashboard|landing/i.test(text);
        const LONG = text.length > 120;
        if (!mentioned && (CODEY || LONG) && pcAvailable) {
          result = await runAgentInChat({ chatId, asstId, text, replaceMessage, pushToast, orchCtrl });
          setBusy(false); inFlightRef.current = false;
          return;
        }

        if (mentioned) {
          // The original user task of the chat that spawned that agent.
          const srcChat = allChats.find((c) => c.id === chatId);
          const srcUser = (srcChat?.messages || []).map((m) => (m.role === "user" ? m.content : null)).filter(Boolean).pop() || text;
          result = await followUp({
            apiBaseUrl, apiKey, apiModel,
            userText: text,
            originalTask: srcUser,
            subtask: mentioned,
            pcAvailable,
            pcWorkspace: useStore.getState().pcWorkspace || "",
            signal: orchCtrl.signal,
            onUpdate: (state) => {
              replaceMessage(chatId, asstId, {
                thinking: false,
                orchestration: { ...state, followUpBadge: mentioned.agentName },
                streaming: !["done", "failed", "stopped"].includes(state.phase),
              });
            },
          });
        } else {
          result = await orchestrate({
            apiBaseUrl,
            apiKey,
            apiModel,
            userText: text,
            history: recentMessages,
            knownModels: [
              ...useStore.getState().customModels.map((m) => m.id),
              apiModel,
            ],
            pcAvailable,
            pcWorkspace: useStore.getState().pcWorkspace || "",
            // ZCode-style plan mode: agents wait for the user's explicit
            // approval of the analysis + team plan before starting work.
            requirePlanApproval: true,
            signal: orchCtrl.signal,
            onPlanReady: () => new Promise((resolve) => {
              planApprovalRef.current = { resolve };
            }),
            onUpdate: (state) => {
              replaceMessage(chatId, asstId, {
                thinking: false,
                orchestration: state,
                streaming: !["done", "failed", "stopped", "awaiting-approval"].includes(state.phase),
              });
            },
          });
        }
      } catch (e) {
        result = { kind: "failed", state: { phase: "failed", subtasks: [], error: String(e?.message || e) } };
      } finally {
        orchAbortRef.current = null;
        planApprovalRef.current = null;
      }

      if (result.kind !== "simple") {
        // Complex path finished (or failed/was stopped) — put the CEO's
        // compiled answer (or the error) on the message and wrap up.
        const st = result.state || {};
        if (result.kind === "complex" && st.review) {
          replaceMessage(chatId, asstId, {
            content: st.review,
            thinking: false,
            streaming: false,
            orchestration: st,
            elapsedMs: st.finishedAt && st.startedAt ? st.finishedAt - st.startedAt : null,
          });
          // Record approximate usage for the orchestration calls so the
          // spend widget reflects the whole agent run.
          const estIn = estPromptTokens * (1 + (st.subtasks?.length || 0) * 2);
          const estOut = estimateTokens(st.review || "") + (st.subtasks || []).reduce((a, s) => a + estimateTokens(s.output || ""), 0);
          const usageObj = { promptTokens: estIn, completionTokens: estOut };
          const cost = computeCost(apiModel, usageObj, modelPricing);
          recordUsage(apiModel, usageObj, cost);
          accumulateChatCost(chatId, cost);
        } else if (result.kind === "aborted" || result.kind === "stopped") {
          // "stopped" covers both Stop-button aborts and plan-approval Deny —
          // neither is a failure, so don't render a red "Orchestration failed".
          replaceMessage(chatId, asstId, { thinking: false, streaming: false, stopped: true, orchestration: st });
          pushToast({ type: "info", message: "Generation stopped." });
        } else {
          replaceMessage(chatId, asstId, {
            thinking: false, streaming: false,
            error: "Orchestration failed",
            errorDetail: st.error || "The agent team could not complete the task.",
            orchestration: st,
          });
        }
        setBusy(false);
        inFlightRef.current = false;
        return;
      }
      // Simple path: clear the orchestration field and fall through to the
      // normal streaming flow below.
      replaceMessage(chatId, asstId, { orchestration: null, thinking: true });
    }

    const noKeyNeeded = apiBaseUrl.includes("11434") || apiBaseUrl.includes("ollama") || apiBaseUrl.includes("1234") || apiBaseUrl.includes("lm-studio") || apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1");
    if (!apiKey && !noKeyNeeded) {
      replaceMessage(chatId, asstId, {
        content: "",
        thinking: false,
        streaming: false,
        model: apiModel,
        error: "No API key configured.",
        errorDetail: "Open Settings → Model Provider. Or use a local provider like Ollama (no key needed).",
      });
      setBusy(false);
      inFlightRef.current = false;
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Initialize pending flush buffer
    pendingFlushRef.current = { chatId, msgId: asstId, text: "", reasoning: "", usage: null, elapsedMs: null, stopped: false, estPromptTokens, webSources, reasoningStartMs: null, contentStartMs: null, reasoningMs: null };
    capturedUsageRef.current = null;
    capturedCostRef.current = null;

    // Throttled flush: update store every 150ms
    flushTimerRef.current = setInterval(() => {
      if (!pendingFlushRef.current) return;
      const p = { ...pendingFlushRef.current };
      if (typeof window !== "undefined" && p.usage) console.log("[cb] timer flush with usage:", p.usage);
      replaceMessage(p.chatId, p.msgId, {
        content: p.text,
        reasoning: p.reasoning,
        thinking: false,
        streaming: true,
        model: apiModel,
        elapsedMs: performance.now() - streamStartRef.current,
        usage: p.usage || null,
        costUSD: p.costUSD || 0,
        estPromptTokens: p.estPromptTokens,
      });
      // Live "Today's spend" preview while streaming: estimate cost from tokens so far.
      if (!p.usage) {
        const estOut = estimateTokens(p.text || "") + estimateTokens(p.reasoning || "");
        previewUsage(apiModel, { promptTokens: p.estPromptTokens || 0, completionTokens: estOut }, computeCost(apiModel, { promptTokens: p.estPromptTokens || 0, completionTokens: estOut }, modelPricing));
      }
    }, 150);

    try {
      // Transient provider errors (503 overloaded / 429 rate-limit / network
      // hiccups) auto-retry with backoff so the user rarely sees a failed
      // reply — the message visibly shows "retrying…" while it happens.
      const RETRYABLE = (st) => st === 429 || st === 502 || st === 503 || st === 504;
      let res = null;
      let lastErrText = "";
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (attempt > 0) {
          replaceMessage(chatId, asstId, {
            content: "", thinking: true, streaming: false, model: apiModel,
            retrying: `Provider busy — auto-retry ${attempt}/2…`,
          });
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          if (ctrl.signal.aborted) {
            // Stopped during backoff — surface as a clean stop, not an error.
            const abortErr = new Error("aborted during backoff");
            abortErr.name = "AbortError";
            throw abortErr;
          }
        }
        let activeModel = apiModel;
      try {
          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiBaseUrl,
              apiKey,
              model: activeModel,
              messages: messagesForApi,
              temperature: typeof temperature === "number" ? temperature : 0.7,
              stream: true,
              systemPrompt,
            }),
            signal: ctrl.signal,
          });
          lastErrText = res.ok ? "" : (await res.text().catch(() => ""));
          if (res.ok) break;
          if (!RETRYABLE(res.status)) break; // client errors (4xx ভুল key ইত্যাদি) — retry নয়
        } catch (netErr) {
          if (netErr?.name === "AbortError") throw netErr;
          lastErrText = String(netErr?.message || netErr);
          res = null;
          if (attempt === 2) throw netErr;
        }
      }

      // Directive §7 fallback model: if the primary model failed hard (and it's
      // not an auth issue), try the configured fallback model once.
      if ((!res || !res.ok) && fallbackModel && fallbackModel !== activeModel && res?.status !== 401) {
        try {
          const fb = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiBaseUrl, apiKey, model: fallbackModel, messages: messagesForApi, temperature: typeof temperature === "number" ? temperature : 0.7, stream: true, systemPrompt }),
            signal: ctrl.signal,
          });
          if (fb.ok) { res = fb; activeModel = fallbackModel; markModelUsed?.(fallbackModel); }
        } catch {}
      }

      if (!res || !res.ok) {
        const errText = lastErrText;
        if (flushTimerRef.current) clearInterval(flushTimerRef.current);
        // Session expired mid-chat → re-authenticate rather than show a raw error.
        if (res && res.status === 401) {
          window.location.href = "/login";
          return;
        }
        replaceMessage(chatId, asstId, {
          content: "",
          thinking: false,
          streaming: false,
          model: apiModel,
          error: res ? `API ${res.status}: ${res.statusText}` : "Network error",
          errorDetail: errText.slice(0, 600),
        });
        pendingFlushRef.current = null;
        setBusy(false);
        inFlightRef.current = false;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Watchdog: some free/slow providers accept the connection and then go
      // silent — without this the UI hangs in "thinking" forever. If no chunk
      // arrives within 90s, abort and surface an actionable error. (90s covers
      // slow reasoning models; any chunk resets the timer.)
      const READ_TIMEOUT_MS = 90000;
      const readWithTimeout = async () => {
        let timer;
        const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("stream-stalled")), READ_TIMEOUT_MS); });
        try { return await Promise.race([reader.read(), timeout]); } finally { clearTimeout(timer); }
      };

      // stream-stalled errors propagate to the outer catch below.
      while (true) {
          const { done, value } = await readWithTimeout();
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
            if (json.error) {
              replaceMessage(chatId, asstId, { content: "", thinking: false, streaming: false, error: json.error.message, errorDetail: json.error.detail });
              pendingFlushRef.current = null;
              continue;
            }
            const choice = json.choices?.[0];
            // Usage often arrives on a separate final chunk with an empty choices array —
            // handle it BEFORE the choice check so it's never skipped.
            if (json.usage && pendingFlushRef.current) {
              const u = json.usage;
              const usageObj = {
                promptTokens: u.prompt_tokens || 0,
                completionTokens: u.completion_tokens || 0,
                reasoningTokens: u.completion_tokens_details?.reasoning_tokens || 0,
                cachedTokens: u.prompt_tokens_details?.cached_tokens || 0,
                audioTokens: u.prompt_tokens_details?.audio_tokens || 0,
              };
              pendingFlushRef.current.usage = usageObj;
              const cost = computeCost(apiModel, usageObj, modelPricing);
              pendingFlushRef.current.costUSD = cost;
              capturedUsageRef.current = usageObj; // survives timer nulling the flush ref
              capturedCostRef.current = cost;
              // Flush immediately so TokenBadge updates in real-time
              flushPending();
            }
            if (!choice) continue;
            const delta = choice.delta || {};
            if (delta.reasoning_content && pendingFlushRef.current) {
              if (pendingFlushRef.current.reasoningStartMs == null) pendingFlushRef.current.reasoningStartMs = performance.now();
              pendingFlushRef.current.reasoning += delta.reasoning_content;
              // Reasoning chunks ARE progress. Flush right away (rate-limited
              // by the interval) so the user sees the model's live thinking
              // instead of an eternal "thinking…" skeleton on slow models.
              flushPending();
            }
            if (delta.content && pendingFlushRef.current) {
              if (pendingFlushRef.current.contentStartMs == null) pendingFlushRef.current.contentStartMs = performance.now();
              pendingFlushRef.current.text += delta.content;
            }
            if (choice.finish_reason && pendingFlushRef.current) {
              pendingFlushRef.current.elapsedMs = performance.now() - streamStartRef.current;
            }
          } catch {}
        }
      }

      // Final flush
      // Use the captured refs that survive timer nulling the flush ref
      const finalUsage = capturedUsageRef.current || pendingFlushRef.current?.usage;
      const finalCost = capturedCostRef.current ?? pendingFlushRef.current?.costUSD;
      if (pendingFlushRef.current) {
        pendingFlushRef.current.elapsedMs = performance.now() - streamStartRef.current;
        // "Thought for Ns": first reasoning delta → first content delta.
        if (pendingFlushRef.current.reasoningStartMs != null) {
          pendingFlushRef.current.reasoningMs = Math.round(
            (pendingFlushRef.current.contentStartMs ?? performance.now()) - pendingFlushRef.current.reasoningStartMs
          );
        }
        flushPending(true);
      }
      if (finalUsage && (finalUsage.promptTokens || finalUsage.completionTokens)) {
        const cost = finalCost ?? computeCost(apiModel, finalUsage, modelPricing);
        recordUsage(apiModel, finalUsage, cost);
        accumulateChatCost(chatId, cost);
      }
    } catch (e) {
      if (e?.name === "AbortError") {
        if (pendingFlushRef.current) {
          pendingFlushRef.current.stopped = true;
          pendingFlushRef.current.elapsedMs = performance.now() - streamStartRef.current;
          // Finalize the flush: leaving streaming:true here would keep the
          // blinking cursor + TokenBadge shimmer on the message forever.
          flushPending(true);
        }
        pushToast({ type: "info", message: "Generation stopped." });
      } else {
        if (flushTimerRef.current) clearInterval(flushTimerRef.current);
        const stalled = String(e?.message || "") === "stream-stalled";
        replaceMessage(chatId, asstId, {
          content: "",
          thinking: false,
          streaming: false,
          model: apiModel,
          error: stalled ? "প্রোভাইডার থেকে ৯০ সেকেন্ডে কোনো সাড়া আসেনি" : "Network error",
          errorDetail: stalled
            ? "এই মডেল/প্রোভাইডারটি এখন অনির্ভরযোগ্য। Settings → ভিন্ন মডেল বেছে নিন, তারপর Regenerate চাপুন।"
            : String(e?.message || e),
        });
        try { await reader.cancel(); } catch {}
        pendingFlushRef.current = null;
      }
    } finally {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
      setBusy(false);
      inFlightRef.current = false;
      abortRef.current = null;
      // If the stream errored before recordUsage ran, drop the live spend
      // preview so Today's spend doesn't keep the partial cost.
      if (pendingFlushRef.current === null && !capturedUsageRef.current) {
        useStore.getState().clearPreviewUsage?.();
      }
    }
  };

  const regenerate = async () => {
    if (!chat || inFlightRef.current) return;
    const msgs = chat.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    // Drop the last user message too — sendInChat re-adds it fresh. Keeping it
    // here would show the same user bubble twice after regeneration.
    truncateMessagesAfter(chat.id, lastUserIdx - 1);
    await sendInChat(chat.id, msgs[lastUserIdx].content, msgs[lastUserIdx].images || []);
  };

  const editAndResend = async (msgId) => {
    if (!chat || inFlightRef.current) return;
    const idx = chat.messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    setEditingId(msgId);
  };

  const onEditSubmit = async (msgId, newText) => {
    if (!chat) return;
    const idx = chat.messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const oldImages = chat.messages[idx]?.images || [];
    // Drop the edited message from history — sendInChat re-adds it with the
    // new text (otherwise the edited bubble would appear twice).
    set((s) => ({
      chats: s.chats.map((c) => c.id !== chat.id ? c : ({
        ...c,
        messages: [...c.messages.slice(0, idx)],
      })),
    }));
    setEditingId(null);
    await sendInChat(chat.id, newText, oldImages);
  };

  const setFeedback = (msgId, value) => {
    set((s) => ({
      chats: s.chats.map((c) => c.id !== chat.id ? c : ({
        ...c,
        messages: c.messages.map((m) => m.id === msgId ? { ...m, feedback: value } : m),
      })),
    }));
  };

  // Helper to use set directly (for editAndResend)
  const set = useStore.setState;

  const startWithPrompt = (s) => {
    const id = createChat();
    setActive(id);
    setTimeout(() => sendInChat(id, s.prompt), 50);
  };

  const noKey = !apiKey && !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("ollama") || apiBaseUrl.includes("1234") || apiBaseUrl.includes("lm-studio") || apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1"));

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {noKey && <NoKeyBar onOpen={() => setSettingsOpen(true)} />}
        <EmptyState onPick={startWithPrompt} onNew={() => createChat()} />
        <div className="max-w-3xl w-full mx-auto shrink-0">
          <ChatInput onSend={send} disabled={busy} stop={stop} busy={busy} webSearch={webSearch} onToggleWebSearch={() => setWebSearch((v) => !v)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <AnimatePresence>
        {noKey && <NoKeyBar key="nokey" onOpen={() => setSettingsOpen(true)} />}
      </AnimatePresence>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" style={{ background: "var(--cb-bg)" }}>
        {chat.messages.length === 0 ? (
          <EmptyState onPick={(s) => sendInChat(chat.id, s.prompt)} />
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            <AnimatePresence initial={false}>
              {chat.messages.map((m, i) => (
                editingId === m.id ? (
                  <EditForm
                    key={m.id}
                    initial={m.content}
                    onCancel={() => setEditingId(null)}
                    onSave={(text) => onEditSubmit(m.id, text)}
                  />
                ) : (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    chatId={chat.id}
                    onEditCode={(subId, newCode) => {
                      // Patch the subtask's story inside this message so the
                      // popup's Save keeps the edited code permanently.
                      useStore.getState().updateOrchSubtask(chat.id, m.id, subId, (patch) => {
                        const s = useStore.getState().chats.find((c) => c.id === chat.id)?.messages.find((x) => x.id === m.id);
                        const st = s?.orchestration?.subtasks.find((x) => x.id === subId);
                        return { story: { ...(st?.story || {}), code: newCode } };
                      });
                    }}
                    onInsertChat={(code) => useStore.getState().setChatInputDraft(code)}
                    onPlanDecision={(allow) => {
                      // Resolve the plan gate: true → agents start, false → run stops.
                      if (planApprovalRef.current) {
                        planApprovalRef.current.resolve(allow);
                        planApprovalRef.current = null;
                      }
                    }}
                    isLast={i === chat.messages.length - 1}
                    onRegenerate={m.role === "assistant" ? regenerate : undefined}
                    onEdit={m.role === "user" ? () => editAndResend(m.id) : undefined}
                    onFeedback={(v) => setFeedback(m.id, v)}
                  />
                )
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="max-w-3xl w-full mx-auto relative shrink-0">
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="absolute -top-10 left-1/2 -translate-x-1/2 z-10"
            >
              <StopButton onClick={stop} />
            </motion.div>
          )}
        </AnimatePresence>
        <ChatInput onSend={send} disabled={busy} stop={stop} busy={busy} webSearch={webSearch} onToggleWebSearch={() => setWebSearch((v) => !v)} />
      </div>
    </div>
  );
}

function NoKeyBar({ onOpen }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="px-4 py-2 text-xs flex items-center justify-between gap-3"
      style={{ background: "color-mix(in srgb, var(--cb-accent) 12%, transparent)", borderBottom: "1px solid var(--cb-border)" }}
    >
      <span className="flex items-center gap-2">
        <KeyRound size={12} />
        Set your API key in Settings to start chatting, or use a local provider (Ollama, LM Studio).
      </span>
      <button onClick={onOpen} className="cb-focus px-2 py-0.5 rounded text-xs font-medium hover:underline" style={{ color: "var(--cb-accent)" }}>
        Open Settings →
      </button>
    </motion.div>
  );
}

function EditForm({ initial, onCancel, onSave }) {
  const [text, setText] = useState(initial);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(text.length, text.length);
  }, []);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSave(t);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="group flex gap-3 px-4 py-4"
      style={{ background: "color-mix(in srgb, var(--cb-accent) 6%, transparent)" }}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm" style={{ background: "var(--cb-user-bubble)" }}>
        <User size={14} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium mb-1 tracking-wide uppercase" style={{ color: "var(--cb-muted)" }}>Edit message</div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape") onCancel();
          }}
          rows={Math.max(2, Math.min(8, text.split("\n").length + 1))}
          className="cb-focus w-full bg-transparent outline-none resize-none text-sm leading-relaxed rounded-md px-3 py-2"
          style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-accent)" }}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white flex items-center gap-1 disabled:opacity-50"
            style={{ background: "var(--cb-accent)" }}
          >
            <Check size={12} /> Save & resend
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs hover:bg-cb-surface transition-colors"
          >
            Cancel
          </button>
          <span className="text-[10px] ml-auto" style={{ color: "var(--cb-muted)" }}>↵ save · esc cancel</span>
        </div>
      </div>
    </motion.div>
  );
}
