import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import Terminal from './components/Terminal';
import Copilot from './components/Copilot';
import './App.css';

function App() {
  const [currentFile, setCurrentFile] = useState('');
  const [fileList, setFileList] = useState([]);
  const [fileContents, setFileContents] = useState({});
  const [rootPath, setRootPath] = useState('');
  const [provider, setProvider] = useState('ollama');
  const [showCopilot, setShowCopilot] = useState(true);

  // 1. Charger la liste des fichiers au démarrage
  const refreshFileList = async (autoSelect = false) => {
    try {
      const res = await fetch('/api/files/list');
      const data = await res.json();
      console.log('Fichiers reçus:', data.files?.length);
      setFileList(data.files || []);
      if (data.root) setRootPath(data.root);
    } catch (err) {
      console.error('Erreur listage:', err);
    }
  };

  useEffect(() => {
    refreshFileList(true);
  }, []);

  // 2. Changer de fichier (et charger son contenu s'il n'est pas là)
  const handleFileChange = async (fileName) => {
    if (!fileName) return;

    setCurrentFile(fileName);
    
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
      const res = await fetch('/api/files/set-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath })
      });
      const data = await res.json();
      if (data.success) {
        // Obligatoire : attendre que le serveur ait fini de changer la racine
        // puis forcer un refresh immédiat
        await refreshFileList();
      }
    } catch (err) {
      console.error('Erreur sync racine:', err);
    }
  };

  // 3. Mettre à jour le code localement (sans sauvegarder sur disque immédiatement)
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
      // Optionnel: rafraîchir si c'est un nouveau fichier
      if (!fileList.includes(fileName)) refreshFileList();
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
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="ollama">Ollama (Local)</option>
            <option value="gemini">Gemini</option>
            <option value="groq">Groq</option>
          </select>
          <button onClick={() => setShowCopilot(!showCopilot)}>
            {showCopilot ? '❌' : '🤖'} Copilot
          </button>
          <button onClick={() => refreshFileList()} title="Rafraîchir les fichiers">🔄</button>
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
          />
        </div>

        {showCopilot && (
          <Copilot 
            code={fileContents[currentFile] || ''}
            fileName={currentFile}
            provider={provider}
            onCodeInsert={(code) => handleCodeChange((fileContents[currentFile] || '') + '\n' + code)}
            onFileAction={handleCreateFileWithContent}
          />
        )}
      </div>
    </div>
  );
}

export default App;
