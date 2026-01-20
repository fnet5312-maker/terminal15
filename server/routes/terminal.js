import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import projectState from '../state.js';

const router = express.Router();

router.post('/run', (req, res) => {
  let { command, cwd } = req.body;
  
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Commande requise' });
  }

  command = command.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  
  let currentCwd = cwd || projectState.getRoot();
  const lowerCmd = command.toLowerCase();

  // 1. Commande spéciale pour l'ÉDITEUR
  if (lowerCmd.startsWith('edit ') || lowerCmd.startsWith('notepad ')) {
    const parts = command.split(' ');
    parts.shift();
    let fileName = parts.join(' ').trim().replace(/^["'](.+)["']$/, '$1');
    const fullPath = path.resolve(currentCwd, fileName);
    return res.json({
        stdout: `[SUCCESS] Ouverture de ${fullPath} dans l'éditeur...`,
        openFile: fullPath,
        newCwd: currentCwd,
        code: 0
    });
  }

  // 2. Interception de CD pour synchroniser l'Explorateur et l'IA
  if (lowerCmd === 'cd' || lowerCmd.startsWith('cd ') || lowerCmd.startsWith('cd..') || lowerCmd.startsWith('cd\\')) {
    let targetPath = '.';
    if (lowerCmd === 'cd..') targetPath = '..';
    else if (lowerCmd.startsWith('cd ')) targetPath = command.substring(3).trim();
    else if (lowerCmd.startsWith('cd\\')) targetPath = '\\';
    
    targetPath = targetPath.replace(/^["'](.+)["']$/, '$1');

    try {
      const newPath = path.resolve(currentCwd, targetPath);
      if (fs.existsSync(newPath) && fs.lstatSync(newPath).isDirectory()) {
        projectState.setRoot(newPath);
        return res.json({
          stdout: lowerCmd === 'cd' ? newPath : '',
          stderr: '',
          newCwd: newPath,
          code: 0
        });
      }
    } catch (e) {
      // Ignorer l'erreur et laisser PowerShell gérer
    }
  }

  // 3. EXÉCUTION RÉELLE VIA POWERSHELL
  const options = { 
    cwd: currentCwd, 
    shell: 'powershell.exe',
    env: process.env 
  };

  // On injecte Get-Location pour capter tout changement de répertoire
  const fullCommand = `${command} ; Get-Location`;

  exec(fullCommand, options, (error, stdout, stderr) => {
    let finalStdout = stdout || '';
    let detectedCwd = currentCwd;

    if (finalStdout) {
      const lines = finalStdout.trim().split(/\r?\n/);
      const lastLine = lines[lines.length - 1].trim();
      
      // Si la dernière ligne est un chemin Windows (résultat de Get-Location)
      if (lastLine.match(/^[A-Z]:\\/i)) {
        detectedCwd = lastLine;
        // On synchronise la racine globale si le shell a bougé
        if (detectedCwd !== currentCwd) {
            projectState.setRoot(detectedCwd);
        }
        lines.pop();
        finalStdout = lines.join('\n');
      }
    }

    res.json({
      stdout: finalStdout,
      stderr: stderr || '',
      error: error ? error.message : null,
      code: error ? error.code : 0,
      newCwd: detectedCwd
    });
  });
});

export default router;
