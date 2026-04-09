import { Router } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

// ── Yuki exclusive access middleware ───────────────────────────────────────────
function requireYukiAccess(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  // Para el iframe, verificar token desde query param también
  const tokenFromHeader = req.headers["authorization"]?.slice(7) ?? null;
  const tokenFromQuery = req.query["token"] as string | undefined;
  const token = tokenFromHeader || tokenFromQuery;
  
  if (!token) { 
    res.status(401).json({ error: "No autenticado" }); 
    return; 
  }
  
  try {
    const p = jwt.verify(token, JWT_SECRET!) as { userId: number; username: string; isAdmin: boolean };
    if (p.username !== "error707mty") {
      res.status(403).json({ error: "Acceso exclusivo — solo el creador puede usar esta función" });
      return;
    }
    (req as any).yukiUser = p;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

// ── Proxy para el dev server del repo clonado (puerto 3001) ───────────────────
// Este proxy permite que el navegador externo del usuario acceda al dev server
// que corre internamente en localhost:3001 dentro del contenedor
router.use(
  "/preview",
  // Comentar temporalmente la autenticación para debugging del iframe
  // requireYukiAccess,
  createProxyMiddleware({
    target: "http://127.0.0.1:3001",
    changeOrigin: true,
    ws: true, // Enable WebSocket proxying for HMR
    pathRewrite: {
      "^/api/preview": "", // Remove /api/preview prefix when forwarding
    },
    // Importante: preservar la ruta original para que Vite funcione correctamente
    onProxyReq: (proxyReq, req, _res) => {
      console.log(`[Proxy] ${req.method} ${req.url} -> http://127.0.0.1:3001${req.url}`);
    },
    onError: (err, _req, res) => {
      console.error("Proxy error:", err);
      if (!res.headersSent) {
        (res as any).status(502).json({
          error: "Dev server no disponible",
          details: "Asegúrate de que el dev server esté corriendo en puerto 3001",
        });
      }
    },
  })
);

export default router;
