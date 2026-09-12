"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { computeUsageValue } from "./pricing";

// Universal id helper — works in all browsers, no crypto.randomUUID dependency
export const newId = () =>
  Math.random().toString(36).slice(2, 10) +
  Date.now().toString(36) +
  Math.random().toString(36).slice(2, 6);

const seedChats = () => []; // start empty — example chats shown via prompt suggestions, not as clutter

export const BUILTIN_MODELS = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", context: 128000, advanced: false, builtin: true, vision: true, tools: true, imageGen: false, thinking: false },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", context: 128000, advanced: true, builtin: true, vision: true, tools: true, imageGen: false, thinking: false },
  { id: "openai/o1-mini", name: "o1-mini", provider: "OpenAI", context: 128000, advanced: true, builtin: true, vision: false, tools: false, imageGen: false, thinking: true },
  { id: "anthropic/claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", context: 200000, advanced: true, builtin: true, vision: true, tools: true, imageGen: false, thinking: true },
  { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", context: 200000, advanced: false, builtin: true, vision: true, tools: true, imageGen: false, thinking: false },
  { id: "google/gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google", context: 1000000, advanced: true, builtin: true, vision: true, tools: true, imageGen: false, thinking: false },
  { id: "google/gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "Google", context: 1000000, advanced: false, builtin: true, vision: true, tools: true, imageGen: false, thinking: false },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3", provider: "DeepSeek", context: 64000, advanced: false, builtin: true, vision: false, tools: true, imageGen: false, thinking: false },
  { id: "xai/grok-2", name: "Grok 2", provider: "xAI", context: 131000, advanced: true, builtin: true, vision: false, tools: true, imageGen: false, thinking: false },
  { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", provider: "Meta", context: 131000, advanced: true, builtin: true, vision: false, tools: true, imageGen: false, thinking: false },
  { id: "mistralai/mistral-large-latest", name: "Mistral Large", provider: "Mistral", context: 128000, advanced: true, builtin: true, vision: false, tools: true, imageGen: false, thinking: false },
];

export const PROMPT_SUGGESTIONS = [
  { label: "Write a poem", icon: "✍️", prompt: "Write a short poem about the quiet of an early morning." },
  { label: "Explain code", icon: "💡", prompt: "Explain how React's useEffect cleanup function works, with a small example." },
  { label: "Plan a trip", icon: "✈️", prompt: "Plan a 3-day trip to Sylhet, Bangladesh, including food and hidden gems." },
  { label: "Translate", icon: "🌐", prompt: "Translate to Bengali: 'The early bird catches the worm.'" },
  { label: "Summarize", icon: "📝", prompt: "Summarize the following text in 3 bullet points:", allowAttachment: true },
  { label: "Brainstorm", icon: "🧠", prompt: "Give me 5 creative ideas for a side project I can build in a weekend." },
];

export const DEFAULT_COPILOTS = [
  {
    id: "default",
    name: "Helpful Assistant",
    icon: "🤖",
    systemPrompt: "You are a helpful assistant.",
    temperature: 0.7,
    builtin: true,
  },
  {
    id: "coder",
    name: "Senior Developer",
    icon: "👨‍💻",
    systemPrompt: "You are a senior software developer. Prioritize correctness, readability, and pragmatic solutions. Explain trade-offs concisely. Use code examples when relevant.",
    temperature: 0.3,
    builtin: true,
  },
  {
    id: "writer",
    name: "Creative Writer",
    icon: "✍️",
    systemPrompt: "You are a creative writing assistant. Write vividly, vary sentence length, and avoid clichés. When editing, preserve the author's voice.",
    temperature: 0.9,
    builtin: true,
  },
  {
    id: "translator",
    name: "Translator",
    icon: "🌐",
    systemPrompt: "You are a professional translator. Preserve tone, idioms, and cultural context. Respond in the target language unless asked otherwise.",
    temperature: 0.2,
    builtin: true,
  },
  {
    id: "analyst",
    name: "Data Analyst",
    icon: "📊",
    systemPrompt: "You are a data analyst. Be precise with numbers, surface assumptions, and recommend next steps. Use tables and bullet points for clarity.",
    temperature: 0.4,
    builtin: true,
  },
];

// Provider auto-detection from base URL hostname
export function detectProvider(baseUrl) {
  if (!baseUrl) return "openai-compatible";
  const u = baseUrl.toLowerCase();
  if (u.includes("api.openai.com")) return "openai";
  if (u.includes("api.anthropic.com")) return "anthropic";
  if (u.includes("generativelanguage.googleapis.com")) return "google";
  if (u.includes("api.groq.com") || u.includes("groq.com")) return "groq";
  if (u.includes("api.deepseek.com") || u.includes("deepseek.com")) return "deepseek";
  if (u.includes("api.mistral.ai") || u.includes("mistral.ai")) return "mistral";
  if (u.includes("api.x.ai") || u.includes("api.grok") || u.includes("x.ai")) return "xai";
  if (u.includes("api.cohere.ai") || u.includes("cohere.ai")) return "cohere";
  if (u.includes("api.together.xyz") || u.includes("together.xyz")) return "together";
  if (u.includes("api.fireworks.ai") || u.includes("fireworks.ai")) return "fireworks";
  if (u.includes("openrouter.ai")) return "openrouter";
  if (u.includes("11434") || u.includes("ollama")) return "ollama";
  if (u.includes("1234") || u.includes("lmstudio") || u.includes("lm-studio")) return "lmstudio";
  return "openai-compatible";
}

export const PROVIDER_LABELS = {
  "openai": { name: "OpenAI", protocol: "OpenAI", hint: "Uses Authorization: Bearer header and /v1/chat/completions endpoint." },
  "openai-compatible": { name: "OpenAI-compatible", protocol: "OpenAI", hint: "Any service that speaks the OpenAI Chat Completions API (most gateways, vLLM, etc)." },
  "openrouter": { name: "OpenRouter", protocol: "OpenAI", hint: "OpenRouter — one key, 100+ models. Uses OpenAI format with model ids like 'anthropic/claude-3.5-sonnet'." },
  "anthropic": { name: "Anthropic Claude", protocol: "Anthropic Native", hint: "Uses x-api-key + anthropic-version headers and /v1/messages endpoint with content blocks." },
  "google": { name: "Google Gemini", protocol: "Google Native", hint: "Uses ?key= query param and /v1beta/models/{model}:streamGenerateContent?alt=sse." },
  "groq": { name: "Groq", protocol: "OpenAI", hint: "Ultra-fast LPU inference. OpenAI-compatible." },
  "deepseek": { name: "DeepSeek", protocol: "OpenAI", hint: "DeepSeek V3. OpenAI-compatible. Set apiModel to 'deepseek-chat' or 'deepseek-reasoner'." },
  "mistral": { name: "Mistral AI", protocol: "OpenAI", hint: "OpenAI-compatible. Set base to https://api.mistral.ai/v1 and pick a Mistral model." },
  "xai": { name: "xAI (Grok)", protocol: "OpenAI", hint: "OpenAI-compatible at https://api.x.ai/v1." },
  "cohere": { name: "Cohere", protocol: "Cohere Native", hint: "Uses /v2/chat with Cohere's native message format. Limited streaming support." },
  "together": { name: "Together AI", protocol: "OpenAI", hint: "OpenAI-compatible. Many open-source models, fast inference." },
  "fireworks": { name: "Fireworks AI", protocol: "OpenAI", hint: "OpenAI-compatible. Fast inference for open-source models." },
  "ollama": { name: "Ollama (local)", protocol: "OpenAI-compat", hint: "Local models. No API key needed. Install from https://ollama.com then run 'ollama pull llama3.1'." },
  "lmstudio": { name: "LM Studio (local)", protocol: "OpenAI-compat", hint: "Local models. No API key needed. Start the local server in LM Studio." },
};

export const useStore = create(
  persist(
    (set, get) => ({
      chats: seedChats(),
      activeChatId: null,
      sidebarOpen: true,
      searchOpen: false,
      settingsOpen: false,
      settingsTab: "general",
      favorites: [],
      paletteOpen: false,

      // toasts (ephemeral, not persisted)
      toasts: [],

      // cross-component draft insert: e.g. AgentPopup "insert into chat"
      chatInputDraft: "",
      setChatInputDraft: (v) => set({ chatInputDraft: v }),

      // Prompt Builder tool
      promptBuilderOpen: false,
      setPromptBuilderOpen: (v) => set({ promptBuilderOpen: v }),

      // ZCode-style PC agent controls
      pcFullAccess: false,   // ON = agents act on the PC without asking (bypass mode)
      pcWorkspace: "",       // agents are confined to this folder ("" = no root)

      // Chat language: the selected voice/output language. When set, the
      // whole conversation replies in this language.
      chatLanguage: "en",
      setChatLanguage: (code) => set({ chatLanguage: code }),

      // Clipboard collection: every Copy inside the app is remembered here.
      // Ctrl+V in the chat input pastes ALL collected items (most recent
      // first), so "jotogula copy korbo sob paste hoi".
      clipCabinet: [],
      pushClip: (text) => {
        if (!text) return;
        set((s) => {
          const cabinet = [{ text, at: Date.now() }, ...s.clipCabinet.filter((c) => c.text !== text)].slice(0, 25);
          return { clipCabinet: cabinet };
        });
      },
      clearClipCabinet: () => set({ clipCabinet: [] }),

      // appearance
      theme: "default", // default | claude-classic | mist-blue | custom
      customColor: "#2f6feb",
      mode: "dark", // dark | light | system
      language: "en",
      fontSize: 14,
      startupPage: "home",
      reduceMotion: "system", // true | false | system

      // chat defaults
      systemPrompt: "You are a helpful assistant. Explain everything in simple words anyone can follow — the user may not be a programmer. When giving code or steps, also say exactly where to put it and what to click/type, step by step.",
      maxContextMessages: 50,
      temperature: 0.7,

      // api config (BYOK)
      apiBaseUrl: "https://openrouter.ai/api/v1",
      apiKey: "",
      apiModel: "openai/gpt-4o-mini",

      // custom models (user-added) + copilots (user-added)
      customModels: [],
      activeCopilotId: "default",
      copilots: DEFAULT_COPILOTS,

      // currency + budget
      fxRateBDT: 110,        // 1 USD = 110 BDT (configurable)
      costPrimary: "bdt",     // bdt | usd — which comes first in TokenBadge
      monthlyBudgetUSD: null, // null = unlimited
      modelPricing: {},       // user overrides: { modelId: { input, output, tier } }

      // Internal Usage Value reference rates (BDT per 1M tokens + BDT→USDT).
      // This is NOT the provider charge — free models have $0.00 API cost
      // while their Usage Value is still calculated and displayed.
      internalRates: { inputBDT: 100, outputBDT: 300, usdtPerBDT: 0.0085 },
      setInternalRate: (key, val) => set((s) => ({
        internalRates: { ...s.internalRates, [key]: val },
      })),

      // usage tracking (this calendar month)
      monthlyUsage: {
        month: new Date().toISOString().slice(0, 7), // YYYY-MM
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 0,
        costUSD: 0,
        costBDT: 0,
        byModel: {}, // { modelId: { requests, promptTokens, completionTokens, costUSD, costBDT } }
        byDay: {},   // { 'YYYY-MM-DD': { requests, costUSD } }
      },
      todayUsage: {
        date: new Date().toISOString().slice(0, 10),
        requests: 0,
        costUSD: 0,
        costBDT: 0,
      },

      // derived: all models available (built-in + custom) for picker
      allModels: () => {
        const s = get();
        return [...BUILTIN_MODELS, ...s.customModels];
      },

      setActive: (id) => set({ activeChatId: id }),
      setSidebar: (v) => set({ sidebarOpen: v }),
      setSearchOpen: (v) => set({ searchOpen: v }),
      setSettingsOpen: (v) => set({ settingsOpen: v }),
      setSettingsTab: (t) => set({ settingsTab: t }),
      setPaletteOpen: (v) => set({ paletteOpen: v }),

      pushToast: (toast) => {
        const id = newId();
        set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, toast.duration ?? 3200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      createChat: (opts = {}) => {
        const c = {
          id: newId(),
          title: opts.title || "New chat",
          pinned: false,
          messages: [],
          createdAt: Date.now(),
        };
        set((s) => ({ chats: [c, ...s.chats], activeChatId: c.id }));
        return c.id;
      },
      createImageChat: () => {
        const c = {
          id: newId(),
          title: "Image generation",
          pinned: false,
          messages: [],
          createdAt: Date.now(),
        };
        set((s) => ({ chats: [c, ...s.chats], activeChatId: c.id }));
        return c.id;
      },
      deleteChat: (id) => {
        set((s) => {
          const chats = s.chats.filter((c) => c.id !== id);
          return {
            chats,
            activeChatId: s.activeChatId === id ? (chats[0]?.id ?? null) : s.activeChatId,
          };
        });
      },
      togglePin: (id) => {
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)) }));
      },
      renameChat: (id, title) => {
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) }));
      },
      addMessage: (chatId, msg) => {
        set((s) => ({
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, msg] } : c)),
        }));
      },
      appendToMessage: (chatId, msgId, chunk) => {
        set((s) => ({
          chats: s.chats.map((c) => {
            if (c.id !== chatId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === msgId ? { ...m, content: (m.content || "") + chunk } : m
              ),
            };
          }),
        }));
      },
      replaceMessage: (chatId, msgId, newMsg) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...newMsg } : m)) }
              : c
          ),
        }));
      },
      // Patch a single subtask inside a message's orchestration state.
      updateOrchSubtask: (chatId, msgId, subId, patchOrFn) => {
        // patchOrFn: plain object OR a function receiving the whole state and
        // returning the patch — handy when the patch needs the current subtask.
        set((s) => {
          const resolved = typeof patchOrFn === "function" ? patchOrFn(s) : patchOrFn;
          if (!resolved) return {};
          return {
            chats: s.chats.map((c) => {
              if (c.id !== chatId) return c;
              return {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== msgId || !m.orchestration) return m;
                  return {
                    ...m,
                    orchestration: {
                      ...m.orchestration,
                      subtasks: m.orchestration.subtasks.map((st) =>
                        st.id === subId ? { ...st, ...resolved } : st
                      ),
                    },
                  };
                }),
              };
            }),
          };
        });
      },
      truncateMessagesAfter: (chatId, indexInclusive) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.slice(0, indexInclusive + 1) }
              : c
          ),
        }));
      },
      setChatTitleIfEmpty: (chatId, title) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId && (c.title === "New chat" || c.title === "Image generation")
              ? { ...c, title }
              : c
          ),
        }));
      },

      // Record token usage after a message completes. Bumps monthlyUsage + todayUsage
      // and the per-model / per-day buckets. Also records cumulative on the message itself.
      // Two separate financial values are tracked:
      //   costUSD      — the ACTUAL provider charge ($0.00 for free models)
      //   usageValue*  — the INTERNAL reference value (৳/USDT), always calculated
      recordUsage: (modelId, usage, costUSD) => {
        if (!usage) return;
        const today = new Date().toISOString().slice(0, 10);
        const month = today.slice(0, 7);
        const promptTokens = usage.promptTokens || usage.prompt_tokens || 0;
        const completionTokens = usage.completionTokens || usage.completion_tokens || 0;
        const reasoningTokens = usage.reasoningTokens || usage.completion_tokens_details?.reasoning_tokens || 0;
        const cachedTokens = usage.cachedTokens || usage.prompt_tokens_details?.cached_tokens || 0;
        const cost = costUSD || 0;
        const fxRate = get().fxRateBDT || 110;
        const costBDT = cost * fxRate;
        // Internal Usage Value — from the configurable BDT token rates. Always
        // calculated, even for free models (whose actual API cost is $0.00).
        const rates = get().internalRates || { inputBDT: 100, outputBDT: 300, usdtPerBDT: 0.0085 };
        const { bdt: valueBDT, usdt: valueUSDT } = computeUsageValue(
          { promptTokens, completionTokens }, rates
        );

        set((s) => {
          // Auto-reset monthly bucket if month rolled over
          const m = s.monthlyUsage.month === month ? s.monthlyUsage : {
            month, requests: 0, promptTokens: 0, completionTokens: 0,
            reasoningTokens: 0, cachedTokens: 0, costUSD: 0, costBDT: 0,
            byModel: {}, byDay: {},
          };
          // If a streaming preview was already showing this request's cost in
          // todayUsage, back it out first so the final record isn't double-counted.
          const prevPreview = s._inFlightPreview || null;
          const baseT = s.todayUsage.date === today ? s.todayUsage : { date: today, requests: 0, costUSD: 0, costBDT: 0 };
          const t = prevPreview && s.todayUsage.date === today
            ? { ...baseT, costUSD: Math.max(0, baseT.costUSD - prevPreview.costUSD), costBDT: Math.max(0, baseT.costBDT - prevPreview.costUSD * fxRate) }
            : baseT;

          // 80% budget warning
          if (s.monthlyBudgetUSD && (m.costUSD + cost) / s.monthlyBudgetUSD >= 0.8 && m.costUSD / s.monthlyBudgetUSD < 0.8) {
            setTimeout(() => get().pushToast({
              type: "warning",
              message: `80% of monthly budget used ($${(m.costUSD + cost).toFixed(2)} of $${s.monthlyBudgetUSD.toFixed(2)}).`,
            }), 0);
          }
          if (s.monthlyBudgetUSD && (m.costUSD + cost) >= s.monthlyBudgetUSD && m.costUSD < s.monthlyBudgetUSD) {
            setTimeout(() => get().pushToast({
              type: "error",
              message: `Monthly budget reached: $${(m.costUSD + cost).toFixed(2)} of $${s.monthlyBudgetUSD.toFixed(2)}.`,
            }), 0);
          }

          const mid = modelId || "unknown";
          return {
            monthlyUsage: {
              ...m,
              requests: m.requests + 1,
              promptTokens: m.promptTokens + promptTokens,
              completionTokens: m.completionTokens + completionTokens,
              reasoningTokens: m.reasoningTokens + reasoningTokens,
              cachedTokens: m.cachedTokens + cachedTokens,
              costUSD: m.costUSD + cost,
              costBDT: m.costBDT + costBDT,
              // Internal usage value totals (৳/USDT) — separate from API cost.
              valueBDT: (m.valueBDT || 0) + valueBDT,
              valueUSDT: (m.valueUSDT || 0) + valueUSDT,
              byModel: {
                ...m.byModel,
                [mid]: {
                  requests: (m.byModel[mid]?.requests || 0) + 1,
                  promptTokens: (m.byModel[mid]?.promptTokens || 0) + promptTokens,
                  completionTokens: (m.byModel[mid]?.completionTokens || 0) + completionTokens,
                  costUSD: (m.byModel[mid]?.costUSD || 0) + cost,
                  costBDT: (m.byModel[mid]?.costBDT || 0) + costBDT,
                  valueBDT: (m.byModel[mid]?.valueBDT || 0) + valueBDT,
                  valueUSDT: (m.byModel[mid]?.valueUSDT || 0) + valueUSDT,
                },
              },
              byDay: {
                ...m.byDay,
                [today]: {
                  requests: (m.byDay[today]?.requests || 0) + 1,
                  costUSD: (m.byDay[today]?.costUSD || 0) + cost,
                  costBDT: (m.byDay[today]?.costBDT || 0) + costBDT,
                  valueBDT: (m.byDay[today]?.valueBDT || 0) + valueBDT,
                  valueUSDT: (m.byDay[today]?.valueUSDT || 0) + valueUSDT,
                },
              },
            },
            todayUsage: {
              ...t,
              requests: t.requests + 1,
              costUSD: t.costUSD + cost,
              costBDT: t.costBDT + costBDT,
              valueBDT: (t.valueBDT || 0) + valueBDT,
              valueUSDT: (t.valueUSDT || 0) + valueUSDT,
              promptTokens: (t.promptTokens || 0) + (usage.promptTokens || 0),
              completionTokens: (t.completionTokens || 0) + (usage.completionTokens || 0),
            },
            _inFlightPreview: null,
          };
        });
      },

      // Live in-flight preview for the Today's spend widget. Called during
      // streaming; recordUsage() at completion reconciles the final numbers.
      // Supports several concurrent in-flight calls (agent workers): each has
      // its own preview slot keyed by id; the completed ones are removed.
      previewUsage: (modelId, usage, costUSD, previewId = "main") => {
        if (!usage) return;
        const promptTokens = usage.promptTokens || usage.prompt_tokens || 0;
        const completionTokens = usage.completionTokens || usage.completion_tokens || 0;
        const cost = costUSD || 0;
        const fxRate = get().fxRateBDT || 110;
        const today = new Date().toISOString().slice(0, 10);
        set((s) => {
          const t0 = s.todayUsage.date === today
            ? s.todayUsage
            : { date: today, requests: 0, costUSD: 0, costBDT: 0 };
          const prevMap = { ...(s._inFlightPreviews || {}) };
          const prev = prevMap[previewId] || { costUSD: 0 };
          // Back out this call's old preview, add the new value.
          const baseCost = Math.max(0, t0.costUSD - (prev.costUSD || 0));
          const otherPreviews = Object.entries(prevMap)
            .filter(([k]) => k !== previewId)
            .reduce((a, [, p]) => a + (p.costUSD || 0), 0);
          const newCost = baseCost + cost;
          prevMap[previewId] = { costUSD: cost, promptTokens, completionTokens };
          // Live ৳/USDT preview too — stream the same value math the chat's
          // badge uses so Console cards tick in real time while generating.
          const rates = get().internalRates || { inputBDT: 100, outputBDT: 300, usdtPerBDT: 0.0085 };
          const prevTok = prevMap.__totals || { promptTokens: 0, completionTokens: 0 };
          const livePrompt = (t0.promptTokens || 0) - (prevTok.promptTokens || 0) + promptTokens;
          const liveCompletion = (t0.completionTokens || 0) - (prevTok.completionTokens || 0) + completionTokens;
          const liveValueBDT = (livePrompt / 1e6) * rates.inputBDT + (liveCompletion / 1e6) * rates.outputBDT;
          prevMap.__totals = { promptTokens, completionTokens };
          return {
            _inFlightPreviews: prevMap,
            todayUsage: {
              ...t0,
              costUSD: newCost,
              costBDT: newCost * fxRate,
              valueBDT: liveValueBDT,
              valueUSDT: liveValueBDT * (rates.usdtPerBDT || 0.0085),
              promptTokens: livePrompt,
              completionTokens: liveCompletion,
            },
            _inFlightPreview: { requests: 1, costUSD: otherPreviews + cost }, // legacy shape for recordUsage
          };
        });
      },
      clearPreviewUsage: (previewId) => set((s) => {
        if (!previewId) return { _inFlightPreview: null, _inFlightPreviews: {} };
        const prevMap = { ...(s._inFlightPreviews || {}) };
        if (!prevMap[previewId]) return {};
        const t0 = s.todayUsage;
        const backed = Math.max(0, t0.costUSD - (prevMap[previewId].costUSD || 0));
        delete prevMap[previewId];
        return { _inFlightPreviews: prevMap, _inFlightPreview: null, todayUsage: { ...t0, costUSD: backed, costBDT: backed * (s.fxRateBDT || 110) } };
      }),

      // Per-chat cumulative cost (sum of all assistant messages)
      accumulateChatCost: (chatId, costUSD) => {
        if (!costUSD) return;
        set((s) => ({
          chats: s.chats.map((c) => c.id === chatId ? {
            ...c,
            cumulativeCostUSD: (c.cumulativeCostUSD || 0) + costUSD,
            cumulativeCostBDT: (c.cumulativeCostBDT || 0) + costUSD * (s.fxRateBDT || 110),
            cumulativeTokens: {
              prompt: (c.cumulativeTokens?.prompt || 0) + (c.lastUsage?.prompt || 0),
              completion: (c.cumulativeTokens?.completion || 0) + (c.lastUsage?.completion || 0),
              reasoning: (c.cumulativeTokens?.reasoning || 0) + (c.lastUsage?.reasoning || 0),
              cached: (c.cumulativeTokens?.cached || 0) + (c.lastUsage?.cached || 0),
            },
          } : c),
        }));
      },

      // Reset all usage (for testing)
      resetUsage: () => {
        const today = new Date().toISOString().slice(0, 10);
        const month = today.slice(0, 7);
        set({
          monthlyUsage: { month, requests: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cachedTokens: 0, costUSD: 0, costBDT: 0, byModel: {}, byDay: {} },
          todayUsage: { date: today, requests: 0, costUSD: 0, costBDT: 0 },
        });
        get().pushToast({ type: "info", message: "Usage counters reset." });
      },

      // model management
      addCustomModel: (model) => {
        const m = { id: model.id || newId(), builtin: false, ...model };
        set((s) => ({ customModels: [...s.customModels, m] }));
        get().pushToast({ type: "success", message: `Model "${m.name}" added.` });
        return m.id;
      },
      updateCustomModel: (id, patch) => {
        set((s) => ({ customModels: s.customModels.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
      },
      removeCustomModel: (id) => {
        set((s) => ({ customModels: s.customModels.filter((m) => m.id !== id) }));
        get().pushToast({ type: "info", message: "Model removed." });
      },

      // copilots
      setActiveCopilot: (id) => {
        const c = get().copilots.find((cp) => cp.id === id);
        if (c) {
          set({
            activeCopilotId: id,
            systemPrompt: c.systemPrompt,
            temperature: c.temperature,
          });
        }
      },
      addCopilot: (copilot) => {
        const c = { id: newId(), builtin: false, ...copilot };
        set((s) => ({ copilots: [...s.copilots, c] }));
        return c.id;
      },
      updateCopilot: (id, patch) => {
        set((s) => ({ copilots: s.copilots.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
        const s = get();
        if (s.activeCopilotId === id) {
          const c = s.copilots.find((cp) => cp.id === id);
          if (c) set({ systemPrompt: c.systemPrompt, temperature: c.temperature });
        }
      },
      removeCopilot: (id) => {
        set((s) => ({
          copilots: s.copilots.filter((c) => c.id !== id),
          activeCopilotId: s.activeCopilotId === id ? "default" : s.activeCopilotId,
        }));
      },

      toggleFavorite: (modelId) => {
        set((s) => ({
          favorites: s.favorites.includes(modelId)
            ? s.favorites.filter((m) => m !== modelId)
            : [...s.favorites, modelId],
        }));
      },

      setSetting: (key, val) => set({ [key]: val }),
    }),
    {
      name: "chatbox-clone-state-v3",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? makeSafeStorage() : undefined)),
      partialize: (s) => ({
        chats: s.chats,
        activeChatId: s.activeChatId,
        theme: s.theme,
        customColor: s.customColor,
        mode: s.mode,
        language: s.language,
        fontSize: s.fontSize,
        startupPage: s.startupPage,
        reduceMotion: s.reduceMotion,
        systemPrompt: s.systemPrompt,
        maxContextMessages: s.maxContextMessages,
        temperature: s.temperature,
        apiBaseUrl: s.apiBaseUrl,
        apiKey: s.apiKey,
        apiModel: s.apiModel,
        customModels: s.customModels,
        copilots: s.copilots,
        activeCopilotId: s.activeCopilotId,
        favorites: s.favorites,
        sidebarOpen: s.sidebarOpen,
        fxRateBDT: s.fxRateBDT,
        costPrimary: s.costPrimary,
        monthlyBudgetUSD: s.monthlyBudgetUSD,
        modelPricing: s.modelPricing,
        internalRates: s.internalRates,
        pcFullAccess: s.pcFullAccess,
        pcWorkspace: s.pcWorkspace,
        chatLanguage: s.chatLanguage,
        clipCabinet: s.clipCabinet.slice(0, 10),
        monthlyUsage: s.monthlyUsage,
        todayUsage: s.todayUsage,
      }),
      // Throttle persist writes (zustand persist can be chatty)
      version: 3,
      // Rehydrate manually in a mount effect (app/page.js) — synchronous
      // rehydration at module init makes the first client render differ from
      // SSR HTML for every returning user → React hydration errors.
      skipHydration: true,
      migrate: (persisted, version) => {
        if (!persisted) return persisted;
        if (version < 3) {
          // Carry over from v2; ensure new fields have safe defaults
          return {
            ...persisted,
            customModels: persisted.customModels || [],
            copilots: persisted.copilots || DEFAULT_COPILOTS,
            activeCopilotId: persisted.activeCopilotId || "default",
            reduceMotion: persisted.reduceMotion || "system",
          };
        }
        return persisted;
      },
    }
  )
);

// Custom storage wrapper: try/catch QuotaExceededError and warn the user once
function makeSafeStorage() {
  return {
    getItem: (name) => {
      try { return localStorage.getItem(name); } catch { return null; }
    },
    setItem: (name, value) => {
      try { localStorage.setItem(name, value); }
      catch (e) {
        if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
          // Don't crash the app. The store has the latest in memory.
          // eslint-disable-next-line no-console
          console.warn("LocalStorage quota exceeded; state in memory only.");
        }
      }
    },
    removeItem: (name) => {
      try { localStorage.removeItem(name); } catch {}
    },
  };
}
