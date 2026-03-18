import React from 'react';

export default function SettingsView() {
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
