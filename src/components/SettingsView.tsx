import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore, ShortcutsConfig } from '../store/appStore';

const SHORTCUT_LABELS: Record<keyof ShortcutsConfig, string> = {
  newNote: 'New Note',
  quickCapture: 'Quick Capture',
  search: 'Search',
  toggleDarkMode: 'Toggle Dark Mode',
  fitCanvas: 'Fit Canvas',
  selectTool: 'Select Tool',
  panTool: 'Pan Tool',
  inkTool: 'Ink Tool',
  frameTool: 'Frame Tool',
  shapeTool: 'Shape Tool',
  textTool: 'Text Tool',
  undo: 'Undo',
};

function formatBinding(binding: string): string {
  return binding
    .replace('Ctrl', '⌃')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Space', 'Space');
}

function captureBinding(e: KeyboardEvent): string | null {
  const ignore = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'];
  if (ignore.includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  parts.push(e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join('+');
}

export default function SettingsView() {
  const { shortcutsConfig, setShortcutsConfig } = useAppStore();
  const [listeningFor, setListeningFor] = useState<keyof ShortcutsConfig | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const handleKeyCapture = useCallback((e: KeyboardEvent) => {
    if (!listeningFor) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setListeningFor(null);
      setConflict(null);
      return;
    }
    const binding = captureBinding(e);
    if (!binding) return;

    // Check for conflicts
    const conflictKey = (Object.keys(shortcutsConfig) as (keyof ShortcutsConfig)[]).find(
      (k) => k !== listeningFor && shortcutsConfig[k] === binding
    );
    if (conflictKey) {
      setConflict(`Already used by "${SHORTCUT_LABELS[conflictKey]}"`);
      return;
    }

    setShortcutsConfig({ ...shortcutsConfig, [listeningFor]: binding });
    setListeningFor(null);
    setConflict(null);
  }, [listeningFor, shortcutsConfig, setShortcutsConfig]);

  useEffect(() => {
    if (!listeningFor) return;
    window.addEventListener('keydown', handleKeyCapture, true);
    return () => window.removeEventListener('keydown', handleKeyCapture, true);
  }, [listeningFor, handleKeyCapture]);

  // Close listening on outside click
  useEffect(() => {
    if (!listeningFor) return;
    const close = () => { setListeningFor(null); setConflict(null); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [listeningFor]);

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-[480px] mx-auto px-8 py-12">
        <h1 className="font-display text-2xl font-medium text-foreground mb-8">Settings</h1>

        <div className="space-y-8">
          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">About</h2>
            <div className="bg-surface rounded-lg p-4">
              <p className="text-sm text-foreground font-medium">Vault</p>
              <p className="text-xs text-muted-foreground mt-1">A thinking environment for deep work</p>
              <p className="text-xs text-muted-foreground mt-0.5">Version 1.0</p>
            </div>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">Editor</h2>
            <div className="bg-surface rounded-lg divide-y divide-border">
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-foreground">Font size</span>
                <span className="text-sm text-muted-foreground">15px</span>
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-foreground">Line height</span>
                <span className="text-sm text-muted-foreground">1.7</span>
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-foreground">Max width</span>
                <span className="text-sm text-muted-foreground">680px</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">Keyboard Shortcuts</h2>
            <p className="text-xs text-muted-foreground mb-3">Click a binding to change it, then press your desired key combination.</p>
            {conflict && (
              <div className="mb-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive">
                {conflict}
              </div>
            )}
            <div className="bg-surface rounded-lg divide-y divide-border">
              {(Object.keys(SHORTCUT_LABELS) as (keyof ShortcutsConfig)[]).map((key) => {
                const isListening = listeningFor === key;
                return (
                  <div key={key} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-foreground">{SHORTCUT_LABELS[key]}</span>
                    <button
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setConflict(null);
                        setListeningFor(isListening ? null : key);
                      }}
                      className={`text-[11px] font-mono px-2.5 py-1 rounded border transition-all duration-150 min-w-[90px] text-center ${
                        isListening
                          ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent'
                          : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'
                      }`}
                    >
                      {isListening ? 'Press keys…' : formatBinding(shortcutsConfig[key])}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => {
                const { setShortcutsConfig: set } = useAppStore.getState();
                set({
                  newNote: 'Ctrl+N',
                  quickCapture: 'Ctrl+Space',
                  search: 'Ctrl+F',
                  toggleDarkMode: 'Ctrl+Shift+D',
                  fitCanvas: 'F',
                  selectTool: 'V',
                  panTool: 'H',
                  inkTool: 'I',
                  frameTool: 'R',
                  undo: 'Ctrl+Z',
                });
                setListeningFor(null);
                setConflict(null);
              }}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset to defaults
            </button>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">Data</h2>
            <div className="bg-surface rounded-lg p-4">
              <p className="text-xs text-muted-foreground">
                All data is stored locally in your browser. No data leaves your device.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
