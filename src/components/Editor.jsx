import React, { useState, useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { FaSave, FaRobot, FaTimes } from 'react-icons/fa';
import './Editor.css';

function Editor({ code, fileName, openFiles = [], onChange, onSave, onFileSelect, onCloseFile, provider, rootPath }) {
  const [saved, setSaved] = useState(true);
  const [selectionText, setSelectionText] = useState('');
  const [showSelectionActions, setShowSelectionActions] = useState(false);
  const [selectionCollapsed, setSelectionCollapsed] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 12, right: 14, left: null });
  const editorViewRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, offsetX: 0, offsetY: 0, contentRect: null });
  const contentRef = useRef(null);

  const getRelativePath = (fullPath) => {
    if (!fullPath || !rootPath) return fullPath;
    const normalizedRoot = rootPath.replace(/[\\\/]$/, '');
    if (fullPath.startsWith(normalizedRoot)) {
      return fullPath.slice(normalizedRoot.length).replace(/^[\\\/]/, '');
    }
    return fullPath;
  };

  // Gérer la sauvegarde par raccourci Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (onSave) {
          onSave(code);
          setSaved(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, fileName, onSave]);

  const getLanguageExtension = () => {
    const ext = fileName.split('.').pop();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return [javascript({ jsx: true })];
      case 'py':
        return [python()];
      case 'html':
        return [html()];
      case 'css':
        return [css()];
      case 'json':
        return [json()];
      default:
        return [javascript()];
    }
  };

  const handleChange = (value) => {
    onChange(value);
    setSaved(false);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(code);
      setSaved(true);
    }
  };

  const handleAskCopilot = () => {
    // Déclencher le copilote
    const event = new CustomEvent('ask-copilot', { 
      detail: { code, fileName, provider } 
    });
    window.dispatchEvent(event);
  };

  const handleSelectionAction = (actionKey) => {
    if (!selectionText.trim()) return;
    const event = new CustomEvent('ask-copilot', {
      detail: { code: selectionText, fileName, provider, action: actionKey }
    });
    window.dispatchEvent(event);
  };

  const handleSelectionUpdate = (viewUpdate) => {
    if (!editorViewRef.current) {
      editorViewRef.current = viewUpdate.view;
    }
    const hadSelection = selectionText.length > 0 && showSelectionActions;
    const sel = viewUpdate.state.selection.main;
    if (!sel || sel.empty) {
      if (selectionText) setSelectionText('');
      if (showSelectionActions) setShowSelectionActions(false);
      if (selectionCollapsed) setSelectionCollapsed(false);
      return;
    }
    const text = viewUpdate.state.sliceDoc(sel.from, sel.to);
    setSelectionText(text);
    if (!showSelectionActions) setShowSelectionActions(true);
    if (!hadSelection) setSelectionCollapsed(false);
  };

  useEffect(() => {
    setSelectionText('');
    setShowSelectionActions(false);
    setSelectionCollapsed(false);
    setPanelPosition({ top: 12, right: 14, left: null });
  }, [fileName]);

  useEffect(() => {
    const handleMove = (e) => {
      const drag = dragStateRef.current;
      if (!drag.dragging || !drag.contentRect) return;
      const { contentRect, offsetX, offsetY } = drag;
      const rawLeft = e.clientX - contentRect.left - offsetX;
      const rawTop = e.clientY - contentRect.top - offsetY;
      const clampedLeft = Math.max(4, Math.min(rawLeft, contentRect.width - 90));
      const clampedTop = Math.max(4, Math.min(rawTop, contentRect.height - 50));
      setPanelPosition((pos) => ({ ...pos, top: clampedTop, left: clampedLeft, right: null }));
    };

    const handleUp = () => {
      if (dragStateRef.current.dragging) {
        dragStateRef.current = { dragging: false, offsetX: 0, offsetY: 0, contentRect: null };
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleDragStart = (e) => {
    if (!selectionCollapsed || !contentRef.current) return;
    if (e.target.closest('button')) return;
    const contentRect = contentRef.current.getBoundingClientRect();
    const panelRect = e.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      dragging: true,
      offsetX: e.clientX - panelRect.left,
      offsetY: e.clientY - panelRect.top,
      contentRect,
    };
    e.preventDefault();
  };

  if (!fileName || openFiles.length === 0) {
    return (
      <div className="editor empty-state">
        <div className="empty-message">
          <h2>Aucun fichier ouvert</h2>
          <p>Ouvrez un fichier depuis l'explorateur ou utilisez le terminal.</p>
          <div className="shortcuts">
            <p>Raccourcis :</p>
            <ul>
              <li>Ctrl+S : Sauvegarder</li>
              <li>Commande "Ouvrir dossier" : Naviguer</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      {/* Barre d'onglets */}
      <div className="editor-tabs">
        {openFiles.map(file => (
          <div 
            key={file} 
            className={`editor-tab ${file === fileName ? 'active' : ''}`}
            onClick={() => onFileSelect && onFileSelect(file)}
          >
            <span className="tab-name">{file.split(/[\\\/]/).pop()}</span>
            <button 
              className="tab-close" 
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile && onCloseFile(file);
              }}
            >
              <FaTimes size={10} />
            </button>
          </div>
        ))}
      </div>

      <div className="editor-header">
        <div className="file-info" title={fileName}>
          <span className="file-root">{rootPath} \</span>
          <span className="file-name">{getRelativePath(fileName)}</span>
          {!saved && <span className="unsaved-indicator">● Non sauvegardé</span>}
        </div>
        <div className="editor-actions">
          <button onClick={handleAskCopilot} title="Demander au copilote">
            <FaRobot /> Copilote
          </button>
          <button onClick={handleSave} disabled={saved} title="Sauvegarder (Ctrl+S)">
            <FaSave /> {saved ? 'Sauvegardé' : 'Sauvegarder'}
          </button>
        </div>
      </div>
      
      <div className="editor-content" ref={contentRef}>
        <CodeMirror
          value={code}
          height="100%"
          theme={oneDark}
          extensions={getLanguageExtension()}
          onChange={handleChange}
          onUpdate={handleSelectionUpdate}
          onPaste={(e) => {
            // Optionnel : on peut intercepter ici si besoin, 
            // mais CodeMirror 6 gère normalement très bien le collage natif.
            console.log("Paste detected in editor");
          }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
        {selectionText && showSelectionActions && (
          <div
            className={`selection-actions ${selectionCollapsed ? 'collapsed' : ''}`}
            style={{
              top: `${panelPosition.top}px`,
              right: panelPosition.left == null ? `${panelPosition.right}px` : undefined,
              left: panelPosition.left != null ? `${panelPosition.left}px` : undefined,
            }}
            onMouseDown={handleDragStart}
          >
            <div className="selection-header">
              <span>Sélection prête pour l'IA</span>
              <div className="selection-toggles">
                <button
                  className="selection-toggle"
                  title={selectionCollapsed ? 'Déplier' : 'Replier'}
                  onClick={() => setSelectionCollapsed(!selectionCollapsed)}
                >
                  {selectionCollapsed ? '▼' : '▲'}
                </button>
                <button
                  className="selection-close"
                  title="Fermer et désélectionner"
                  onClick={() => {
                    setSelectionText('');
                    setShowSelectionActions(false);
                    setSelectionCollapsed(false);
                    setPanelPosition({ top: 12, right: 14, left: null });
                    if (editorViewRef.current) {
                      const view = editorViewRef.current;
                      const pos = view.state.selection.main.to;
                      view.dispatch({ selection: { anchor: pos } });
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            {!selectionCollapsed && (
              <div className="selection-buttons">
                <button onClick={() => handleSelectionAction('explain')}>Expliquer</button>
                <button onClick={() => handleSelectionAction('optimize')}>Optimiser</button>
                <button onClick={() => handleSelectionAction('tests')}>Tests</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Editor;
