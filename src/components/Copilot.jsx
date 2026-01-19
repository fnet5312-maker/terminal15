import React, { useState, useEffect } from 'react';
import { FaPaperPlane, FaRobot, FaCode, FaLightbulb, FaFolder, FaFile } from 'react-icons/fa';
import './Copilot.css';

function Copilot({ code, fileName, fileList, rootPath, provider, onCodeInsert, onFileAction, onPathChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerStatus, setProviderStatus] = useState({});

  useEffect(() => {
    // Message de bienvenue initial
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Bonjour ! Je suis votre agent de code. Posez-moi vos questions ou demandez-moi d'effectuer des tâches sur votre projet.
        
Conseil : Utilisez le bandeau de contexte en haut pour vérifier mon emplacement actuel.`
      }]);
    }
  }, []);

  useEffect(() => {
    // Vérifier le statut des providers
    fetch('/api/copilot/status')
      .then(res => res.json())
      .then(data => setProviderStatus(data))
      .catch(err => console.error('Erreur status:', err));

    // Écouter les événements "ask-copilot"
    const handleAskCopilot = (e) => {
      const { code, fileName } = e.detail;
      askAboutCode(code, fileName);
    };

    window.addEventListener('ask-copilot', handleAskCopilot);
    return () => window.removeEventListener('ask-copilot', handleAskCopilot);
  }, []);

  const askAboutCode = (codeToAnalyze, file) => {
    const prompt = `Analyse ce code du fichier ${file} et donne-moi des suggestions d'amélioration:`;
    sendMessage(prompt, codeToAnalyze);
  };

  const sendMessage = async (message, contextCode = null, isAutoResponse = false) => {
    if (!message.trim()) return;

    if (!isAutoResponse) {
      const userMessage = { role: 'user', content: message };
      setMessages(prev => [...prev, userMessage]);
    }
    
    setInput('');
    setLoading(true);

    try {
      // Enrichir TOUJOURS le message avec le contexte du projet, même en auto-réponse
      const projectContext = `[CONTEXTE: Racine=${rootPath}, FichierActuel=${fileName}]\n`;
      const fullMessage = projectContext + (contextCode ? `${message}\n\`\`\`\n${contextCode}\n\`\`\`` : message);
      
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMessage,
          context: messages.slice(-10),
          provider
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.message || data.error);

      const aiMessage = { 
        role: 'assistant', 
        content: data.response,
        provider: data.provider
      };
      setMessages(prev => [...prev, aiMessage]);

      // --- LOGIQUE DE SÉQUENCE AUTONOME (BOUCLE DE RÉTROACTION SÉQUENTIELLE) ---
      let autoFeedback = "";
      let currentExecutingPath = rootPath;

      // Regex STRICT : On ne prend que ce qui est DANS les crochets
      // Supprime les préfixes inutiles comme "OUTIL:" ou "COMMAND:" si l'IA en ajoute par erreur
      const toolRegex = /\[(?:OUTIL|COMMAND|TAG)?[:\s]*(READ_FILE|LIST_DIR|RUN_COMMAND|CREATE_FILE|ACTION)[:\s]*([^\]]*?)\](?:\s*```[\w]*\n([\s\S]*?)```)?/gi;
      
      let match;
      while ((match = toolRegex.exec(data.response)) !== null) {
        let tag = match[1].toUpperCase();
        if (tag === "ACTION") tag = "LIST_DIR";

        const param = (match[2] || "").trim();
        const contentBlock = match[3];

        try {
          if (tag === "READ_FILE") {
            if (!param) continue;
            const res = await fetch(`/api/files/read?filePath=${encodeURIComponent(param)}`);
            const fileData = await res.json();
            autoFeedback += `\n[CONTENU DE ${param}]:\n${fileData.content || fileData.error}\n`;
          } 
          else if (tag === "LIST_DIR") {
            const dirToList = param || currentExecutingPath;
            const res = await fetch(`/api/terminal/run`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ command: `dir /b "${dirToList}"`, cwd: currentExecutingPath })
            });
            const listData = await res.json();
            window.dispatchEvent(new CustomEvent('terminal-run', { 
              detail: { command: `ls "${dirToList}"`, output: listData.stdout || listData.stderr, isSystem: true } 
            }));
            autoFeedback += `\n[LISTE DE ${dirToList}]:\n${listData.stdout || listData.stderr}\n`;
          }
          else if (tag === "CREATE_FILE") {
            if (param && contentBlock && onFileAction) {
              await onFileAction(param, contentBlock);
              autoFeedback += `\n[NOTIFICATION]: Fichier ${param} créé.\n`;
            }
          }
          else if (tag === "RUN_COMMAND") {
            if (param) {
              const res = await fetch('/api/terminal/run', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ command: param, cwd: currentExecutingPath })
              });
              const cmdData = await res.json();
              
              // Feedback ultra-précis pour forcer l'IA à apprendre de la réalité du terminal
              let terminalFeedback = "";
              if (cmdData.error || (cmdData.stderr && cmdData.code !== 0)) {
                terminalFeedback = `[ERREUR TERMINAL]: La commande "${param}" a échoué.\nErreur: ${cmdData.stderr || cmdData.error}\nPosition actuelle maintenue: ${currentExecutingPath}`;
              } else {
                terminalFeedback = `[SUCCÈS TERMINAL]: Commande "${param}" terminée.\nSortie: ${cmdData.stdout || "Opération réussie"}\n`;
                if (cmdData.newCwd) {
                  terminalFeedback += `VOTRE NOUVELLE POSITION RÉELLE: ${cmdData.newCwd}`;
                  currentExecutingPath = cmdData.newCwd;
                  if (onPathChange) onPathChange(cmdData.newCwd);
                }
              }

              window.dispatchEvent(new CustomEvent('terminal-run', { 
                detail: { command: param, output: cmdData.stdout || cmdData.stderr || cmdData.error, isSystem: true } 
              }));

              autoFeedback += `\n${terminalFeedback}\n`;
            }
          }
        } catch (e) {
          autoFeedback += `\n[ERREUR SUR ${tag}]: ${e.message}\n`;
        }
      }

      // Si l'IA a besoin de voir les résultats pour continuer sa séquence
      if (autoFeedback && messages.length < 30) {
        // Ajouter un petit délai pour que l'utilisateur voit les étapes
        setTimeout(async () => {
          await sendMessage(`[RÉSULTAT D'OUTIL]:\n${autoFeedback}\n\nAnalyse ces résultats et continue ta mission.`, null, true);
        }, 500);
      }

    } catch (error) {
      setMessages(prev => [...prev, { role: 'error', content: `Erreur: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const quickActions = [
    { 
      icon: <FaCode />, 
      label: 'Expliquer le code', 
      action: () => sendMessage(`Explique-moi ce code:\n\`\`\`\n${code}\n\`\`\``, code)
    },
    { 
      icon: <FaLightbulb />, 
      label: 'Optimiser', 
      action: () => sendMessage(`Comment puis-je optimiser ce code?\n\`\`\`\n${code}\n\`\`\``, code)
    },
    { 
      icon: <FaRobot />, 
      label: 'Ajouter des tests', 
      action: () => sendMessage(`Génère des tests unitaires pour ce code:\n\`\`\`\n${code}\n\`\`\``, code)
    }
  ];

  const getProviderStatusColor = () => {
    return providerStatus[provider] ? '#0dbc79' : '#cd3131';
  };

  const extractCode = (text) => {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = text.match(codeBlockRegex);
    if (matches) {
      return matches.map(match => 
        match.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim()
      );
    }
    return [];
  };

  return (
    <div className="copilot">
      <div className="copilot-header">
        <div className="copilot-title">
          <FaRobot />
          <span>Copilote IA</span>
        </div>
        <div className="provider-status">
          <span 
            className="status-indicator" 
            style={{ background: getProviderStatusColor() }}
          />
          <span>{provider}</span>
        </div>
      </div>

      {/* Indicateur de Contexte Dynamique */}
      <div className="context-banner">
        <div className="context-item" title={rootPath}>
          <FaFolder style={{ marginRight: '5px', color: '#e8a87c' }} />
          <span>{rootPath}</span>
        </div>
        {fileName && (
          <div className="context-item" title={fileName}>
            <FaFile style={{ marginRight: '5px', color: '#61afef' }} />
            <span>{fileName.split(/[\\\/]/).pop()}</span>
          </div>
        )}
      </div>

      <div className="quick-actions">
        {quickActions.map((action, idx) => (
          <button 
            key={idx} 
            onClick={action.action}
            disabled={loading || !code}
            title={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome-message">
            <FaRobot size={40} />
            <p>Bonjour! Je suis votre copilote IA.</p>
            <p>Posez-moi des questions sur votre code!</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-header">
              {msg.role === 'user' ? '👤' : msg.role === 'error' ? '⚠️' : '🤖'}
              <span>{msg.role === 'user' ? 'Vous' : msg.role === 'error' ? 'Erreur' : `IA (${msg.provider || provider})`}</span>
            </div>
            <div className="message-content">
              {msg.content.split('```').map((part, i) => {
                if (i % 2 === 1) {
                  // Code block
                  const lines = part.split('\n');
                  const lang = lines[0];
                  const codeContent = lines.slice(1).join('\n');
                  return (
                    <div key={i} className="code-block">
                      <div className="code-header">
                        <span>{lang || 'code'}</span>
                        <button onClick={() => onCodeInsert(codeContent)}>
                          Insérer
                        </button>
                      </div>
                      <pre><code>{codeContent}</code></pre>
                    </div>
                  );
                }
                return <p key={i}>{part}</p>;
              })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant loading">
            <div className="message-header">
              <span>🤖 IA ({provider})</span>
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Posez une question..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          <FaPaperPlane />
        </button>
      </form>
    </div>
  );
}

export default Copilot;
