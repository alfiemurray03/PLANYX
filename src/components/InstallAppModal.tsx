/**
 * InstallAppModal
 *
 * A full-featured install guide modal triggered by the footer "Install App" link.
 * - Detects platform and opens on the relevant tab automatically
 * - Covers iOS Safari, Android Chrome, Android Samsung Internet,
 *   desktop Chrome, desktop Edge, desktop Safari (macOS Sonoma+)
 * - On Android/desktop Chrome/Edge: shows a one-click install button if the
 *   browser's beforeinstallprompt is available
 * - Falls back gracefully on unsupported browsers with a help centre link
 *
 * Usage:
 *   import { openInstallModal } from '@/components/InstallAppModal';
 *   openInstallModal();          // call from anywhere
 *
 *   Mount <InstallAppModal /> once in RootLayout (or App.tsx).
 */

import { useState, useEffect, useRef } from 'react';
import {
  X, Smartphone, Monitor, Apple, Chrome, Download,
  CheckCircle2, ExternalLink, ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Global event bus ────────────────────────────────────────────────────────
const OPEN_EVENT = 'ja:open-install-modal';
export function openInstallModal() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type TabId = 'ios' | 'android' | 'desktop-chrome' | 'desktop-edge' | 'desktop-safari';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  shortLabel: string;
}

const TABS: Tab[] = [
  { id: 'ios',            label: 'iPhone / iPad',   shortLabel: 'iOS',     icon: <Apple className="w-4 h-4" /> },
  { id: 'android',        label: 'Android',          shortLabel: 'Android', icon: <Smartphone className="w-4 h-4" /> },
  { id: 'desktop-chrome', label: 'Chrome / Edge',    shortLabel: 'Chrome',  icon: <Chrome className="w-4 h-4" /> },
  { id: 'desktop-safari', label: 'Mac Safari',       shortLabel: 'Safari',  icon: <Monitor className="w-4 h-4" /> },
];

// ─── Platform detection ───────────────────────────────────────────────────────
function detectDefaultTab(): TabId {
  if (typeof window === 'undefined') return 'android';
  const ua = navigator.userAgent;
  const isIOS     = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isEdge    = /edg\//i.test(ua);
  const isChrome  = /chrome|chromium|crios/i.test(ua) && !isEdge;
  const isMac     = /macintosh|mac os x/i.test(ua) && !isIOS;
  const isSafari  = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);

  if (isIOS)                       return 'ios';
  if (isAndroid)                   return 'android';
  if (isMac && isSafari)           return 'desktop-safari';
  if (isEdge)                      return 'desktop-chrome';
  if (isChrome)                    return 'desktop-chrome';
  return 'desktop-chrome';
}

// ─── Step component ───────────────────────────────────────────────────────────
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </span>
      <span className="text-sm text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
      <p className="text-xs text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">Tip: </span>{children}
      </p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
      <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
        <span className="font-semibold">Note: </span>{children}
      </p>
    </div>
  );
}

// ─── Tab content ─────────────────────────────────────────────────────────────
function IOSContent() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          iOS only supports PWA installation through <strong className="text-foreground">Safari</strong>. Chrome, Firefox, and other browsers on iPhone/iPad do not support adding to the home screen.
        </p>
        <ol className="space-y-3">
          <Step n={1}>
            Open <strong className="text-foreground">Sousa Murray Planeia</strong> in <strong className="text-foreground">Safari</strong> on your iPhone or iPad.
          </Step>
          <Step n={2}>
            Tap the <strong className="text-foreground">Share button</strong> — the box with an arrow pointing up (
            <span className="inline-block align-middle font-bold text-primary">⎙</span>
            ) at the bottom of the screen. On iPad it may appear in the top toolbar.
          </Step>
          <Step n={3}>
            Scroll down in the share sheet and tap <strong className="text-foreground">"Add to Home Screen"</strong>.
          </Step>
          <Step n={4}>
            Edit the name if you like — we suggest <strong className="text-foreground">Sousa Murray Planeia</strong>.
          </Step>
          <Step n={5}>
            Tap <strong className="text-foreground">"Add"</strong> in the top-right corner. Done!
          </Step>
        </ol>
        <Tip>
          The app icon will appear on your home screen. Tap it to open Sousa Murray Planeia in full-screen mode — no browser bar, just the app.
        </Tip>
        <Note>
          iOS 16.4 and later: once installed, you may be asked to allow push notifications the first time you open the app.
        </Note>
      </div>
    </div>
  );
}

function AndroidContent({
  deferredPrompt,
  onInstalled,
}: {
  deferredPrompt: BeforeInstallPromptEvent | null;
  onInstalled: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setTimeout(onInstalled, 1500);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-4">
      {deferredPrompt && !installed && (
        <div className="p-4 rounded-xl bg-primary/8 border border-primary/20 flex items-center gap-3">
          <Download className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">One-tap install available</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your browser is ready — tap the button to install instantly.</p>
          </div>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 flex-shrink-0"
          >
            {installing ? 'Installing…' : 'Install now'}
          </button>
        </div>
      )}

      {installed && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">Installed! Check your home screen.</p>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-foreground mb-3">Using Chrome (recommended)</p>
        <ol className="space-y-3">
          <Step n={1}>Open <strong className="text-foreground">Sousa Murray Planeia</strong> in <strong className="text-foreground">Chrome</strong> on your Android device.</Step>
          <Step n={2}>A banner may appear at the bottom saying <strong className="text-foreground">"Add Sousa Murray Planeia to Home screen"</strong> — tap <strong className="text-foreground">"Add"</strong>.</Step>
          <Step n={3}>If no banner appears, tap the <strong className="text-foreground">three-dot menu</strong> (⋮) in the top-right corner.</Step>
          <Step n={4}>Tap <strong className="text-foreground">"Add to Home screen"</strong> or <strong className="text-foreground">"Install app"</strong>.</Step>
          <Step n={5}>Tap <strong className="text-foreground">"Add"</strong> or <strong className="text-foreground">"Install"</strong> to confirm.</Step>
        </ol>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground mb-3">Using Samsung Internet</p>
        <ol className="space-y-3">
          <Step n={1}>Open <strong className="text-foreground">Sousa Murray Planeia</strong> in <strong className="text-foreground">Samsung Internet</strong>.</Step>
          <Step n={2}>Tap the <strong className="text-foreground">menu icon</strong> (three horizontal lines) at the bottom of the screen.</Step>
          <Step n={3}>Tap <strong className="text-foreground">"Add page to"</strong> → <strong className="text-foreground">"Home screen"</strong>.</Step>
          <Step n={4}>Tap <strong className="text-foreground">"Add"</strong> to confirm.</Step>
        </ol>
      </div>

      <Tip>
        The app opens in full-screen mode without the browser address bar — just like a native app, no Play Store needed.
      </Tip>
    </div>
  );
}

function DesktopChromeContent({
  deferredPrompt,
  onInstalled,
}: {
  deferredPrompt: BeforeInstallPromptEvent | null;
  onInstalled: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setTimeout(onInstalled, 1500);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-4">
      {deferredPrompt && !installed && (
        <div className="p-4 rounded-xl bg-primary/8 border border-primary/20 flex items-center gap-3">
          <Download className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">One-click install available</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your browser is ready — click the button to install instantly.</p>
          </div>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 flex-shrink-0"
          >
            {installing ? 'Installing…' : 'Install now'}
          </button>
        </div>
      )}

      {installed && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">Installed! Check your taskbar or Start Menu.</p>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-foreground mb-3">Google Chrome</p>
        <ol className="space-y-3">
          <Step n={1}>Open <strong className="text-foreground">Sousa Murray Planeia</strong> in <strong className="text-foreground">Google Chrome</strong>.</Step>
          <Step n={2}>Look for the <strong className="text-foreground">install icon</strong> — a computer with a down arrow — in the address bar on the right side. Click it.</Step>
          <Step n={3}>Click <strong className="text-foreground">"Install"</strong> in the prompt that appears.</Step>
          <Step n={4}>
            Alternatively: click the <strong className="text-foreground">three-dot menu</strong> (⋮) → <strong className="text-foreground">"Cast, save, and share"</strong> → <strong className="text-foreground">"Install page as app"</strong>.
          </Step>
        </ol>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground mb-3">Microsoft Edge</p>
        <ol className="space-y-3">
          <Step n={1}>Open <strong className="text-foreground">Sousa Murray Planeia</strong> in <strong className="text-foreground">Microsoft Edge</strong>.</Step>
          <Step n={2}>Click the <strong className="text-foreground">three-dot menu</strong> (…) in the top-right corner.</Step>
          <Step n={3}>Click <strong className="text-foreground">"Apps"</strong> → <strong className="text-foreground">"Install this site as an app"</strong>.</Step>
          <Step n={4}>Click <strong className="text-foreground">"Install"</strong> to confirm.</Step>
        </ol>
      </div>

      <Tip>
        Once installed, Sousa Murray Planeia opens in its own window. Find it in your Start Menu (Windows) or Applications folder (Mac) like any other app.
      </Tip>
    </div>
  );
}

function DesktopSafariContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Safari on <strong className="text-foreground">macOS Sonoma (14) or later</strong> supports adding web apps to your Dock.
      </p>
      <ol className="space-y-3">
        <Step n={1}>Open <strong className="text-foreground">Sousa Murray Planeia</strong> in <strong className="text-foreground">Safari</strong> on your Mac.</Step>
        <Step n={2}>Click <strong className="text-foreground">"File"</strong> in the menu bar at the top of the screen.</Step>
        <Step n={3}>Click <strong className="text-foreground">"Add to Dock…"</strong></Step>
        <Step n={4}>Edit the name if you like, then click <strong className="text-foreground">"Add"</strong>.</Step>
      </ol>
      <Tip>
        Sousa Murray Planeia will appear in your Dock and can be launched like any other Mac app.
      </Tip>
      <Note>
        Requires macOS Sonoma (14) or later. On older macOS versions, use Chrome or Edge instead — see the Chrome / Edge tab above.
      </Note>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function InstallAppModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('android');
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [promptReady, setPromptReady] = useState(false);

  // Capture beforeinstallprompt globally
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setPromptReady(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const installed = () => { deferredPrompt.current = null; setPromptReady(false); };
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  // Listen for open trigger
  useEffect(() => {
    const handler = () => {
      setActiveTab(detectDefaultTab());
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Install Sousa Murray Planeia"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/40 flex flex-col max-h-[92dvh] sm:max-h-[85vh] overflow-hidden">

        {/* Accent bar */}
        <div className="h-0.5 bg-gradient-to-r from-primary via-blue-400 to-primary flex-shrink-0" />

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground leading-snug">Install Sousa Murray Planeia</h2>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Add to your home screen or desktop — no app store needed. Works like a native app.
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 -mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Already installed notice */}
        {isStandalone && (
          <div className="mx-5 mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">You're already running Sousa Murray Planeia as an installed app.</p>
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 flex-shrink-0">
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 border border-border">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {activeTab === 'ios'            && <IOSContent />}
          {activeTab === 'android'        && <AndroidContent deferredPrompt={promptReady ? deferredPrompt.current : null} onInstalled={() => setOpen(false)} />}
          {activeTab === 'desktop-chrome' && <DesktopChromeContent deferredPrompt={promptReady ? deferredPrompt.current : null} onInstalled={() => setOpen(false)} />}
          {activeTab === 'desktop-safari' && <DesktopSafariContent />}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Still having trouble?
          </p>
          <Link
            to="/dashboard/help-centre"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            View full install guide in Help Centre
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
