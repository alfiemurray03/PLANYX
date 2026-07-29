(() => {
  const params = new URLSearchParams(window.location.search);
  const reason = String(params.get('reason') || '').trim().slice(0, 500);
  const decision = String(params.get('decision') || 'deny').trim().slice(0, 40);
  const target = document.getElementById('restrictionReason');
  if (!target) return;
  const title = decision === 'review' || decision === 'step_up'
    ? 'Head Office review required'
    : 'Access blocked by Head Office';
  const safeReason = reason || 'Your Planyx session has been revoked. Access will remain unavailable until Head Office clears the restriction.';
  target.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = safeReason;
  target.append(strong, span);
  history.replaceState({}, '', '/account/access-restricted/');
})();
