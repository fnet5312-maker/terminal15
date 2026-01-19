import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import Terminal from './components/Terminal';
import Copilot from './components/Copilot';
import './App.css';

function App() {
  const [currentFile, setCurrentFile] = useState(localStorage.getItem('lastFile') || '');
  const [fileList, setFileList] = useState([]);
  const [fileContents, setFileContents] = useState({});
  const [rootPath, setRootPath] = useState(localStorage.getItem('lastRoot') || 'C:\\');
  const [provider, setProvider] = useState(localStorage.getItem('aiProvider') || 'ollama');
  const [showCopilot, setShowCopilot] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. Charger la liste des fichiers au démarrage
  const refreshFileList = async (autoSelect = false) => {
    setIsRefreshing(true);
    try {
      // Synchroniser la racine stockée avec le backend au démarrage
      const savedRoot = localStorage.getItem('lastRoot') || rootPath;
      
      await fetch('/api/files/set-root', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPath: savedRoot })
      });

      const res = await fetch('/api/files/list');
      const data = await res.json();
      
      setFileList(data.files || []);
      if (data.root) {
          setRootPath(data.root);
          localStorage.setItem('lastRoot', data.root);
      }

      // Restaurer le dernier fichier ouvert s'il existe toujours
      const lastFile = localStorage.getItem('lastFile');
      if (lastFile && !currentFile) {
          handleFileChange(lastFile);
      } else if (currentFile) {
          // Rafraîchir le contenu du fichier actuel
          const fileRes = await fetch(`/api/files/read?filePath=${encodeURIComponent(currentFile)}`);
          const fileData = await fileRes.json();
          if (!fileData.error) {
            setFileContents(prev => ({ 
              ...prev, 
              [currentFile]: fileData.content || '' 
            }));
          }
      }
    } catch (err) {
      console.error('Erreur listage:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    refreshFileList(true);
  }, []);

  // 2. Changer de fichier
  const handleFileChange = async (fileName) => {
    if (!fileName) return;

    setCurrentFile(fileName);
    localStorage.setItem('lastFile', fileName);
    
    try {
      const res = await fetch(`/api/files/read?filePath=${encodeURIComponent(fileName)}`);
      const data = await res.json();
      
      if (data.error) {
        console.error('Erreur lecture:', data.error);
        return;
      }
      
      setFileContents(prev => ({ 
        ...prev, 
        [fileName]: data.content || '' 
      }));
      
    } catch (err) {
      console.error('Erreur lecture:', err);
    }
  };

  // Synchroniser la racine du projet quand le terminal change de dossier
  const handleRootChange = async (newPath) => {
    try {
      if (newPath === rootPath) return; // Éviter les boucles infinies
      
      setRootPath(newPath);
      localStorage.setItem('lastRoot', newPath);
      
      const res = await fetch('/api/files/set-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath })
      });
      const data = await res.json();
      if (data.success) {
        await refreshFileList();
      }
    } catch (err) {
      console.error('Erreur sync racine:', err);
    }
  };

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    localStorage.setItem('aiProvider', newProvider);
  };

  // 3. Mettre à jour le code localement
  const handleCodeChange = (newCode) => {
    setFileContents(prev => ({
      ...prev,
      [currentFile]: newCode
    }));
  };

  // 4. Sauvegarder explicitement sur le disque
  const handleSaveFile = async (fileName, content) => {
    try {
      await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: fileName, content: content })
      });
      if (!fileList.some(f => (typeof f === 'string' ? f : f.path) === fileName)) {
        refreshFileList();
      }
    } catch (err) {
      console.error('Erreur sauvegarde:', err);
    }
  };

  const handleNewFile = async (fileName) => {
    try {
      await handleSaveFile(fileName, '');
      await refreshFileList();
      handleFileChange(fileName);
    } catch (err) {
      console.error('Erreur creation:', err);
    }
  };

  const handleCreateFileWithContent = async (fileName, content) => {
    try {
      await handleSaveFile(fileName, content);
      await refreshFileList();
      handleFileChange(fileName);
    } catch (err) {
      console.error('Erreur creation IA:', err);
    }
  };

  const handleDeleteFile = async (fileName) => {
    try {
      await fetch(`/api/files/delete?filePath=${encodeURIComponent(fileName)}`, {
        method: 'DELETE'
      });
      await refreshFileList();
      if (currentFile === fileName) {
        setCurrentFile('');
      }
    } catch (err) {
      console.error('Erreur suppression:', err);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <h1>🚀 Web IDE with AI Copilot</h1>
        <div className="provider-selector">
          <label>AI Provider:</label>
          <select value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
            <option value="ollama">Ollama (Local)</option>
            <option value="gemini">Gemini</option>
            <option value="groq">Groq</option>
          </select>
          <button onClick={() => setShowCopilot(!showCopilot)}>
            {showCopilot ? '❌' : '🤖'} Copilot
          </button>
          <button 
            onClick={() => refreshFileList()} 
            className={isRefreshing ? 'refresh-loading' : ''}
            title="Rafraîchir les fichiers"
          >
            🔄
          </button>
        </div>
      </div>
      
      <div className="main-container">
        <Sidebar 
          files={fileList}
          currentFile={currentFile}
          onFileSelect={handleFileChange}
          onNewFile={handleNewFile}
          onDeleteFile={handleDeleteFile}
          rootPath={rootPath}
        />
        
        <div className="content">
          <Editor 
            code={fileContents[currentFile] || ''}
            fileName={currentFile}
            onChange={handleCodeChange}
            onSave={(content) => handleSaveFile(currentFile, content)}
            provider={provider}
          />
          
          <Terminal 
            onPathChange={handleRootChange}
            onOpenFile={handleFileChange}
            initialPath={rootPath}
          />
        </div>

        {showCopilot && (
          <Copilot 
            code={fileContents[currentFile] || ''}
            fileName={currentFile}
            fileList={fileList}
            rootPath={rootPath}
            provider={provider}
            onCodeInsert={(code) => handleCodeChange((fileContents[currentFile] || '') + '\n' + code)}
            onFileAction={handleCreateFileWithContent}
            onPathChange={handleRootChange}
          />
        )}
      </div>
    </div>
  );
}

export default App;
