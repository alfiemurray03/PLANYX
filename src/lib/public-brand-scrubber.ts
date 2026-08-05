const LEGACY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@(?:planyx|aptenvo|profilecentre|profilecenter|jadomainhub)\.jagroupservices\.co\.uk/gi, 'contact@jagroupservices.co.uk'],
  [/\b(?:planyx|aptenvo|profilecentre|profilecenter|jadomainhub)@jagroupservices\.co\.uk\b/gi, 'contact@jagroupservices.co.uk'],

  [/https?:\/\/(?:www\.)?planyx\.jagroupservices\.co\.uk/gi, 'https://sousamurrayplaneia.jagroupservices.co.uk'],
  [/\bplanyx\.jagroupservices\.co\.uk\b/gi, 'sousamurrayplaneia.jagroupservices.co.uk'],
  [/https?:\/\/(?:www\.)?aptenvo\.jagroupservices\.co\.uk/gi, 'https://sousamurrayelearning.jagroupservices.co.uk'],
  [/\baptenvo\.jagroupservices\.co\.uk\b/gi, 'sousamurrayelearning.jagroupservices.co.uk'],
  [/https?:\/\/(?:www\.)?profilecent(?:re|er)\.jagroupservices\.co\.uk/gi, 'https://sousamurrayprofiles.jagroupservices.co.uk'],
  [/\bprofilecent(?:re|er)\.jagroupservices\.co\.uk\b/gi, 'sousamurrayprofiles.jagroupservices.co.uk'],
  [/https?:\/\/(?:www\.)?(?:shop\.)?jadomainhub\.jagroupservices\.co\.uk/gi, 'https://sousamurraydomains.jagroupservices.co.uk'],
  [/\b(?:shop\.)?jadomainhub\.jagroupservices\.co\.uk\b/gi, 'sousamurraydomains.jagroupservices.co.uk'],

  [/\bJA Domain Hub\b/gi, 'Sousa Murray Domains'],
  [/\bJA Plan Studio\b/gi, 'Sousa Murray Planeia'],
  [/\bPlanyx\b/gi, 'Sousa Murray Planeia'],
  [/\bJA Profile Studio\b/gi, 'Sousa Murray Profiles'],
  [/\bProfile Centre\b/gi, 'Sousa Murray Profiles'],
  [/\bAptenvo\b/gi, 'Sousa Murray eLearning'],
];

const VISIBLE_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'content',
  'href',
  'placeholder',
  'poster',
  'src',
  'srcset',
  'style',
  'title',
  'value',
  'action',
  'data-label',
  'data-title',
  'data-description',
  'data-tooltip',
]);

function replaceLegacyBranding(value: string) {
  return LEGACY_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function shouldSkipTextNode(node: Node) {
  const parent = node.parentElement;
  return Boolean(parent?.closest('script, style, template, noscript'));
}

function scrubElement(element: Element) {
  for (const attribute of Array.from(element.attributes)) {
    if (!VISIBLE_ATTRIBUTES.has(attribute.name.toLowerCase())) continue;
    const replacement = replaceLegacyBranding(attribute.value);
    if (replacement !== attribute.value) element.setAttribute(attribute.name, replacement);
  }
}

function scrubTree(root: Node) {
  if (root instanceof Element) scrubElement(root);

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    if (!shouldSkipTextNode(textNode)) {
      const current = textNode.nodeValue ?? '';
      const replacement = replaceLegacyBranding(current);
      if (replacement !== current) textNode.nodeValue = replacement;
    }
    textNode = textWalker.nextNode();
  }

  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    root.querySelectorAll('*').forEach(scrubElement);
  }
}

export function installPublicBrandScrubber() {
  const start = () => {
    scrubTree(document.documentElement);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          scrubElement(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach(scrubTree);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(start), { once: true });
  } else {
    requestAnimationFrame(start);
  }
}
