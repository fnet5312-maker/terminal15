import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { FaSave, FaRobot } from 'react-icons/fa';
import './Editor.css';

function Editor({ code, fileName, onChange, onSave, provider }) {
  const [saved, setSaved] = useState(true);

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

  return (
    <div className="editor">
      <div className="editor-header">
        <div className="file-info">
          <span className="file-name">{fileName}</span>
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
      
      <div className="editor-content">
        <CodeMirror
          value={code}
          height="100%"
          theme={oneDark}
          extensions={getLanguageExtension()}
          onChange={handleChange}
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
      </div>
    </div>
  );
}

export default Editor;
