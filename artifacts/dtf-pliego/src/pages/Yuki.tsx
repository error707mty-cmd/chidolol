import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { 
  Send, Loader2, Settings, Github, RefreshCw, 
  ExternalLink, X, Check, AlertCircle, 
  Eye, Trash2, Upload, FolderTree, Terminal,
  FileCode, Database, Search, ChevronRight,
  Minus, Square, Maximize2, Copy, Play
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_BASE = "/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: unknown }[];
  isThinking?: boolean;
  timestamp?: Date;
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

interface FileItem {
  name: string;
  type: "file" | "directory";
  path: string;
}

// Markdown renderer
function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre class="yk-code"><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`);
    return `%%CB${idx}%%`;
  });

  const inlines: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlines.length;
    inlines.push(`<code class="yk-inline">${code.replace(/</g, "&lt;")}</code>`);
    return `%%IL${idx}%%`;
  });

  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  result = result.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  result = result.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  result = result.replace(/(^- .+\n?)+/gm, (block) => {
    const items = block.trim().split("\n").map((l) => `<li>${l.replace(/^- /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });

  result = result.split(/\n\n+/).map((p) => {
    p = p.trim();
    if (!p || /^<[huo]/.test(p) || p.startsWith("%%")) return p;
    return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
  }).join("");

  codeBlocks.forEach((b, i) => { result = result.replace(`%%CB${i}%%`, b); });
  inlines.forEach((c, i) => { result = result.replace(`%%IL${i}%%`, c); });

  return result;
}

export default function Yuki() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  
  // Core state
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // UI state
  const [activePanel, setActivePanel] = useState<"preview" | "files" | "terminal" | "db">("preview");
  const [showSettings, setShowSettings] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  
  // GitHub state
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [pushing, setPushing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  
  // Files state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState("artifacts/dtf-pliego/src");
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Terminal state
  const [terminalOutput, setTerminalOutput] = useState<string[]>(["$ Yuki Terminal Ready"]);
  const [terminalInput, setTerminalInput] = useState("");
  const [runningCmd, setRunningCmd] = useState(false);

  const previewUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check access
  useEffect(() => {
    if (!token) { setHasAccess(false); return; }
    fetch(`${API_BASE}/yuki/access`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setHasAccess(r.ok))
      .catch(() => setHasAccess(false));
  }, [token]);

  // Load initial data
  useEffect(() => {
    if (!token || !hasAccess) return;
    loadGitHubConfig();
    loadGitStatus();
    loadFiles(currentPath);
  }, [token, hasAccess]);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (type: "success" | "error", message: string) => setToast({ type, message });

  // API calls
  const loadGitHubConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/config`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const cfg = await res.json();
        setGithubConfig(cfg);
        if (cfg.repoUrl) setRepoUrl(cfg.repoUrl);
      }
    } catch {}
  };

  const loadGitStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setGitStatus(await res.json());
    } catch {}
  };

  const loadFiles = async (path: string) => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`${API_BASE}/yuki/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: [{ role: "user", content: `[TOOL_ONLY] list_files {"directory": "${path}"}` }] }),
      });
      // Parse SSE response for files
      const text = await res.text();
      const lines = text.split("\n").filter(l => l.startsWith("data: "));
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content && data.content.includes('"type"')) {
            // Try to extract file list from content
            const match = data.content.match(/\[[\s\S]*?\]/);
            if (match) {
              setFiles(JSON.parse(match[0]));
            }
          }
        } catch {}
      }
    } catch {}
    setLoadingFiles(false);
  };

  const saveGitHubConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repoUrl: repoUrl || undefined, token: githubToken || undefined }),
      });
      if (res.ok) {
        await loadGitHubConfig();
        setGithubToken("");
        setShowSettings(false);
        showToast("success", "Configuración guardada");
      }
    } catch {}
  };

  const pushToGitHub = async () => {
    setPushing(true);
    try {
      const res = await fetch(`${API_BASE}/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("success", "Push exitoso 🎉");
        await loadGitStatus();
      } else {
        showToast("error", data.error || "Error en push");
      }
    } catch (e) {
      showToast("error", String(e));
    }
    setPushing(false);
  };

  const runTerminalCommand = async () => {
    if (!terminalInput.trim() || runningCmd) return;
    const cmd = terminalInput.trim();
    setTerminalOutput(prev => [...prev, `$ ${cmd}`]);
    setTerminalInput("");
    setRunningCmd(true);
    
    try {
      // Use Yuki to execute shell command
      const res = await fetch(`${API_BASE}/yuki/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          messages: [{ role: "user", content: `Ejecuta este comando y dame solo el output: ${cmd}` }] 
        }),
      });
      const text = await res.text();
      const lines = text.split("\n").filter(l => l.startsWith("data: "));
      let output = "";
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) output += data.content;
        } catch {}
      }
      setTerminalOutput(prev => [...prev, output || "(sin output)"]);
    } catch (e) {
      setTerminalOutput(prev => [...prev, `Error: ${e}`]);
    }
    setRunningCmd(false);
  };

  // Chat
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", isThinking: true }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/yuki/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let tools: { name: string; input: unknown }[] = [];

      setMessages(prev => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.isThinking) {
          updated[updated.length - 1] = { role: "assistant", content: "", timestamp: new Date() };
        }
        return updated;
      });

      while (true) {
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
              setPreviewKey(k => k + 1);
              loadGitStatus();
              break;
            }
            if (data.tool_calls) tools = [...tools, ...data.tool_calls];
            if (data.content) {
              accumulated += data.content;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: accumulated, toolCalls: tools.length ? tools : undefined };
                }
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: `⚠️ Error: ${err}`, isThinking: false };
          }
          return updated;
        });
      }
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Access check
  if (hasAccess === false) {
    return (
      <div className="yk-denied">
        <div className="yk-denied-card">
          <div className="yk-denied-icon">🔒</div>
          <h2>Acceso Exclusivo</h2>
          <p>Solo el creador puede acceder a Yuki IDE</p>
          <button onClick={() => setLocation("/")} className="yk-btn-primary">Volver</button>
        </div>
      </div>
    );
  }

  if (hasAccess === null) {
    return (
      <div className="yk-loading">
        <div className="yk-loader" />
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="yk-root">
      {/* Toast */}
      {toast && (
        <div className={`yk-toast yk-toast-${toast.type}`}>
          {toast.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="yk-header">
        <div className="yk-header-left">
          <div className="yk-logo" onClick={() => setLocation("/")}>
            <span className="yk-logo-icon">雪</span>
            <span className="yk-logo-text">Yuki</span>
          </div>
          {gitStatus && (
            <div className="yk-git-badge">
              <span className="yk-git-dot" />
              <span>{gitStatus.branch}</span>
              {gitStatus.hasChanges && <span className="yk-git-changes">+{gitStatus.changesCount}</span>}
            </div>
          )}
        </div>
        <div className="yk-header-right">
          <button className="yk-header-btn" onClick={() => { setPreviewKey(k => k + 1); loadGitStatus(); }} title="Refrescar">
            <RefreshCw size={16} />
          </button>
          <button className="yk-header-btn" onClick={() => setShowSettings(true)} title="Configuración">
            <Settings size={16} />
          </button>
          <button 
            className={`yk-push-btn ${pushing ? "yk-pushing" : ""}`} 
            onClick={pushToGitHub}
            disabled={pushing || !githubConfig?.configured}
          >
            {pushing ? <Loader2 size={16} className="yk-spin" /> : <Upload size={16} />}
            <span>Push</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="yk-main">
        {/* Chat Panel */}
        <div className="yk-chat">
          <div className="yk-chat-messages">
            {messages.length === 0 ? (
              <div className="yk-empty">
                <div className="yk-empty-icon">雪</div>
                <h3>Hola, soy Yuki</h3>
                <p>Tu asistente de desarrollo con control total</p>
                <div className="yk-quick-actions">
                  {["Cambia el color a azul", "Muestra la estructura", "Optimiza el código"].map(q => (
                    <button key={q} onClick={() => setInput(q)}>{q}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`yk-msg yk-msg-${msg.role} ${msg.isThinking ? "yk-thinking" : ""}`}>
                  {msg.isThinking ? (
                    <div className="yk-thinking-dots"><span/><span/><span/></div>
                  ) : (
                    <>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="yk-tools">
                          {msg.toolCalls.slice(0, 3).map((t, j) => (
                            <span key={j} className="yk-tool">{t.name}</span>
                          ))}
                          {msg.toolCalls.length > 3 && <span className="yk-tool">+{msg.toolCalls.length - 3}</span>}
                        </div>
                      )}
                      <div className="yk-msg-content" dangerouslySetInnerHTML={{ __html: msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content.replace(/\n/g, "<br/>") }} />
                    </>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="yk-chat-input">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe lo que quieres hacer..."
              rows={1}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()} className="yk-send-btn">
              {loading ? <Loader2 size={18} className="yk-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>

        {/* Right Panel */}
        <div className="yk-panel">
          <div className="yk-panel-tabs">
            {[
              { id: "preview", icon: Eye, label: "Preview" },
              { id: "files", icon: FolderTree, label: "Archivos" },
              { id: "terminal", icon: Terminal, label: "Terminal" },
            ].map(tab => (
              <button
                key={tab.id}
                className={`yk-tab ${activePanel === tab.id ? "yk-tab-active" : ""}`}
                onClick={() => setActivePanel(tab.id as any)}
              >
                <tab.icon size={14} />
                <span>{tab.label}</span>
              </button>
            ))}
            <div className="yk-tab-spacer" />
            {activePanel === "preview" && (
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="yk-tab-action">
                <ExternalLink size={14} />
              </a>
            )}
          </div>

          <div className="yk-panel-content">
            {/* Preview */}
            {activePanel === "preview" && (
              <div className="yk-preview">
                <iframe key={previewKey} src={previewUrl} title="Preview" />
              </div>
            )}

            {/* Files */}
            {activePanel === "files" && (
              <div className="yk-files">
                <div className="yk-files-header">
                  <span className="yk-files-path">{currentPath}</span>
                </div>
                <div className="yk-files-list">
                  {loadingFiles ? (
                    <div className="yk-files-loading"><Loader2 size={20} className="yk-spin" /></div>
                  ) : files.length === 0 ? (
                    <div className="yk-files-empty">Sin archivos</div>
                  ) : (
                    files.map((f, i) => (
                      <div 
                        key={i} 
                        className="yk-file-item"
                        onClick={() => {
                          if (f.type === "directory") {
                            setCurrentPath(f.path);
                            loadFiles(f.path);
                          } else {
                            setInput(`Lee el archivo ${f.path} y muéstramelo`);
                          }
                        }}
                      >
                        {f.type === "directory" ? <FolderTree size={14} /> : <FileCode size={14} />}
                        <span>{f.name}</span>
                        {f.type === "directory" && <ChevronRight size={14} className="yk-file-arrow" />}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Terminal */}
            {activePanel === "terminal" && (
              <div className="yk-terminal">
                <div className="yk-terminal-output">
                  {terminalOutput.map((line, i) => (
                    <div key={i} className={`yk-terminal-line ${line.startsWith("$") ? "yk-terminal-cmd" : ""}`}>
                      {line}
                    </div>
                  ))}
                  {runningCmd && <div className="yk-terminal-line"><Loader2 size={12} className="yk-spin" /> Ejecutando...</div>}
                </div>
                <div className="yk-terminal-input">
                  <span className="yk-terminal-prompt">$</span>
                  <input
                    value={terminalInput}
                    onChange={e => setTerminalInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && runTerminalCommand()}
                    placeholder="Escribe un comando..."
                    disabled={runningCmd}
                  />
                  <button onClick={runTerminalCommand} disabled={runningCmd}>
                    <Play size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="yk-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="yk-modal" onClick={e => e.stopPropagation()}>
            <div className="yk-modal-header">
              <h3><Github size={18} /> GitHub</h3>
              <button onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div className="yk-modal-body">
              <label>Repositorio</label>
              <input
                type="text"
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
              />
              {githubConfig?.repoUrl && <span className="yk-hint">Actual: {githubConfig.repoUrl}</span>}
              
              <label>Token</label>
              <input
                type="password"
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
              />
              {githubConfig?.tokenSet && <span className="yk-hint">Configurado: {githubConfig.tokenPreview}</span>}
            </div>
            <div className="yk-modal-footer">
              <button className="yk-btn-secondary" onClick={() => setShowSettings(false)}>Cancelar</button>
              <button className="yk-btn-primary" onClick={saveGitHubConfig}>
                <Check size={14} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
