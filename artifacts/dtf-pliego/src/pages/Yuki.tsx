import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  Send, Loader2, Settings, Github, RefreshCw, 
  ExternalLink, X, Check, AlertCircle, ChevronDown,
  Eye, Code, Trash2, Upload
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_BASE = "/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: unknown }[];
  isThinking?: boolean;
}

interface GitHubConfig {
  configured: boolean;
  repoUrl?: string;
  tokenSet?: boolean;
  tokenPreview?: string;
  lastPush?: string;
}

interface GitStatus {
  branch: string;
  lastCommit: string;
  changesCount: number;
  hasChanges: boolean;
  changes: { status: string; file: string }[];
}

function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="yuki-code"><code class="lang-${lang}">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`
    );
    return `%%CODEBLOCK_${idx}%%`;
  });

  const inlineCodes: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code class="yuki-inline-code">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`);
    return `%%INLINE_${idx}%%`;
  });

  result = result.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  result = result.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  result = result.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  result = result.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  result = result.replace(/(^- .+\n?)+/gm, (block) => {
    const items = block.trim().split("\n").map((l) => `<li>${l.replace(/^- /, "").trim()}</li>`).join("");
    return `<ul>${items}</ul>\n`;
  });

  result = result.split(/\n\n+/).map((block) => {
    block = block.trim();
    if (!block) return "";
    if (/^<(h[1-3]|ul|ol|pre|%%)/i.test(block)) return block;
    return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");

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
    const maxHeight = 120;
    el.style.height = Math.min(newHeight, maxHeight) + "px";
    el.style.overflowY = newHeight > maxHeight ? "auto" : "hidden";
  }, [value, ref]);
}

export default function Yuki() {
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  
  // Access control
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const genRef = useRef(0);
  
  // GitHub state
  const [showSettings, setShowSettings] = useState(false);
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  
  // Preview state
  const [previewKey, setPreviewKey] = useState(0);
  const previewUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

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
      .then((r) => setHasAccess(r.ok))
      .catch(() => setHasAccess(false));
  }, [token]);

  // Load GitHub config
  useEffect(() => {
    if (!token || !hasAccess) return;
    loadGitHubConfig();
    loadGitStatus();
  }, [token, hasAccess]);

  const loadGitHubConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const config = await res.json();
        setGithubConfig(config);
        if (config.repoUrl) setRepoUrl(config.repoUrl);
      }
    } catch { /* ignore */ }
  };

  const loadGitStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setGitStatus(await res.json());
      }
    } catch { /* ignore */ }
  };

  const saveGitHubConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE}/github/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoUrl: repoUrl || undefined,
          token: githubToken || undefined,
        }),
      });
      if (res.ok) {
        await loadGitHubConfig();
        setGithubToken("");
        setShowSettings(false);
      }
    } catch { /* ignore */ }
    setSavingConfig(false);
  };

  const pushToGitHub = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch(`${API_BASE}/github/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: commitMessage || undefined }),
      });
      const data = await res.json();
      setPushResult({
        success: res.ok,
        message: data.message || data.error || "Error desconocido",
      });
      if (res.ok) {
        setCommitMessage("");
        await loadGitStatus();
        await loadGitHubConfig();
      }
    } catch (err) {
      setPushResult({ success: false, message: String(err) });
    }
    setPushing(false);
    setTimeout(() => setPushResult(null), 5000);
  };

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
            if (data.done) {
              // Refresh preview and git status after AI makes changes
              setPreviewKey(k => k + 1);
              loadGitStatus();
              break;
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
            if (data.error) throw new Error(data.error);
          } catch { /* skip malformed */ }
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

  const refreshPreview = () => {
    setPreviewKey(k => k + 1);
    loadGitStatus();
  };

  // Access denied
  if (hasAccess === false) {
    return (
      <div className="yuki-ide-denied">
        <div className="yuki-ide-denied-card">
          <div className="yuki-ide-denied-icon">🔒</div>
          <h2>Acceso Exclusivo</h2>
          <p>Esta herramienta es exclusiva para el creador de ERROR707 Studio.</p>
          <button onClick={() => setLocation("/")} className="yuki-ide-btn">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (hasAccess === null) {
    return (
      <div className="yuki-ide-loading">
        <Loader2 size={32} className="yuki-spinner" />
        <p>Verificando acceso...</p>
      </div>
    );
  }

  return (
    <div className="yuki-ide">
      {/* Header */}
      <header className="yuki-ide-header">
        <div className="yuki-ide-logo" onClick={() => setLocation("/")}>
          <span className="yuki-ide-logo-icon">雪</span>
          <span className="yuki-ide-logo-text">Yuki IDE</span>
        </div>

        <div className="yuki-ide-header-center">
          {gitStatus && (
            <div className="yuki-ide-git-info">
              <span className="yuki-ide-branch">{gitStatus.branch}</span>
              {gitStatus.hasChanges && (
                <span className="yuki-ide-changes">{gitStatus.changesCount} cambios</span>
              )}
            </div>
          )}
        </div>

        <div className="yuki-ide-header-actions">
          <button 
            className="yuki-ide-header-btn"
            onClick={refreshPreview}
            title="Refrescar preview"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            className="yuki-ide-header-btn"
            onClick={() => setShowSettings(true)}
            title="Configuración GitHub"
          >
            <Settings size={16} />
          </button>
          <button 
            className={`yuki-ide-push-btn ${pushing ? 'pushing' : ''}`}
            onClick={pushToGitHub}
            disabled={pushing || !githubConfig?.configured}
            title={githubConfig?.configured ? "Subir a GitHub" : "Configura GitHub primero"}
          >
            {pushing ? (
              <Loader2 size={16} className="yuki-spinner" />
            ) : (
              <Upload size={16} />
            )}
            <span>Push</span>
          </button>
        </div>
      </header>

      {/* Push result toast */}
      {pushResult && (
        <div className={`yuki-ide-toast ${pushResult.success ? 'success' : 'error'}`}>
          {pushResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{pushResult.message}</span>
        </div>
      )}

      {/* Main content */}
      <div className="yuki-ide-main">
        {/* Chat Panel */}
        <div className="yuki-ide-chat">
          <div className="yuki-ide-chat-header">
            <div className="yuki-ide-chat-title">
              <span className="yuki-ide-avatar">雪</span>
              <div>
                <div className="yuki-ide-chat-name">Yuki</div>
                <div className="yuki-ide-chat-status">Control total • DeepSeek Coder</div>
              </div>
            </div>
            {messages.length > 0 && (
              <button className="yuki-ide-clear-btn" onClick={clearChat} title="Limpiar chat">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="yuki-ide-messages">
            {messages.length === 0 && (
              <div className="yuki-ide-empty">
                <div className="yuki-ide-empty-icon">雪</div>
                <h3>Hola, soy Yuki 🌸</h3>
                <p>Puedo modificar cualquier parte de tu app en tiempo real. Los cambios se reflejan instantáneamente en el preview.</p>
                <div className="yuki-ide-suggestions">
                  <button onClick={() => setInput("Cambia el color principal de la app a azul")}>
                    Cambiar colores
                  </button>
                  <button onClick={() => setInput("Muéstrame la estructura del proyecto")}>
                    Ver estructura
                  </button>
                  <button onClick={() => setInput("Agrega un nuevo botón en el header")}>
                    Agregar elemento
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`yuki-ide-message yuki-ide-message--${msg.role}`}>
                {msg.isThinking ? (
                  <div className="yuki-ide-thinking">
                    <Loader2 size={14} className="yuki-spinner" />
                    <span>Procesando...</span>
                  </div>
                ) : (
                  <>
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="yuki-ide-tools">
                        {msg.toolCalls.map((tc, j) => (
                          <span key={j} className="yuki-ide-tool">{tc.name}</span>
                        ))}
                      </div>
                    )}
                    <div
                      className="yuki-ide-message-content"
                      dangerouslySetInnerHTML={{
                        __html: msg.role === "assistant"
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

          <div className="yuki-ide-input-area">
            <textarea
              ref={inputRef}
              className="yuki-ide-input"
              placeholder="Describe qué quieres modificar..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className="yuki-ide-send-btn"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
            >
              {loading ? <Loader2 size={18} className="yuki-spinner" /> : <Send size={18} />}
            </button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="yuki-ide-preview">
          <div className="yuki-ide-preview-header">
            <div className="yuki-ide-preview-tabs">
              <button className="yuki-ide-preview-tab active">
                <Eye size={14} />
                <span>Preview</span>
              </button>
            </div>
            <div className="yuki-ide-preview-actions">
              <button onClick={refreshPreview} title="Refrescar">
                <RefreshCw size={14} />
              </button>
              <a 
                href={previewUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                title="Abrir en nueva pestaña"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
          <div className="yuki-ide-preview-content">
            <iframe
              key={previewKey}
              src={previewUrl}
              className="yuki-ide-iframe"
              title="App Preview"
            />
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="yuki-ide-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="yuki-ide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="yuki-ide-modal-header">
              <h3><Github size={18} /> Configuración GitHub</h3>
              <button onClick={() => setShowSettings(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="yuki-ide-modal-body">
              <div className="yuki-ide-form-group">
                <label>URL del Repositorio</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/usuario/repo"
                />
                {githubConfig?.repoUrl && (
                  <span className="yuki-ide-form-hint">Actual: {githubConfig.repoUrl}</span>
                )}
              </div>
              <div className="yuki-ide-form-group">
                <label>Personal Access Token</label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                />
                {githubConfig?.tokenSet && (
                  <span className="yuki-ide-form-hint">
                    Token configurado: {githubConfig.tokenPreview}
                  </span>
                )}
              </div>
              {githubConfig?.lastPush && (
                <div className="yuki-ide-form-group">
                  <label>Último push</label>
                  <span className="yuki-ide-form-value">
                    {new Date(githubConfig.lastPush).toLocaleString("es-MX")}
                  </span>
                </div>
              )}
            </div>
            <div className="yuki-ide-modal-footer">
              <button className="yuki-ide-btn-secondary" onClick={() => setShowSettings(false)}>
                Cancelar
              </button>
              <button 
                className="yuki-ide-btn-primary" 
                onClick={saveGitHubConfig}
                disabled={savingConfig}
              >
                {savingConfig ? <Loader2 size={14} className="yuki-spinner" /> : <Check size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .yuki-spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
