import React, { useState, useEffect } from 'react';
import { FaFile, FaFolder, FaPlus, FaTrash, FaChevronRight, FaChevronDown, FaHome } from 'react-icons/fa';
import './Sidebar.css';

function Sidebar({ files = [], currentFile, onFileSelect, onNewFile, onDeleteFile, rootPath }) {
  const [newFileName, setNewFileName] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [tree, setTree] = useState({});

  // Construire l'arborescence à partir de la liste plate
  useEffect(() => {
    if (!Array.isArray(files)) return;

    const newTree = {};
    files.forEach(pathStr => {
      let relativePath = pathStr;
      
      // Nettoyer le chemin
      if (rootPath) {
        // Normaliser les séparateurs pour la comparaison
        const normalizedRoot = rootPath.replace(/[\\\/]$/, '');
        if (pathStr.startsWith(normalizedRoot)) {
          relativePath = pathStr.slice(normalizedRoot.length).replace(/^[\\\/]/, '');
        }
      }
      
      if (!relativePath) return;

      const parts = relativePath.split(/[\\\/]/);
      let current = newTree;
      
      parts.forEach((part, index) => {
        if (!part) return;
        if (index === parts.length - 1) {
          current[part] = { type: 'file', fullPath: pathStr };
        } else {
          if (!current[part]) current[part] = { type: 'folder', children: {} };
          // Sécurité au cas où un fichier porterait le même nom qu'un dossier parent
          if (current[part].type === 'file') return; 
          current = current[part].children;
        }
      });
    });
    setTree(newTree);
  }, [files, rootPath]);

  const handleCreateFile = () => {
    if (newFileName.trim()) {
      onNewFile(newFileName.trim());
      setNewFileName('');
      setShowInput(false);
    }
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const iconMap = {
      'js': '📜', 'jsx': '⚛️', 'ts': '📘', 'tsx': '⚛️', 'py': '🐍',
      'html': '🌐', 'css': '🎨', 'json': '📋', 'md': '📝'
    };
    return iconMap[ext] || '📄';
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <FaHome size={14} />
          <span title={rootPath}>{rootPath?.split(/[\\\/]/).filter(Boolean).pop() || 'Explorateur'}</span>
        </div>
        <button 
          className="new-file-btn"
          onClick={() => setShowInput(true)}
          title="Nouveau fichier"
        >
          <FaPlus />
        </button>
      </div>

      {showInput && (
        <div className="new-file-input">
          <input
            type="text"
            placeholder="nom.ext"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateFile()}
            autoFocus
          />
          <button onClick={handleCreateFile}>✓</button>
          <button onClick={() => setShowInput(false)}>✗</button>
        </div>
      )}

      <div className="file-list tree-view">
        {Object.entries(tree || {})
          .sort(([aName, aNode], [bName, bNode]) => {
            if (aNode.type !== bNode.type) return aNode.type === 'folder' ? -1 : 1;
            return aName.localeCompare(bName);
          })
          .map(([name, node]) => (
            <TreeNode 
              key={name} 
              name={name} 
              node={node} 
              currentFile={currentFile}
              onFileSelect={onFileSelect}
              onDeleteFile={onDeleteFile}
              getFileIcon={getFileIcon}
            />
          ))}
      </div>
    </div>
  );
}

// Composant récursif pour rendre le noeud (Dossier ou Fichier)
const TreeNode = ({ name, node, currentFile, onFileSelect, onDeleteFile, getFileIcon }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (node.type === 'file') {
    const isActive = currentFile === node.fullPath;
    return (
      <div
        className={`file-item ${isActive ? 'active' : ''}`}
        onClick={() => onFileSelect(node.fullPath)}
      >
        <span className="file-icon">{getFileIcon(name)}</span>
        <span className="file-name" title={node.fullPath}>{name}</span>
        <button
          className="delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Supprimer ${name}?`)) {
              onDeleteFile(node.fullPath);
            }
          }}
        >
          <FaTrash size={10} />
        </button>
      </div>
    );
  }

  return (
    <div className="folder-container">
      <div className="folder-item" onClick={() => setIsOpen(!isOpen)}>
        <span className="folder-chevron">
          {isOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
        </span>
        <FaFolder className="folder-icon" color="#e8a87c" />
        <span className="folder-name">{name}</span>
      </div>
      {isOpen && node.children && (
        <div className="folder-children">
          {Object.entries(node.children)
            .sort(([aName, aNode], [bName, bNode]) => {
              if (aNode.type !== bNode.type) return aNode.type === 'folder' ? -1 : 1;
              return aName.localeCompare(bName);
            })
            .map(([childName, childNode]) => (
              <TreeNode 
                key={childName} 
                name={childName} 
                node={childNode}
                currentFile={currentFile}
                onFileSelect={onFileSelect}
                onDeleteFile={onDeleteFile}
                getFileIcon={getFileIcon}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
