(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  $('copyright-year').textContent = String(new Date().getFullYear());
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copied!'; }
      catch { button.textContent = 'Copy unavailable'; }
      setTimeout(() => { button.textContent = 'Copy PowerShell'; }, 1800);
    });
  }
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port === '3000';
  if (!local) {
    $('dashboard-mode').textContent = 'Local-only in this version';
    $('connect').disabled = true;
    $('key').disabled = true;
    $('dash-message').textContent = 'For security, the published static website cannot connect to your local API. Open http://localhost:3000 on the same computer running Honor BAH to use this dashboard.';
    return;
  }
  const setMessage = (message, error=false) => { $('dash-message').textContent = message; $('dash-message').classList.toggle('error', error); };
  $('connect').addEventListener('click', async () => {
    const secret = $('key').value.trim();
    if (!secret) { setMessage('Enter your API key to view usage.', true); return; }
    $('connect').disabled = true;
    setMessage('Checking usage...');
    try {
      const response = await fetch('/v1/usage', { headers: { 'X-API-Key': secret }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || `HTTP ${response.status}`);
      $('plan').textContent = result.plan;
      $('used').textContent = Number(result.requests_used).toLocaleString();
      $('remaining').textContent = Number(result.requests_remaining).toLocaleString();
      $('month').textContent = result.month;
      $('ratio').textContent = `${Number(result.requests_used).toLocaleString()} / ${Number(result.monthly_limit).toLocaleString()}`;
      $('progress').style.width = `${Math.min(100, Math.max(0, Number(result.requests_used) / Number(result.monthly_limit) * 100))}%`;
      $('usage-results').hidden = false;
      $('status').textContent = '● Connected';
      $('status').classList.add('good');
      $('key').value = '';
      setMessage('Connected. Key cleared from the input; re-enter it to refresh usage.');
    } catch (error) {
      $('usage-results').hidden = true;
      $('status').textContent = '● Not connected';
      $('status').classList.remove('good');
      setMessage(`Could not load usage: ${error.message}`, true);
    } finally { $('connect').disabled = false; }
  });
})();
