import React, { useState, useEffect } from 'react';
import { FaPaperPlane, FaRobot, FaCode, FaLightbulb, FaFolder, FaFile, FaStop, FaTerminal } from 'react-icons/fa';
import './Copilot.css';

function Copilot({ code, fileName, fileList, rootPath, provider, onCodeInsert, onFileAction, onPathChange, onRefresh }) {
  // --- NOUVELLE GESTION DE LA PERSISTANCE ET MULTI-CONVERSATIONS ---
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('ide_conversations');
    return saved ? JSON.parse(saved) : [{ id: Date.now(), title: 'Nouvelle discussion', messages: [] }];
  });
  
  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem('ide_active_conversation_id');
    return saved ? parseInt(saved) : (conversations[0]?.id || Date.now());
  });

  const activeChat = conversations.find(c => c.id === activeId) || conversations[0];
  const messages = activeChat.messages;

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
    const [planApproved, setPlanApproved] = useState(false);
    const [planPending, setPlanPending] = useState(false);
    const [pendingToolResponse, setPendingToolResponse] = useState(null);
  const [lastCommand, setLastCommand] = useState('');
  const [providerStatus, setProviderStatus] = useState({});
  const [terminalHistory, setTerminalHistory] = useState([]);
  const [pendingCommand, setPendingCommand] = useState(null); // {command, cwd}
  const [typingTargetIndex, setTypingTargetIndex] = useState(-1);
  const [typedText, setTypedText] = useState('');

  // Référence pour arrêter les boucles asynchrones immédiatement
  const stopRef = React.useRef(false);
  const abortControllerRef = React.useRef(null);
  const askCopilotHandlerRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);
  const messagesRef = React.useRef(null);

  // Sauvegarde automatique dans localStorage
  useEffect(() => {
    localStorage.setItem('ide_conversations', JSON.stringify(conversations));
    localStorage.setItem('ide_active_conversation_id', activeId.toString());
  }, [conversations, activeId]);

  useEffect(() => {
    // Message de bienvenue si vide
    if (messages.length === 0) {
      updateActiveMessages([{
        role: 'assistant',
        content: `Bonjour ! Je suis votre agent de code. Posez-moi vos questions ou demandez-moi d'effectuer des tâches sur votre projet.
        
Conseil : Utilisez le bandeau de contexte en haut pour vérifier mon emplacement actuel.`
      }]);
    }
  }, [activeId]);

  const updateActiveMessages = (newMessages) => {
    setConversations(prev => prev.map(c => 
      c.id === activeId ? { ...c, messages: typeof newMessages === 'function' ? newMessages(c.messages) : newMessages } : c
    ));
  };

  const createNewChat = () => {
    const newId = Date.now();
    const newChat = { id: newId, title: `Discussion ${conversations.length + 1}`, messages: [] };
    setConversations(prev => [...prev, newChat]);
    setActiveId(newId);
  };

  const deleteChat = (e, id) => {
    e.stopPropagation();
    if (conversations.length === 1) return;
    const newConvs = conversations.filter(c => c.id !== id);
    setConversations(newConvs);
    if (activeId === id) setActiveId(newConvs[0].id);
  };
  // -----------------------------------------------------------

  useEffect(() => {
    // Vérifier le statut des providers
    fetch('/api/copilot/status')
      .then(res => res.json())
      .then(data => setProviderStatus(data))
      .catch(err => console.error('Erreur status:', err));

    // Écouter les sorties du terminal pour enrichir le contexte
    const handleTerminalOutput = (e) => {
      const { command, stdout, stderr, cwd } = e.detail;
      setTerminalHistory(prev => {
        // Augmentation de la limite de capture pour permettre à l'IA de voir plus de résultats (ex: liste de fichiers)
        // 500 chars était trop peu pour un 'dir' ou 'ls' récursif
        const newEntry = { command, stdout: stdout?.slice(0, 2000), stderr: stderr?.slice(0, 2000), cwd, timestamp: Date.now() };
        // Garder seulement les 5 dernières entrées pour ne pas surcharger le contexte
        return [...prev, newEntry].slice(-5);
      });
    };

    window.addEventListener('terminal-output', handleTerminalOutput);

    return () => {
      window.removeEventListener('terminal-output', handleTerminalOutput);
    };
  }, []);

  // Scroll automatique vers le bas à chaque nouveau message ou pendant le chargement
  useEffect(() => {
    const scrollToBottom = () => {
      const el = messagesRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    };

    const raf1 = requestAnimationFrame(scrollToBottom);
    const raf2 = requestAnimationFrame(scrollToBottom);
    const timer = setTimeout(scrollToBottom, 80);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  }, [messages, loading, planPending, pendingCommand, typedText]);

  useEffect(() => {
    setPlanApproved(false);
    setPlanPending(false);
    setPendingCommand(null);
    setPendingToolResponse(null);
    setTypingTargetIndex(-1);
    setTypedText('');
  }, [activeId]);

  useEffect(() => {
    if (planApproved && pendingToolResponse) {
      const toRun = pendingToolResponse;
      setPendingToolResponse(null);
      setPlanPending(false);
      handleTools(toRun, true).finally(() => {
        setPlanApproved(false);
      });
    }
  }, [planApproved, pendingToolResponse]);

  // Effet de saisie progressive pour le dernier message assistant
  useEffect(() => {
    const lastAssistantIndex = [...messages].map((m, i) => ({ m, i })).filter(x => x.m.role === 'assistant').pop()?.i ?? -1;
    if (lastAssistantIndex === -1) {
      setTypingTargetIndex(-1);
      setTypedText('');
      return;
    }

    const content = messages[lastAssistantIndex].content || '';
    setTypingTargetIndex(lastAssistantIndex);
    setTypedText('');

    let i = 0;
    const speed = 8; // ms per char
    const timer = setInterval(() => {
      i += 1;
      setTypedText(content.slice(0, i));
      if (i >= content.length) {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [messages]);

  const askAboutCode = (codeToAnalyze, file) => {
    const prompt = `Analyse ce code du fichier ${file} et donne-moi des suggestions d'amélioration:`;
    sendMessage(prompt, codeToAnalyze);
  };

  const sendMessage = async (message, contextCode = null, isAutoResponse = false) => {
    if (!message.trim()) return;

    if (!isAutoResponse) {
      // Message utilisateur normal -> On l'affiche tout de suite
      // NOTE: Le filtrage des messages système se fait plus bas pour l'appel API mais ici on gère l'affichage immédiat
      if (!message.startsWith('[RÉSULTAT DU TERMINAL]:')) {
          const userMsgObj = { role: 'user', content: message };
          updateActiveMessages(prev => [...prev, userMsgObj]);
      } else {
         // C'est un message système interne, on l'ajoute avec un rôle spécial invisible ou discret
         const sysMsgObj = { role: 'system_log', content: "🔄 Analyse du résultat terminal..." };
         updateActiveMessages(prev => [...prev, sysMsgObj]);
      }
      
      stopRef.current = false;
      setIsStopping(false);
      abortControllerRef.current = new AbortController();
    } else {
       // Message automatique (boucle) -> Log discret
       const sysMsgObj = { role: 'system_log', content: "🔄 Analyse de la suite..." };
       updateActiveMessages(prev => [...prev, sysMsgObj]);
    }
    
    setInput('');
    setLoading(true);

    try {
      if (stopRef.current) throw new Error("Interrompu");

      // Vérifier si un arrêt a été demandé avant de commencer
      if (stopRef.current) {
        setLoading(false);
        setIsStopping(false);
        return;
      }

      // PRÉPARATION DU RÉSUMÉ DES AUTRES DISCUSSIONS (Limité aux 10 dernières pour économiser les tokens)
      const otherChatsSummary = conversations
        .filter(c => c.id !== activeId)
        .slice(-10)
        .map(c => {
          const lastUserMsg = [...c.messages].reverse().find(m => m.role === 'user');
          return `- [ID:${c.id}] "${c.title}": ${lastUserMsg ? lastUserMsg.content.slice(0, 80) : 'Pas encore de messages'}`;
        })
        .join('\n');

      // Préparation de l'historique terminal (limité aux 8 dernières actions pour donner plus de contexte)
      const terminalContext = terminalHistory.length > 0 
        ? terminalHistory.slice(-8).map(h => {
          // Augmentation significative de la limite pour éviter la "cécité" de l'IA sur les gros resultats
          const MAX_CHARS = 10000;
          const out = h.stdout ? (h.stdout.length > MAX_CHARS ? h.stdout.slice(0, MAX_CHARS) + `\n... [TRONQUÉ: Reste ${h.stdout.length - MAX_CHARS} caractères]` : h.stdout) : '';
          const err = h.stderr ? (h.stderr.length > MAX_CHARS ? h.stderr.slice(0, MAX_CHARS) + `\n... [TRONQUÉ: Reste ${h.stderr.length - MAX_CHARS} caractères]` : h.stderr) : '';
          return `> ${h.command}\n${out}${err ? '\nERR: ' + err : ''}`;
        }).join('\n---\n')
        : "Aucune commande exécutée récemment.";

      const guardrails = `
[REGLES_GARDES_FOU]
- Demande explicitement toute information manquante (clés API, cible de déploiement, choix stack) au lieu d'inventer.
- Ne jamais inventer de valeurs ou de chemins inconnus; si inconnu, dire "inconnu" et demander à l'utilisateur.
- Mode plan par défaut: propose un plan clair, attends la validation explicite avant d'exécuter des actions.
- Avant git commit/push, déploiement ou action destructrice, demander validation.
- Respecte strictement la consigne utilisateur, ne pas ajouter de tâches non demandées.
- Quand la tâche est terminée, annoncer "Tâche accomplie" avec un bref récap et s'arrêter.
`;

      // Enrichir TOUJOURS le message avec le contexte du projet et des autres discussions
      const projectContext = [
        guardrails,
        '[CONTEXTE_SYSTEME]',
        `Racine: ${rootPath}`,
        `Fichier actuel: ${fileName}`,
        '[DERNIÈRES_SORTIES_TERMINAL]:',
        terminalContext,
        '[AUTRES_DISCUSSIONS_RÉSUMÉ]:',
        otherChatsSummary
      ].join('\n');

      // Limiter l'historique envoyé à l'API pour éviter la surcharge
      const conversationHistory = messages.slice(-30);

      // La variable 'fullMessage' contient tout le contexte pour l'API.
      let fullMessage = `${projectContext}\n\n[MESSAGE_UTILISATEUR]:\n${message}`;
      if (contextCode) {
        fullMessage += `\n\n[CODE_SÉLECTIONNÉ]:\n${contextCode}`;
      }

      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({
          message: fullMessage,
          context: conversationHistory,
          provider
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.message || data.error);

      if (stopRef.current) throw new Error("Interrompu");

      const aiMessage = { 
        role: 'assistant', 
        content: data.response,
        provider: data.provider
      };
      updateActiveMessages(prev => [...prev, aiMessage]);

      if (activeChat.title === 'Nouvelle discussion' && !isAutoResponse) {
        setConversations(prev => prev.map(c => 
          c.id === activeId ? { ...c, title: message.slice(0, 30) + (message.length > 30 ? '...' : '') } : c
        ));
      }

      await handleTools(data.response, isAutoResponse);

    } catch (error) {
      if (error.name === 'AbortError' || error.message === "Interrompu") {
        updateActiveMessages(prev => [...prev, { role: 'assistant', content: "[PROCESSUS INTERROMPU]" }]);
      } else {
        updateActiveMessages(prev => [...prev, { role: 'error', content: `Erreur: ${error.message}` }]);
      }
    } finally {
      if (!isAutoResponse || !stopRef.current) {
        setLoading(false);
      }
      if (stopRef.current) {
        setIsStopping(false);
        setLoading(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleStop = () => {
    stopRef.current = true;
    setIsStopping(true);
    setLoading(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const sendToTerminal = (text) => {
    if (!text || !text.trim()) return;
    window.dispatchEvent(new CustomEvent('terminal-run', {
      detail: { command: text.trim(), output: null, isSystem: false }
    }));
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

  const runPendingCommand = async () => {
    if (!pendingCommand) return;
    const { command, cwd } = pendingCommand;
    setPendingCommand(null);
    try {
      const res = await fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: cwd || rootPath })
      });
      const cmdData = await res.json();

      window.dispatchEvent(new CustomEvent('terminal-run', {
        detail: {
          command,
          output: cmdData.stdout || cmdData.stderr || cmdData.error,
          isSystem: true
        }
      }));

      window.dispatchEvent(new CustomEvent('terminal-output', {
        detail: {
          command,
          stdout: cmdData.stdout,
          stderr: cmdData.stderr || cmdData.error,
          cwd: cmdData.newCwd || cwd || rootPath,
          code: cmdData.code
        }
      }));

      if (cmdData.newCwd && onPathChange) onPathChange(cmdData.newCwd);
      if (onRefresh) onRefresh();

      const feedback = cmdData.error || cmdData.stderr
        ? `[ERREUR TERMINAL]:\n${cmdData.stderr || cmdData.error}`
        : `[STDOUT]:\n${cmdData.stdout || 'Succès.'}`;

      updateActiveMessages(prev => [...prev, { role: 'assistant', content: `[COMMANDE VALIDÉE]: ${command}\n${feedback}` }]);
    } catch (e) {
      updateActiveMessages(prev => [...prev, { role: 'error', content: `Erreur pendant l'exécution validée: ${e.message}` }]);
    }
  };

  const cancelPendingCommand = () => {
    if (!pendingCommand) return;
    updateActiveMessages(prev => [...prev, { role: 'assistant', content: `[COMMANDE ANNULÉE] Aucune exécution: ${pendingCommand.command}` }]);
    setPendingCommand(null);
  };

  // --- OUTIL: EXÉCUTION DES TAGS IA ---
  const handleTools = async (responseText, isAutoResponse = false) => {
    let autoFeedback = "";
    let currentExecutingPath = rootPath;
    let planBlocked = false;

    const toolRegex = new RegExp("\\[(RUN_COMMAND|CREATE_FILE)\\s*:\\s*([^\\]]+)\\]", "gi");

    let match;
    while ((match = toolRegex.exec(responseText)) !== null) {
      if (stopRef.current) {
        autoFeedback += "\n[PROCESSUS INTERROMPU PAR L'UTILISATEUR]\n";
        break;
      }

      const tag = match[1].toUpperCase();
      const param = match[2].trim();
      let contentBlock = null;

      const remainingText = responseText.slice(toolRegex.lastIndex);
      const codeBlockRegex = new RegExp("^\\s*```[\\w]*\\n([\\s\\S]*?)```", "m");
      const codeBlockMatch = remainingText.match(codeBlockRegex);
      if (codeBlockMatch) {
        contentBlock = codeBlockMatch[1];
        toolRegex.lastIndex += codeBlockMatch[0].length;
      }

      try {
        if (!planApproved) {
          planBlocked = true;
          autoFeedback += "\n[MODE PLAN ACTIF] Aucun outil exécuté. Valide le plan puis relance l'exécution.\n";
          break;
        }

        if (tag === "CREATE_FILE") {
          if (param && contentBlock && onFileAction) {
            await onFileAction(param, contentBlock);
            autoFeedback += `\n[ACTION RÉUSSIE]: Fichier ${param} créé/modifié via l'éditeur.\n`;
          }
        } else if (tag === "RUN_COMMAND") {
          if (param) {
            if (stopRef.current) break;

            const isDangerous = /\b(rm|rmdir|del|erase|move|mv|rename|ren|rd|remove-item|move-item|git\s+(push|commit|tag|rebase|reset|checkout)|deploy|vercel|netlify|render|flyctl|docker\s+push|kubectl|helm|gcloud|az\s+webapp)\b/i.test(param);
            if (isDangerous) {
              setPendingCommand({ command: param, cwd: currentExecutingPath });
              autoFeedback += `\n[EN ATTENTE DE VALIDATION]: ${param}\n`;
              continue;
            }

            if (param === lastCommand && isAutoResponse) {
              autoFeedback += `\n[ATTENTION]: Tu répètes exactement la même commande : "${param}". Essaie une approche différente.\n`;
            } else {
              setLastCommand(param);
              const res = await fetch('/api/terminal/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortControllerRef.current?.signal,
                body: JSON.stringify({ command: param, cwd: currentExecutingPath })
              });
              const cmdData = await res.json();

              if (stopRef.current) break;

              let terminalFeedback = "";
              if (cmdData.error || (cmdData.stderr && cmdData.code !== 0)) {
                terminalFeedback = `[TERMINAL ERROR]:\n${cmdData.stderr || cmdData.error}\n`;
              } else {
                terminalFeedback = `[STDOUT]:\n${cmdData.stdout || "Succès."}\n`;
                if (cmdData.newCwd) {
                  terminalFeedback += `VOTRE POSITION RÉELLE: ${cmdData.newCwd}\n`;
                  currentExecutingPath = cmdData.newCwd;
                  if (onPathChange) onPathChange(cmdData.newCwd);
                }
                if (cmdData.openFile) {
                  window.dispatchEvent(new CustomEvent('open-file-in-editor', {
                    detail: { filePath: cmdData.openFile }
                  }));
                }
                if (cmdData.closeEditor) {
                  window.dispatchEvent(new CustomEvent('close-file-in-editor'));
                }
              }

              window.dispatchEvent(new CustomEvent('terminal-run', {
                detail: { command: param, output: cmdData.stdout || cmdData.stderr || cmdData.error, isSystem: true }
              }));

              window.dispatchEvent(new CustomEvent('terminal-output', {
                detail: {
                  command: param,
                  stdout: cmdData.stdout,
                  stderr: cmdData.stderr || cmdData.error,
                  cwd: cmdData.newCwd || currentExecutingPath,
                  code: cmdData.code
                }
              }));

              if (onRefresh) onRefresh();
              autoFeedback += `\n${terminalFeedback}\n`;
            }
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        autoFeedback += `\n[ERREUR SYSTÈME]: ${e.message}\n`;
      }
    }

    if (planBlocked) {
      setPlanPending(true);
      setPendingToolResponse(responseText);
      updateActiveMessages(prev => [...prev, { role: 'assistant', content: "Mode plan actif: aucun outil exécuté. Clique sur 'Approuver le plan' pour lancer le plan." }]);
      return;
    }

    setPendingToolResponse(null);
    setPlanPending(false);

    if (autoFeedback && messages.length < 50 && !stopRef.current) {
      setTimeout(async () => {
        if (!stopRef.current) {
          await sendMessage(`[RÉSULTAT DU TERMINAL]:\n${autoFeedback}\n\nPrends quelques secondes pour analyser ce retour, vérifie les erreurs éventuelles, et déduis la prochaine étape logique.`, null, true);
        }
      }, 2000);
    }

    if (stopRef.current) {
      setIsStopping(false);
    }
  };

  const approvePlan = () => {
    setPlanApproved(true);
    updateActiveMessages(prev => [...prev, { role: 'assistant', content: '[PLAN APPROUVÉ] Exécution en cours des étapes validées.' }]);
  };

  const resetPlan = () => {
    setPlanApproved(false);
    setPlanPending(false);
    setPendingCommand(null);
    setPendingToolResponse(null);
    updateActiveMessages(prev => [...prev, { role: 'assistant', content: '[PLAN REJETÉ] Aucun outil ou commande ne sera exécuté.' }]);
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

      {/* GESTIONNAIRE DE CONVERSATIONS */}
      <div className="chats-manager">
        <div className="chats-list">
          {conversations.map(chat => (
            <div 
              key={chat.id} 
              className={`chat-tab ${chat.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(chat.id)}
            >
              <span className="chat-tab-title">{chat.title}</span>
              {conversations.length > 1 && (
                <button className="delete-chat" onClick={(e) => deleteChat(e, chat.id)}>×</button>
              )}
            </div>
          ))}
        </div>
        <button className="new-chat-btn" onClick={createNewChat} title="Nouvelle discussion">+</button>
      </div>

      {/* Indicateur de Contexte Dynamique */}
      <div className="context-banner">
        <div className="context-item" title={rootPath}>
          <FaFolder style={{ marginRight: '5px', color: '#e8a87c' }} />
          <span>{rootPath}</span>
        </div>
        {fileName ? (
          <div className="context-item" title={fileName}>
            <FaFile style={{ marginRight: '5px', color: '#61afef' }} />
            <span>{fileName.split(/[\\\/]/).pop()}</span>
          </div>
        ) : (
          <div className="context-item" style={{ fontStyle: 'italic', color: '#666' }}>
            Aucun fichier ouvert
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

      <div className="messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="welcome-message">
            <FaRobot size={40} />
            <p>Bonjour! Je suis votre copilote IA.</p>
            <p>Posez-moi des questions sur votre code!</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isAssistant = msg.role === 'assistant';
          const display = isAssistant && typingTargetIndex === idx && typedText.length > 0 && typedText.length < (msg.content || '').length
            ? typedText
            : msg.content;
          const cleaned = (display || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

          return (
            <div key={idx} className={`message ${msg.role} ${isAssistant ? 'assistant-plain' : ''}`}>
              <div className="message-header">
                {msg.role === 'user' ? '👤' : msg.role === 'error' ? '⚠️' : '🤖'}
                <span>{msg.role === 'user' ? 'Vous' : msg.role === 'error' ? 'Erreur' : `IA (${msg.provider || provider})`}</span>
              </div>
              <div className="message-content">
                {cleaned.split('```').map((part, i) => {
                  if (i % 2 === 1) {
                    const lines = part.split('\n');
                    const lang = lines[0];
                    const codeContent = lines.slice(1).join('\n');
                    return (
                      <div key={i} className="code-block">
                        <div className="code-header">
                          <span>{lang || 'code'}</span>
                          <div className="code-actions">
                            <button onClick={() => onCodeInsert(codeContent)}>
                              Vers éditeur
                            </button>
                            <button onClick={() => sendToTerminal(codeContent)}>
                              Vers terminal
                            </button>
                          </div>
                        </div>
                        <pre><code>{codeContent}</code></pre>
                      </div>
                    );
                  }
                  return part ? <p key={i}>{part}</p> : null;
                })}
              </div>
            </div>
          );
        })}

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
        {planPending && (
          <div className="plan-panel inline-panel">
            <div className="plan-text">Mode plan : approuve pour exécuter.</div>
            <div className="plan-actions">
              <button onClick={approvePlan} className="plan-confirm">Approuver</button>
              <button onClick={resetPlan} className="plan-reset">Rejeter</button>
            </div>
          </div>
        )}
        {pendingCommand && (
          <div className="danger-panel inline-panel">
            <div className="danger-text">Commande sensible en attente :</div>
            <div className="danger-command">{pendingCommand.command}</div>
            <div className="danger-actions">
              <button onClick={runPendingCommand} className="danger-confirm">Confirmer</button>
              <button onClick={cancelPendingCommand} className="danger-cancel">Annuler</button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? "L'IA travaille..." : "Posez une question..."}
          disabled={loading}
        />
        {loading ? (
          <button type="button" className="stop-btn" onClick={handleStop} title="Arrêter l'IA">
            <FaStop />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            <FaPaperPlane />
          </button>
        )}
      </form>
    </div>
  );
}

export default Copilot;
