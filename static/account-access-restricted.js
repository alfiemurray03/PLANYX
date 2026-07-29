(() => {
  const params = new URLSearchParams(window.location.search);
  const decision = String(params.get('decision') || 'deny').trim().toLowerCase().slice(0, 40);
  if (decision === 'step_up') {
    window.location.replace('/account/verification-required/');
    return;
  }

  const target = document.getElementById('restrictionReason');
  if (!target) return;
  target.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = decision === 'review' ? 'Head Office review required' : 'Access blocked by Head Office';
  const span = document.createElement('span');
  span.textContent = 'Your Planyx session has been revoked. Try signing in again after Head Office confirms that the restriction has been lifted.';
  target.append(strong, span);
  history.replaceState({}, '', '/account/access-restricted/');
})();
