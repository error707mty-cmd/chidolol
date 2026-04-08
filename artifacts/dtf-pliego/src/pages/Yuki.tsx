import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bot, Send, Trash2, Loader2, Sparkles, X, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_BASE = "/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: unknown }[];
  isThinking?: boolean;
}

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

export default function Yuki() {
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const genRef = useRef(0);

  useAutoResize(inputRef, input);

  // Check access on mount
  useEffect(() => {
    if (!token) {
      setHasAccess(false);
      return;
    }
    fetch(`${API_BASE}/yuki/access`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        setHasAccess(r.ok);
      })
      .catch(() => setHasAccess(false));
  }, [token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

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
      const res = await fetch(`${API_BASE}/yuki/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
          } catch {
            // skip malformed SSE
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

  // Access denied screen
  if (hasAccess === false) {
    return (
      <div className="yuki-denied">
        <div className="yuki-denied-card">
          <Shield size={48} className="yuki-denied-icon" />
          <h2>Acceso Exclusivo</h2>
          <p>Yuki es una IA exclusiva para el creador de ERROR707 Studio.</p>
          <button onClick={() => setLocation("/")} className="yuki-denied-btn">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // Loading access check
  if (hasAccess === null) {
    return (
      <div className="yuki-loading">
        <Loader2 size={32} className="yuki-spinner" />
        <p>Verificando acceso...</p>
      </div>
    );
  }

  return (
    <div className="yuki-root">
      {/* Header */}
      <header className="yuki-header">
        <div className="yuki-logo" onClick={() => setLocation("/")} style={{ cursor: "pointer" }}>
          <span className="yuki-logo-icon">雪</span>
          <span className="yuki-logo-text">Yuki</span>
          <span className="yuki-logo-badge">EXCLUSIVE</span>
        </div>
        <nav className="yuki-nav">
          <button onClick={() => setLocation("/")}>Inicio</button>
          <button className="active">
            <Sparkles size={14} /> Yuki
          </button>
        </nav>
      </header>

      {/* Main */}
      <div className="yuki-main">
        {/* Sidebar */}
        <aside className="yuki-sidebar">
          <div className="yuki-sidebar-header">
            <div className="yuki-avatar">
              <span>雪</span>
            </div>
            <div>
              <div className="yuki-name">Yuki</div>
              <div className="yuki-status">
                <span className="yuki-status-dot" />
                DeepSeek Coder
              </div>
            </div>
          </div>

          <div className="yuki-sidebar-section">
            <div className="yuki-sidebar-label">Control Total</div>
            {[
              { icon: "📝", label: "Modificar código" },
              { icon: "🎨", label: "Cambiar estilos" },
              { icon: "🗄️", label: "Base de datos" },
              { icon: "⚡", label: "Shell Linux" },
              { icon: "📦", label: "Paquetes npm" },
              { icon: "🔧", label: "Configuración" },
              { icon: "🧠", label: "Memoria persistente" },
            ].map(({ icon, label }) => (
              <div key={label} className="yuki-capability">
                <span className="yuki-capability-icon">{icon}</span>
                <span>{label}</span>
                <span className="yuki-capability-check">✓</span>
              </div>
            ))}
          </div>

          <div className="yuki-sidebar-section">
            <div className="yuki-sidebar-label">Info</div>
            <div className="yuki-info-card">
              <div className="yuki-info-row">
                <span>Modelo</span>
                <span>deepseek-coder</span>
              </div>
              <div className="yuki-info-row">
                <span>Herramientas</span>
                <span>18 activas</span>
              </div>
              <div className="yuki-info-row">
                <span>Acceso</span>
                <span>Exclusivo</span>
              </div>
            </div>
          </div>

          {messages.length > 0 && (
            <div className="yuki-sidebar-section" style={{ marginTop: "auto" }}>
              <button onClick={clearChat} className="yuki-clear-btn">
                <Trash2 size={13} />
                Limpiar chat
              </button>
            </div>
          )}
        </aside>

        {/* Chat Panel */}
        <div className="yuki-chat-panel">
          <div className="yuki-chat">
            {/* Chat Header */}
            <div className="yuki-chat-header">
              <Sparkles size={16} />
              <span>Control Total de la Aplicación</span>
              <span className="yuki-chat-header-sub">
                Puedo modificar cualquier cosa — código, estilos, DB, configuración
              </span>
              {loading && (
                <button className="yuki-cancel-btn" onClick={stopGeneration}>
                  <X size={11} /> Cancelar
                </button>
              )}
              {messages.length > 0 && !loading && (
                <button className="yuki-cancel-btn" onClick={clearChat} style={{ marginLeft: "auto" }}>
                  <Trash2 size={11} /> Limpiar
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="yuki-messages">
              {messages.length === 0 && (
                <div className="yuki-empty">
                  <div className="yuki-empty-avatar">雪</div>
                  <h3>Hola, soy Yuki 🌸</h3>
                  <p>
                    Tengo control total sobre ERROR707 Studio. Puedo modificar código, 
                    cambiar estilos, ejecutar comandos, y hacer cualquier cambio que necesites
                    — todo en tiempo real.
                  </p>
                  <div className="yuki-suggestions">
                    <button onClick={() => setInput("Cambia el color principal de la app a azul")}>
                      Cambiar color principal
                    </button>
                    <button onClick={() => setInput("Muéstrame las estadísticas de la app")}>
                      Ver estadísticas
                    </button>
                    <button onClick={() => setInput("Lista los archivos del frontend")}>
                      Explorar código
                    </button>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`yuki-message yuki-message--${msg.role}${msg.isThinking ? " yuki-message--thinking" : ""}`}
                >
                  {msg.isThinking ? (
                    <div className="yuki-thinking">
                      <Loader2 size={13} className="yuki-spinner" />
                      <span>Procesando...</span>
                    </div>
                  ) : (
                    <>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="yuki-tool-calls">
                          {msg.toolCalls.map((tc, j) => (
                            <div key={j} className="yuki-tool-call">
                              <span className="yuki-tool-name">{tc.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        className="yuki-message-content"
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
            <div className="yuki-input-area">
              <div className="yuki-input-row">
                <textarea
                  ref={inputRef}
                  className="yuki-input"
                  placeholder={
                    loading
                      ? "Yuki está trabajando..."
                      : "Pídeme lo que necesites... (Enter para enviar)"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="yuki-send-btn"
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                >
                  {loading ? (
                    <Loader2 size={16} className="yuki-spinner" />
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
        .yuki-spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
