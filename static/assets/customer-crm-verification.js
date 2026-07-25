(() => {
  const match = window.location.pathname.match(/^\/admin\/users\/([^/?#]+)/i);
  if (!match) return;

  const customerEmail = decodeURIComponent(match[1] || '').trim().toLowerCase();
  if (!customerEmail) return;

  const endpoint = '/api/admin/customer-verification';
  const state = {
    payload: null,
    busy: '',
    error: '',
    notice: '',
    formHydrated: false,
    form: {
      supportPin: '',
      emailCode: '',
      reasonCode: '',
      supportChannel: '',
      caseReference: '',
      reasonDetail: '',
      adminPin: '',
    },
    reviews: {},
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value) {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf())
      ? String(value)
      : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  }

  function reasonLabel(value) {
    return state.payload?.reasons?.find(item => item.value === value)?.label || value || 'Not recorded';
  }

  function channelLabel(value) {
    return state.payload?.channels?.find(item => item.value === value)?.label || value || 'Not recorded';
  }

  async function api(body) {
    const response = await fetch(body
      ? endpoint
      : `${endpoint}?customer_email=${encodeURIComponent(customerEmail)}`, {
      method: body ? 'POST' : 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify({ ...body, customerEmail }) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      const suffix = payload.correlationId ? ` Reference: ${payload.correlationId}` : '';
      throw new Error(`${payload.error || 'Customer verification could not be completed.'}${suffix}`);
    }
    return payload;
  }

  function findHost() {
    const headings = Array.from(document.querySelectorAll('[data-slot="card-title"], h2, h3'));
    const title = headings.find(element => /verify customer identity/i.test(element.textContent || ''));
    const card = title?.closest('[data-slot="card"]');
    const content = card?.querySelector('[data-slot="card-content"]');
    return { card, content };
  }

  function mount() {
    const { card, content } = findHost();
    if (!card || !content) return null;
    card.classList.add('crm-verification-card');
    let root = content.querySelector('#crm-governed-verification-root');
    if (!root) {
      Array.from(content.children).forEach(child => {
        child.dataset.crmLegacyVerification = 'hidden';
        child.hidden = true;
      });
      root = document.createElement('div');
      root.id = 'crm-governed-verification-root';
      root.className = 'crm-verification-workspace';
      content.appendChild(root);
      bind(root);
    }
    return root;
  }

  function hydrateForm() {
    if (state.formHydrated || !state.payload) return;
    const own = state.payload.override?.ownRequest;
    if (own) {
      state.form.reasonCode = own.reason_code || '';
      state.form.supportChannel = own.support_channel || '';
      state.form.caseReference = own.case_reference || '';
      state.form.reasonDetail = own.reason_detail || '';
    } else {
      state.form.reasonCode = state.payload.reasons?.[0]?.value || '';
      state.form.supportChannel = state.payload.channels?.[0]?.value || '';
    }
    state.formHydrated = true;
  }

  function statusBanner() {
    const verification = state.payload?.verification || {};
    if (verification.verified) {
      return `<section class="crm-security-status crm-security-status--verified" aria-live="polite">
        <div class="crm-security-status__icon" aria-hidden="true">✓</div>
        <div>
          <p class="crm-security-eyebrow">Customer-specific access active</p>
          <h3>Identity verification completed</h3>
          <p>This administrator may access this customer record until <strong>${escapeHtml(formatDate(verification.expiresAt))}</strong>.</p>
          <dl class="crm-security-meta">
            <div><dt>Method</dt><dd>${escapeHtml(verification.method)}</dd></div>
            <div><dt>Assurance</dt><dd>${escapeHtml(verification.assuranceLevel || 'Standard')}</dd></div>
            ${verification.approvedBy ? `<div><dt>Approved by</dt><dd>${escapeHtml(verification.approvedBy)}</dd></div>` : ''}
          </dl>
        </div>
        <button class="crm-security-button crm-security-button--quiet" type="button" data-action="end-verification">End access</button>
      </section>`;
    }
    return `<section class="crm-security-status" aria-live="polite">
      <div class="crm-security-status__icon" aria-hidden="true">🔒</div>
      <div>
        <p class="crm-security-eyebrow">Protected customer record</p>
        <h3>Verify this customer before discussing protected information</h3>
        <p>Verification applies only to <strong>${escapeHtml(customerEmail)}</strong> and only to the signed-in administrator. Opening another customer record requires a fresh verification.</p>
      </div>
    </section>`;
  }

  function ordinaryVerification() {
    return `<section class="crm-security-grid" aria-label="Customer verification methods">
      <article class="crm-security-panel">
        <div class="crm-security-panel__heading">
          <span class="crm-security-panel__number">1</span>
          <div><h3>Customer Support PIN</h3><p>Use the single-use six-digit PIN displayed to the customer.</p></div>
        </div>
        <label class="crm-security-field">
          <span>Six-digit Support PIN</span>
          <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${escapeHtml(state.form.supportPin)}" data-field="supportPin" placeholder="000000" class="crm-security-code-input" />
        </label>
        <button type="button" class="crm-security-button" data-action="verify-support-pin" ${state.busy ? 'disabled' : ''}>${state.busy === 'verify-support-pin' ? 'Verifying…' : 'Verify Support PIN'}</button>
        <p class="crm-security-help">The PIN is single-use and the resulting CRM access lasts 15 minutes for this customer only.</p>
      </article>

      <article class="crm-security-panel">
        <div class="crm-security-panel__heading">
          <span class="crm-security-panel__number">2</span>
          <div><h3>Registered-email support code</h3><p>For telephone support, send a one-time code to the customer’s registered account email.</p></div>
        </div>
        <button type="button" class="crm-security-button crm-security-button--secondary" data-action="send-email-code" ${state.busy ? 'disabled' : ''}>${state.busy === 'send-email-code' ? 'Sending…' : 'Send code to customer email'}</button>
        <label class="crm-security-field">
          <span>Code supplied by the customer</span>
          <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${escapeHtml(state.form.emailCode)}" data-field="emailCode" placeholder="000000" class="crm-security-code-input" />
        </label>
        <button type="button" class="crm-security-button" data-action="verify-email-code" ${state.busy ? 'disabled' : ''}>${state.busy === 'verify-email-code' ? 'Checking…' : 'Verify email code'}</button>
        <div class="crm-security-advisory"><strong>Important:</strong> This confirms control of the registered email during support. It is not Microsoft MFA and must not be represented as high-assurance identity proof.</div>
      </article>
    </section>`;
  }

  function governanceFields() {
    const reasons = (state.payload?.reasons || []).map(item => `<option value="${escapeHtml(item.value)}" ${state.form.reasonCode === item.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
    const channels = (state.payload?.channels || []).map(item => `<option value="${escapeHtml(item.value)}" ${state.form.supportChannel === item.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
    return `<div class="crm-security-form-grid">
      <label class="crm-security-field"><span>Override reason</span><select data-field="reasonCode">${reasons}</select></label>
      <label class="crm-security-field"><span>Support or investigation channel</span><select data-field="supportChannel">${channels}</select></label>
      <label class="crm-security-field crm-security-field--wide"><span>Case, incident or enquiry reference <small>Required for legal/compliance and incident reasons</small></span><input type="text" maxlength="120" value="${escapeHtml(state.form.caseReference)}" data-field="caseReference" placeholder="For example: ENQ-2026-00125 or INC-2026-004" /></label>
      <label class="crm-security-field crm-security-field--wide"><span>Professional justification</span><textarea rows="5" maxlength="1500" data-field="reasonDetail" placeholder="Explain why normal customer verification cannot be completed, what checks have already been performed, and why access is necessary.">${escapeHtml(state.form.reasonDetail)}</textarea><small class="crm-security-counter">${state.form.reasonDetail.length}/1500 characters · minimum 20</small></label>
    </div>`;
  }

  function requesterOverride() {
    const admin = state.payload?.admin || {};
    const own = state.payload?.override?.ownRequest;
    if (admin.canApproveOverride) {
      return `<article class="crm-security-panel crm-security-panel--privileged">
        <div class="crm-security-panel__heading"><span class="crm-security-panel__number">3</span><div><h3>Privileged administrator override</h3><p>Use only when ordinary verification cannot be completed. The action is customer-specific, time-limited and permanently audited.</p></div></div>
        ${governanceFields()}
        <label class="crm-security-field crm-security-pin-field"><span>Re-enter your own administrator PIN</span><input type="password" inputmode="numeric" autocomplete="off" maxlength="4" value="${escapeHtml(state.form.adminPin)}" data-field="adminPin" placeholder="••••" /></label>
        <button type="button" class="crm-security-button crm-security-button--danger" data-action="authorise-override" ${state.busy ? 'disabled' : ''}>${state.busy === 'authorise-override' ? 'Authorising…' : 'Authorise customer-specific override'}</button>
        <p class="crm-security-help">Signed in as ${escapeHtml(admin.name || admin.email)} · ${escapeHtml(admin.role)}. Your PIN must be entered again for each customer override.</p>
      </article>`;
    }

    if (own?.status === 'Approved') {
      return `<article class="crm-security-panel crm-security-panel--approved">
        <div class="crm-security-panel__heading"><span class="crm-security-panel__number">3</span><div><h3>Supervisor approval granted</h3><p>Approval was granted by ${escapeHtml(own.reviewed_by || 'an authorised supervisor')} and expires ${escapeHtml(formatDate(own.approved_until))}.</p></div></div>
        <dl class="crm-security-summary"><div><dt>Reason</dt><dd>${escapeHtml(reasonLabel(own.reason_code))}</dd></div><div><dt>Channel</dt><dd>${escapeHtml(channelLabel(own.support_channel))}</dd></div><div><dt>Supervisor note</dt><dd>${escapeHtml(own.review_note || 'Approved')}</dd></div></dl>
        <label class="crm-security-field crm-security-pin-field"><span>Re-enter your own administrator PIN</span><input type="password" inputmode="numeric" autocomplete="off" maxlength="4" value="${escapeHtml(state.form.adminPin)}" data-field="adminPin" placeholder="••••" /></label>
        <button type="button" class="crm-security-button" data-action="authorise-override" data-request-id="${escapeHtml(own.id)}" ${state.busy ? 'disabled' : ''}>${state.busy === 'authorise-override' ? 'Completing…' : 'Complete approved override'}</button>
        <p class="crm-security-help">The supervisor’s approval alone does not open the record. You must re-enter your own PIN to consume it.</p>
      </article>`;
    }

    if (own?.status === 'Pending') {
      return `<article class="crm-security-panel crm-security-panel--pending">
        <div class="crm-security-panel__heading"><span class="crm-security-panel__number">3</span><div><h3>Supervisor approval pending</h3><p>Your request was submitted ${escapeHtml(formatDate(own.requested_at))} and expires ${escapeHtml(formatDate(own.expires_at))}.</p></div></div>
        <dl class="crm-security-summary"><div><dt>Request</dt><dd>${escapeHtml(own.id)}</dd></div><div><dt>Reason</dt><dd>${escapeHtml(reasonLabel(own.reason_code))}</dd></div><div><dt>Channel</dt><dd>${escapeHtml(channelLabel(own.support_channel))}</dd></div><div><dt>Justification</dt><dd>${escapeHtml(own.reason_detail)}</dd></div></dl>
        <p class="crm-security-help">A supervisor or platform administrator must review this request. Refresh this panel after they respond.</p>
        <button type="button" class="crm-security-button crm-security-button--secondary" data-action="refresh" ${state.busy ? 'disabled' : ''}>Refresh approval status</button>
      </article>`;
    }

    return `<article class="crm-security-panel crm-security-panel--privileged">
      <div class="crm-security-panel__heading"><span class="crm-security-panel__number">3</span><div><h3>Request a supervised override</h3><p>Your role requires independent approval before protected CRM access can be opened.</p></div></div>
      ${governanceFields()}
      <button type="button" class="crm-security-button crm-security-button--danger" data-action="request-override" ${state.busy ? 'disabled' : ''}>${state.busy === 'request-override' ? 'Submitting…' : 'Request supervisor approval'}</button>
      <p class="crm-security-help">The request records your identity, role, customer, reason, channel and time. A supervisor cannot approve their own request.</p>
    </article>`;
  }

  function approvalQueue() {
    const admin = state.payload?.admin || {};
    const pending = state.payload?.override?.pendingForReview || [];
    if (!admin.canApproveOverride || !pending.length) return '';
    return `<section class="crm-security-approvals"><div class="crm-security-section-heading"><div><p class="crm-security-eyebrow">Supervisor queue</p><h3>Override requests awaiting review</h3></div><span class="crm-security-badge">${pending.length} pending</span></div>
      <div class="crm-security-approval-list">${pending.map(request => {
        const draft = state.reviews[request.id] || { note: '', pin: '' };
        return `<article class="crm-security-approval" data-review-card="${escapeHtml(request.id)}">
          <div class="crm-security-approval__top"><div><strong>${escapeHtml(request.requested_by)}</strong><span>${escapeHtml(request.requester_role || 'Administrator')}</span></div><code>${escapeHtml(request.id)}</code></div>
          <dl class="crm-security-summary"><div><dt>Customer</dt><dd>${escapeHtml(request.customer_email)}</dd></div><div><dt>Reason</dt><dd>${escapeHtml(reasonLabel(request.reason_code))}</dd></div><div><dt>Channel</dt><dd>${escapeHtml(channelLabel(request.support_channel))}</dd></div><div><dt>Reference</dt><dd>${escapeHtml(request.case_reference || 'Not supplied')}</dd></div><div class="crm-security-summary__wide"><dt>Justification</dt><dd>${escapeHtml(request.reason_detail)}</dd></div></dl>
          <label class="crm-security-field"><span>Supervisor review note</span><textarea rows="3" maxlength="1000" data-review-field="note" data-request-id="${escapeHtml(request.id)}" placeholder="Record the checks performed and the basis for your decision.">${escapeHtml(draft.note)}</textarea></label>
          <label class="crm-security-field crm-security-pin-field"><span>Your administrator PIN</span><input type="password" inputmode="numeric" autocomplete="off" maxlength="4" data-review-field="pin" data-request-id="${escapeHtml(request.id)}" value="${escapeHtml(draft.pin)}" placeholder="••••" /></label>
          <div class="crm-security-actions"><button type="button" class="crm-security-button" data-action="review-approve" data-request-id="${escapeHtml(request.id)}" ${state.busy ? 'disabled' : ''}>Approve</button><button type="button" class="crm-security-button crm-security-button--quiet-danger" data-action="review-reject" data-request-id="${escapeHtml(request.id)}" ${state.busy ? 'disabled' : ''}>Reject</button></div>
        </article>`;
      }).join('')}</div>
    </section>`;
  }

  function render() {
    const root = mount();
    if (!root) return;
    if (!state.payload) {
      root.innerHTML = `<div class="crm-security-loading"><span></span><p>${escapeHtml(state.error || 'Loading secure verification controls…')}</p><button type="button" class="crm-security-button crm-security-button--secondary" data-action="refresh">Retry</button></div>`;
      return;
    }
    hydrateForm();
    root.innerHTML = `${statusBanner()}
      ${state.error ? `<div class="crm-security-message crm-security-message--error" role="alert">${escapeHtml(state.error)}</div>` : ''}
      ${state.notice ? `<div class="crm-security-message crm-security-message--success" role="status">${escapeHtml(state.notice)}</div>` : ''}
      <section class="crm-security-context"><div><span>Customer</span><strong>${escapeHtml(customerEmail)}</strong></div><div><span>Administrator</span><strong>${escapeHtml(state.payload.admin?.name || state.payload.admin?.email)}</strong><small>${escapeHtml(state.payload.admin?.role)}</small></div><div><span>Protocol</span><strong>Fresh verification per customer</strong><small>${escapeHtml(String(state.payload.policy?.sessionMinutes || 15))}-minute session</small></div></section>
      ${state.payload.verification?.verified ? '' : ordinaryVerification()}
      ${state.payload.verification?.verified ? '' : requesterOverride()}
      ${approvalQueue()}
      <section class="crm-security-protocol"><h3>Security protocol</h3><ol><li>Confirm you are working on the correct customer record.</li><li>Use the customer’s Support PIN or registered-email code wherever possible.</li><li>Use override only as an exceptional route with a complete professional justification.</li><li>Never ask for the customer’s Microsoft password or MFA approval.</li><li>End access when the support interaction is complete.</li></ol></section>`;
  }

  async function refresh({ silent = false } = {}) {
    if (!silent) state.busy = 'refresh';
    state.error = '';
    render();
    try {
      state.payload = await api();
      if (!silent) state.notice = '';
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Verification controls could not be loaded.';
    } finally {
      state.busy = '';
      render();
    }
  }

  async function act(action, extra = {}) {
    state.busy = action;
    state.error = '';
    state.notice = '';
    render();
    try {
      const payload = await api({ action, ...extra });
      state.payload = payload;
      state.form.supportPin = '';
      state.form.emailCode = '';
      state.form.adminPin = '';
      Object.keys(state.reviews).forEach(key => { state.reviews[key].pin = ''; });
      const successMessages = {
        verify_support_pin: 'Customer identity verified using the single-use Support PIN.',
        send_email_code: 'A one-time verification code was sent to the customer’s registered email.',
        verify_email_code: 'Registered-email support verification completed.',
        request_override: 'Supervisor approval request submitted and recorded.',
        authorise_override: 'Customer-specific override authorised and audited.',
        end_verification: 'Customer verification session ended.',
      };
      state.notice = successMessages[action] || 'Action completed and recorded.';
      if (['verify_support_pin', 'verify_email_code', 'authorise_override', 'end_verification'].includes(action)) {
        window.setTimeout(() => window.location.reload(), 350);
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'The secure action could not be completed.';
    } finally {
      state.busy = '';
      render();
    }
  }

  function bind(root) {
    root.addEventListener('input', event => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      const field = target.dataset.field;
      if (field && field in state.form) {
        let value = target.value;
        if (['supportPin', 'emailCode'].includes(field)) value = value.replace(/\D/g, '').slice(0, 6);
        if (field === 'adminPin') value = value.replace(/\D/g, '').slice(0, 4);
        state.form[field] = value;
        if (field === 'reasonDetail') {
          const counter = root.querySelector('.crm-security-counter');
          if (counter) counter.textContent = `${value.length}/1500 characters · minimum 20`;
        }
      }
      const reviewField = target.dataset.reviewField;
      const requestId = target.dataset.requestId;
      if (reviewField && requestId) {
        state.reviews[requestId] ||= { note: '', pin: '' };
        state.reviews[requestId][reviewField] = reviewField === 'pin' ? target.value.replace(/\D/g, '').slice(0, 4) : target.value;
      }
    });

    root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'refresh') return void refresh();
      if (action === 'verify-support-pin') return void act('verify_support_pin', { pin: state.form.supportPin });
      if (action === 'send-email-code') return void act('send_email_code');
      if (action === 'verify-email-code') return void act('verify_email_code', { code: state.form.emailCode });
      if (action === 'request-override') return void act('request_override', {
        reasonCode: state.form.reasonCode,
        reasonDetail: state.form.reasonDetail,
        supportChannel: state.form.supportChannel,
        caseReference: state.form.caseReference,
      });
      if (action === 'authorise-override') return void act('authorise_override', {
        requestId: button.dataset.requestId || state.payload?.override?.ownRequest?.id || '',
        adminPin: state.form.adminPin,
        reasonCode: state.form.reasonCode,
        reasonDetail: state.form.reasonDetail,
        supportChannel: state.form.supportChannel,
        caseReference: state.form.caseReference,
      });
      if (action === 'end-verification') return void act('end_verification');
      if (action === 'review-approve' || action === 'review-reject') {
        const requestId = button.dataset.requestId;
        const draft = state.reviews[requestId] || { note: '', pin: '' };
        state.busy = action;
        state.error = '';
        render();
        void api({
          action: 'review_override',
          customerEmail,
          requestId,
          decision: action === 'review-approve' ? 'approve' : 'reject',
          reviewNote: draft.note,
          adminPin: draft.pin,
        }).then(payload => {
          state.payload = payload;
          state.notice = `Override request ${action === 'review-approve' ? 'approved' : 'rejected'} and audited.`;
          delete state.reviews[requestId];
        }).catch(error => {
          state.error = error instanceof Error ? error.message : 'The review could not be completed.';
        }).finally(() => {
          state.busy = '';
          render();
        });
      }
    });
  }

  const observer = new MutationObserver(() => {
    const root = mount();
    if (root && state.payload && !root.innerHTML.trim()) render();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
  void refresh();
})();
