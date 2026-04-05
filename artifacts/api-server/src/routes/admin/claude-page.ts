/**
 * ERROR707 — Interfaz autónoma de Claude/ERROR
 * Página HTML pura servida por Express, sin dependencia de React/Vite.
 * Sobrevive cualquier cambio en el frontend.
 */

import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env["JWT_SECRET"];

function requireAdminToken(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const token = req.headers["authorization"]?.slice(7) ?? req.query["t"] as string ?? null;
  if (!token) { res.status(401).send("No autenticado"); return; }
  try {
    const p = jwt.verify(token, JWT_SECRET!) as { isAdmin: boolean };
    if (!p.isAdmin) { res.status(403).send("Acceso denegado"); return; }
    next();
  } catch {
    res.status(401).send("Token inválido");
  }
}

// ── GET /admin/error — Interfaz autónoma de Claude (auth es client-side)
router.get("/admin/error", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(CLAUDE_HTML);
});

const CLAUDE_HTML = /* html */`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ERROR — ERROR707 Studio</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #09090f;
  --surface:  #0f0f17;
  --surface2: #14141e;
  --surface3: #1c1c28;
  --surface4: #232332;
  --border:   #25253a;
  --border2:  #2e2e45;
  --accent:   #7c3aed;
  --accent2:  #9b5cf5;
  --pink:     #ec4899;
  --text:     #eaeaf4;
  --text2:    #8888a8;
  --text3:    #4a4a6a;
  --green:    #22c55e;
  --red:      #ef4444;
  --yellow:   #f59e0b;
  --blue:     #3b82f6;
  --font:     'Segoe UI', system-ui, -apple-system, sans-serif;
  --mono:     'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

html, body {
  height: 100%; background: var(--bg); color: var(--text);
  font-family: var(--font); overflow: hidden; font-size: 14px;
}

/* ── Layout ── */
#app { display: flex; flex-direction: column; height: 100vh; }

/* ── Header ── */
#header {
  display: flex; align-items: center; gap: 0;
  height: 52px; background: var(--surface); border-bottom: 1px solid var(--border);
  flex-shrink: 0; padding: 0 20px;
}
.header-logo {
  display: flex; align-items: center; gap: 10px;
  font-weight: 900; font-size: 14px; letter-spacing: 2px;
  text-transform: uppercase; color: var(--text); white-space: nowrap;
}
.header-logo-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--pink));
}
.header-logo span { color: var(--accent2); }
.header-sep { width: 1px; height: 24px; background: var(--border); margin: 0 16px; }
.header-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
  color: var(--accent2); background: rgba(124,58,237,0.12);
  border: 1px solid rgba(124,58,237,0.3); border-radius: 4px; padding: 3px 8px;
}
.header-tabs { display: flex; gap: 2px; margin-left: 24px; }
.htab {
  padding: 6px 16px; border-radius: 6px; border: 1px solid transparent;
  background: transparent; color: var(--text2); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s; font-family: var(--font); display: flex;
  align-items: center; gap: 6px;
}
.htab:hover { background: var(--surface2); color: var(--text); }
.htab.active {
  background: var(--surface3); color: var(--accent2);
  border-color: var(--border2);
}
.htab svg { opacity: 0.8; }
.header-right { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.status-pill {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--green);
}
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
.logout-btn {
  padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border);
  background: transparent; color: var(--text2); font-size: 12px; cursor: pointer;
  font-family: var(--font); transition: all 0.15s;
}
.logout-btn:hover { background: var(--surface3); color: var(--text); }

/* ── Main ── */
#main { display: flex; flex: 1; overflow: hidden; }

/* ── Sidebar ── */
#sidebar {
  width: 216px; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; flex-shrink: 0;
  overflow-y: auto; padding: 16px;
}
#sidebar::-webkit-scrollbar { width: 3px; }
#sidebar::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 3px; }

.sid-avatar {
  width: 48px; height: 48px; border-radius: 14px; margin: 0 auto 8px;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  display: flex; align-items: center; justify-content: center; font-size: 22px;
}
.sid-name { text-align: center; font-weight: 800; font-size: 18px; letter-spacing: 1px; }
.sid-sub { text-align: center; font-size: 11px; color: var(--text3); margin-top: 2px; }

.sid-sep { height: 1px; background: var(--border); margin: 14px 0; }
.sid-label {
  font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--text3); margin-bottom: 8px;
}
.sid-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 0;
}
.sid-row-label { font-size: 12px; color: var(--text2); display: flex; align-items: center; gap: 6px; }
.sid-row-val { font-size: 11px; color: var(--green); font-weight: 700; }

.job-card {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; font-size: 11px;
}
.job-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-bottom: 4px;
}
.job-pill.pending { background: rgba(245,158,11,0.12); color: var(--yellow); border: 1px solid rgba(245,158,11,0.25); }
.job-pill.running { background: rgba(59,130,246,0.12); color: var(--blue); border: 1px solid rgba(59,130,246,0.25); }
.job-pill.done    { background: rgba(34,197,94,0.12);  color: var(--green); border: 1px solid rgba(34,197,94,0.25); }
.job-pill.error   { background: rgba(239,68,68,0.12);  color: var(--red);   border: 1px solid rgba(239,68,68,0.25); }
.job-hint { font-size: 10px; color: var(--text3); margin-top: 2px; }

.sid-btn {
  width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--surface2); color: var(--text2); font-size: 12px; cursor: pointer;
  text-align: left; margin-bottom: 6px; transition: all 0.15s; font-family: var(--font);
  display: flex; align-items: center; gap: 7px;
}
.sid-btn:hover { background: var(--surface3); color: var(--text); border-color: var(--border2); }

/* ── Chat area ── */
#chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
#messages {
  flex: 1; overflow-y: auto; padding: 24px 28px;
  display: flex; flex-direction: column; gap: 18px;
}
#messages::-webkit-scrollbar { width: 4px; }
#messages::-webkit-scrollbar-track { background: transparent; }
#messages::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 4px; }

/* ── Empty state ── */
#empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: var(--text3); gap: 10px; pointer-events: none;
}
.empty-icon {
  width: 64px; height: 64px; border-radius: 18px; margin-bottom: 4px;
  background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(236,72,153,0.15));
  border: 1px solid rgba(124,58,237,0.2);
  display: flex; align-items: center; justify-content: center; font-size: 30px;
}
#empty h3 { font-size: 16px; color: var(--text2); font-weight: 700; }
#empty p { font-size: 13px; text-align: center; max-width: 300px; line-height: 1.6; }

/* ── Messages ── */
.msg { display: flex; gap: 10px; max-width: 820px; animation: msgIn 0.18s ease; }
.msg.user    { flex-direction: row-reverse; align-self: flex-end; }
.msg.assistant { align-self: flex-start; }
.msg-avatar {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.msg.user .msg-avatar      { background: linear-gradient(135deg, #4338ca, #7c3aed); }
.msg.assistant .msg-avatar { background: linear-gradient(135deg, var(--accent), var(--pink)); }
.msg-body { max-width: calc(100% - 42px); }
.msg-bubble {
  padding: 11px 15px; border-radius: 14px; font-size: 13.5px; line-height: 1.65;
  word-break: break-word;
}
.msg.user .msg-bubble {
  background: linear-gradient(135deg, #4338ca, #7c3aed); color: white;
  border-bottom-right-radius: 4px;
}
.msg.assistant .msg-bubble {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); border-bottom-left-radius: 4px;
}

/* thinking dots */
.thinking { display: flex; align-items: center; gap: 5px; padding: 4px 2px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent2); animation: bounce 1.4s infinite; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

/* Tool calls */
.tool-call {
  margin-top: 7px; padding: 6px 10px; border-radius: 7px;
  background: var(--surface3); border: 1px solid var(--border2);
  font-size: 11px; color: var(--text3); font-family: var(--mono);
}
.tool-name { color: var(--accent2); font-weight: 600; }

/* Images */
.msg-img { max-width: 220px; max-height: 160px; border-radius: 9px; margin-top: 7px; display: block; }

/* Markdown */
.msg-bubble h1 { font-size: 17px; font-weight: 800; margin: 8px 0 4px; }
.msg-bubble h2 { font-size: 15px; font-weight: 700; margin: 8px 0 4px; }
.msg-bubble h3 { font-size: 14px; font-weight: 700; margin: 6px 0 3px; color: var(--accent2); }
.msg-bubble code {
  font-family: var(--mono); font-size: 12px;
  background: rgba(124,58,237,0.18); padding: 2px 5px; border-radius: 4px; color: var(--accent2);
}
.msg.user .msg-bubble code { background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); }
.msg-bubble pre {
  background: #07070e; border: 1px solid var(--border2); border-radius: 9px;
  padding: 12px 14px; margin: 8px 0; overflow-x: auto;
}
.msg-bubble pre code { background: none; padding: 0; color: #c8c8e8; }
.msg-bubble ul, .msg-bubble ol { padding-left: 18px; margin: 6px 0; }
.msg-bubble li { margin: 3px 0; }
.msg-bubble p { margin: 4px 0; }
.msg-bubble strong { color: #fff; font-weight: 700; }
.msg.user .msg-bubble strong { color: #fff; }
.msg-bubble a { color: var(--accent2); text-decoration: none; }
.msg-bubble a:hover { text-decoration: underline; }
.msg-bubble blockquote { border-left: 3px solid var(--accent); padding-left: 10px; color: var(--text2); margin: 6px 0; }
.msg-bubble table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12.5px; }
.msg-bubble th { background: var(--surface3); padding: 6px 10px; border: 1px solid var(--border); font-weight: 700; }
.msg-bubble td { padding: 5px 10px; border: 1px solid var(--border); }
.msg-bubble hr { border: none; border-top: 1px solid var(--border); margin: 8px 0; }

/* ── Input area ── */
#input-area {
  padding: 12px 20px 16px; background: var(--surface);
  border-top: 1px solid var(--border);
}
#pending-imgs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.pimg { position: relative; display: inline-block; }
.pimg img { width: 54px; height: 54px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border2); display: block; }
.pimg-rm {
  position: absolute; top: -5px; right: -5px; width: 18px; height: 18px;
  border-radius: 50%; background: var(--red); border: none; color: white;
  font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
#input-row { display: flex; gap: 8px; align-items: flex-end; }
#msg-input {
  flex: 1; resize: none; background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); border-radius: 10px; padding: 10px 14px; font-size: 13.5px;
  font-family: var(--font); line-height: 1.55; max-height: 160px; min-height: 44px;
  transition: border-color 0.15s; outline: none;
}
#msg-input:focus { border-color: var(--accent); }
#msg-input::placeholder { color: var(--text3); }
.icon-btn {
  width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface2); color: var(--text2); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; flex-shrink: 0; font-size: 16px;
}
.icon-btn:hover { background: var(--surface3); color: var(--text); border-color: var(--border2); }
#send-btn {
  width: 40px; height: 40px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  color: white; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: opacity 0.15s; flex-shrink: 0;
}
#send-btn:hover { opacity: 0.85; }
#send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.input-hint { font-size: 11px; color: var(--text3); margin-top: 7px; text-align: center; }

/* ── Auth overlay ── */
#auth-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.92);
  display: none; align-items: center; justify-content: center;
  flex-direction: column; gap: 14px; z-index: 999; backdrop-filter: blur(4px);
}
.auth-card {
  background: var(--surface); border: 1px solid var(--border2); border-radius: 16px;
  padding: 32px 40px; text-align: center; max-width: 340px;
}
.auth-icon { font-size: 36px; margin-bottom: 8px; }
.auth-card h2 { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
.auth-card p { font-size: 13px; color: var(--text2); margin-bottom: 20px; }
.auth-link {
  display: inline-block; padding: 10px 24px; border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), var(--pink));
  color: white; text-decoration: none; font-weight: 700; font-size: 13px;
}

/* ── Animations ── */
@keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes bounce  { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
@keyframes msgIn   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
</style>
</head>
<body>

<!-- Auth overlay -->
<div id="auth-overlay">
  <div class="auth-card">
    <div class="auth-icon">🔒</div>
    <h2>Sesión expirada</h2>
    <p>Inicia sesión nuevamente para acceder al asistente ERROR.</p>
    <a class="auth-link" href="/">← Ir al inicio</a>
  </div>
</div>

<div id="app">

  <!-- Header -->
  <div id="header">
    <div class="header-logo">
      <div class="header-logo-dot"></div>
      ERROR<span>707</span> - ESTUDIO
    </div>
    <div class="header-sep"></div>
    <div class="header-badge">IA ADMIN</div>

    <div class="header-tabs">
      <button class="htab active" id="tab-trabajo" onclick="setTab('trabajo')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Trabajo
      </button>
      <button class="htab" id="tab-casual" onclick="setTab('casual')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        Casual
      </button>
    </div>

    <div class="header-right">
      <div class="status-pill">
        <span class="status-dot"></span>
        <span id="status-text">ERROR activo</span>
      </div>
      <button class="logout-btn" onclick="goBack()">← Volver</button>
    </div>
  </div>

  <!-- Main layout -->
  <div id="main">

    <!-- Sidebar -->
    <div id="sidebar">
      <div class="sid-avatar">🤖</div>
      <div class="sid-name">ERROR</div>
      <div class="sid-sub">Claude Sonnet — Acceso total</div>

      <div class="sid-sep"></div>
      <div class="sid-label">Capacidades</div>
      <div class="sid-row">
        <span class="sid-row-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          Archivos
        </span>
        <span class="sid-row-val">✓</span>
      </div>
      <div class="sid-row">
        <span class="sid-row-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          Base de datos
        </span>
        <span class="sid-row-val">✓</span>
      </div>
      <div class="sid-row">
        <span class="sid-row-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          Shell
        </span>
        <span class="sid-row-val">✓</span>
      </div>
      <div class="sid-row">
        <span class="sid-row-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 110 20A10 10 0 0112 2z"/><path d="M12 6v6l4 2"/>
          </svg>
          Memoria
        </span>
        <span class="sid-row-val">✓</span>
      </div>

      <div class="sid-sep"></div>
      <div class="sid-label">Job activo</div>
      <div id="job-status" class="job-card" style="color:var(--text3);font-size:12px;">Sin job activo</div>

      <div class="sid-sep"></div>
      <button class="sid-btn" onclick="clearChat()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
        </svg>
        Limpiar chat
      </button>
    </div>

    <!-- Chat area -->
    <div id="chat-area">
      <div id="messages">
        <div id="empty">
          <div class="empty-icon">🤖</div>
          <h3>ERROR listo</h3>
          <p>Tengo acceso total al sistema. Puedo leer y editar archivos, ejecutar comandos, consultar la base de datos y mucho más.</p>
        </div>
      </div>

      <!-- Input -->
      <div id="input-area">
        <div id="pending-imgs"></div>
        <div id="input-row">
          <label class="icon-btn" title="Adjuntar imagen" style="cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <input type="file" accept="image/*" multiple style="display:none" onchange="handleFiles(this)">
          </label>
          <textarea id="msg-input" placeholder="Escríbele a ERROR..." rows="1"
            onkeydown="handleKey(event)" oninput="autoResize(this)"></textarea>
          <button id="send-btn" onclick="sendMessage()" title="Enviar (Enter)">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="input-hint" id="hint-text">
          Trabajo: ejecuta tareas largas en background · Enter para enviar · Shift+Enter nueva línea
        </div>
      </div>
    </div>

  </div>
</div>

<script>
// ── State ─────────────────────────────────────────────────────────────────────
const TOKEN_KEY = 'dtf_auth_token';
const STORAGE_KEY_T = 'error_trabajo_msgs';
const STORAGE_KEY_C = 'error_casual_msgs';
const STORAGE_KEY_JOB = 'error_current_job';
let token = localStorage.getItem(TOKEN_KEY);
let activeTab = 'trabajo';
let trabajoMsgs = [];
let casualMsgs = [];
let pendingImages = [];
let isLoading = false;
let jobPolling = null;
let currentJob = null;
let pollStartedAt = null; // timestamp when polling started
const MAX_POLL_MS = 5 * 60 * 1000; // 5 min max polling

// ── Persistence helpers ────────────────────────────────────────────────────────
function saveMsgs() {
  try {
    const clean = arr => arr.filter(m => !m.isThinking).map(m => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls || undefined,
    }));
    localStorage.setItem(STORAGE_KEY_T, JSON.stringify(clean(trabajoMsgs).slice(-80)));
    localStorage.setItem(STORAGE_KEY_C, JSON.stringify(clean(casualMsgs).slice(-80)));
  } catch {}
}

function loadMsgs() {
  try {
    const t = localStorage.getItem(STORAGE_KEY_T);
    const c = localStorage.getItem(STORAGE_KEY_C);
    if (t) trabajoMsgs = JSON.parse(t);
    if (c) casualMsgs = JSON.parse(c);
  } catch {}
}

function saveJob(job) {
  try {
    if (job) localStorage.setItem(STORAGE_KEY_JOB, JSON.stringify({ id: job.id, status: job.status, createdAt: job.createdAt }));
    else localStorage.removeItem(STORAGE_KEY_JOB);
  } catch {}
}

function loadJob() {
  try {
    const j = localStorage.getItem(STORAGE_KEY_JOB);
    return j ? JSON.parse(j) : null;
  } catch { return null; }
}

// Initialize from localStorage
loadMsgs();

// ── Auth ─────────────────────────────────────────────────────────────────────
(async function checkAuth() {
  if (!token) { showAuthOverlay(); return; }
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) showAuthOverlay();
  } catch {}
})();

function showAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'flex';
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() { window.location.href = '/admin/asistente'; }

// ── Tab switching ─────────────────────────────────────────────────────────────
function setTab(tab) {
  activeTab = tab;
  document.getElementById('tab-trabajo').className = 'htab' + (tab === 'trabajo' ? ' active' : '');
  document.getElementById('tab-casual').className  = 'htab' + (tab === 'casual'  ? ' active' : '');
  document.getElementById('hint-text').textContent = tab === 'trabajo'
    ? 'Trabajo: ejecuta tareas largas en background · Enter para enviar · Shift+Enter nueva línea'
    : 'Casual: conversación libre sin herramientas · Enter para enviar · Shift+Enter nueva línea';
  renderMessages();
}

// Markdown renderer
function md(raw) {
  if (!raw) return '';
  var t = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // code blocks: (triple-backtick)lang...code(triple-backtick)
  t = t.replace(new RegExp('\`\`\`(\\\\w*)\\\\n?([\\\\s\\\\S]*?)\`\`\`', 'g'), function(_,l,c){ return '<pre><code>' + c.trimEnd() + '</code></pre>'; });
  // inline code: (backtick)code(backtick)  — no newlines
  t = t.replace(new RegExp('\`([^\`\\\\n]+)\`', 'g'), '<code>$1</code>');
  // bold+italic, bold, italic  — \\\\* in TS template → \\* in HTML → \* in RegExp
  t = t.replace(new RegExp('\\\\*\\\\*\\\\*([^*]+)\\\\*\\\\*\\\\*', 'g'), '<strong><em>$1</em></strong>');
  t = t.replace(new RegExp('\\\\*\\\\*([^*]+)\\\\*\\\\*', 'g'), '<strong>$1</strong>');
  t = t.replace(new RegExp('\\\\*([^*\\\\n]+)\\\\*', 'g'), '<em>$1</em>');
  // headings (no metachar issues with . ^ $)
  t = t.replace(new RegExp('^### (.+)$', 'gm'), '<h3>$1</h3>');
  t = t.replace(new RegExp('^## (.+)$',  'gm'), '<h2>$1</h2>');
  t = t.replace(new RegExp('^# (.+)$',   'gm'), '<h1>$1</h1>');
  // blockquote, hr
  t = t.replace(new RegExp('^&gt; (.+)$', 'gm'), '<blockquote>$1</blockquote>');
  t = t.replace(new RegExp('^---+$', 'gm'), '<hr>');
  // unordered lists
  t = t.replace(new RegExp('^[*-] (.+)$', 'gm'), '<li>$1</li>');
  t = t.replace(new RegExp('(<li>[\\\\s\\\\S]*?<\\/li>\\\\n?)+', 'g'), function(s){ return '<ul>' + s + '</ul>'; });
  // ordered lists — \\\\d in TS → \\d in HTML → \d in RegExp
  t = t.replace(new RegExp('^\\\\d+\\\\. (.+)$', 'gm'), '<li>$1</li>');
  // paragraphs / line breaks
  t = t.replace(new RegExp('\\\\n\\\\n+', 'g'), '</p><p>');
  t = t.replace(new RegExp('\\\\n', 'g'), '<br>');
  return '<p>' + t + '</p>';
}

// ── Render messages ───────────────────────────────────────────────────────────
function renderMessages() {
  const msgs = activeTab === 'trabajo' ? trabajoMsgs : casualMsgs;
  const el = document.getElementById('messages');

  if (msgs.length === 0) {
    el.innerHTML = \`<div id="empty">
      <div class="empty-icon">🤖</div>
      <h3>ERROR listo</h3>
      <p>\${activeTab === 'trabajo'
        ? 'Tengo acceso total al sistema. Puedo leer y editar archivos, ejecutar comandos, consultar la base de datos y mucho más.'
        : 'Modo casual activo. Podemos hablar de lo que quieras sin herramientas — ideas, negocios, lo que sea.'
      }</p>
    </div>\`;
    return;
  }

  el.innerHTML = msgs.map(renderMsg).join('');
  el.scrollTop = el.scrollHeight;
}

function renderMsg(m) {
  if (m.isThinking) {
    return \`<div class="msg assistant">
      <div class="msg-avatar">🤖</div>
      <div class="msg-body">
        <div class="msg-bubble">
          <div class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
        </div>
      </div>
    </div>\`;
  }

  const isUser = m.role === 'user';
  let contentHtml = '';

  if (typeof m.content === 'string') {
    contentHtml = md(m.content);
  } else if (Array.isArray(m.content)) {
    contentHtml = m.content.map(b => {
      if (b.type === 'text') return md(b.text || '');
      if (b.type === 'image_url') return '<img class="msg-img" src="' + escHtml(b.image_url.url) + '">';
      return '';
    }).join('');
  }

  let toolsHtml = '';
  if (m.toolCalls && m.toolCalls.length > 0) {
    toolsHtml = m.toolCalls.map(t =>
      '<div class="tool-call"><span class="tool-name">' + escHtml(t.name) + '</span> ' +
      escHtml(JSON.stringify(t.input || {}).slice(0, 100)) + '</div>'
    ).join('');
  }

  return \`<div class="msg \${isUser ? 'user' : 'assistant'}">
    <div class="msg-avatar">\${isUser ? '👤' : '🤖'}</div>
    <div class="msg-body">
      <div class="msg-bubble">\${contentHtml}\${toolsHtml}</div>
    </div>
  </div>\`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Job status ────────────────────────────────────────────────────────────────
function updateJobStatus() {
  const el = document.getElementById('job-status');
  if (!currentJob) {
    el.style.color = 'var(--text3)';
    el.innerHTML = 'Sin job activo';
    return;
  }
  const icons   = { pending:'⏳', running:'⚙️', done:'✅', error:'❌' };
  const labels  = { pending:'En cola', running:'Procesando', done:'Completado', error:'Error' };
  const status  = currentJob.status;
  const iters   = currentJob.iterations > 0 ? ' · iter ' + currentJob.iterations : '';
  el.innerHTML  = \`<div class="job-pill \${status}">\${icons[status]||''} \${labels[status]||status}\${iters}</div>\`;
  if (status === 'running') {
    el.innerHTML += \`<div class="job-hint">Trabajo en progreso · <button onclick="cancelJob()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px;padding:0;text-decoration:underline">Cancelar</button></div>\`;
  }
}

async function cancelJob() {
  if (!currentJob || (currentJob.status !== 'running' && currentJob.status !== 'pending')) return;
  try {
    await fetch('/api/admin/chat-job/' + currentJob.id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    });
  } catch {}
  stopPolling();
  trabajoMsgs = trabajoMsgs.filter(m => !m.isThinking);
  trabajoMsgs.push({ role: 'assistant', content: '⏹ Job cancelado.' });
  currentJob = null;
  saveJob(null);
  saveMsgs();
  isLoading = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('status-text').textContent = 'ERROR activo';
  updateJobStatus();
  renderMessages();
}

function stopPolling() {
  if (jobPolling) { clearInterval(jobPolling); jobPolling = null; }
  pollStartedAt = null;
}

// ── Poll job ──────────────────────────────────────────────────────────────────
async function pollJob(jobId) {
  // Max poll timeout: stop after MAX_POLL_MS and mark as error
  if (pollStartedAt && Date.now() - pollStartedAt > MAX_POLL_MS) {
    stopPolling();
    trabajoMsgs = trabajoMsgs.filter(m => !m.isThinking);
    trabajoMsgs.push({ role: 'assistant', content: '⏱ Timeout: el job tardó demasiado. El trabajo puede haber continuado en el servidor — intenta recargar o escribe un nuevo mensaje.' });
    isLoading = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('status-text').textContent = 'ERROR activo';
    saveMsgs();
    renderMessages();
    return;
  }

  try {
    const r = await fetch('/api/admin/chat-job/' + jobId, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) return;
    const job = await r.json();
    currentJob = job;
    saveJob(job);
    updateJobStatus();

    // Show partial results while running (progressive)
    if (job.status === 'running' && job.result && job.result.length > 0) {
      const thinkIdx = trabajoMsgs.findIndex(m => m.isThinking);
      if (thinkIdx >= 0) {
        trabajoMsgs[thinkIdx] = { role: 'assistant', content: job.result + '\\n\\n⚙️ *Procesando...*', toolCalls: job.toolCalls || [], isStreaming: true };
        renderMessages();
      }
    }

    if (job.status === 'done' || job.status === 'error') {
      stopPolling();
      isLoading = false;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('status-text').textContent = 'ERROR activo';

      // Replace thinking/streaming bubble with final result
      trabajoMsgs = trabajoMsgs.filter(m => !m.isThinking && !m.isStreaming);
      if (job.status === 'done' && job.result) {
        trabajoMsgs.push({ role: 'assistant', content: job.result, toolCalls: job.toolCalls || [] });
      } else if (job.status === 'error') {
        trabajoMsgs.push({ role: 'assistant', content: '❌ ' + (job.error || 'Error desconocido') });
      } else if (job.status === 'done' && !job.result) {
        trabajoMsgs.push({ role: 'assistant', content: '✅ Tarea completada sin respuesta de texto.' });
      }
      saveMsgs();
      saveJob(null);
      renderMessages();
    }
  } catch {}
}

// ── Send ──────────────────────────────────────────────────────────────────────
async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text && pendingImages.length === 0) return;

  // Build content
  let content;
  if (pendingImages.length > 0) {
    content = [];
    if (text) content.push({ type: 'text', text });
    pendingImages.forEach(img => content.push({ type: 'image_url', image_url: { url: img.url } }));
  } else {
    content = text;
  }

  const msgs = activeTab === 'trabajo' ? trabajoMsgs : casualMsgs;
  msgs.push({ role: 'user', content });
  msgs.push({ role: 'assistant', content: '', isThinking: true });

  pendingImages = [];
  document.getElementById('pending-imgs').innerHTML = '';
  input.value = '';
  input.style.height = '44px';
  isLoading = true;
  document.getElementById('send-btn').disabled = true;
  renderMessages();

  if (activeTab === 'trabajo') {
    await sendTrabajo(msgs);
  } else {
    await sendCasual(msgs);
  }
}

async function sendTrabajo(msgs) {
  // Cancel any previously running job before starting a new one
  if (currentJob && (currentJob.status === 'running' || currentJob.status === 'pending')) {
    try {
      await fetch('/api/admin/chat-job/' + currentJob.id, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      });
    } catch {}
    stopPolling();
  }

  try {
    document.getElementById('status-text').textContent = 'Enviando...';
    const apiMsgs = msgs
      .filter(m => !m.isThinking && !m.isStreaming)
      .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : flattenContent(m.content) }));

    const r = await fetch('/api/admin/chat-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ messages: apiMsgs })
    });
    if (r.status === 401) { showAuthOverlay(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const body = await r.json();
    const jobId = body.jobId;
    if (!jobId) throw new Error('No se recibió jobId del servidor');

    currentJob = { id: jobId, status: 'pending', result: '', toolCalls: [], iterations: 0, createdAt: new Date().toISOString() };
    saveJob(currentJob);
    updateJobStatus();
    document.getElementById('status-text').textContent = 'Job corriendo...';
    stopPolling(); // clear any leftover intervals
    pollStartedAt = Date.now();
    jobPolling = setInterval(() => pollJob(jobId), 2000);
  } catch (err) {
    trabajoMsgs = trabajoMsgs.filter(m => !m.isThinking && !m.isStreaming);
    trabajoMsgs.push({ role: 'assistant', content: '❌ Error de conexión: ' + err.message });
    isLoading = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('status-text').textContent = 'ERROR activo';
    saveMsgs();
    renderMessages();
  }
}

async function sendCasual(msgs) {
  // We'll stream into the last (assistant) message
  const targetMsgs = casualMsgs;

  try {
    const apiMsgs = msgs
      .filter(m => !m.isThinking)
      .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : flattenContent(m.content) }));

    document.getElementById('status-text').textContent = 'ERROR escribiendo...';
    const r = await fetch('/api/admin/chat-casual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ messages: apiMsgs })
    });
    if (r.status === 401) { showAuthOverlay(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let accum = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            accum += data.content;
            // Replace the thinking bubble with streaming content
            const last = targetMsgs[targetMsgs.length - 1];
            if (last) {
              last.isThinking = false;
              last.content = accum;
            }
            renderMessages();
          }
          if (data.error) {
            const last = targetMsgs[targetMsgs.length - 1];
            if (last) { last.isThinking = false; last.content = '❌ Error: ' + data.error; }
            renderMessages();
          }
        } catch {}
      }
    }

    // Finalize — remove thinking flag if still set
    const last = targetMsgs[targetMsgs.length - 1];
    if (last && last.isThinking) {
      last.isThinking = false;
      last.content = accum || '(sin respuesta)';
      renderMessages();
    }
  } catch (err) {
    const last = casualMsgs[casualMsgs.length - 1];
    if (last) { last.isThinking = false; last.content = '❌ Error: ' + err.message; }
    renderMessages();
  } finally {
    isLoading = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('status-text').textContent = 'ERROR activo';
    saveMsgs();
  }
}

function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text').map(b => b.text || '').join('\\n');
  }
  return String(content);
}

// ── File handling ─────────────────────────────────────────────────────────────
function handleFiles(input) {
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      pendingImages.push({ url: e.target.result, name: file.name });
      renderPendingImgs();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderPendingImgs() {
  document.getElementById('pending-imgs').innerHTML = pendingImages.map((img, i) =>
    '<div class="pimg">' +
      '<img src="' + img.url + '" title="' + escHtml(img.name) + '">' +
      '<button class="pimg-rm" onclick="removeImg(' + i + ')">✕</button>' +
    '</div>'
  ).join('');
}

function removeImg(i) {
  pendingImages.splice(i, 1);
  renderPendingImgs();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function clearChat() {
  if (activeTab === 'trabajo') { trabajoMsgs = []; saveJob(null); }
  else casualMsgs = [];
  stopPolling();
  currentJob = null;
  isLoading = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('status-text').textContent = 'ERROR activo';
  saveMsgs();
  updateJobStatus();
  renderMessages();
}

// ── Init ──────────────────────────────────────────────────────────────────────
renderMessages();
updateJobStatus();
setTimeout(() => document.getElementById('msg-input').focus(), 100);

// Resume polling if there was a running job from a previous page load
(async function resumeJob() {
  const savedJob = loadJob();
  if (!savedJob) return;
  // Only resume jobs created within last 10 minutes
  const age = Date.now() - new Date(savedJob.createdAt).getTime();
  if (age > 10 * 60 * 1000) { saveJob(null); return; }
  // Check server status
  try {
    const r = await fetch('/api/admin/chat-job/' + savedJob.id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) { saveJob(null); return; }
    const job = await r.json();
    if (job.status === 'done' || job.status === 'error') {
      // Job finished while we were away — add result to messages
      if (job.status === 'done' && job.result) {
        trabajoMsgs.push({ role: 'assistant', content: job.result, toolCalls: job.toolCalls || [] });
      } else if (job.status === 'error') {
        trabajoMsgs.push({ role: 'assistant', content: '❌ ' + (job.error || 'Error desconocido') });
      }
      saveJob(null);
      saveMsgs();
      renderMessages();
    } else if (job.status === 'running' || job.status === 'pending') {
      // Still running — resume polling
      currentJob = job;
      isLoading = true;
      document.getElementById('send-btn').disabled = true;
      document.getElementById('status-text').textContent = 'Job corriendo...';
      if (!trabajoMsgs.find(m => m.isThinking)) {
        trabajoMsgs.push({ role: 'assistant', content: '', isThinking: true });
      }
      updateJobStatus();
      renderMessages();
      stopPolling();
      pollStartedAt = Date.now() - age; // adjust for elapsed time
      jobPolling = setInterval(() => pollJob(savedJob.id), 2000);
    }
  } catch { saveJob(null); }
})();
</script>
</body>
</html>`;

export default router;
