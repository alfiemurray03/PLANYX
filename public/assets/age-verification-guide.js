(() => {
  const root = document.getElementById('age-guide');
  const toggle = document.getElementById('age-guide-toggle');
  const panel = document.getElementById('age-guide-panel');
  const welcome = document.getElementById('age-guide-welcome');
  const suggestions = document.getElementById('age-guide-suggestions');
  const messages = document.getElementById('age-guide-messages');
  const form = document.getElementById('age-guide-form');
  const input = document.getElementById('age-guide-input');
  if (!root || !toggle || !panel || !welcome || !suggestions || !messages || !form || !input) return;

  const history = [];
  const safeSuggestions = [
    'Why is Planyx 16+?',
    'What happens to my date of birth?',
    'What safeguards apply at 16–17?',
    'Is this independent age verification?',
    'What if the check does not work?',
  ];

  function addMessage(role, text) {
    const item = document.createElement('div');
    item.className = `age-guide__message age-guide__message--${role}`;
    item.textContent = String(text || '');
    messages.appendChild(item);
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function openGuide() {
    toggle.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  }

  async function ask(question) {
    const message = String(question || '').trim();
    if (message.length < 2) return;
    openGuide();
    addMessage('user', message);
    history.push({ role: 'user', content: message });
    input.value = '';
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    input.disabled = true;
    try {
      const response = await fetch('/api/age-verification-assistant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message, history: history.slice(-10) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.reply) {
        throw new Error(payload.error || 'The guide is temporarily unavailable.');
      }
      addMessage('assistant', payload.reply);
      history.push({ role: 'assistant', content: payload.reply });
    } catch (error) {
      addMessage('assistant', error instanceof Error ? error.message : 'The guide is temporarily unavailable.');
    } finally {
      if (button) button.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
    if (!open) input.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void ask(input.value);
  });

  fetch('/api/age-verification-assistant', {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
    .then(({ response, payload }) => {
      if (!response.ok || !payload.enabled || payload.maintenance) return;
      root.hidden = false;
      welcome.textContent = payload.welcomeMessage || 'I can explain the Planyx 16+ age check and privacy safeguards.';
      input.placeholder = payload.inputPlaceholder || 'Ask about the 16+ age check…';
      const labels = Array.isArray(payload.suggestions) && payload.suggestions.length ? payload.suggestions : safeSuggestions;
      for (const label of labels) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(label);
        button.addEventListener('click', () => void ask(label));
        suggestions.appendChild(button);
      }
    })
    .catch(() => {
      root.hidden = true;
    });
})();