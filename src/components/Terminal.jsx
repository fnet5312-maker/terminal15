import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './Terminal.css';

function Terminal({ onPathChange, onOpenFile }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const pathRef = useRef('');

  // Synchroniser le ref avec le state
  useEffect(() => {
    pathRef.current = currentPath;
  }, [currentPath]);

  // Fonction pour afficher le prompt
  const displayPrompt = (term, path) => {
    const displayPath = path || '~';
    // Format style Windows/PowerShell comme demandé
    term.write(`\x1b[1;36mPS\x1b[0m \x1b[1;32m${displayPath}\x1b[0m> `);
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
        
        // On récupère le chemin initial
        fetch('/api/terminal/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'cd .' })
        })
        .then(res => res.json())
        .then(data => {
          const root = data.newCwd || 'C:\\Users\\melly\\terminale15';
          setCurrentPath(root);
          displayPrompt(term, root);
        });

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        setIsReady(true);
      }
    };

    const timer = setTimeout(init, 300);

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
        processTerminalCommand(commandLine.trim(), term);
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

    return () => {
      clearTimeout(timer);
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

  const processTerminalCommand = (cmd, term) => {
    const activePath = pathRef.current;
    
    if (!cmd) {
      displayPrompt(term, activePath);
      return;
    }

    if (cmd === 'clear') {
      term.reset();
      displayPrompt(term, activePath);
      return;
    }

    // Appel Serveur
    fetch('/api/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, cwd: activePath })
    })
    .then(res => res.json())
    .then(data => {
      // 1. Mise à jour PRIORITAIRE du chemin si on a fait un cd
      if (data.newCwd && data.newCwd !== activePath) {
        setCurrentPath(data.newCwd);
        pathRef.current = data.newCwd; // Update ref immediately
        if (onPathChange) onPathChange(data.newCwd);
      }

      // 2. Ouverture d'un fichier avec chemin résolu par le serveur
      if (data.openFile && onOpenFile) {
        onOpenFile(data.openFile);
      }

      // 3. Affichage des sorties
      if (data.stdout) term.write(data.stdout.replace(/\n/g, '\r\n'));
      if (data.stderr) term.write('\r\n\x1b[31m' + data.stderr.replace(/\n/g, '\r\n') + '\x1b[0m');
      if (data.error && !data.stderr) term.write('\r\n\x1b[31mError: ' + data.error + '\x1b[0m');
      
      // Nouveau prompt (avec un saut de ligne si on a eu de la sortie)
      const hasOutput = data.stdout || data.stderr || data.error;
      if (hasOutput) {
          // Si la sortie ne finit pas par un saut de ligne, on en ajoute un
          if (data.stdout && !data.stdout.endsWith('\n')) term.write('\r\n');
          else if (!data.stdout) term.write('\r\n');
      }
      
      displayPrompt(term, data.newCwd || activePath);
      setTimeout(() => term.scrollToBottom(), 20);
    })
    .catch(err => {
      term.write(`\r\n\x1b[31mNetwork Error: ${err.message}\x1b[0m\r\n`);
      displayPrompt(term, activePath);
    });
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
