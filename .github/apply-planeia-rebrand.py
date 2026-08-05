from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path.cwd()
BRAND = 'Sousa Murray Planeia'
BRAND_UPPER = 'SOUSA MURRAY PLANEIA'
PUBLIC_URL = 'https://sousamurrayplaneia.jagroupservices.co.uk'
CONTACT_EMAIL = 'contact@jagroupservices.co.uk'
BLANK_FAVICON = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'

TEXT_SUFFIXES = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.txt', '.xml'}
TEXT_ROOTS = ['src', 'functions', 'scripts', 'static', 'docs']


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.write_text(content, encoding='utf-8')


def replace(path: str, old: str, new: str, *, required: bool = True) -> None:
    text = read(path)
    if required and old not in text:
        raise RuntimeError(f'Expected text not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new))


def replace_regex(path: str, pattern: str, replacement: str, *, required: bool = True, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, flags=flags)
    if required and count == 0:
        raise RuntimeError(f'Expected pattern not found in {path}: {pattern!r}')
    write(path, updated)


def public_text_rebrand() -> None:
    files: list[Path] = []
    for root_name in TEXT_ROOTS:
        root = ROOT / root_name
        if root.exists():
            files.extend(path for path in root.rglob('*') if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES)
    files.extend(path for path in [ROOT / 'index.html', ROOT / 'README.md'] if path.exists())

    brand_pattern = re.compile(r'(?<![A-Za-z0-9_])Planyx(?![A-Za-z0-9_])')
    for path in files:
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        updated = text.replace('https://planyx.jagroupservices.co.uk', PUBLIC_URL)
        updated = updated.replace('planyx@jagroupservices.co.uk', CONTACT_EMAIL)
        updated = brand_pattern.sub(BRAND, updated)
        updated = updated.replace('X-Sousa Murray Planeia-', 'X-Planyx-')
        if updated != text:
            path.write_text(updated, encoding='utf-8')


def remove_brand_images_from_markup() -> None:
    candidates = []
    for root_name in ['src', 'functions', 'static']:
        root = ROOT / root_name
        if root.exists():
            candidates.extend(path for path in root.rglob('*') if path.is_file() and path.suffix.lower() in {'.tsx', '.js', '.html'})

    image_pattern = re.compile(
        r'<img\b[^>]*\bsrc=["\']/assets/brand/planyx-logo\.svg(?:\?[^"\']*)?["\'][^>]*>',
        re.IGNORECASE,
    )
    icon_link_pattern = re.compile(
        r'\s*<link\b[^>]*\b(?:href=["\'](?:/assets/brand/planyx-icon\.png|/favicon\.svg|/assets/favicons/favicon\.svg)(?:\?[^"\']*)?["\'])[^>]*>\s*',
        re.IGNORECASE,
    )
    wordmark = f'<span class="brand-wordmark" style="font-weight:800;letter-spacing:-.02em;color:inherit">{BRAND}</span>'

    for path in candidates:
        text = path.read_text(encoding='utf-8')
        updated = image_pattern.sub(wordmark, text)
        updated = icon_link_pattern.sub('', updated)
        if updated != text:
            path.write_text(updated, encoding='utf-8')


def targeted_updates() -> None:
    menu = 'src/components/CustomerWebsitesMenu.tsx'
    replacements = {
        "{ name: 'Profile Centre', href: 'https://profilecentre.jagroupservices.co.uk/' },": "{ name: 'Sousa Murray Profiles', href: 'https://sousamurrayprofiles.jagroupservices.co.uk/' },",
        "{ name: 'JA Domain Hub', href: 'https://jadomainhub.jagroupservices.co.uk/' },": "{ name: 'Sousa Murray Domains', href: 'https://sousamurraydomains.jagroupservices.co.uk/' },",
        "{ name: 'Aptenvo', href: 'https://aptenvo.jagroupservices.co.uk/' },": "{ name: 'Sousa Murray eLearning', href: 'https://sousamurrayelearning.jagroupservices.co.uk/' },",
    }
    for old, new in replacements.items():
        replace(menu, old, new)

    replace('src/lib/branding.ts', "  platform_logo_url: '/assets/brand/planyx-logo.svg?v=3',", "  platform_logo_url: '',")
    replace('src/lib/branding.ts', "  platform_favicon_url: '/assets/brand/planyx-icon.png?v=1',", "  platform_favicon_url: '',")

    browser = 'src/lib/browser-branding.ts'
    replace(browser, "export interface BrowserBrandingSettings {\n", "export interface BrowserBrandingSettings {\n", required=False)
    text = read(browser)
    if 'const BLANK_FAVICON' not in text:
        anchor = "}\n\nconst DEFAULTS: BrowserBrandingSettings = {"
        text = text.replace(anchor, f"}}\n\nconst BLANK_FAVICON = '{BLANK_FAVICON}';\n\nconst DEFAULTS: BrowserBrandingSettings = {{")
    text = re.sub(r"faviconUrl:\s*'[^']*',", 'faviconUrl: BLANK_FAVICON,', text, count=1)
    text = re.sub(
        r"function cleanFavicon\(value: unknown\): string \{.*?\n\}",
        "function cleanFavicon(_value: unknown): string {\n  return BLANK_FAVICON;\n}",
        text,
        count=1,
        flags=re.DOTALL,
    )
    write(browser, text)

    replace('src/server/api/site-settings/public/GET.ts', "  favicon_url: '/favicon.svg?v=20260718-4',", f"  favicon_url: '{BLANK_FAVICON}',")
    replace('functions/site-settings.js', '  favicon_url: "/favicon.svg?v=20260718-4",', f'  favicon_url: "{BLANK_FAVICON}",')

    replace(
        'src/components/AdminLayoutStable.tsx',
        '<img src={branding.platform_logo_url} alt="Sousa Murray Planeia" className="h-9 w-auto max-w-[148px] object-contain sm:h-10 sm:max-w-[176px]" />',
        "<span className=\"text-base font-black tracking-tight text-slate-950 dark:text-white sm:text-lg\">{branding.platform_name || 'Sousa Murray Planeia'}</span>",
    )
    replace(
        'src/components/AdminLayoutStable.tsx',
        '<img src={branding.platform_logo_url} alt="Sousa Murray Planeia" className="h-8 w-auto max-w-[150px] object-contain" />',
        "<span className=\"text-base font-black tracking-tight text-slate-950 dark:text-white\">{branding.platform_name || 'Sousa Murray Planeia'}</span>",
    )
    replace_regex(
        'src/pages/admin/login.tsx',
        r'<span class="brand-wordmark" style="font-weight:800;letter-spacing:-\.02em;color:inherit">Sousa Murray Planeia</span>',
        '<div className="mb-7 text-xl font-black tracking-tight text-black dark:text-white">Sousa Murray Planeia</div>',
    )
    replace(
        'src/App.tsx',
        '<div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-xl font-black text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">P</div>',
        '<p className="mb-5 text-sm font-extrabold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Sousa Murray Planeia</p>',
    )
    replace(
        'src/pages/index.tsx',
        '<div className="w-12 h-12 rounded-xl bg-blue-600/80 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">P</div>',
        '<div className="w-12 h-12 rounded-xl bg-blue-600/80 flex items-center justify-center text-white shadow-sm flex-shrink-0"><Check className="w-5 h-5" /></div>',
    )

    replace('src/lib/itinerary-pdf.ts', '  document.text("PLANYX", margin, 14);', '  document.setFontSize(11);\n  document.text("SOUSA MURRAY PLANEIA", margin, 14);')
    replace('src/pages/admin/age-verification.tsx', 'DPIA-PLANYX-AGE-001', 'DPIA-PLANEIA-AGE-001')
    replace('src/pages/admin/website-source-files.tsx', "const root: TreeNode = { name: 'PLANYX'", "const root: TreeNode = { name: 'SOUSA MURRAY PLANEIA'")
    replace('functions/api/admin/website-studio-v4.js', 'PLANYX DESIGN CONTRACT:', 'SOUSA MURRAY PLANEIA DESIGN CONTRACT:')

    html = read('index.html')
    html = re.sub(r'^\s*<meta (?:property="og:image"|name="twitter:image")[^>]*>\s*\n', '', html, flags=re.MULTILINE)
    html = re.sub(r'^\s*<link rel="(?:apple-touch-icon|icon|shortcut icon)"[^>]*planyx-icon\.png[^>]*>\s*\n', '', html, flags=re.MULTILINE)
    write('index.html', html)

    manifest_path = ROOT / 'static/manifest.webmanifest'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['name'] = BRAND
    manifest['short_name'] = 'Planeia'
    manifest.pop('icons', None)
    for shortcut in manifest.get('shortcuts', []):
        shortcut.pop('icons', None)
        if shortcut.get('name') == 'Planyx Home':
            shortcut['name'] = f'{BRAND} Home'
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    replace(
        'static/sw.js',
        "const SHELL = ['/', PUBLIC_LAUNCH, '/manifest.webmanifest?v=8', '/pwa-icon.svg', '/favicon.svg'];",
        "const SHELL = ['/', PUBLIC_LAUNCH, '/manifest.webmanifest?v=8'];",
    )

    pin_css = read('static/admin-pin.css')
    pin_css = pin_css.replace('content: "";', f'content: "{BRAND}";', 1)
    pin_css = pin_css.replace('display: block;', 'display: flex;\n    align-items: center;', 1)
    pin_css = pin_css.replace(
        "background:\n      url('/assets/brand/planyx-logo.svg?v=1') no-repeat left max(24px, calc((100vw - 1120px) / 2)) center / 148px auto,\n      rgba(255, 255, 255, 0.96);",
        "background: rgba(255, 255, 255, 0.96);\n    padding-left: max(24px, calc((100vw - 1120px) / 2));\n    color: #0f172a;\n    font-size: 18px;\n    font-weight: 800;\n    letter-spacing: -0.025em;",
    )
    write('static/admin-pin.css', pin_css)

    shell_css = read('static/admin-pin-shell.css')
    shell_css = shell_css.replace(
        "background-image: url('/assets/brand/planyx-logo.svg?v=1') !important;\n    background-repeat: no-repeat !important;\n    background-position: left max(24px, calc((100vw - 1120px) / 2)) center !important;\n    background-size: 148px auto !important;",
        f"background-image: none !important;\n    content: \"{BRAND}\" !important;\n    display: flex !important;\n    align-items: center !important;\n    padding-left: max(24px, calc((100vw - 1120px) / 2)) !important;\n    color: #0f172a !important;\n    font-size: 18px !important;\n    font-weight: 800 !important;\n    letter-spacing: -0.025em !important;",
    )
    shell_css = shell_css.replace(
        'background-position: center !important;\n      background-size: 132px auto !important;',
        'justify-content: center !important;\n      padding-left: 0 !important;',
    )
    write('static/admin-pin-shell.css', shell_css)

    gate_css = read('src/styles/admin-pin-gate.css')
    gate_css = gate_css.replace('content: "";', f'content: "{BRAND}";', 1)
    gate_css = gate_css.replace(
        "background:\n    url('/assets/brand/planyx-logo.svg?v=1') no-repeat left max(24px, calc((100vw - 1120px) / 2)) center / 148px auto,\n    rgba(255, 255, 255, 0.96);",
        "background: rgba(255, 255, 255, 0.96);\n  display: flex;\n  align-items: center;\n  padding-left: max(24px, calc((100vw - 1120px) / 2));\n  color: #0f172a;\n  font-size: 18px;\n  font-weight: 800;\n  letter-spacing: -0.025em;",
    )
    write('src/styles/admin-pin-gate.css', gate_css)

    for path in [
        'static/account/access-restricted/index.html',
        'static/account/verification-required/index.html',
        'functions/account/access-restricted/[[path]].js',
        'functions/account/verification-required/[[path]].js',
    ]:
        text = read(path)
        text = re.sub(r'<(?:span|div) class="mark">P</(?:span|div)>', '', text)
        text = text.replace('<span>P</span>', '')
        text = text.replace('gap:12px;', '')
        text = re.sub(r'\.mark\{[^}]*\}', '', text)
        write(path, text)

    replace('static/assets/admin-gates.js', "'Show logo','Remove the top Sousa Murray Planeia logo and header when disabled.'", "'Show word mark','Remove the top Sousa Murray Planeia word mark and header when disabled.'")
    replace('static/assets/admin-gates.js', "'Show logo','Display the Sousa Murray Planeia logo in the maintenance header.'", "'Show word mark','Display the Sousa Murray Planeia word mark in the maintenance header.'")

    gates = read('functions/_shared/site-gates.js').replace('logoUrl: "/assets/brand/planyx-logo.svg?v=1",', 'logoUrl: "",')
    write('functions/_shared/site-gates.js', gates)


def delete_old_brand_assets() -> None:
    paths = [
        'static/assets/brand/planyx-logo.svg',
        'static/pwa-icon.svg',
        'public/assets/brand/planyx-logo.svg',
        'public/favicon.ico',
        'public/favicon.svg',
        'public/pwa-icon.svg',
    ]
    for relative in paths:
        (ROOT / relative).unlink(missing_ok=True)


def audit() -> None:
    failures: list[str] = []
    public_patterns = [
        re.compile(r'(?<![A-Za-z0-9_])Planyx(?![A-Za-z0-9_])'),
        re.compile(r'https://planyx\.jagroupservices\.co\.uk'),
        re.compile(r'planyx@jagroupservices\.co\.uk'),
        re.compile(r'planyx-logo\.svg|planyx-icon\.png'),
    ]
    for root_name in ['src', 'functions', 'scripts', 'static']:
        root = ROOT / root_name
        if not root.exists():
            continue
        for path in root.rglob('*'):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            text = path.read_text(encoding='utf-8', errors='ignore')
            for pattern in public_patterns:
                for match in pattern.finditer(text):
                    line = text.count('\n', 0, match.start()) + 1
                    excerpt = text[max(0, match.start()-16):match.end()+16]
                    if 'X-Planyx-' in excerpt:
                        continue
                    failures.append(f'{path.relative_to(ROOT)}:{line}: {match.group(0)}')
    if failures:
        raise RuntimeError('Public legacy references remain:\n' + '\n'.join(failures[:80]))


public_text_rebrand()
remove_brand_images_from_markup()
targeted_updates()
delete_old_brand_assets()
audit()
print('Sousa Murray Planeia rebrand applied successfully.')
