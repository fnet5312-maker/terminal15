import express from 'express';
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Racine de base (peut être modifiée dynamiquement)
let CURRENT_PROJECT_ROOT = process.cwd();

// Fonction pour mettre à jour la racine du projet
router.post('/set-root', (req, res) => {
  const { newPath } = req.body;
  if (!newPath) return res.status(400).json({ error: 'Chemin requis' });
  
  const resolvedPath = path.resolve(newPath);
  if (fs.existsSync(resolvedPath) && fs.lstatSync(resolvedPath).isDirectory()) {
    CURRENT_PROJECT_ROOT = resolvedPath;
    console.log(`📍 Nouvelle racine projet : ${CURRENT_PROJECT_ROOT}`);
    res.json({ success: true, root: CURRENT_PROJECT_ROOT });
  } else {
    res.status(400).json({ error: 'Chemin invalide ou dossier inexistant' });
  }
});

// Supprimé : la sécurité getSafePath pour permettre un accès total
const getFullPath = (filePath) => {
  // Si le chemin est déjà absolu (ex: C:\...), on l'utilise tel quel
  if (path.isAbsolute(filePath)) return filePath;
  // Sinon on le résout par rapport à la racine actuelle du projet
  return path.resolve(CURRENT_PROJECT_ROOT, filePath);
};

// Lire un fichier réel
router.get('/read', async (req, res) => {
  try {
    const { filePath } = req.query;
    if (!filePath) return res.status(400).json({ error: 'Chemin requis' });

    const fullPath = getFullPath(filePath);
    const content = await fsPromises.readFile(fullPath, 'utf8');
    res.json({ content, filePath: fullPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sauvegarder un fichier réel
router.post('/save', async (req, res) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Chemin requis' });

    const fullPath = getFullPath(filePath);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, content || '', 'utf8');
    res.json({ success: true, filePath: fullPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lister les fichiers réels
router.get('/list', async (req, res) => {
  try {
    const listFiles = async (dir, fileList = [], depth = 0) => {
      // Limiter la profondeur pour éviter de bloquer sur C:\ ou les très gros projets
      if (depth > 3) return fileList;

      const files = await fsPromises.readdir(dir);
      for (const file of files) {
        // Ignorer les dossiers lourds ou cachés
        if (['node_modules', '.git', '.venv', '.next', 'dist', 'build'].includes(file)) continue;
        if (file.startsWith('.')) continue;
        
        try {
          const filePath = path.join(dir, file);
          const stats = await fsPromises.stat(filePath);
          if (stats.isDirectory()) {
            await listFiles(filePath, fileList, depth + 1);
          } else {
            fileList.push(filePath);
          }
        } catch (e) { /* skip inaccessible files */ }
      }
      return fileList;
    };

    const files = await listFiles(CURRENT_PROJECT_ROOT);
    res.json({ files, root: CURRENT_PROJECT_ROOT });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Supprimer un fichier réel
router.delete('/delete', async (req, res) => {
  try {
    const { filePath } = req.query;
    if (!filePath) return res.status(400).json({ error: 'Chemin requis' });

    const fullPath = getFullPath(filePath);
    await fsPromises.unlink(fullPath);
    res.json({ success: true, filePath: fullPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
