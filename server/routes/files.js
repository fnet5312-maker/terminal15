import express from 'express';
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import projectState from '../state.js';

const router = express.Router();

// Fonction pour mettre à jour la racine du projet
router.post('/set-root', (req, res) => {
  const { newPath } = req.body;
  if (!newPath) return res.status(400).json({ error: 'Chemin requis' });
  
  try {
    projectState.setRoot(newPath);
    res.json({ success: true, root: projectState.getRoot() });
  } catch (error) {
    res.status(400).json({ error: 'Chemin invalide ou dossier inexistant' });
  }
});

// Supprimé : la sécurité getSafePath pour permettre un accès total
const getFullPath = (filePath) => {
  // Si le chemin est déjà absolu (ex: C:\...), on l'utilise tel quel
  if (path.isAbsolute(filePath)) return filePath;
  // Sinon on le résout par rapport à la racine actuelle du projet
  return path.resolve(projectState.getRoot(), filePath);
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
    const { dir: targetDir, depth: maxDepth = 2 } = req.query;
    const baseDir = targetDir ? path.resolve(targetDir) : projectState.getRoot();

    const listFiles = async (dir, itemList = [], depth = 0) => {
      // Limiter la profondeur pour la performance
      if (depth > maxDepth) return itemList;

      try {
        const files = await fsPromises.readdir(dir);
        
        for (const file of files) {
          const heavyFolders = [
            'node_modules', '.git', '.venv', '.next', 'dist', 'build', 
            'System Volume Information', '$RECYCLE.BIN', 'Config.Msi',
            'Windows', 'ProgramData', 'AppData', 'Local Settings',
            'Program Files', 'Program Files (x86)'
          ];
          
          const isHeavy = heavyFolders.includes(file);
          if (file.startsWith('.') && file !== '.env') continue;
          
          try {
            const filePath = path.join(dir, file);
            const stats = await fsPromises.stat(filePath);
            const isDirectory = stats.isDirectory();

            itemList.push({
                path: filePath,
                name: file,
                isDirectory: isDirectory,
                isHeavy: isHeavy
            });

            // Ne descendre en récursion QUE si ce n'est pas un dossier lourd et qu'on n'a pas atteint la limite
            if (isDirectory && !isHeavy && depth < maxDepth) {
              await listFiles(filePath, itemList, depth + 1);
            }
          } catch (e) { }
        }
      } catch (e) { }
      return itemList;
    };

    const items = await listFiles(baseDir);
    res.json({ files: items, root: projectState.getRoot(), current: baseDir });
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

// Créer un dossier réel (mkdir -p)
router.post('/mkdir', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Chemin requis' });

    const fullPath = getFullPath(filePath);
    await fsPromises.mkdir(fullPath, { recursive: true });
    res.json({ success: true, filePath: fullPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
