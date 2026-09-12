"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import { Bot, User, Brain, Square, Loader2, Volume2, VolumeX, FileCode, Copy, Check, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, memo } from "react";
import MessageActions from "./MessageActions";
import TokenBadge from "./TokenBadge";
import OrchestrationCard from "./OrchestrationCard";
import ReadAloud from "./ReadAloud";
import { useStore } from "@/lib/store";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize, rehypeHighlight];

// Perf: during streaming ChatPanel re-renders on every 150ms flush. Without
// this memo EVERY message bubble re-parses its markdown + re-runs highlight.js
// each tick — the main source of "choppy" on modest hardware. Finished
// messages have unchanged content strings, so their (expensive) markdown
// subtree is skipped entirely.
const MarkdownBody = memo(function MarkdownBody({ content }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={{ pre: CodeBlockPre }}>
      {content}
    </ReactMarkdown>
  );
});

// One-click Copy button on every fenced code block (directive §8 safe: the
// button only reads the rendered text — never injects anything).
function CodeBlockPre({ children }) {
  const preRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const text = preRef.current?.innerText || "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <div className="relative group/code">
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium opacity-0 group-hover/code:opacity-100 transition-opacity cb-focus"
        style={{ background: "var(--cb-border)", color: "var(--cb-text)" }}
        aria-label="Copy code"
        title="Copy code"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied!" : "Copy"}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

export default function MessageBubble({ message, chatId, onEditCode, onInsertChat, onPlanDecision, onRegenerate, onEdit, onFeedback, isLast, apiModel, modelPricing }) {
  const isUser = message.role === "user";
  const hasOrch = !!message.orchestration;
  const hasThinking = message.thinking && !message.content && !hasOrch;
  const modelPricingFromStore = useStore((s) => s.modelPricing);
  const modelPricingResolved = modelPricing || modelPricingFromStore;
  const apiModelFromStore = useStore((s) => s.apiModel);
  const effectiveModel = apiModel || apiModelFromStore;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex gap-3 px-4 py-4"
      style={{ background: isUser ? "transparent" : "var(--cb-surface)" }}
    >
      <motion.div
        layout="position"
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm"
        style={{ background: isUser ? "var(--cb-user-bubble)" : "var(--cb-accent)" }}
      >
        {isUser ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
      </motion.div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium mb-1 tracking-wide uppercase flex items-center gap-2" style={{ color: "var(--cb-muted)" }}>
          <span>{isUser ? "You" : "Assistant"}</span>
          {message.model && !isUser && (
            <span className="text-[10px] normal-case font-normal tracking-normal" style={{ color: "var(--cb-muted)" }}>
              {message.model}
            </span>
          )}
          {message.stopped && (
            <span className="text-[10px] normal-case font-normal px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: "var(--cb-border)" }}>
              <Square size={8} fill="currentColor" /> stopped
            </span>
          )}
        </div>

        {/* Agent mission-control card — live status while the coding agent works */}
        {message.agentRun && (
          <div className="mb-2.5 overflow-hidden rounded-xl border" style={{ borderColor: "var(--cb-border)", background: "var(--cb-surface)" }}>
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--cb-border)" }}>
              <span className={`h-2 w-2 rounded-full ${message.agentRun.done ? (message.agentRun.status2 === "completed" ? "bg-emerald-400" : "bg-red-400") : "animate-pulse bg-sky-400"}`} />
              <span className="text-[12px] font-semibold">🤖 Coding Agent</span>
              <span className="ml-auto text-[11px]" style={{ color: message.agentRun.done ? "var(--cb-accent)" : "var(--cb-muted)" }}>
                {message.agentRun.status}
              </span>
            </div>
            <div className="px-3 py-2">
              {message.agentRun.todos?.length > 0 && (
                <div className="mb-2 space-y-1">
                  {message.agentRun.todos.map((t, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11.5px]">
                      {t.status === "done" ? (
                        <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                      ) : t.status === "doing" ? (
                        <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin text-sky-400" />
                      ) : t.status === "failed" ? (
                        <XCircle size={12} className="mt-0.5 shrink-0 text-red-400" />
                      ) : (
                        <CircleDashed size={12} className="mt-0.5 shrink-0" style={{ color: "var(--cb-muted)" }} />
                      )}
                      <span
                        className={t.status === "done" ? "line-through opacity-60" : ""}
                        style={{ color: t.status === "doing" ? "var(--cb-accent)" : "var(--cb-muted)" }}
                      >
                        {t.text}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] font-medium" style={{ color: "var(--cb-muted)" }}>
                    {message.agentRun.todos.filter((t) => t.status === "done").length}/{message.agentRun.todos.length} সম্পন্ন
                  </p>
                </div>
              )}
              {message.agentRun.steps?.length > 0 && (
                <div className="mb-1.5 space-y-0.5">
                  {message.agentRun.steps.map((s, i) => (
                    <p key={i} className="font-mono text-[10.5px]" style={{ color: "var(--cb-muted)" }}>{s}</p>
                  ))}
                </div>
              )}
              {message.agentRun.files?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {message.agentRun.files.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px]" style={{ background: "color-mix(in srgb, var(--cb-accent) 12%, transparent)", color: "var(--cb-accent)" }}>
                      <FileCode size={10} /> {f}
                    </span>
                  ))}
                </div>
              )}
              {!message.agentRun.done && (
                <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--cb-muted)" }}>
                  ডান পাশের IDE-তে কাজ লাইভ দেখুন · লেখা কোড floating window-তেও আসছে →
                </p>
              )}
            </div>
          </div>
        )}

        {/* Reasoning block (collapsible) */}
        {message.reasoning && (
          <details className="mb-2 rounded-lg overflow-hidden" style={{ background: "color-mix(in srgb, var(--cb-accent) 8%, transparent)", border: "1px solid var(--cb-border)" }}>
            <summary className="px-3 py-2 text-xs cursor-pointer flex items-center gap-1.5 select-none" style={{ color: "var(--cb-muted)" }}>
              <Brain size={12} /> Thought for {Math.max(1, Math.round((message.reasoningMs || 0) / 1000))}s
            </summary>
            <div className="px-3 pb-3 text-xs whitespace-pre-wrap" style={{ color: "var(--cb-muted)" }}>
              {message.reasoning}
            </div>
          </details>
        )}

        {/* Multi-agent orchestration card (animated) */}
        {message.orchestration && (
          <OrchestrationCard orch={message.orchestration} chatId={chatId} msgId={message.id} onEditCode={onEditCode} onInsertChat={onInsertChat} onPlanDecision={onPlanDecision} />
        )}

        {/* CEO's compiled final answer — shown below the card once review is done */}
        {message.orchestration && message.content && (
          <div className="prose-cb max-w-none">
            <MarkdownBody content={message.content} />
          </div>
        )}

        {!hasOrch && (
        <div className="prose-cb max-w-none">
          {message.error ? (
            <div className="text-red-400 text-sm">
              <div className="font-medium">⚠ {message.error}</div>
              {message.errorDetail && (
                <pre className="mt-2 text-xs opacity-80 whitespace-pre-wrap rounded-md p-2 bg-black/30">{message.errorDetail}</pre>
              )}
            </div>
          ) : hasThinking ? (
            <div>
              {message.retrying && (
                <div className="text-[11px] mb-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-md"
                  style={{ background: "color-mix(in srgb, #f59e0b 12%, transparent)", color: "#f59e0b" }}>
                  <Loader2 size={10} className="animate-spin" /> {message.retrying}
                </div>
              )}
              <div className="cb-skel" aria-label="Assistant is thinking">
                <div /><div /><div />
              </div>
            </div>
          ) : message.content ? (
            <>
              <MarkdownBody content={message.content} />
              {message.streaming && <span className="cb-cursor" aria-hidden style={{ marginLeft: 2 }} />}
              {/* Web search sources (ChatGPT-style citations) */}
              {!message.streaming && message.webSources?.length > 0 && (
                <div className="mt-2.5 pt-2 border-t" style={{ borderColor: "var(--cb-border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--cb-muted)" }}>
                    🌐 Web sources
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {message.webSources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer"
                        className="cb-focus flex items-center gap-1 max-w-56 rounded-lg px-2 py-1 text-[11px] transition-colors hover:opacity-80"
                        style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)", color: "var(--cb-text)" }}
                        title={s.url}>
                        <span className="shrink-0 font-mono" style={{ color: "var(--cb-accent)" }}>[{i + 1}]</span>
                        <span className="truncate">{s.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : message.reasoning && !message.streaming ? (
            // Some providers put everything in reasoning_content. Show it as the answer.
            <div className="text-sm opacity-80 italic">
              (Provider returned thinking only) {message.reasoning.slice(0, 200)}{message.reasoning.length > 200 ? "…" : ""}
            </div>
          ) : message.streaming ? (
            <span className="cb-cursor" aria-hidden />
          ) : null}
        </div>
        )}

        {/* Footer stats — rich token badge with USD + BDT cost, real-time */}
        {!isUser && !message.error && (message.content || message.usage || message.streaming) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <TokenBadge
              usage={message.usage}
              model={message.model || effectiveModel}
              streaming={message.streaming}
              modelPricing={modelPricingResolved}
              text={message.content}
              reasoningText={message.reasoning}
              estPromptTokens={message.estPromptTokens}
            />
            {message.elapsedMs != null && (
              <span className="text-[10px] font-mono" style={{ color: "var(--cb-muted)" }}>
                {(message.elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}

        {/* Actions (hover-revealed for non-user; always visible for user) */}
        {(isUser || message.content) && !message.error && (
          <div className={`mt-2 flex items-center gap-1 transition-opacity ${isUser ? "opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            <MessageActions
              message={message}
              onRegenerate={onRegenerate}
              onEdit={onEdit}
              onFeedback={onFeedback}
            />
            {/* Read the reply aloud in the output's own language */}
            {!isUser && <ReadAloud message={message} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}
