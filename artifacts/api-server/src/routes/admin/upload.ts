import express from "express";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { requireAuth } from "../../middlewares/requireAuth";

const router = express.Router();

// Require authentication for uploads
router.use(requireAuth);

// Configurar multer para guardar archivos
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err: any) {
      cb(err, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Solo se permiten imágenes"));
  },
});

// POST /api/admin/upload/image
router.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se subió ninguna imagen" });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl, filename: req.file.filename });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/upload/image/:filename
router.delete("/image/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(process.cwd(), "uploads", filename);
    
    try {
      await fs.unlink(filepath);
      res.json({ message: "Imagen eliminada" });
    } catch (err) {
      res.status(404).json({ error: "Imagen no encontrada" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
