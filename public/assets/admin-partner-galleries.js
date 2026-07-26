(() => {
  const app = document.getElementById('partner-gallery-app');
  if (!app) return;

  const state = { config: null, catalogue: null, provider: 'headout', search: '', editingId: '', busy: '', message: '', error: '' };
  const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  async function request(url, options) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(`${payload.error || 'The request could not be completed.'}${payload.correlationId ? ` Reference: ${payload.correlationId}` : ''}`);
    return payload;
  }

  function seedProvider(provider, items) {
    const headout = provider === 'headout';
    return {
      enabled: true,
      eyebrow: headout ? 'Primary affiliate partner' : 'Secondary affiliate partner',
      pageTitle: `Explore activities with ${headout ? 'Headout' : 'GetYourGuide'}`,
      intro: 'Choose a destination and browse live tours, attractions, tickets and experiences without leaving Planyx.',
      galleryLabel: 'Destination gallery', galleryHeading: 'Where would you like to explore?', searchPlaceholder: 'Search city or country',
      allDestinationsLabel: 'All destinations', cardButtonLabel: 'Open live gallery', liveGalleryLabel: `Live ${headout ? 'Headout' : 'GetYourGuide'} gallery for`,
      currency: 'GBP', language: 'en', locale: 'en-GB', resultCount: 5, maxCount: 100, showMore: true,
      partnerId: headout ? '' : 'ZSEVDSG', affiliateCode: headout ? 'JL2D9u' : '', affiliateWebsite: headout ? 'https://tours.jagroupservices.co.uk' : 'https://planyx.jagroupservices.co.uk', campaign: 'planyx-discovery',
      destinations: (items || []).map((item, index) => ({ ...item, sortOrder: index })),
    };
  }

  function normaliseOrder(items) { return items.map((item, index) => ({ ...item, sortOrder: index })); }
  function current() { return state.config[state.provider]; }
  function setPath(path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((object, key) => object[key], state.config);
    target[last] = value;
  }
  function input(path, label, value, options = {}) {
    const { wide = false, textarea = false, type = 'text', hint = '' } = options;
    const field = textarea
      ? `<textarea data-path="${path}" rows="3">${escapeHtml(value)}</textarea>`
      : `<input data-path="${path}" type="${type}" value="${escapeHtml(value)}">`;
    return `<label class="pg-field${wide ? ' pg-field--wide' : ''}"><span>${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}${field}</label>`;
  }
  function toggle(path, label, description, checked) {
    return `<div class="pg-toggle"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div><button type="button" class="pg-switch ${checked ? 'is-on' : ''}" data-toggle="${path}" aria-pressed="${checked}"></button></div>`;
  }

  function providerSettings() {
    const provider = state.provider;
    const c = current();
    return `<section class="pg-panel"><div class="pg-panel__head"><div><h2>Page and widget settings</h2><p>These fields update the actual public ${provider === 'headout' ? 'Headout' : 'GetYourGuide'} page.</p></div><a class="pg-button pg-button--secondary" href="/${provider === 'headout' ? 'headout' : 'getyourguide'}" target="_blank">Open live page</a></div><div class="pg-panel__body">
      ${toggle(`${provider}.enabled`, 'Page enabled', 'Switch the entire public partner page on or off.', c.enabled)}
      <div class="pg-fields">
        ${input(`${provider}.eyebrow`, 'Partner label', c.eyebrow)}${input(`${provider}.pageTitle`, 'Page heading', c.pageTitle)}
        ${input(`${provider}.intro`, 'Page introduction', c.intro, { wide:true, textarea:true })}
        ${input(`${provider}.galleryLabel`, 'Gallery label', c.galleryLabel)}${input(`${provider}.galleryHeading`, 'Gallery heading', c.galleryHeading)}
        ${input(`${provider}.searchPlaceholder`, 'Search placeholder', c.searchPlaceholder)}${input(`${provider}.cardButtonLabel`, 'Card button wording', c.cardButtonLabel)}
        ${input(`${provider}.allDestinationsLabel`, 'Back button wording', c.allDestinationsLabel)}${input(`${provider}.liveGalleryLabel`, 'Live gallery wording', c.liveGalleryLabel)}
        ${provider === 'headout' ? `${input('headout.affiliateCode','Headout affiliate code',c.affiliateCode,{hint:'Public affiliate identifier'})}${input('headout.affiliateWebsite','Affiliate website',c.affiliateWebsite)}${input('headout.maxCount','Maximum activities',c.maxCount,{type:'number'})}` : `${input('getyourguide.partnerId','GetYourGuide partner ID',c.partnerId,{hint:'Public partner identifier'})}${input('getyourguide.resultCount','Results per widget',c.resultCount,{type:'number'})}${input('getyourguide.locale','Locale',c.locale)}${input('getyourguide.campaign','Campaign label',c.campaign)}`}
        ${input(`${provider}.currency`, 'Currency', c.currency)}${input(`${provider}.language`, 'Language', c.language)}
      </div>
      ${provider === 'headout' ? toggle('headout.showMore','Show more button','Allow visitors to load more Headout activities.',c.showMore) : ''}
    </div></section>`;
  }

  function destinationRows() {
    const term = state.search.trim().toLowerCase();
    const items = [...current().destinations].sort((a,b) => a.sortOrder-b.sortOrder || a.name.localeCompare(b.name));
    const filtered = term ? items.filter(item => `${item.name} ${item.country} ${item.code} ${item.providerLocationId}`.toLowerCase().includes(term)) : items;
    if (!filtered.length) return '<div class="pg-empty">No destinations match this search.</div>';
    return filtered.map(item => `<div class="pg-row">
      <div class="pg-thumb">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="">` : '⌖'}</div>
      <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.country)} · ${escapeHtml(item.providerLocationId || item.searchQuery || 'Provider mapping required')}</p><div class="pg-badges">${item.featured ? '<span class="pg-badge pg-badge--featured">Featured</span>' : ''}${!item.enabled ? '<span class="pg-badge pg-badge--hidden">Hidden</span>' : ''}<span class="pg-badge">${escapeHtml(item.badge || item.code)}</span></div></div>
      <div class="pg-row__actions"><button class="pg-icon" data-move="-1" data-id="${escapeHtml(item.id)}" title="Move up">↑</button><button class="pg-icon" data-move="1" data-id="${escapeHtml(item.id)}" title="Move down">↓</button><button class="pg-icon" data-feature="${escapeHtml(item.id)}" title="Toggle featured">★</button><button class="pg-icon" data-visible="${escapeHtml(item.id)}" title="Toggle visibility">${item.enabled ? '◉' : '○'}</button><button class="pg-button pg-button--secondary" data-edit="${escapeHtml(item.id)}">Edit</button></div>
    </div>`).join('');
  }

  function destinationPanel() {
    const c = current();
    return `<section class="pg-panel"><div class="pg-panel__head"><div><h2>Destination gallery</h2><p>${c.destinations.filter(item => item.enabled).length} visible of ${c.destinations.length} destinations.</p></div><div class="pg-actions"><button class="pg-button pg-button--secondary" data-action="reset">Reset directory</button><button class="pg-button" data-action="add">+ Add destination</button></div></div><div class="pg-toolbar"><label class="pg-search"><input value="${escapeHtml(state.search)}" placeholder="Search destinations or provider codes" data-search></label><span class="pg-count">Order, hide, feature or edit every destination.</span></div><div class="pg-list">${destinationRows()}</div></section>`;
  }

  function editorModal() {
    if (!state.editingId) return '';
    const item = current().destinations.find(destination => destination.id === state.editingId);
    if (!item) return '';
    const providerLabel = state.provider === 'headout' ? 'Headout city code' : 'GetYourGuide location ID';
    return `<div class="pg-modal"><section class="pg-modal__card"><div class="pg-modal__head"><div><h2>Edit destination</h2><p>Changes remain a draft until Save and publish is selected.</p></div><button class="pg-close" data-action="close">×</button></div><div class="pg-modal__body"><div class="pg-fields">
      ${input(`item.name`,'Destination name',item.name)}${input('item.country','Country',item.country)}${input('item.slug','URL slug',item.slug)}${input('item.code','Country/badge code',item.code)}${input('item.badge','Custom badge',item.badge,{hint:'Optional'})}${input('item.imageUrl','Image URL or /assets path',item.imageUrl)}${input('item.providerLocationId',providerLabel,item.providerLocationId)}${input('item.searchQuery','Fallback provider search query',item.searchQuery)}
    </div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px">${toggle('item.enabled','Visible','Show this destination publicly.',item.enabled)}${toggle('item.featured','Featured','Place this destination before standard items.',item.featured)}</div></div><div class="pg-modal__footer"><button class="pg-button pg-button--danger" data-action="remove">Remove destination</button><button class="pg-button" data-action="close">Done</button></div></section></div>`;
  }

  function render() {
    if (!state.config) return;
    app.innerHTML = `<div class="pg-shell"><section class="pg-hero"><div class="pg-hero__row"><div><h1>Partner Gallery Manager</h1><p>Control the Planyx destination galleries, images, order, visibility and provider widget identifiers. Headout and GetYourGuide continue to control their live products, prices and availability.</p></div><div class="pg-actions"><a class="pg-button pg-button--secondary" href="/admin/dashboard">Admin Dashboard</a><button class="pg-button" data-action="save">${state.busy === 'save' ? 'Saving…' : 'Save and publish'}</button></div></div></section>
      <div class="pg-note"><strong>What you control:</strong> destination cards, gallery copy, images, ordering, provider IDs and page visibility. <strong>What the provider controls:</strong> live activities, prices, booking terms, availability and checkout.</div>
      ${state.message ? `<div class="pg-message pg-message--success">${escapeHtml(state.message)}</div>` : ''}${state.error ? `<div class="pg-message pg-message--error">${escapeHtml(state.error)}</div>` : ''}
      <nav class="pg-tabs"><button class="pg-tab ${state.provider === 'headout' ? 'is-active' : ''}" data-provider="headout">Headout</button><button class="pg-tab ${state.provider === 'getyourguide' ? 'is-active' : ''}" data-provider="getyourguide">GetYourGuide</button></nav>
      ${providerSettings()}${destinationPanel()}</div>${editorModal()}`;
    bind();
  }

  function updateItem(id, patch) {
    current().destinations = normaliseOrder(current().destinations.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function bind() {
    app.querySelectorAll('[data-path]').forEach(element => element.addEventListener('input', event => {
      const path = event.currentTarget.dataset.path;
      let value = event.currentTarget.value;
      if (event.currentTarget.type === 'number') value = Number(value) || 1;
      if (path.startsWith('item.')) {
        const key = path.slice(5);
        if (key === 'slug') value = String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        if (key === 'code') value = String(value).toUpperCase().slice(0,12);
        updateItem(state.editingId, { [key]: value });
      } else setPath(path, value);
    }));
    app.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
      const path = button.dataset.toggle;
      if (path.startsWith('item.')) {
        const key = path.slice(5); const item = current().destinations.find(value => value.id === state.editingId); updateItem(state.editingId, { [key]: !item[key] });
      } else setPath(path, !path.split('.').reduce((value,key) => value[key], state.config));
      render();
    }));
    app.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', () => { state.provider = button.dataset.provider; state.search = ''; state.editingId = ''; render(); }));
    app.querySelector('[data-search]')?.addEventListener('input', event => { state.search = event.currentTarget.value; render(); app.querySelector('[data-search]')?.focus(); });
    app.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => { state.editingId = button.dataset.edit; render(); }));
    app.querySelectorAll('[data-visible]').forEach(button => button.addEventListener('click', () => { const item = current().destinations.find(value => value.id === button.dataset.visible); updateItem(item.id,{ enabled:!item.enabled }); render(); }));
    app.querySelectorAll('[data-feature]').forEach(button => button.addEventListener('click', () => { const item = current().destinations.find(value => value.id === button.dataset.feature); updateItem(item.id,{ featured:!item.featured }); render(); }));
    app.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => { const items = [...current().destinations].sort((a,b)=>a.sortOrder-b.sortOrder); const index=items.findIndex(item=>item.id===button.dataset.id); const target=index+Number(button.dataset.move); if(index>=0&&target>=0&&target<items.length){[items[index],items[target]]=[items[target],items[index]];current().destinations=normaliseOrder(items);render();} }));
    app.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
      const action = button.dataset.action;
      if (action === 'close') { state.editingId=''; render(); }
      if (action === 'add') { const id=`destination-${Date.now()}`; current().destinations.push({id,slug:id,name:'New destination',country:'Worldwide',code:'GL',badge:'',imageUrl:'',enabled:true,featured:false,providerLocationId:'',searchQuery:'',sortOrder:current().destinations.length}); state.editingId=id; render(); }
      if (action === 'remove') { const item=current().destinations.find(value=>value.id===state.editingId); if(item&&confirm(`Remove ${item.name} from this gallery?`)){current().destinations=normaliseOrder(current().destinations.filter(value=>value.id!==item.id));state.editingId='';render();} }
      if (action === 'reset') { if(confirm(`Reset the ${state.provider==='headout'?'Headout':'GetYourGuide'} gallery to the platform destination directory?`)){state.config[state.provider]=seedProvider(state.provider,state.catalogue[state.provider]);state.editingId='';render();} }
      if (action === 'save') await save();
    }));
  }

  async function save() {
    state.busy='save';state.message='';state.error='';render();
    try { const payload=await request('/api/admin/partner-galleries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:state.config})});state.config=payload.config;state.message='Partner galleries saved and published successfully.'; }
    catch(error){state.error=error.message||'Partner galleries could not be saved.';} finally{state.busy='';render();}
  }

  Promise.all([request('/api/admin/partner-galleries'),request('/api/partner-gallery-catalogue')]).then(([settings,catalogue]) => {
    state.catalogue=catalogue;
    state.config=settings.config;
    ['headout','getyourguide'].forEach(provider => {
      const seed=seedProvider(provider,catalogue[provider]);
      state.config[provider]={...seed,...state.config[provider],destinations:state.config[provider]?.destinations?.length?state.config[provider].destinations:seed.destinations};
    });
    render();
  }).catch(error => { app.innerHTML=`<div class="pg-message pg-message--error">${escapeHtml(error.message||'Partner Gallery Manager could not be loaded.')}</div>`; });
})();
