import React, { useState, useEffect, useRef } from 'react';
import { FaFile, FaFolder, FaPlus, FaTrash, FaChevronRight, FaChevronDown, FaHome } from 'react-icons/fa';
import './Sidebar.css';

function Sidebar({ files = [], currentFile, onFileSelect, onNewFile, onNewFolder, onDeleteFile, rootPath, onPathChange }) {
  const [creationName, setCreationName] = useState('');
  const [creationType, setCreationType] = useState(null); // 'file' | 'folder'
  const [showCreationMenu, setShowCreationMenu] = useState(false);
  const [tree, setTree] = useState({});
  const creationAreaRef = useRef(null);

  // Navigation manuelle vers le haut
  const goUp = () => {
    if (!rootPath) return;

    const normalized = rootPath.replace(/[\\\/]+$/, '');

    // Cas Windows avec lettre de lecteur
    const driveMatch = normalized.match(/^([a-zA-Z]:)([\\\/]?.*)?$/);
    if (driveMatch) {
      const drive = driveMatch[1];
      const rest = (driveMatch[2] || '').replace(/^\\+|^\/+/g, '');
      const segments = rest ? rest.split(/[\\\/]/).filter(Boolean) : [];
      if (segments.length > 0) {
        segments.pop();
        const newRoot = segments.length ? `${drive}\\${segments.join('\\')}` : `${drive}\\`;
        onPathChange && onPathChange(newRoot);
      } else {
        // Déjà à la racine du lecteur, rester sur "C:\" (ou autre lettre)
        onPathChange && onPathChange(`${drive}\\`);
      }
      return;
    }

    // Cas chemins unix-like
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      const newRoot = '/' + parts.join('/');
      onPathChange && onPathChange(newRoot || '/');
    } else {
      onPathChange && onPathChange('/');
    }
  };

  // Construire l'arborescence à partir de la liste plate
  useEffect(() => {
    if (!Array.isArray(files)) return;

    const newTree = {};
    files.forEach(item => {
      // Gérer si item est un objet (nouveau format) ou une string (ancien format)
      const pathStr = typeof item === 'string' ? item : item.path;
      const isDir = typeof item === 'string' ? false : item.isDirectory;

      let relativePath = pathStr;
      
      // Nettoyer le chemin
      if (rootPath) {
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
        
        const isLast = index === parts.length - 1;

        if (isLast) {
          if (isDir) {
            if (!current[part]) current[part] = { 
              type: 'folder', 
              children: {}, 
              fullPath: pathStr, // Stocker le chemin complet
              isHeavy: item.isHeavy // Stocker l'info de dossier lourd
            };
          } else {
            current[part] = { type: 'file', fullPath: pathStr };
          }
        } else {
          const folderPath = rootPath.endsWith('\\') ? rootPath + parts.slice(0, index + 1).join('\\') : rootPath + '\\' + parts.slice(0, index + 1).join('\\');
          if (!current[part]) current[part] = { type: 'folder', children: {}, fullPath: folderPath };
          if (current[part].type === 'file') return; 
          current = current[part].children;
        }
      });
    });
    setTree(newTree);
  }, [files, rootPath]);

  const isAbsolute = (p) => /^(?:[a-zA-Z]:\\|\\|\/)/.test(p);
  const joinPath = (base, name) => {
    const sep = base.includes('\\') ? '\\' : '/';
    const cleanBase = base.replace(/[\\\/]+$/, '');
    return cleanBase ? `${cleanBase}${sep}${name}` : name;
  };

  const resolveTargetPath = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    // Si absolu, on le garde; sinon on se base sur la racine courante
    return isAbsolute(trimmed) ? trimmed : joinPath(rootPath || '', trimmed);
  };

  const handleCreate = () => {
    const target = resolveTargetPath(creationName);
    if (!target || !creationType) return;

    if (creationType === 'file') {
      onNewFile(target);
    } else if (creationType === 'folder' && onNewFolder) {
      onNewFolder(target);
    }

    setCreationName('');
    setCreationType(null);
    setShowCreationMenu(false);
  };

  // Fermer menu/panneau si clic en dehors
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!creationAreaRef.current) return;
      const isInside = creationAreaRef.current.contains(e.target);
      if (!isInside) {
        setShowCreationMenu(false);
        setCreationType(null);
        setCreationName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const iconMap = {
      'js': '📜', 'jsx': '⚛️', 'ts': '📘', 'tsx': '⚛️', 'py': '🐍',
      'html': '🌐', 'css': '🎨', 'json': '📋', 'md': '📝'
    };
    return iconMap[ext] || '📄';
  };

  const creationOpen = Boolean(creationType || showCreationMenu);

  return (
    <div className="sidebar">
      <div className="creation-area" ref={creationAreaRef}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            <button className="back-btn" onClick={goUp} title="Remonter d'un dossier"><FaChevronRight style={{transform:'rotate(180deg)'}} /></button>
            <FaHome size={14} />
            <span title={rootPath}>{rootPath?.split(/[\\\/]/).filter(Boolean).pop() || 'Explorateur'}</span>
          </div>
          <div className="new-menu-wrapper">
            <button 
              className="new-file-btn"
              onClick={() => {
                setShowCreationMenu(!showCreationMenu);
                setCreationType(null);
                setCreationName('');
              }}
              title="Nouveau..."
            >
              <FaPlus />
            </button>
            {showCreationMenu && (
              <div className="new-menu">
                <button onClick={() => { setCreationType('file'); setCreationName(''); setShowCreationMenu(false); }} className={creationType === 'file' ? 'active' : ''}>Fichier</button>
                <button onClick={() => { setCreationType('folder'); setCreationName(''); setShowCreationMenu(false); }} className={creationType === 'folder' ? 'active' : ''}>Dossier</button>
              </div>
            )}
          </div>
        </div>

        {creationType && (
          <div className="new-file-input">
            <div className="new-input-row">
              <input
                type="text"
                placeholder={creationType === 'file' ? 'nom.ext ou sous/dossier/nom.ext' : 'nouveau/dossier' }
                value={creationName}
                onChange={(e) => setCreationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setCreationType(null); setCreationName(''); }
                }}
                autoFocus
              />
              <button className="close-panel-btn" onClick={() => { setCreationType(null); setCreationName(''); setShowCreationMenu(false); }} title="Fermer">✕</button>
            </div>
            <div className="new-actions">
              <button onClick={handleCreate}>✓</button>
            </div>
          </div>
        )}
      </div>

      <div className={`file-list tree-view ${creationOpen ? 'creation-open' : ''}`}>
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
              onPathChange={onPathChange}
              getFileIcon={getFileIcon}
            />
          ))}
      </div>
    </div>
  );
}

// Composant récursif pour rendre le noeud (Dossier ou Fichier)
const TreeNode = ({ name, node, currentFile, onFileSelect, onDeleteFile, onPathChange, getFileIcon }) => {
  const [isOpen, setIsOpen] = useState(false); // Fermé par défaut pour éviter de tout charger d'un coup

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
      <div className="folder-item" onClick={() => setIsOpen(!isOpen)} onDoubleClick={() => onPathChange && onPathChange(node.fullPath)}>
        <span className="folder-chevron">
          {isOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
        </span>
        <FaFolder className="folder-icon" color={node.isHeavy ? "#8e9aaf" : "#e8a87c"} />
        <span className="folder-name" style={{ opacity: node.isHeavy ? 0.8 : 1 }} title="Double-clic pour définir comme racine">
          {name} {node.isHeavy && <span style={{ fontSize: '0.7em', fontStyle: 'italic', marginLeft: '5px' }}>(poids lourd)</span>}
        </span>
        <button 
          className="set-root-btn" 
          onClick={(e) => { e.stopPropagation(); onPathChange(node.fullPath); }}
          title="Entrer dans ce dossier"
        >
          ↵
        </button>
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
                onPathChange={onPathChange}
                getFileIcon={getFileIcon}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
