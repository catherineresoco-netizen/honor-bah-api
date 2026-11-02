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
    $('account-ui').hidden=true; $('account-offline').hidden=false;
    $('dashboard-mode').textContent = 'Local-only in this version';
    $('connect').disabled = true;
    $('key').disabled = true;
    $('dash-message').textContent = 'For security, the published static website cannot connect to your local API. Open http://localhost:3000 on the same computer running Honor BAH to use this dashboard.';
    return;
  }
  // Local-only account console; session cookie is HttpOnly and keys are shown only once.
  const accountMsg = (message,error=false) => { $('account-message').textContent=message; $('account-message').classList.toggle('error',error); };
  async function accountRequest(path,method='GET',data){
    const response=await fetch(`/v1/account/${path}`,{method,cache:'no-store',credentials:'same-origin',headers:method==='POST'?{'Content-Type':'application/json','X-HBAH-CSRF':'1'}:{},...(data?{body:JSON.stringify(data)}:{})});
    const result=await response.json();
    if(!response.ok) throw Error(result.message||result.error||`HTTP ${response.status}`);
    return result;
  }
  async function refreshAccount(){
    try{
      const info=await accountRequest('me');
      $('auth-panels').hidden=true;$('account-console').hidden=false;$('account-email').textContent=info.email;
      const list=$('account-key-list');list.replaceChildren();
      if(!info.keys.length) list.textContent='No keys yet. Create one above.';
      for(const key of info.keys){
        const item=document.createElement('div');item.className='key-entry';
        const txt=document.createElement('span');txt.textContent=`${key.name} · ${key.key_prefix}… · ${key.requests_used}/${key.monthly_limit} requests · ${key.revoked_at?'Revoked':'Active'}`;
        item.append(txt);
        if(!key.revoked_at){const b=document.createElement('button');b.type='button';b.className='button ghost';b.textContent='Revoke';b.addEventListener('click',async()=>{
          if(!confirm(`Revoke ${key.name}? This cannot be undone.`)) return;
          try{await accountRequest('keys/revoke','POST',{id:key.id});await refreshAccount();accountMsg('Key revoked.');}catch(e){accountMsg(e.message,true);}
        });item.append(b);}
        list.append(item);
      }
    }catch{
      $('auth-panels').hidden=false;$('account-console').hidden=true;
    }
  }
  for (const [form,path,fields] of [['signup-form','signup',['signup-email','signup-password']],['login-form','login',['login-email','login-password']]]) {
    $(form).addEventListener('submit',async e=>{
      e.preventDefault();try{
        const [email,password]=fields.map(id=>$(id).value);
        await accountRequest(path,'POST',{email,password});$(fields[1]).value='';accountMsg('Signed in successfully.');await refreshAccount();
      }catch(err){accountMsg(err.message,true);}
    });
  }
  $('new-key-form').addEventListener('submit',async e=>{
    e.preventDefault();try{
      const created=await accountRequest('keys','POST',{name:$('new-key-name').value});
      $('one-time-key').textContent=created.key;$('revealed-key').hidden=false;$('new-key-name').value='';
      await refreshAccount();accountMsg('Key created. Copy it now; it cannot be retrieved again.');
    }catch(err){accountMsg(err.message,true);}
  });
  $('copy-key').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('one-time-key').textContent);accountMsg('Key copied. Store it securely.');}catch{accountMsg('Copy unavailable. Select the key manually.',true);}});
  $('hide-key').addEventListener('click',()=>{$('one-time-key').textContent='';$('revealed-key').hidden=true;});
  $('logout').addEventListener('click',async()=>{
    try{await accountRequest('logout','POST',{});$('revealed-key').hidden=true;$('one-time-key').textContent='';await refreshAccount();accountMsg('Signed out.');}catch(e){accountMsg(e.message,true);}
  });
  refreshAccount();
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
