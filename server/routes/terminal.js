import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Route pour exécuter une commande
router.post('/run', (req, res) => {
  let { command, cwd } = req.body;
  
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Commande requise' });
  }

  // Nettoyage impératif
  command = command.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  let currentCwd = cwd || process.cwd();

  // Commande spéciale pour ouvrir un fichier dans l'éditeur (ex: edit fichier.txt ou notepad fichier.txt)
  const lowerCmd = command.toLowerCase();
  if (lowerCmd.startsWith('edit ') || lowerCmd.startsWith('notepad ')) {
    const parts = command.split(' ');
    parts.shift(); // enlever 'edit' ou 'notepad'
    let fileName = parts.join(' ').trim();
    
    // Supprimer les guillemets si présents
    fileName = fileName.replace(/^["'](.+)["']$/, '$1');
    
    // Résoudre le chemin complet par rapport au CWD actuel du terminal
    const fullPath = path.resolve(currentCwd, fileName);

    return res.json({
        stdout: `Ouverture de ${fullPath} dans l'éditeur...`,
        openFile: fullPath,
        newCwd: currentCwd,
        code: 0
    });
  }

  // Gestion de "cd"
  if (lowerCmd === 'cd' || lowerCmd.startsWith('cd ') || lowerCmd.startsWith('cd..') || lowerCmd.startsWith('cd\\')) {
    let targetPath = '.';
    
    if (lowerCmd === 'cd..') {
      targetPath = '..';
    } else if (lowerCmd.startsWith('cd ')) {
      targetPath = command.substring(3).trim();
    } else if (lowerCmd.startsWith('cd\\')) {
      targetPath = '\\';
    }
    
    // Supprimer les guillemets si présents
    targetPath = targetPath.replace(/^["'](.+)["']$/, '$1');

    try {
      const newPath = path.resolve(currentCwd, targetPath);
      
      if (fs.existsSync(newPath) && fs.lstatSync(newPath).isDirectory()) {
        return res.json({
          stdout: lowerCmd === 'cd' ? newPath : '',
          stderr: '',
          newCwd: newPath,
          code: 0
        });
      } else {
        return res.json({
          stdout: '',
          stderr: `Le dossier n'existe pas : ${newPath}`,
          newCwd: currentCwd,
          code: 1
        });
      }
    } catch (e) {
      return res.json({
        stdout: '',
        stderr: `Erreur de chemin : ${e.message}`,
        newCwd: currentCwd,
        code: 1
      });
    }
  }

  // Limitation de sécurité basique pour la démo
  const forbiddenCommands = ['rm -rf /', 'format', 'mkfs'];
  if (forbiddenCommands.some(forbidden => command.includes(forbidden))) {
    return res.status(403).json({ error: 'Commande interdite par mesure de sécurité' });
  }

  exec(command, { cwd: currentCwd, env: process.env }, (error, stdout, stderr) => {
    // Loguer la sortie pour le debugging backend
    if (stdout) console.log(`[STDOUT] ${stdout.trim()}`);
    if (stderr) console.error(`[STDERR] ${stderr.trim()}`);

    res.json({
      stdout: stdout || '',
      stderr: stderr || '',
      error: error ? error.message : null,
      code: error ? error.code : 0
    });
  });
});

export default router;
