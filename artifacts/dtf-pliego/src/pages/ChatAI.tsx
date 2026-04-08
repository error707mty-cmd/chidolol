import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bot, Send, Trash2, Loader2, Zap, X } from "lucide-react";

const API_BASE = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: unknown }[];
  isThinking?: boolean;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre><code class="lang-${lang}">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`
    );
    return `%%CODEBLOCK_${idx}%%`;
  });

  const inlineCodes: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(
      `<code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`
    );
    return `%%INLINE_${idx}%%`;
  });

  result = result.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  result = result.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  result = result.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  result = result.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  result = result.replace(/(^- .+\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^- /, "").trim()}</li>`)
      .join("");
    return `<ul>${items}</ul>\n`;
  });

  result = result
    .split(/\n\n+/)
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (/^<(h[1-3]|ul|ol|pre|%%)/i.test(block)) return block;
      return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  codeBlocks.forEach((block, idx) => {
    result = result.replace(`%%CODEBLOCK_${idx}%%`, block);
  });
  inlineCodes.forEach((code, idx) => {
    result = result.replace(`%%INLINE_${idx}%%`, code);
  });

  return result;
}

// ─── Auto-resize textarea ─────────────────────────────────────────────────────

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = el.scrollHeight;
    const maxHeight = 180;
    el.style.height = Math.min(newHeight, maxHeight) + "px";
    el.style.overflowY = newHeight > maxHeight ? "auto" : "hidden";
  }, [value, ref]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatAI() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const genRef = useRef(0);

  useAutoResize(inputRef, input);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ─── Send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    genRef.current += 1;
    const myGen = genRef.current;

    const userMsg: Message = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", isThinking: true }]);
    setInput("");
    setLoading(true);

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let toolCallsAccum: { name: string; input: unknown }[] = [];

      // Replace thinking placeholder with real streaming message
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.isThinking) {
          updated[updated.length - 1] = { role: "assistant", content: "" };
        }
        return updated;
      });

      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.done) break;

            if (data.thinking) {
              // Agent is iterating with tools — show subtle indicator
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant" && !last.isThinking) {
                  // keep current content, just mark as still processing
                }
                return updated;
              });
            }

            if (data.tool_calls) {
              toolCallsAccum = [...toolCallsAccum, ...data.tool_calls];
            }

            if (data.content) {
              accumulated += data.content;
              const snap = accumulated;
              const tools = toolCallsAccum;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: snap,
                    toolCalls: tools.length > 0 ? tools : undefined,
                    isThinking: false,
                  };
                }
                return updated;
              });
            }

            if (data.error) {
              throw new Error(data.error);
            }
          } catch (parseErr) {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        if (myGen === genRef.current) setLoading(false);
        return;
      }
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || `⚠️ Error: ${String(err)}`,
            isThinking: false,
          };
        }
        return updated;
      });
    } finally {
      try { reader?.cancel(); } catch { /* ignore */ }
      if (myGen === genRef.current) setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setLoading(false);
    setInput("");
  };

  const stopGeneration = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setLoading(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant" && last.isThinking) {
        updated[updated.length - 1] = { ...last, isThinking: false, content: last.content || "_(cancelado)_" };
      }
      return updated;
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="aia-root">
      {/* ── Header ── */}
      <header className="jl-header">
        <div
          className="jl-logo"
          onClick={() => setLocation("/")}
          style={{ cursor: "pointer" }}
        >
          <span className="jl-logo-icon">🖨️</span>
          <span className="jl-logo-text">ERROR707</span>
        </div>
        <nav className="jl-nav">
          <button className="jl-admin-link" onClick={() => setLocation("/")}>
            Inicio
          </button>
          <button
            className="jl-admin-link jl-admin-link--active"
            onClick={() => setLocation("/chat-ia")}
          >
            <Bot size={14} /> Chat IA
          </button>
        </nav>
      </header>

      {/* ── Main layout ── */}
      <div className="aia-main">
        {/* ── Sidebar ── */}
        <aside className="aia-sidebar">
          <div className="aia-sidebar-header">
            <div className="aia-avatar" style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)" }}>
              <span style={{ fontSize: "18px" }}>雪</span>
            </div>
            <div>
              <div className="aia-name">Yuki</div>
              <div className="aia-status">
                <span className="aia-status-dot" />
                DeepSeek Coder
              </div>
            </div>
          </div>

          <div className="aia-sidebar-section">
            <div className="aia-sidebar-label">Capacidades</div>
            {[
              { icon: "🗄️", label: "Base de datos" },
              { icon: "📁", label: "Sistema de archivos" },
              { icon: "⚡", label: "Shell de Linux" },
              { icon: "✏️", label: "Edición de código" },
              { icon: "📦", label: "Gestión de paquetes" },
              { icon: "🧠", label: "Memoria persistente" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  padding: "7px 4px",
                  fontSize: "12px",
                  color: "#4a5568",
                }}
              >
                <span style={{ fontSize: "14px" }}>{icon}</span>
                <span>{label}</span>
                <span style={{ marginLeft: "auto", color: "#22c55e", fontSize: "10px", fontWeight: 700 }}>✓</span>
              </div>
            ))}
          </div>

          <div className="aia-sidebar-section">
            <div className="aia-sidebar-label">Info</div>
            <div className="aia-info-card">
              <div className="aia-info-row">
                <span>Modelo</span>
                <span>deepseek-coder</span>
              </div>
              <div className="aia-info-row">
                <span>Herramientas</span>
                <span>18 activas</span>
              </div>
              <div className="aia-info-row">
                <span>Acceso</span>
                <span>Público</span>
              </div>
            </div>
          </div>

          {messages.length > 0 && (
            <div className="aia-sidebar-section" style={{ marginTop: "auto" }}>
              <button
                onClick={clearChat}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  width: "100%",
                  padding: "10px 16px",
                  background: "rgba(239,68,68,0.07)",
                  border: "1px solid rgba(239,68,68,0.18)",
                  borderRadius: "10px",
                  color: "rgba(248,113,113,0.7)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.14)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.07)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,113,113,0.7)";
                }}
              >
                <Trash2 size={13} />
                Limpiar chat
              </button>
            </div>
          )}
        </aside>

        {/* ── Chat panel ── */}
        <div className="aia-right-panel">
          <div className="aia-chat">
            {/* Header */}
            <div className="aia-chat-header">
              <Zap size={16} />
              <span>Agente Autónomo</span>
              <span className="aia-chat-header-sub">
                Con acceso completo a herramientas — filesystem, shell, DB, código
              </span>
              {loading && (
                <button
                  className="aia-reset-btn"
                  onClick={stopGeneration}
                  title="Cancelar generación"
                >
                  <X size={11} /> Cancelar
                </button>
              )}
              {messages.length > 0 && !loading && (
                <button
                  className="aia-reset-btn"
                  onClick={clearChat}
                  title="Limpiar conversación"
                  style={{ marginLeft: "auto" }}
                >
                  <Trash2 size={11} /> Limpiar
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="aia-messages">
              {messages.length === 0 && (
                <div className="aia-empty">
                  <div style={{ width: "60px", height: "60px", background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", marginBottom: "12px", boxShadow: "0 4px 20px rgba(139, 92, 246, 0.3)" }}>雪</div>
                  <h3>Yuki lista para ayudarte 🌸</h3>
                  <p>
                    Tengo acceso completo a código, base de datos, shell y
                    configuración. Pregúntame lo que necesites — puedo leer
                    archivos, ejecutar comandos, consultar la DB y mucho más.
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`aia-message aia-message--${msg.role}${msg.isThinking ? " aia-message--thinking" : ""}`}
                >
                  {msg.isThinking ? (
                    <div className="aia-thinking">
                      <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      <span>Pensando...</span>
                    </div>
                  ) : (
                    <>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="aia-tool-calls">
                          {msg.toolCalls.map((tc, j) => (
                            <div key={j} className="aia-tool-call">
                              <span className="aia-tool-name">{tc.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        className="aia-message-content"
                        dangerouslySetInnerHTML={{
                          __html:
                            msg.role === "assistant"
                              ? renderMarkdown(msg.content)
                              : msg.content.replace(/\n/g, "<br/>"),
                        }}
                      />
                    </>
                  )}
                </div>
              ))}

              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="aia-input-area">
              <div className="aia-input-row">
                <textarea
                  ref={inputRef}
                  className="aia-input"
                  placeholder={
                    loading
                      ? "Yuki está procesando..."
                      : "Escribe tu pregunta o tarea... (Enter para enviar, Shift+Enter para nueva línea)"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={false}
                />
                <button
                  className="aia-send-btn"
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  title={loading ? "Procesando..." : "Enviar"}
                >
                  {loading ? (
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
