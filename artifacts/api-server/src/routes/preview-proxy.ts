import { Router } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import jwt from "jsonwebtoken";
import http from "http";

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

// ── Simple proxy with HTML rewriting ───────────────────────────────────────────
router.use("/preview", (req, res, next) => {
  const targetPath = req.url.replace("/api/preview", "");
  const isAsset = req.url.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|mp4|webm|wav|mp3)$/);
  
  // For binary assets, use standard proxy
  if (isAsset) {
    return createProxyMiddleware({
      target: "http://127.0.0.1:3001",
      changeOrigin: true,
      ws: true,
      pathRewrite: { "^/api/preview": "" },
      onError: (err, _req, res) => {
        console.error("Proxy error:", err);
        if (!res.headersSent) {
          (res as any).status(502).json({ error: "Dev server no disponible" });
        }
      },
    })(req, res, next);
  }
  
  // For HTML, JS, CSS - fetch and rewrite paths
  const options = {
    hostname: "127.0.0.1",
    port: 3001,
    path: targetPath || "/",
    method: req.method,
    headers: {
      ...req.headers,
      host: "127.0.0.1:3001",
    },
  };
  
  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] || "";
    
    // Check if response needs path rewriting
    const needsRewrite = contentType.includes("text/html") || 
                        contentType.includes("javascript") ||
                        contentType.includes("typescript") ||
                        contentType.includes("text/css") ||
                        req.url.match(/\.(js|mjs|jsx|ts|tsx|css)$/);
    
    if (!needsRewrite) {
      // Pipe through as-is
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }
    
    // Collect and rewrite text content
    let body = "";
    proxyRes.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    
    proxyRes.on("end", () => {
      // Rewrite absolute paths to work through proxy
      const rewritten = body
        // Scripts with various paths
        .replace(/src=(["'])(\/@[^"']+)\1/g, 'src=$1/api/preview$2$1')
        .replace(/src=(["'])(\/src\/[^"']+)\1/g, 'src=$1/api/preview$2$1')
        .replace(/src=(["'])(\/node_modules\/[^"']+)\1/g, 'src=$1/api/preview$2$1')
        .replace(/src=(["'])(\/assets\/[^"']+)\1/g, 'src=$1/api/preview$2$1')
        // Imports
        .replace(/from\s+(["'])(\/@[^"']+)\1/g, 'from $1/api/preview$2$1')
        .replace(/from\s+(["'])(\/src\/[^"']+)\1/g, 'from $1/api/preview$2$1')
        .replace(/from\s+(["'])(\/node_modules\/[^"']+)\1/g, 'from $1/api/preview$2$1')
        .replace(/import\s+(["'])(\/@[^"']+)\1/g, 'import $1/api/preview$2$1')
        .replace(/import\s+(["'])(\/src\/[^"']+)\1/g, 'import $1/api/preview$2$1')
        .replace(/import\s+(["'])(\/node_modules\/[^"']+)\1/g, 'import $1/api/preview$2$1')
        // Dynamic imports
        .replace(/import\((["'])(\/@[^"']+)\1\)/g, 'import($1/api/preview$2$1)')
        .replace(/import\((["'])(\/src\/[^"']+)\1\)/g, 'import($1/api/preview$2$1)')
        .replace(/import\((["'])(\/node_modules\/[^"']+)\1\)/g, 'import($1/api/preview$2$1)')
        // Href links
        .replace(/href=(["'])(\/@[^"']+)\1/g, 'href=$1/api/preview$2$1')
        .replace(/href=(["'])(\/src\/[^"']+)\1/g, 'href=$1/api/preview$2$1')
        .replace(/href=(["'])(\/node_modules\/[^"']+)\1/g, 'href=$1/api/preview$2$1')
        .replace(/href=(["'])(\/assets\/[^"']+)\1/g, 'href=$1/api/preview$2$1');
      
      res.setHeader("content-type", contentType);
      res.setHeader("content-length", Buffer.byteLength(rewritten, "utf8"));
      res.status(proxyRes.statusCode || 200).send(rewritten);
    });
  });
  
  proxyReq.on("error", (err) => {
    console.error("Proxy request error:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "Dev server no disponible" });
    }
  });
  
  proxyReq.end();
});

export default router;
