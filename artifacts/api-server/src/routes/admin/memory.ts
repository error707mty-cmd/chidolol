/**
 * ERROR707 — Sistema de memoria semántica con embeddings
 * Usa pgvector para búsqueda por similitud
 * Esquema real: id, session_id, role, content, embedding, metadata, created_at
 */

import { pool as rawPool } from "@workspace/db";

// ── Generar embedding via Anthropic (no OpenAI key needed) ─────────────────────
// Usamos un embedding simple basado en hash para no depender de API keys externas
// La búsqueda semántica real se hace via error-brain.md (más confiable)

async function generateSimpleEmbedding(text: string): Promise<number[] | null> {
  // Return null to skip embedding — use error-brain.md for semantic memory instead
  return null;
}

// ── Guardar memoria en DB ──────────────────────────────────────────────────────

export async function saveMemory(
  content: string,
  category: string = "conversation",
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const client = await rawPool.connect();
    try {
      await client.query(
        `INSERT INTO ai_memory (session_id, role, content, metadata)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          `admin-${Date.now()}`,
          "assistant",
          content.slice(0, 4000),
          JSON.stringify({ category, ...metadata }),
        ]
      );
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[memory] Error guardando:", e);
  }
}

// ── Buscar memorias relevantes (búsqueda por texto simple) ─────────────────────

export async function searchMemory(
  query: string,
  limit: number = 5,
  threshold: number = 0.25
): Promise<{ content: string; category: string; similarity: number; date: string }[]> {
  try {
    const client = await rawPool.connect();
    try {
      // Búsqueda por texto simple (ILIKE) sin embeddings externos
      const words = query.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
      if (words.length === 0) return [];

      const conditions = words.map((w, i) => `content ILIKE $${i + 1}`).join(" OR ");
      const params = words.map(w => `%${w}%`);

      const result = await client.query(
        `SELECT content, metadata, created_at
         FROM ai_memory
         WHERE ${conditions}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1}`,
        [...params, limit]
      );

      return result.rows.map((r) => ({
        content: r.content,
        category: (r.metadata?.category as string) ?? "conversation",
        similarity: 0.5,
        date: new Date(r.created_at).toLocaleDateString("es-MX"),
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[memory] Error buscando:", e);
    return [];
  }
}

// ── Obtener resumen de memorias recientes ──────────────────────────────────────

export async function getRecentMemories(limit: number = 10): Promise<string> {
  try {
    const client = await rawPool.connect();
    try {
      const result = await client.query(
        `SELECT content, metadata, created_at
         FROM ai_memory
         WHERE role = 'assistant'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      if (result.rows.length === 0) return "(sin memorias guardadas aún)";
      return result.rows
        .map((r) => {
          const cat = (r.metadata?.category as string) ?? "conversation";
          const date = new Date(r.created_at).toLocaleDateString("es-MX");
          return `[${cat} | ${date}] ${r.content}`;
        })
        .join("\n");
    } finally {
      client.release();
    }
  } catch (e) {
    return "(error leyendo memorias)";
  }
}
