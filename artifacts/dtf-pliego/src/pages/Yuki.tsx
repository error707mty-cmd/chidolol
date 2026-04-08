import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  Send, Loader2, Settings, Github, RefreshCw, 
  ExternalLink, X, Check, AlertCircle, 
  Eye, Trash2, Upload, FolderTree, Terminal,
  FileCode, ChevronRight, Play, Maximize2, Minimize2,
  Menu, ChevronLeft, Plus, GitBranch,
  Code, FileText, Database, Cpu, Zap,
  Sparkles, Command, Terminal as TerminalIcon,
  Globe, Shield, Cpu as CpuIcon
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

interface SavedRepo {
  url: string;
  name: string;
}

// Markdown renderer minimalista
function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
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
  const [activePanel, setActivePanel] = useState<"preview" | "terminal">("preview");
  const [showSettings, setShowSettings] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"github" | "repos">("github");
  
  // GitHub state
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [pushing, setPushing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savedRepos, setSavedRepos] = useState<SavedRepo[]>([]);
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  
  // Terminal state
  const [terminalOutput, setTerminalOutput] = useState<string[]>(["$ Yuki Terminal Ready"]);
  const [terminalInput, setTerminalInput] = useState("");
  const [runningCmd, setRunningCmd] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const previewUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Scroll effects
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalOutput]);

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
    loadSavedRepos();
  }, [token, hasAccess]);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Close mobile menu on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const loadSavedRepos = () => {
    try {
      const saved = localStorage.getItem('yk-repos');
      if (saved) setSavedRepos(JSON.parse(saved));
    } catch {}
  };

  const saveRepoToList = (url: string) => {
    const name = url.split('/').slice(-2).join('/').replace('.git', '');
    const newRepos = [...savedRepos.filter(r => r.url !== url), { url, name }];
    setSavedRepos(newRepos);
    localStorage.setItem('yk-repos', JSON.stringify(newRepos));
  };

  const removeRepoFromList = (url: string) => {
    const newRepos = savedRepos.filter(r => r.url !== url);
    setSavedRepos(newRepos);
    localStorage.setItem('yk-repos', JSON.stringify(newRepos));
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
        if (repoUrl) saveRepoToList(repoUrl);
        showToast("success", "Configuración guardada");
      }
    } catch (e) {
      showToast("error", "Error al guardar");
    }
  };

  const selectRepo = async (url: string) => {
    setRepoUrl(url);
    try {
      const res = await fetch(`${API_BASE}/github/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repoUrl: url }),
      });
      if (res.ok) {
        await loadGitHubConfig();
        await loadGitStatus();
        showToast("success", `Repo cambiado a ${url.split('/').slice(-1)[0]}`);
      }
    } catch {}
  };

  const cloneRepo = async () => {
    if (!newRepoUrl.trim()) return;
    setCloning(true);
    try {
      // Use Yuki to clone
      const res = await fetch(`${API_BASE}/yuki/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          messages: [{ role: "user", content: `Clona el repositorio ${newRepoUrl} en /app/repos/ y configúralo` }] 
        }),
      });
      if (res.ok) {
        saveRepoToList(newRepoUrl);
        setNewRepoUrl("");
        showToast("success", "Repositorio clonado");
      }
    } catch (e) {
      showToast("error", "Error al clonar");
    }
    setCloning(false);
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
      const res = await fetch(`${API_BASE}/yuki/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          messages: [{ role: "user", content: `Ejecuta este comando y dame solo el output sin explicaciones: ${cmd}` }] 
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

    const userMsg: Message = { role: "user", content: text };
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
          updated[updated.length - 1] = { role: "assistant", content: "" };
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

  const clearChat = () => {
    setMessages([]);
    setInput("");
  };

  // Access check
  if (hasAccess === false) {
    return (
      <div className="yk-denied">
        <div className="yk-denied-card">
          <div className="yk-denied-icon">🔒</div>
          <h2>Acceso Exclusivo</h2>
          <p>Solo el creador puede acceder</p>
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
    <div className={`yk-root ${focusMode ? 'yk-focus' : ''}`}>
      {/* Toast */}
      {toast && (
        <div className={`yk-toast yk-toast-${toast.type}`}>
          {toast.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header minimalista */}
      <header className="yk-header">
        <div className="yk-header-left">
          {/* Mobile menu button */}
          <button className="yk-mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu size={20} />
          </button>
          
          <div className="yk-logo" onClick={() => setLocation("/")}>
            <span className="yk-logo-icon">雪</span>
            <span className="yk-logo-text">Yuki</span>
          </div>
          
          {gitStatus && (
            <div className="yk-git-badge">
              <GitBranch size={12} />
              <span>{gitStatus.branch}</span>
              {gitStatus.hasChanges && <span className="yk-git-changes">+{gitStatus.changesCount}</span>}
            </div>
          )}
        </div>
        
        <div className="yk-header-right">
          <button 
            className={`yk-header-btn yk-focus-btn ${focusMode ? 'active' : ''}`} 
            onClick={() => setFocusMode(!focusMode)} 
            title={focusMode ? "Salir de Focus" : "Modo Focus"}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
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
            <span className="yk-push-text">Push</span>
          </button>
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileMenuOpen && <div className="yk-mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}

      {/* Main */}
      <div className="yk-main">
        {/* Chat Panel */}
        <div className={`yk-chat ${mobileMenuOpen ? 'yk-chat-open' : ''}`}>
          {/* Mobile close button */}
          <button className="yk-mobile-close" onClick={() => setMobileMenuOpen(false)}>
            <ChevronLeft size={20} />
          </button>
          
          <div className="yk-chat-header">
            <div className="yk-chat-title">
              <span className="yk-avatar">雪</span>
              <span>Yuki</span>
            </div>
            {messages.length > 0 && (
              <button className="yk-clear-btn" onClick={clearChat} title="Limpiar">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="yk-chat-messages">
            {messages.length === 0 ? (
              <div className="yk-empty">
                <div className="yk-empty-icon">雪</div>
                <h3>Hola, soy Yuki</h3>
                <p>Tu asistente de código con control total</p>
                <div className="yk-quick-actions">
                  <div className="yk-quick-grid">
                    <button onClick={() => setInput("Cambia el color a azul")}>
                      <Sparkles size={14} />
                      <span>Cambia el color</span>
                    </button>
                    <button onClick={() => setInput("Muestra la estructura del proyecto")}>
                      <FolderTree size={14} />
                      <span>Estructura</span>
                    </button>
                    <button onClick={() => setInput("Optimiza el código CSS")}>
                      <Code size={14} />
                      <span>Optimizar CSS</span>
                    </button>
                    <button onClick={() => setInput("Ejecuta un comando en terminal")}>
                      <TerminalIcon size={14} />
                      <span>Terminal</span>
                    </button>
                  </div>
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
        {!focusMode && (
          <div className="yk-panel">
            <div className="yk-panel-tabs">
              {[
                { id: "preview", icon: Eye, label: "Preview" },
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

              {/* Terminal */}
              {activePanel === "terminal" && (
                <div className="yk-terminal">
                  <div className="yk-terminal-output">
                    {terminalOutput.map((line, i) => (
                      <div key={i} className={`yk-terminal-line ${line.startsWith("$") ? "yk-terminal-cmd" : ""}`}>
                        {line}
                      </div>
                    ))}
                    {runningCmd && <div className="yk-terminal-line yk-terminal-running"><Loader2 size={12} className="yk-spin" /> Ejecutando...</div>}
                    <div ref={terminalEndRef} />
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
                    <button onClick={runTerminalCommand} disabled={runningCmd || !terminalInput.trim()}>
                      <Play size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="yk-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="yk-modal yk-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="yk-modal-header">
              <div className="yk-modal-tabs">
                <button 
                  className={settingsTab === "github" ? "active" : ""} 
                  onClick={() => setSettingsTab("github")}
                >
                  <Github size={14} /> Configuración
                </button>
                <button 
                  className={settingsTab === "repos" ? "active" : ""} 
                  onClick={() => setSettingsTab("repos")}
                >
                  <FolderTree size={14} /> Repositorios
                </button>
              </div>
              <button onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            
            {settingsTab === "github" && (
              <>
                <div className="yk-modal-body">
                  <label>URL del Repositorio</label>
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/user/repo"
                  />
                  {githubConfig?.repoUrl && <span className="yk-hint">Actual: {githubConfig.repoUrl}</span>}
                  
                  <label>Personal Access Token</label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={e => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                  />
                  {githubConfig?.tokenSet && <span className="yk-hint">Configurado: {githubConfig.tokenPreview}</span>}
                  
                  {githubConfig?.lastPush && (
                    <>
                      <label>Último push</label>
                      <span className="yk-hint">{new Date(githubConfig.lastPush).toLocaleString("es-MX")}</span>
                    </>
                  )}
                </div>
                <div className="yk-modal-footer">
                  <button className="yk-btn-secondary" onClick={() => setShowSettings(false)}>Cancelar</button>
                  <button className="yk-btn-primary" onClick={saveGitHubConfig}>
                    <Check size={14} /> Guardar
                  </button>
                </div>
              </>
            )}
            
            {settingsTab === "repos" && (
              <>
                <div className="yk-modal-body">
                  <label>Agregar nuevo repositorio</label>
                  <div className="yk-repo-add">
                    <input
                      type="text"
                      value={newRepoUrl}
                      onChange={e => setNewRepoUrl(e.target.value)}
                      placeholder="https://github.com/user/repo"
                    />
                    <button onClick={cloneRepo} disabled={cloning || !newRepoUrl.trim()}>
                      {cloning ? <Loader2 size={14} className="yk-spin" /> : <Plus size={14} />}
                    </button>
                  </div>
                  
                  <label>Repositorios guardados</label>
                  <div className="yk-repo-list">
                    {savedRepos.length === 0 ? (
                      <div className="yk-repo-empty">Sin repositorios guardados</div>
                    ) : (
                      savedRepos.map((repo, i) => (
                        <div 
                          key={i} 
                          className={`yk-repo-item ${githubConfig?.repoUrl === repo.url ? 'active' : ''}`}
                        >
                          <button className="yk-repo-select" onClick={() => selectRepo(repo.url)}>
                            <Github size={14} />
                            <span>{repo.name}</span>
                            {githubConfig?.repoUrl === repo.url && <Check size={14} className="yk-repo-check" />}
                          </button>
                          <button className="yk-repo-remove" onClick={() => removeRepoFromList(repo.url)}>
                            <X size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="yk-modal-footer">
                  <button className="yk-btn-secondary" onClick={() => setShowSettings(false)}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}