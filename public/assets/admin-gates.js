(() => {
  const app = document.getElementById('gate-control-app');
  if (!app) return;

  const state = { config: null, tab: 'launch', busy: '', message: '', error: '' };

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  async function api(body) {
    const response = await fetch('/api/admin/gate-settings', {
      method: body ? 'POST' : 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: body?.action === 'preview' ? 'text/html' : 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (body?.action === 'preview') {
      const html = await response.text();
      if (!response.ok) throw new Error(html || 'Preview could not be generated.');
      return html;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(`${payload.error || 'Gate settings could not be loaded.'}${payload.correlationId ? ` Reference: ${payload.correlationId}` : ''}`);
    return payload;
  }

  function input(path, label, value, options = {}) {
    const { type = 'text', wide = false, hint = '', rows = 0, placeholder = '' } = options;
    const cls = `gate-field${wide ? ' gate-field--wide' : ''}`;
    const field = rows
      ? `<textarea data-path="${path}" rows="${rows}" placeholder="${escapeHtml(placeholder)}" ${options.code ? 'class="gate-code"' : ''}>${escapeHtml(value)}</textarea>`
      : `<input data-path="${path}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${options.code ? 'class="gate-code"' : ''}>`;
    return `<label class="${cls}"><span>${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}${field}</label>`;
  }

  function toggle(path, label, description, checked) {
    return `<div class="gate-toggle"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div><button type="button" class="gate-switch ${checked ? 'is-on' : ''}" data-toggle="${path}" aria-pressed="${checked}"></button></div>`;
  }

  function listEditor(path, items, type) {
    const rows = items.map((item, index) => type === 'links'
      ? `<div class="gate-list-item"><input data-list-path="${path}" data-list-index="${index}" data-list-key="label" value="${escapeHtml(item.label)}" placeholder="Link label"><input data-list-path="${path}" data-list-index="${index}" data-list-key="href" value="${escapeHtml(item.href)}" placeholder="/path"><button class="gate-icon-button" type="button" data-remove-list="${path}" data-index="${index}" aria-label="Remove">×</button></div>`
      : `<div class="gate-list-item is-single"><input data-list-path="${path}" data-list-index="${index}" value="${escapeHtml(item)}" placeholder="Feature text"><button class="gate-icon-button" type="button" data-remove-list="${path}" data-index="${index}" aria-label="Remove">×</button></div>`
    ).join('');
    return `<div class="gate-list">${rows || '<p style="font-size:11px;color:#64748b">No items. Add one below.</p>'}<button type="button" class="gate-button gate-button--secondary" data-add-list="${path}" data-list-type="${type}">+ Add ${type === 'links' ? 'link' : 'item'}</button></div>`;
  }

  function launchForm(c) {
    return `<div class="gate-panel"><div class="gate-panel__head"><div><h2>Launch Gate content and design</h2><p>Every field below is used by the actual public coming-soon page.</p></div><a class="gate-button gate-button--secondary" href="/coming-soon/" target="_blank">Open live page</a></div><div class="gate-panel__body">
      <div class="gate-fields">
        ${input('launch.logoUrl','Logo URL',c.logoUrl,{hint:'Use a hosted URL or /assets/... path.'})}
        ${input('launch.statusLabel','Status label',c.statusLabel,{hint:'Small line above the headline.'})}
        ${input('launch.headline','Headline',c.headline,{wide:true})}
        ${input('launch.highlight','Highlighted headline words',c.highlight,{wide:true,hint:'Displayed with the Planyx gradient. Leave blank to remove.'})}
        ${input('launch.subtext','Supporting text',c.subtext,{wide:true,rows:3})}
        ${input('launch.description','Description',c.description,{wide:true,rows:4})}
        ${input('launch.seoTitle','Browser and SEO title',c.seoTitle,{wide:true})}
        ${input('launch.seoDescription','SEO description',c.seoDescription,{wide:true,rows:3})}
      </div>
      ${toggle('launch.featuresEnabled','Show feature cards','Turn the editable feature-card section on or off.',c.featuresEnabled)}
      <div class="gate-field"><span>Feature cards</span><small>Add, edit or remove any item.</small>${listEditor('launch.features',c.features,'features')}</div>
      ${toggle('launch.countdownEnabled','Show launch countdown','Display a live countdown to the saved date.',c.countdownEnabled)}
      <div class="gate-fields">${input('launch.countdownLabel','Countdown label',c.countdownLabel)}${input('launch.launchDate','Launch date and time',c.launchDate ? c.launchDate.slice(0,16) : '',{type:'datetime-local'})}</div>
      <div class="gate-note"><strong>Owner sign-in:</strong> the public page includes a small bottom-centre owner access control. You can edit or remove it below.</div>
      ${toggle('launch.ownerEnabled','Show owner sign-in','Display the owner prompt and sign-in button at the bottom centre.',c.ownerEnabled)}
      <div class="gate-fields">${input('launch.ownerPrompt','Owner prompt',c.ownerPrompt)}${input('launch.ownerButtonLabel','Button label',c.ownerButtonLabel)}${input('launch.ownerUrl','Sign-in URL',c.ownerUrl,{wide:true})}</div>
      <div class="gate-field"><span>Footer links</span><small>Add, update or remove the links displayed in the gate footer.</small>${listEditor('launch.legalLinks',c.legalLinks,'links')}</div>
      ${input('launch.footerText','Footer copyright text',c.footerText,{wide:true})}
      ${input('launch.customHtml','Additional safe HTML',c.customHtml,{wide:true,rows:7,code:true,hint:'Scripts, iframes and inline event handlers are removed.'})}
      ${input('launch.customCss','Custom CSS',c.customCss,{wide:true,rows:10,code:true,hint:'Use this for complete visual control of the launch page.'})}
    </div></div>`;
  }

  function maintenanceForm(c) {
    return `<div class="gate-panel"><div class="gate-panel__head"><div><h2>Maintenance Gate content and design</h2><p>Saving generates the exact HTML used by the live maintenance middleware.</p></div><a class="gate-button gate-button--secondary" href="/maintenance/" target="_blank">Open live page</a></div><div class="gate-panel__body">
      <div class="gate-fields">
        ${input('maintenance.logoUrl','Logo URL',c.logoUrl)}
        ${input('maintenance.statusLabel','Status label',c.statusLabel)}
        ${input('maintenance.reason','Maintenance reason',c.reason)}
        ${input('maintenance.title','Page heading',c.title)}
        ${input('maintenance.message','Customer message',c.message,{wide:true,rows:4})}
        ${input('maintenance.start','Maintenance started',c.start ? c.start.slice(0,16) : '',{type:'datetime-local'})}
        ${input('maintenance.expectedReturn','Expected return',c.expectedReturn ? c.expectedReturn.slice(0,16) : '',{type:'datetime-local'})}
        ${input('maintenance.seoTitle','Browser and SEO title',c.seoTitle,{wide:true})}
        ${input('maintenance.seoDescription','SEO description',c.seoDescription,{wide:true,rows:3})}
      </div>
      ${toggle('maintenance.timelineEnabled','Show maintenance timeline','Display start and expected-return information when supplied.',c.timelineEnabled)}
      ${toggle('maintenance.contactEnabled','Show contact guidance','Display the editable support guidance panel.',c.contactEnabled)}
      ${input('maintenance.contactText','Contact guidance',c.contactText,{wide:true,rows:3})}
      ${toggle('maintenance.ownerEnabled','Show owner sign-in','Display the owner prompt and sign-in button at the bottom centre.',c.ownerEnabled)}
      <div class="gate-fields">${input('maintenance.ownerPrompt','Owner prompt',c.ownerPrompt)}${input('maintenance.ownerButtonLabel','Button label',c.ownerButtonLabel)}${input('maintenance.ownerUrl','Sign-in URL',c.ownerUrl,{wide:true})}</div>
      <div class="gate-field"><span>Footer links</span><small>Add, update or remove maintenance-page links.</small>${listEditor('maintenance.legalLinks',c.legalLinks,'links')}</div>
      ${input('maintenance.footerText','Footer copyright text',c.footerText,{wide:true})}
      ${input('maintenance.customHtml','Additional safe HTML',c.customHtml,{wide:true,rows:7,code:true})}
      ${input('maintenance.customCss','Custom CSS',c.customCss,{wide:true,rows:10,code:true,hint:'Use this for complete visual control of the maintenance page.'})}
    </div></div>`;
  }

  function render() {
    if (!state.config) return;
    const c = state.config;
    app.innerHTML = `<div class="gate-shell">
      <section class="gate-hero"><div class="gate-hero__row"><div><h1>Public Gate Control Centre</h1><p>One source of truth for Launch Gate and Maintenance Gate. Save once and the real public pages update immediately.</p></div><div class="gate-actions"><a class="gate-button gate-button--secondary" href="/admin/site-settings">Back to Site Settings</a><button class="gate-button" type="button" data-action="save">${state.busy === 'save' ? 'Saving…' : 'Save and publish gate settings'}</button></div></div></section>
      ${state.message ? `<div class="gate-message gate-message--success">${escapeHtml(state.message)}</div>` : ''}${state.error ? `<div class="gate-message gate-message--error">${escapeHtml(state.error)}</div>` : ''}
      <section class="gate-status-grid">${[
        ['normal','Live','The normal Planyx website is publicly available.'],
        ['coming_soon','Coming Soon','All public routes are redirected to the Launch Gate.'],
        ['maintenance','Maintenance','The public platform is replaced by the Maintenance Gate.'],
      ].map(([value,label,desc]) => `<button type="button" class="gate-status ${c.siteStatus === value ? 'is-active' : ''}" data-status="${value}"><strong>${label}</strong><span>${desc}</span></button>`).join('')}</section>
      <nav class="gate-tabs"><button class="gate-tab ${state.tab === 'launch' ? 'is-active' : ''}" data-tab="launch">Launch Gate</button><button class="gate-tab ${state.tab === 'maintenance' ? 'is-active' : ''}" data-tab="maintenance">Maintenance Gate</button></nav>
      <div class="gate-layout"><div>${state.tab === 'launch' ? launchForm(c.launch) : maintenanceForm(c.maintenance)}</div><aside class="gate-preview-wrap gate-panel"><div class="gate-preview-toolbar"><strong>${state.tab === 'launch' ? 'Launch Gate' : 'Maintenance Gate'} live preview</strong><button class="gate-button gate-button--secondary" type="button" data-action="preview">Refresh preview</button></div><iframe class="gate-preview-frame" title="Gate preview" id="gate-preview-frame"></iframe></aside></div>
    </div>`;
    bind();
    void preview();
  }

  function getPath(path) {
    return path.split('.').reduce((value, key) => value?.[key], state.config);
  }
  function setPath(path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((obj, key) => obj[key], state.config);
    target[last] = value;
  }

  async function preview() {
    const frame = document.getElementById('gate-preview-frame');
    if (!frame) return;
    try {
      const html = await api({ action: 'preview', mode: state.tab, config: state.config });
      frame.srcdoc = html;
    } catch (error) {
      state.error = error.message || 'Preview could not be generated.';
      render();
    }
  }

  async function save() {
    state.busy = 'save'; state.error = ''; state.message = ''; render();
    try {
      const payload = await api({ action: 'save', config: state.config });
      state.config = payload.config;
      state.message = `Gate settings saved. Public status: ${state.config.siteStatus.replace('_',' ')}.`;
    } catch (error) { state.error = error.message || 'Gate settings could not be saved.'; }
    finally { state.busy = ''; render(); }
  }

  function bind() {
    app.querySelectorAll('[data-path]').forEach(element => {
      element.addEventListener('input', event => setPath(event.currentTarget.dataset.path, event.currentTarget.value));
    });
    app.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => { setPath(button.dataset.toggle, !getPath(button.dataset.toggle)); render(); }));
    app.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => { state.config.siteStatus = button.dataset.status; render(); }));
    app.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { state.tab = button.dataset.tab; render(); }));
    app.querySelector('[data-action="save"]')?.addEventListener('click', () => void save());
    app.querySelector('[data-action="preview"]')?.addEventListener('click', () => void preview());
    app.querySelectorAll('[data-list-path]').forEach(inputEl => inputEl.addEventListener('input', () => {
      const list = getPath(inputEl.dataset.listPath);
      const index = Number(inputEl.dataset.listIndex);
      if (inputEl.dataset.listKey) list[index][inputEl.dataset.listKey] = inputEl.value;
      else list[index] = inputEl.value;
    }));
    app.querySelectorAll('[data-remove-list]').forEach(button => button.addEventListener('click', () => {
      getPath(button.dataset.removeList).splice(Number(button.dataset.index), 1); render();
    }));
    app.querySelectorAll('[data-add-list]').forEach(button => button.addEventListener('click', () => {
      const list = getPath(button.dataset.addList);
      list.push(button.dataset.listType === 'links' ? { label: 'New link', href: '/' } : 'New feature'); render();
    }));
  }

  api().then(payload => { state.config = payload.config; render(); }).catch(error => {
    app.innerHTML = `<div class="gate-message gate-message--error">${escapeHtml(error.message || 'Gate Control Centre could not be loaded.')}</div>`;
  });
})();
