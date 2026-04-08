import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { 
  Send, Loader2, Settings, Github, RefreshCw, 
  ExternalLink, X, Check, AlertCircle, 
  Eye, Trash2, Upload, Terminal, Play,
  Maximize2, Minimize2, Menu, ChevronLeft,
  Plus, Image, Paperclip, Bot, Sparkles,
  FileCode, Cpu, Key, Zap, GitBranch, Save
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_BASE = "/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: unknown }[];
  toolResults?: { name: string; result: unknown }[];
  isThinking?: boolean;
  attachments?: { name: string; type: string; path: string }[];
}

interface AIProvider {
  id: string;
  name: string;
  model: string;
  apiKey?: string;
  hasKey?: boolean;
  baseUrl?: string;
}

interface YukiConfig {
  providers: AIProvider[];
  activeProviderId: string;
}

// Markdown renderer
function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];

  // Mapeo de tools a labels amigables
  const getToolLabel = (toolName: string): string => {
    const labels: Record<string, string> = {
      read_file: "Leyendo archivo",
      write_file: "Escribiendo archivo",
      list_files: "Listando archivos",
      search_replace: "Modificando código",
      exec_shell: "Ejecutando comando",
      screenshot: "Tomando captura",
      search_in_files: "Buscando en archivos",
      get_app_stats: "Obteniendo estadísticas",
      execute_sql: "Consultando base de datos",
      read_knowledge: "Leyendo memoria",
      update_knowledge: "Guardando en memoria",
      install_package: "Instalando paquete",
      restart_backend: "Reiniciando backend",
    };
    return labels[toolName] || toolName;
  };

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
  
  // Access
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  
  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  
  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; type: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  
  // UI
  const [activePanel, setActivePanel] = useState<"preview" | "terminal">("preview");
  const [showSettings, setShowSettings] = useState(false);
  // Preview - usar ruta absoluta para evitar recursión en Railway
  const [previewUrl, setPreviewUrl] = useState("/");
  const [previewKey, setPreviewKey] = useState(0);
  const [previewScrollPos, setPreviewScrollPos] = useState({ x: 0, y: 0 });
  
  // Auto-refresh preview manteniendo scroll
  const refreshPreview = () => {
    // Guardar posición de scroll antes de refrescar
    if (previewIframeRef.current?.contentWindow) {
      try {
        const iframe = previewIframeRef.current.contentWindow;
        setPreviewScrollPos({ x: iframe.scrollX, y: iframe.scrollY });
      } catch {}
    }
    setPreviewKey(prev => prev + 1);
  };
  
  // Restaurar scroll después de cargar
  const handlePreviewLoad = () => {
    if (previewIframeRef.current?.contentWindow && (previewScrollPos.x !== 0 || previewScrollPos.y !== 0)) {
      try {
        previewIframeRef.current.contentWindow.scrollTo(previewScrollPos.x, previewScrollPos.y);
      } catch {}
    }
  };
  const [focusMode, setFocusMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  
  // AI Config
  const [config, setConfig] = useState<YukiConfig | null>(null);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [newProviderForm, setNewProviderForm] = useState({ name: "", model: "", apiKey: "", baseUrl: "" });
  
  // Terminal
  const [terminalOutput, setTerminalOutput] = useState<string[]>(["$ Yuki Terminal"]);
  const [terminalInput, setTerminalInput] = useState("");
  const [runningCmd, setRunningCmd] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  
  // GitHub
  const [githubConfig, setGithubConfig] = useState<{ repoUrl?: string; tokenSet?: boolean } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubForm, setGithubForm] = useState({ repoUrl: "", token: "" });

  // Effects
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalOutput]);

  useEffect(() => {
    if (!token) { setHasAccess(false); return; }
    fetch(`${API_BASE}/yuki/access`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setHasAccess(r.ok))
      .catch(() => setHasAccess(false));
  }, [token]);

  useEffect(() => {
    if (!token || !hasAccess) return;
    loadConfig();
    loadGitHubConfig();
  }, [token, hasAccess]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (type: "success" | "error", msg: string) => setToast({ type, msg });

  // API
  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/yuki/config`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setConfig(await res.json());
    } catch {}
  };

  const loadGitHubConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/config`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setGithubConfig(data);
        setGithubForm({ repoUrl: data.repoUrl || "", token: "" });
      }
    } catch {}
  };

  const saveGitHubConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(githubForm),
      });
      if (res.ok) {
        showToast("success", "Configuración de GitHub guardada ✅");
        await loadGitHubConfig();
        setShowGithubModal(false);
      } else {
        showToast("error", "Error al guardar configuración");
      }
    } catch {
      showToast("error", "Error de conexión");
    }
  };

  const saveProvider = async () => {
    if (!newProviderForm.name || !newProviderForm.model) return;
    try {
      const res = await fetch(`${API_BASE}/yuki/config/provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editingProvider?.id,
          ...newProviderForm,
        }),
      });
      if (res.ok) {
        await loadConfig();
        setNewProviderForm({ name: "", model: "", apiKey: "", baseUrl: "" });
        setEditingProvider(null);
        showToast("success", "Proveedor guardado");
      }
    } catch {}
  };

  const deleteProvider = async (id: string) => {
    try {
      await fetch(`${API_BASE}/yuki/config/provider/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadConfig();
    } catch {}
  };

  const setActiveProvider = async (id: string) => {
    try {
      await fetch(`${API_BASE}/yuki/config/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ providerId: id }),
      });
      await loadConfig();
      showToast("success", "Proveedor activado");
    } catch {}
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/yuki/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setAttachments(prev => [...prev, { name: data.originalName, type: data.mimetype, path: data.path }]);
        showToast("success", `${data.originalName} subido`);
      }
    } catch {}
    setUploading(false);
  };

  const pushToGitHub = async () => {
    setPushing(true);
    try {
      const res = await fetch(`${API_BASE}/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (res.ok) showToast("success", "Push exitoso 🎉");
      else showToast("error", "Error en push");
    } catch {}
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
        body: JSON.stringify({ messages: [{ role: "user", content: `Ejecuta: ${cmd}` }] }),
      });
      const text = await res.text();
      const lines = text.split("\n").filter(l => l.startsWith("data: "));
      let output = "";
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.tool_result?.result?.stdout) output += data.tool_result.result.stdout;
          if (data.content) output += data.content;
        } catch {}
      }
      setTerminalOutput(prev => [...prev, output || "(sin output)"]);
    } catch {}
    setRunningCmd(false);
  };

  // Chat
  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: Message = { role: "user", content: text, attachments: attachments.length ? [...attachments] : undefined };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", isThinking: true }]);
    setInput("");
    setAttachments([]);
    setLoading(true);
    setCurrentTool(null);

    try {
      const res = await fetch(`${API_BASE}/yuki/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          messages: history.map(m => ({ role: m.role, content: m.content })),
          attachments: userMsg.attachments,
        }),
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let tools: { name: string; input: unknown }[] = [];
      let toolResults: { name: string; result: unknown }[] = [];

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
              setCurrentTool(null);
              break;
            }
            
            if (data.tool_executing) {
              setCurrentTool(data.tool_executing);
            }
            
            if (data.tool_calls) {
              tools = [...tools, ...data.tool_calls];
            }
            
            if (data.tool_result) {
              toolResults = [...toolResults, data.tool_result];
              // Auto-refresh preview on file changes
              if (data.tool_result.name === "write_file" || data.tool_result.name === "search_replace") {
                setPreviewKey(k => k + 1);
              }
            }
            
            if (data.content) {
              accumulated += data.content;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { 
                    ...last, 
                    content: accumulated, 
                    toolCalls: tools.length ? tools : undefined,
                    toolResults: toolResults.length ? toolResults : undefined,
                  };
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
    setCurrentTool(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(uploadFile);
    }
    e.target.value = "";
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

  const activeProvider = config?.providers.find(p => p.id === config.activeProviderId);

  return (
    <div className={`yk-root ${focusMode ? 'yk-focus' : ''}`}>
      {/* Toast */}
      {toast && (
        <div className={`yk-toast yk-toast-${toast.type}`}>
          {toast.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="yk-header">
        <div className="yk-header-left">
          <button className="yk-mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu size={18} />
          </button>
          <div className="yk-logo" onClick={() => setLocation("/")}>
            <span className="yk-logo-icon">雪</span>
            <span className="yk-logo-text">Yuki</span>
          </div>
          {activeProvider && (
            <div className="yk-provider-badge" onClick={() => setShowSettings(true)}>
              <Cpu size={12} />
              <span>{activeProvider.name}</span>
            </div>
          )}
        </div>
        
        <div className="yk-header-right">
          {currentTool && (
            <div className="yk-current-tool">
              <Zap size={12} />
              <span>{currentTool}</span>
            </div>
          )}
          <button className={`yk-header-btn ${focusMode ? 'active' : ''}`} onClick={() => setFocusMode(!focusMode)} title="Focus">
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="yk-header-btn" onClick={() => setPreviewKey(k => k + 1)} title="Refrescar">
            <RefreshCw size={16} />
          </button>
          <button className="yk-header-btn" onClick={() => setShowSettings(true)} title="Config IA">
            <Settings size={16} />
          </button>
          <button className="yk-header-btn" onClick={() => setShowGithubModal(true)} title="Config GitHub">
            <GitBranch size={16} />
          </button>
          <button 
            className={`yk-push-btn ${pushing ? "yk-pushing" : ""}`} 
            onClick={pushToGitHub}
            disabled={pushing || !githubConfig?.tokenSet}
          >
            {pushing ? <Loader2 size={14} className="yk-spin" /> : <Upload size={14} />}
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
          <button className="yk-mobile-close" onClick={() => setMobileMenuOpen(false)}>
            <ChevronLeft size={18} />
          </button>
          
          <div className="yk-chat-header">
            <div className="yk-chat-title">
              <div className="yk-avatar">雪</div>
              <div>
                <span className="yk-chat-name">Yuki</span>
                <span className="yk-chat-status">Autónomo • {activeProvider?.model || "Sin IA"}</span>
              </div>
            </div>
            {messages.length > 0 && (
              <button className="yk-clear-btn" onClick={() => setMessages([])} title="Limpiar">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="yk-chat-messages">
            {messages.length === 0 ? (
              <div className="yk-empty">
                <div className="yk-empty-icon">雪</div>
                <h3>Yuki IDE - Autónomo</h3>
                <p>Hola error707mty, soy Yuki. Dime qué quieres y lo haré automáticamente.</p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                  Control total sobre ERROR707 Studio • Railway Deployment • PostgreSQL
                </p>
                <div className="yk-quick-actions">
                  {[
                    { icon: Sparkles, text: "Cambia el color principal a azul" },
                    { icon: FileCode, text: "Muestra la estructura del proyecto" },
                    { icon: Zap, text: "Optimiza el rendimiento" },
                  ].map((q, i) => (
                    <button key={i} onClick={() => setInput(q.text)}>
                      <q.icon size={14} />
                      <span>{q.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`yk-msg yk-msg-${msg.role} ${msg.isThinking ? "yk-thinking" : ""}`}>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="yk-msg-attachments">
                      {msg.attachments.map((a, j) => (
                        <div key={j} className="yk-attachment-chip">
                          <Paperclip size={12} />
                          <span>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.isThinking ? (
                    <div className="yk-thinking-indicator">
                      <div className="yk-thinking-dots"><span/><span/><span/></div>
                      {currentTool && <span className="yk-thinking-tool">{currentTool}</span>}
                    </div>
                  ) : (
                    <>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="yk-tools">
                          {msg.toolCalls.map((t, j) => (
                            <span key={j} className="yk-tool">
                              <Zap size={10} />
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div 
                        className="yk-msg-content" 
                        dangerouslySetInnerHTML={{ 
                          __html: msg.role === "assistant" 
                            ? renderMarkdown(msg.content) 
                            : msg.content.replace(/\n/g, "<br/>") 
                        }} 
                      />
                    </>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="yk-attachments-bar">
              {attachments.map((a, i) => (
                <div key={i} className="yk-attachment-preview">
                  <span>{a.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <form className="yk-chat-input" onSubmit={sendMessage}>
            {loading && (
              <div className="yk-loading-bar">
                <div className="yk-loading-progress"></div>
                <div className="yk-loading-text">
                  <span className="yk-loading-icon">⚡</span>
                  <span>{currentTool || "Procesando..."}</span>
                </div>
              </div>
            )}
            <div className="yk-input-actions">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                accept="image/*,.pdf,.txt,.json,.csv"
                style={{ display: "none" }}
              />
              <button 
                className="yk-input-action" 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Adjuntar archivo"
              >
                {uploading ? <Loader2 size={16} className="yk-spin" /> : <Paperclip size={16} />}
              </button>
              <button 
                className="yk-input-action" 
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) uploadFile(file);
                  };
                  input.click();
                }}
                title="Adjuntar imagen"
              >
                <Image size={16} />
              </button>
            </div>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Dime qué hacer..."
              rows={1}
            />
            <button type="submit" disabled={loading || !input.trim()} className="yk-send-btn">
              {loading ? <Loader2 size={18} className="yk-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>

        {/* Right Panel */}
        {!focusMode && (
          <div className="yk-panel">
            <div className="yk-panel-tabs">
              <button className={`yk-tab ${activePanel === "preview" ? "yk-tab-active" : ""}`} onClick={() => setActivePanel("preview")}>
                <Eye size={14} /><span>Preview</span>
              </button>
              <button className={`yk-tab ${activePanel === "terminal" ? "yk-tab-active" : ""}`} onClick={() => setActivePanel("terminal")}>
                <Terminal size={14} /><span>Terminal</span>
              </button>
              <div className="yk-tab-spacer" />
              {activePanel === "preview" && (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="yk-tab-action">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>

            <div className="yk-panel-content">
              {activePanel === "preview" && (
                <div className="yk-preview">
                  <iframe 
                    ref={previewIframeRef}
                    key={previewKey} 
                    src={previewUrl} 
                    title="Preview"
                    onLoad={handlePreviewLoad}
                  />
                </div>
              )}

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
                      placeholder="Comando..."
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
              <h3><Bot size={18} /> Configuración de IA</h3>
              <button onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            
            <div className="yk-modal-body">
              {/* Provider list */}
              <div className="yk-providers-list">
                <label>Proveedores de IA</label>
                {config?.providers.map(p => (
                  <div key={p.id} className={`yk-provider-item ${p.id === config.activeProviderId ? 'active' : ''}`}>
                    <button className="yk-provider-select" onClick={() => setActiveProvider(p.id)}>
                      <div className="yk-provider-icon">
                        <Cpu size={16} />
                      </div>
                      <div className="yk-provider-info">
                        <span className="yk-provider-name">{p.name}</span>
                        <span className="yk-provider-model">{p.model}</span>
                      </div>
                      {p.id === config.activeProviderId && (
                        <div className="yk-provider-check">
                          <Check size={16} />
                        </div>
                      )}
                    </button>
                    <div className="yk-provider-actions">
                      <button onClick={() => {
                        setEditingProvider(p);
                        setNewProviderForm({ name: p.name, model: p.model, apiKey: "", baseUrl: p.baseUrl || "" });
                      }} title="Editar">
                        <Key size={14} />
                      </button>
                      {config.providers.length > 1 && (
                        <button onClick={() => deleteProvider(p.id)} title="Eliminar">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add/Edit provider form */}
              <div className="yk-provider-form">
                <label>{editingProvider ? "Editar proveedor" : "Agregar nuevo proveedor"}</label>
                <input
                  type="text"
                  placeholder="Nombre (ej: GPT-4, Claude)"
                  value={newProviderForm.name}
                  onChange={e => setNewProviderForm(prev => ({ ...prev, name: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Modelo (ej: gpt-4-turbo, claude-3-opus)"
                  value={newProviderForm.model}
                  onChange={e => setNewProviderForm(prev => ({ ...prev, model: e.target.value }))}
                />
                <input
                  type="password"
                  placeholder="API Key"
                  value={newProviderForm.apiKey}
                  onChange={e => setNewProviderForm(prev => ({ ...prev, apiKey: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Base URL (opcional, ej: https://api.openai.com/v1)"
                  value={newProviderForm.baseUrl}
                  onChange={e => setNewProviderForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                />
                <div className="yk-form-actions">
                  {editingProvider && (
                    <button className="yk-btn-secondary" onClick={() => {
                      setEditingProvider(null);
                      setNewProviderForm({ name: "", model: "", apiKey: "", baseUrl: "" });
                    }}>
                      Cancelar
                    </button>
                  )}
                  <button className="yk-btn-primary" onClick={saveProvider} disabled={!newProviderForm.name || !newProviderForm.model}>
                    <Plus size={14} />
                    {editingProvider ? "Actualizar" : "Agregar"}
                  </button>
                </div>
              </div>

              {/* Presets */}
              <div className="yk-presets">
                <label>Presets populares</label>
                <div className="yk-preset-buttons">
                  {[
                    { name: "OpenAI GPT-4", model: "gpt-4-turbo", baseUrl: "https://api.openai.com/v1" },
                    { name: "Claude 3", model: "claude-3-opus-20240229", baseUrl: "https://api.anthropic.com/v1" },
                    { name: "DeepSeek", model: "deepseek-coder", baseUrl: "https://api.deepseek.com" },
                    { name: "Groq", model: "llama-3.1-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
                  ].map(preset => (
                    <button key={preset.name} onClick={() => setNewProviderForm({ ...preset, apiKey: "" })}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="yk-modal-footer">
              <button className="yk-btn-secondary" onClick={() => setShowSettings(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Config Modal */}
      {showGithubModal && (
        <div className="yk-modal-overlay" onClick={() => setShowGithubModal(false)}>
          <div className="yk-modal" onClick={e => e.stopPropagation()}>
            <div className="yk-modal-header">
              <h3><GitBranch size={18} /> Configuración de GitHub</h3>
              <button onClick={() => setShowGithubModal(false)}><X size={18} /></button>
            </div>
            
            <div className="yk-modal-body">
              <div className="yk-github-info">
                <p>Configura tu repositorio de GitHub y token de acceso personal (PAT) para habilitar el push automático.</p>
                {githubConfig?.tokenSet && (
                  <div className="yk-github-status">
                    <Check size={14} />
                    <span>Token configurado ✓</span>
                  </div>
                )}
              </div>

              <div className="yk-github-form">
                <label>Repositorio URL</label>
                <input
                  type="text"
                  placeholder="https://github.com/usuario/repo.git"
                  value={githubForm.repoUrl}
                  onChange={e => setGithubForm(prev => ({ ...prev, repoUrl: e.target.value }))}
                />
                <span className="yk-hint">Ejemplo: https://github.com/tu-usuario/tu-repo.git</span>

                <label>Personal Access Token (PAT)</label>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={githubForm.token}
                  onChange={e => setGithubForm(prev => ({ ...prev, token: e.target.value }))}
                />
                <span className="yk-hint">
                  Genera un token en: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
                </span>
              </div>

              <div className="yk-github-help">
                <h4>¿Cómo obtener un token?</h4>
                <ol>
                  <li>Ve a tu perfil de GitHub → Settings</li>
                  <li>Navega a: Developer settings → Personal access tokens → Tokens (classic)</li>
                  <li>Click en "Generate new token (classic)"</li>
                  <li>Selecciona el scope: <code>repo</code> (Full control of private repositories)</li>
                  <li>Copia el token y pégalo arriba</li>
                </ol>
              </div>
            </div>

            <div className="yk-modal-footer">
              <button className="yk-btn-secondary" onClick={() => setShowGithubModal(false)}>Cancelar</button>
              <button 
                className="yk-btn-primary" 
                onClick={saveGitHubConfig}
                disabled={!githubForm.repoUrl || !githubForm.token}
              >
                <Save size={14} />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
