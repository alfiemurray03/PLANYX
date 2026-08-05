(() => {
  const statusBox = document.getElementById('ageAssuranceStatus');
  const consent = document.getElementById('ageAssuranceConsent');
  const startButton = document.getElementById('startAgeAssurance');
  const openLink = document.getElementById('openVerificationLink');
  const signInLink = document.getElementById('ageAssuranceSignIn');
  let pollTimer = 0;

  function setStatus(title, message, tone = 'neutral') {
    if (!statusBox) return;
    statusBox.dataset.tone = tone;
    const strong = statusBox.querySelector('strong');
    const span = statusBox.querySelector('span');
    if (strong) strong.textContent = title;
    if (span) span.textContent = message;
  }

  async function request(method = 'GET', payload) {
    const response = await fetch('/api/head-office-age-assurance', {
      method,
      credentials: 'include',
      headers: method === 'POST' ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: method === 'POST' ? JSON.stringify(payload || {}) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const error = new Error(data?.error?.message || 'Head Office age assurance is temporarily unavailable.');
      error.code = data?.error?.code || 'AGE_ASSURANCE_UNAVAILABLE';
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function stopPolling() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = 0;
  }

  function schedulePoll() {
    stopPolling();
    pollTimer = window.setTimeout(() => void checkStatus(true), 5000);
  }

  async function checkStatus(isPoll = false) {
    try {
      const data = await request('GET');
      if (data.allowed === true) {
        stopPolling();
        setStatus('Age assurance confirmed', 'Head Office has released the Sousa Murray Planeia age requirement. You can now sign in again.', 'success');
        if (startButton) startButton.hidden = true;
        if (consent?.closest('.consent-row')) consent.closest('.consent-row').hidden = true;
        if (openLink) openLink.hidden = true;
        if (signInLink) {
          signInLink.hidden = false;
          signInLink.href = data.redirectUrl || '/account/login';
        }
        return;
      }
      const age = Number(data.requiredAge || 16);
      if (!isPoll) setStatus(`${age}+ confirmation required`, data.reason || `Head Office requires confirmation that you are aged ${age} or over.`, 'warning');
      else setStatus('Waiting for Didit', 'Complete the check in the Didit window. This page is checking the signed Head Office decision automatically.', 'pending');
      if (data.newSessionsAllowed === false && data.deploymentStatus === 'paused') {
        setStatus('Age assurance is paused', data.reason || 'Head Office has temporarily paused new checks. Existing valid results remain recognised.', 'warning');
        if (startButton) startButton.disabled = true;
        return;
      }
      schedulePoll();
    } catch (error) {
      stopPolling();
      const expired = error.code === 'AGE_ASSURANCE_CHALLENGE_REQUIRED';
      setStatus(expired ? 'This verification request has expired' : 'Head Office check unavailable', error.message, 'error');
      if (startButton) startButton.disabled = true;
      if (consent) consent.disabled = true;
      if (signInLink) {
        signInLink.hidden = false;
        signInLink.href = '/account/login';
        signInLink.textContent = 'Sign in again';
      }
    }
  }

  async function startVerification() {
    if (!consent?.checked) {
      setStatus('Consent required', 'Read and accept the customer age-assurance disclosure before continuing.', 'warning');
      consent?.focus();
      return;
    }
    if (startButton) startButton.disabled = true;
    setStatus('Creating your secure check', 'Sousa Murray Planeia is asking Head Office to create a Didit age-assurance session.', 'pending');

    const providerWindow = window.open('', 'planyx_didit_age_assurance', 'popup,width=560,height=760');
    if (providerWindow) {
      providerWindow.document.title = 'Preparing secure age check';
      providerWindow.document.body.textContent = 'Preparing your secure Didit age check…';
      providerWindow.opener = null;
    }

    try {
      const data = await request('POST', {
        consentAccepted: true,
        consentVersion: 'planyx-head-office-age-v1'
      });
      if (data.allowed === true) {
        if (providerWindow && !providerWindow.closed) providerWindow.close();
        return checkStatus();
      }
      if (!data.verificationUrl) throw new Error('Head Office did not return a secure Didit link.');
      if (providerWindow && !providerWindow.closed) providerWindow.location.replace(data.verificationUrl);
      if (openLink) {
        openLink.href = data.verificationUrl;
        openLink.hidden = false;
      }
      setStatus('Didit check opened', `Complete the ${Number(data.requiredAge || 16)}+ check in the new window. Head Office will update this page after the signed result arrives.`, 'pending');
      schedulePoll();
    } catch (error) {
      if (providerWindow && !providerWindow.closed) providerWindow.close();
      setStatus('The age check could not start', error.message, 'error');
      if (startButton) startButton.disabled = false;
    }
  }

  startButton?.addEventListener('click', () => void startVerification());
  window.addEventListener('focus', () => void checkStatus(true));
  window.addEventListener('beforeunload', stopPolling);
  void checkStatus();
})();
