/**
 * InstallAppBanner
 *
 * Smart PWA install prompt shown at the bottom of the page.
 *
 * Behaviour:
 * - Hidden entirely when already running as a standalone PWA (already installed)
 * - On Android/Chrome: captures `beforeinstallprompt` and shows a native-style
 *   "Add to home screen" button that triggers the browser prompt
 * - On iOS Safari: shows manual step instructions (iOS has no JS install API)
 * - On desktop Chrome/Edge: shows the install button via `beforeinstallprompt`
 * - On unsupported browsers: shows a fallback link to the Help Centre article
 * - Dismissed state is in-memory only — no localStorage, no device persistence
 * - Disappears automatically once the app is installed
 *
 * External trigger:
 * - Dispatching `new CustomEvent('ja:show-install-banner')` on `window` will
 *   force the banner open (used by the footer "Install App" link).
 *   Returns whether the banner CAN show via `window.__jaInstallBannerCanShow`.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Smartphone, Download, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform =
  | 'standalone'   // already installed — hide banner
  | 'ios'          // iOS Safari — manual steps
  | 'android'      // Android Chrome/Samsung — native prompt available
  | 'desktop'      // Desktop Chrome/Edge — native prompt available
  | 'unsupported'; // Firefox, etc. — link to help

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unsupported';

  if (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  ) {
    return 'standalone';
  }

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isChromium = /chrome|chromium|crios/i.test(ua) || /edg\//i.test(ua);

  if (isIOS && isSafari) return 'ios';
  if (isAndroid && isChromium) return 'android';
  if (!isIOS && !isAndroid && isChromium) return 'desktop';
  return 'unsupported';
}

const DISMISS_KEY = 'ja_install_banner_dismissed_session';

// In-memory dismissed flag — no localStorage, cleared when the tab closes.
let sessionDismissed = false;

function isDismissed(): boolean {
  return sessionDismissed;
}

function setDismissed() {
  sessionDismissed = true;
}

/** Expose whether the banner can show so the footer link can decide. */
function publishCanShow(canShow: boolean) {
  try { (window as any).__jaInstallBannerCanShow = canShow; } catch { /* ignore */ }
}

export default function InstallAppBanner() {
  const [platform, setPlatform] = useState<Platform>('unsupported');
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [iosStep, setIosStep] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  // Track whether this banner is capable of showing (for the footer link)
  const canShowRef = useRef(false);

  useEffect(() => {
    const p = detectPlatform();

    if (p === 'standalone') {
      publishCanShow(false);
      return;
    }

    setPlatform(p);

    if (p === 'android' || p === 'desktop') {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        canShowRef.current = true;
        publishCanShow(true);
        if (!isDismissed()) setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', handler);

      const timer = setTimeout(() => {
        if (deferredPrompt.current && !isDismissed()) setVisible(true);
      }, 800);

      const installed = () => { setVisible(false); publishCanShow(false); };
      window.addEventListener('appinstalled', installed);

      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        window.removeEventListener('appinstalled', installed);
        clearTimeout(timer);
      };
    }

    if (p === 'ios') {
      canShowRef.current = true;
      publishCanShow(true);
      if (!isDismissed()) {
        const timer = setTimeout(() => setVisible(true), 1200);
        return () => clearTimeout(timer);
      }
    }

    if (p === 'unsupported') {
      // Can "show" the banner (it will display the help link fallback)
      canShowRef.current = true;
      publishCanShow(true);
      if (!isDismissed()) {
        const timer = setTimeout(() => setVisible(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Listen for standalone mode change (user installs while page is open)
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) { setVisible(false); publishCanShow(false); }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Listen for external trigger from the footer "Install App" link
  useEffect(() => {
    const handler = () => {
      // Reset in-memory dismissed flag so the user can see it again
      sessionDismissed = false;
      setIosStep(false);
      setVisible(true);
    };
    window.addEventListener('ja:show-install-banner', handler);
    return () => window.removeEventListener('ja:show-install-banner', handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    setDismissed();
  };

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    setInstalling(true);
    try {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
        setDismissed();
      }
    } finally {
      setInstalling(false);
      deferredPrompt.current = null;
    }
  };

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Install Sousa Murray Planeia as an app"
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none"
    >
      <div className="max-w-lg mx-auto pointer-events-auto">
        <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
          {/* Accent bar */}
          <div className="h-0.5 bg-gradient-to-r from-primary via-blue-400 to-primary" />

          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Smartphone className="w-5 h-5 text-primary" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {platform === 'ios' && !iosStep && (
                  <>
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      Add Sousa Murray Planeia to your home screen
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Get quick access — works like a native app, no App Store needed.
                    </p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        onClick={() => setIosStep(true)}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        Show me how
                      </button>
                      <button
                        onClick={dismiss}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Not now
                      </button>
                    </div>
                  </>
                )}

                {platform === 'ios' && iosStep && (
                  <>
                    <p className="text-sm font-semibold text-foreground leading-snug mb-2">
                      3 quick steps in Safari:
                    </p>
                    <ol className="space-y-1.5">
                      {[
                        <><strong className="text-foreground">Tap the Share button</strong> <span className="inline-block align-middle text-base">⎙</span> at the bottom of your screen</>,
                        <>Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong></>,
                        <>Tap <strong className="text-foreground">Add</strong> — done!</>,
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-xs text-muted-foreground leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-muted-foreground mt-2 opacity-70">
                      Must be using Safari — other iOS browsers don't support this yet.
                    </p>
                  </>
                )}

                {(platform === 'android' || platform === 'desktop') && (
                  <>
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      {platform === 'android'
                        ? 'Add Sousa Murray Planeia to your home screen'
                        : 'Install Sousa Murray Planeia as a desktop app'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {platform === 'android'
                        ? 'Works offline, loads instantly — no Play Store needed.'
                        : 'Opens in its own window, works offline, loads instantly.'}
                    </p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        onClick={handleInstall}
                        disabled={installing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {installing ? 'Installing…' : platform === 'android' ? 'Add to home screen' : 'Install app'}
                      </button>
                      <button
                        onClick={dismiss}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Not now
                      </button>
                    </div>
                  </>
                )}

                {platform === 'unsupported' && (
                  <>
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      Install Sousa Murray Planeia as an app
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Get quick access from your home screen — no app store needed.
                    </p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <Link
                        to="/help#install-app"
                        onClick={dismiss}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-xs font-semibold rounded-lg hover:bg-primary/20 transition-colors border border-primary/20"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View install guide
                      </Link>
                      <button
                        onClick={dismiss}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Not now
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Close */}
              <button
                onClick={dismiss}
                aria-label="Dismiss install prompt"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
