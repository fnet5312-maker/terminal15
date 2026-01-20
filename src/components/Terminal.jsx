import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './Terminal.css';

function Terminal({ onPathChange, onOpenFile, onCloseFile, initialPath = 'C:\\' }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const pathRef = useRef(initialPath);
  const commandQueue = useRef([]);
  const isProcessing = useRef(false);

  // Synchroniser le ref avec le state
  useEffect(() => {
    pathRef.current = currentPath;
  }, [currentPath]);

  // Synchroniser le terminal si la racine change depuis l'extérieur (ex: sidebar ou démarrage)
  useEffect(() => {
    if (xtermRef.current && isReady && initialPath && initialPath !== currentPath) {
      setCurrentPath(initialPath);
      pathRef.current = initialPath;
      
      // On informe le processus backend du changement de dossier
      fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `cd "${initialPath}"` })
      }).then(() => {
        displayPrompt(xtermRef.current, initialPath);
      });
    }
  }, [initialPath, isReady]);

  // Fonction pour afficher le prompt
  const displayPrompt = (term, path) => {
    if (!term) return; // Sécurité si le terminal n'est pas prêt ou démonté
    const displayPath = path || 'C:\\';
    // Format style Windows/PowerShell comme demandé
    term.write(`\r\n\x1b[1;36mPS\x1b[0m \x1b[1;32m${displayPath}\x1b[0m> `);
  };

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // 1. Initialisation avec une configuration propre
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.1,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
      },
      scrollback: 1000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // 2. Montage avec une synchronisation stricte
    const init = () => {
      if (terminalRef.current) {
        term.open(terminalRef.current);
        fitAddon.fit();
        
        term.writeln('\x1b[1;32mONLINE\x1b[0m - Web IDE Terminal Ready');
        
        // On récupère le chemin initial - Utilise la racine passée en prop
        fetch('/api/terminal/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `cd "${initialPath}"` })
        })
        .then(res => res.json())
        .then(data => {
          const root = data.newCwd || initialPath;
          setCurrentPath(root);
          pathRef.current = root;
          displayPrompt(term, root);
        })
        .catch(() => {
          const fallback = initialPath;
          setCurrentPath(fallback);
          pathRef.current = fallback;
          displayPrompt(term, fallback);
        });

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        setIsReady(true);
      }
    };

    const timer = setTimeout(init, 300);

    // Écouter les commandes envoyées par l'IA
    const handleAiCmd = (e) => {
      if (e.detail && xtermRef.current) {
        const { command, output, isSystem } = e.detail;
        
        if (isSystem) {
          // Commande déjà exécutée par l'IA, on l'affiche seulement
          xtermRef.current.write(`\r\n\x1b[1;35m[IA EXEC]\x1b[0m \x1b[1;32m${command}\x1b[0m\r\n`);
          if (output) {
            xtermRef.current.write(output.replace(/\n/g, '\r\n'));
            if (!output.endsWith('\n')) xtermRef.current.write('\r\n');
          }
          displayPrompt(xtermRef.current, pathRef.current);
          xtermRef.current.scrollToBottom();
        } else if (command) {
          // Commande à exécuter réellement
          addToQueue(command);
        }
      }
    };
    window.addEventListener('terminal-run', handleAiCmd);

    // 3. Logique d'entrée (OnData) - Supporte maintenant le copier-coller
    let commandLine = '';
    term.onData(e => {
      // Cas du Copier-Coller ou saisie multiple (e est une chaîne complète)
      if (e.length > 1 && !e.startsWith('\x1b')) {
        const cleanPaste = e.replace(/[\x00-\x1F\x7F]/g, '');
        commandLine += cleanPaste;
        term.write(cleanPaste);
        return;
      }

      // Séquences ANSI (flèches, etc.)
      if (e.startsWith('\x1b')) {
        return;
      }

      if (e === '\r') { // Enter
        term.write('\r\n');
        addToQueue(commandLine.trim());
        commandLine = '';
      } else if (e === '\x7f' || e === '\b') { // Backspace
        if (commandLine.length > 0) {
          commandLine = commandLine.slice(0, -1);
          term.write('\b \b');
        }
      } else {
        // Caractère unique imprimable
        if (e.charCodeAt(0) >= 32) {
          commandLine += e;
          term.write(e);
        }
      }
    });

    const addToQueue = (cmd) => {
      if (!cmd) {
         if (xtermRef.current) displayPrompt(xtermRef.current, pathRef.current);
         return;
      }
      commandQueue.current.push(cmd);
      processNextInQueue();
    };

    const processNextInQueue = async () => {
      if (isProcessing.current || commandQueue.current.length === 0) return;

      isProcessing.current = true;
      const cmd = commandQueue.current.shift();
      
      if (xtermRef.current) {
        if (cmd.startsWith('[IA EXEC]')) {
           // Déjà affiché par le message
        } else {
           // Optionnel: loguer la commande si elle vient de l'IA
        }
      }

      await processTerminalCommand(cmd, xtermRef.current);
      isProcessing.current = false;
      processNextInQueue(); // Passer à la suivante
    };

    return () => {
      clearTimeout(timer);
      window.removeEventListener('terminal-run', handleAiCmd);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Support du clic droit pour coller (comportement Windows)
  const handleContextMenu = async (e) => {
    // Si du texte est sélectionné, on laisse le menu contextuel par défaut pour "Copier"
    if (window.getSelection().toString()) return;

    e.preventDefault();
    try {
      const text = await navigator.clipboard.readText();
      if (text && xtermRef.current) {
        // Utiliser paste() sur l'instance xterm pour simuler une saisie réelle
        xtermRef.current.paste(text);
      }
    } catch (err) {
      console.error('Erreur clic droit coller:', err);
    }
  };

  // Gestion du redimensionnement fluide
  useEffect(() => {
    const handleResize = () => {
      if (!isMinimized && fitAddonRef.current) {
        fitAddonRef.current.fit();
        xtermRef.current?.scrollToBottom();
      }
    };
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleResize, 400); // Après animation
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [isMinimized]);

  const processTerminalCommand = async (cmd, term) => {
    if (!term) return;
    const activePath = pathRef.current;
    
    if (cmd === 'clear') {
      term.reset();
      displayPrompt(term, activePath);
      return;
    }

    // Si la commande vient de l'IA via l'event
    if (cmd.includes('[IA EXEC]') === false && xtermRef.current && commandQueue.current.length > 0) {
       // On peut identifier si c'est une commande auto ici
    }

    try {
      const res = await fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, cwd: activePath })
      });
      
      const data = await res.json();

      // 1. Mise à jour PRIORITAIRE du chemin
      if (data.newCwd && data.newCwd !== activePath) {
        setCurrentPath(data.newCwd);
        pathRef.current = data.newCwd;
        if (onPathChange) onPathChange(data.newCwd);
      }

      // 2. Ouverture d'un fichier
      if (data.openFile && onOpenFile) {
        onOpenFile(data.openFile);
      }

      // Fermeture d'un fichier ou de l'éditeur
      if ((data.closeEditor || data.closeFile) && onCloseFile) {
        onCloseFile(data.closeFile !== true ? data.closeFile : null);
      }

      // 3. Affichage des sorties
      if (data.stdout) term.write(data.stdout.replace(/\n/g, '\r\n'));
      if (data.stderr) term.write('\x1b[31m' + data.stderr.replace(/\n/g, '\r\n') + '\x1b[0m');
      if (data.error && !data.stderr) term.write('\x1b[31mError: ' + data.error + '\x1b[0m');
      
      const hasOutput = data.stdout || data.stderr || data.error;
      
      // Notifier le système de la commande et de sa sortie (pour Copilot)
      window.dispatchEvent(new CustomEvent('terminal-output', {
        detail: {
          command: cmd,
          stdout: data.stdout,
          stderr: data.stderr || data.error,
          cwd: data.newCwd || activePath,
          code: data.code
        }
      }));

      if (hasOutput && !data.stdout?.endsWith('\n')) term.write('\r\n');
      
      displayPrompt(term, data.newCwd || activePath);
      setTimeout(() => term.scrollToBottom(), 20);
    } catch (err) {
      term.write(`\r\n\x1b[31mNetwork Error: ${err.message}\x1b[0m\r\n`);
      displayPrompt(term, activePath);
    }
  };

  return (
    <div className={`terminal-container ${isMinimized ? 'minimized' : ''}`}>
      <div className="terminal-header" onClick={() => setIsMinimized(!isMinimized)}>
        <div className="terminal-title">
          <span>{isReady ? '🟢' : '🟡'} TERMINAL</span>
        </div>
        <div className="terminal-actions">
           <button style={{background:'none', border:'none', color:'#888'}}>{isMinimized ? '□' : '—'}</button>
        </div>
      </div>
      <div className={`terminal-body ${isMinimized ? 'hidden' : ''}`}>
        <div 
          ref={terminalRef} 
          className="terminal-main"
          onContextMenu={handleContextMenu}
          onClick={(e) => {
            e.stopPropagation();
            xtermRef.current?.focus();
          }}
        />
      </div>
    </div>
  );
}

export default Terminal;
