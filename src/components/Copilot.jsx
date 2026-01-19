import React, { useState, useEffect } from 'react';
import { FaPaperPlane, FaRobot, FaCode, FaLightbulb } from 'react-icons/fa';
import './Copilot.css';

function Copilot({ code, fileName, provider, onCodeInsert, onFileAction }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerStatus, setProviderStatus] = useState({});

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

  const sendMessage = async (message, contextCode = null) => {
    if (!message.trim()) return;

    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contextCode ? `${message}\n\`\`\`\n${contextCode}\n\`\`\`` : message,
          context: messages,
          provider
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.message || data.error);
      }

      const aiMessage = { 
        role: 'assistant', 
        content: data.response,
        provider: data.provider
      };
      setMessages(prev => [...prev, aiMessage]);

      // Analyse de l'action de création de fichier
      const createFileRegex = /\[CREATE_FILE:\s*(.*?)\]\s*```[\w]*\n([\s\S]*?)```/g;
      let match;
      while ((match = createFileRegex.exec(data.response)) !== null) {
        const newFileName = match[1].trim();
        const content = match[2];
        if (newFileName && onFileAction) {
          onFileAction(newFileName, content);
        }
      }

      // Analyse de l'action d'exécution de commande
      const runCommandRegex = /\[RUN_COMMAND:\s*(.*?)\]/g;
      let cmdMatch;
      while ((cmdMatch = runCommandRegex.exec(data.response)) !== null) {
        const command = cmdMatch[1].trim();
        if (command) {
          console.log('🚀 Commande détectée par le copilote:', command);
          const event = new CustomEvent('terminal-run', { 
            detail: { command, provider: data.provider || provider } 
          });
          window.dispatchEvent(event);
        }
      }
    } catch (error) {
      const errorMessage = { 
        role: 'error', 
        content: `Erreur: ${error.message}` 
      };
      setMessages(prev => [...prev, errorMessage]);
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
