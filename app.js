(function(){
'use strict';
var LS={user:'nx_user',acc:'nx_accounts',usage:'nx_daily_searches'};
var RESULT_LIMIT=5;
var $=function(id){return document.getElementById(id)};
var state={user:null,manifest:[],files:[],authReady:false};
fetch('/api/health',{cache:'no-store',credentials:'same-origin'}).catch(function(){msg($('searchMsg'),'Serveur non détecté : lancez « python server.py » puis ouvrez http://localhost:8000.','err')});
var fields={'f-nom':'nom','f-prenom':'prenom','f-email':'email','f-ville':'ville','f-code-postal':'codepostal','f-naissance':'naissance','f-tel':'telephone','f-entreprise':'entreprise','f-pseudo':'pseudo','f-pays':'pays'};
var labels={'f-nom':'Nom','f-prenom':'Prénom','f-email':'Email','f-ville':'Ville','f-code-postal':'Code postal','f-naissance':'Naissance','f-tel':'Téléphone','f-entreprise':'Entreprise','f-pseudo':'Pseudo','f-pays':'Pays'};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function msg(el,text,kind){if(el)el.innerHTML=text?'<div class="msg '+(kind||'')+'">'+text+'</div>':''}
function go(page){document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on')});var el=$('page-'+page);if(el)el.classList.add('on');document.querySelectorAll('#nav [data-go]').forEach(function(b){b.classList.toggle('on',b.dataset.go===page)});window.scrollTo({top:0,behavior:'smooth'});if(page==='recherche'&&!state.authReady){refreshMe().then(function(){state.authReady=true;renderAuth()})}}
document.addEventListener('click',function(e){var t=e.target.closest('[data-go]');if(t){e.preventDefault();go(t.dataset.go)}});

// Tarifs -> Contact -> Discord
document.addEventListener('click',function(e){
  var plan=e.target.closest('.plan-choice');
  if(!plan)return;
  e.preventDefault();
  var selected=plan.dataset.plan||'offre sélectionnée';
  var box=$('selectedPlan');
  if(box){box.hidden=false;box.innerHTML='<strong>Offre sélectionnée : '+esc(selected)+'</strong><span>Pour finaliser votre demande, rejoignez le serveur Discord ci-dessous.</span>';}
  go('contact');
});
var discordButtons=document.querySelectorAll('.discord');
discordButtons.forEach(function(btn){btn.addEventListener('click',function(){if(btn.tagName.toLowerCase()!=='a')window.open('https://discord.gg/SFYPrQwX2C','_blank','noopener');});});
function renderAuth(){if($('authBtn'))$('authBtn').textContent=state.user?'Déconnexion':'Connexion';if($('accountCurrent'))$('accountCurrent').textContent=state.user?(state.user.pseudo+' · '+state.user.email):'Aucun compte connecté';updateCreditCounter()}
async function api(path, data, method){
  var opt={method:method||'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin'};
  if(data!==undefined)opt.body=JSON.stringify(data);
  var res;
  try{res=await fetch(path,opt)}catch(e){throw new Error('Serveur API inaccessible. Lancez « python server.py » et ouvrez le site via http://localhost:8000 (pas en fichier local).')}
  var text=''; try{text=await res.text()}catch(e){}
  var out={}; try{out=text?JSON.parse(text):{}}catch(e){}
  if(!res.ok)throw new Error(out.error||('Erreur serveur HTTP '+res.status));
  return out;
}
async function refreshMe(){try{var r=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});if(!r.ok){state.user=null;updateCreditCounter();return null}var d=await r.json();if(d.ok&&d.user){state.user=d.user;updateCreditCounter();return d.user}state.user=null;updateCreditCounter();return null}catch(e){state.user=null;updateCreditCounter();return null}}
async function ensureAuth(){if(state.user&&typeof state.user==='object'&&state.user.email)return state.user;var u=await refreshMe();state.authReady=true;renderAuth();return u}
function updateCreditCounter(){var el=$('creditCounter');if(el)el.textContent=state.user?(state.user.credits+' crédit'+(state.user.credits>1?'s':'')+' · '+state.user.pseudo):'Connexion requise'}
$('authBtn').addEventListener('click',async function(){if(state.user){try{await api('/api/logout',{})}catch(e){}state.user=null;renderAuth();go('accueil')}else go('auth')});
$('authTabs').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;document.querySelectorAll('#authTabs button').forEach(function(x){x.classList.toggle('on',x===b)});$('authSubmit').dataset.mode=b.dataset.tab;$('authSubmit').textContent=b.dataset.tab==='signup'?'Créer mon compte':'Se connecter';$('pseudoLabel').style.display=b.dataset.tab==='signup'?'block':'none';$('au-pseudo').style.display=b.dataset.tab==='signup'?'block':'none';msg($('authMsg'),'')});
$('authSubmit').addEventListener('click',async function(){var email=$('au-email').value.trim().toLowerCase(),pseudo=$('au-pseudo').value.trim(),pass=$('au-pass').value,mode=this.dataset.mode||'login';if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return msg($('authMsg'),'Email invalide.','err');if(pass.length<6)return msg($('authMsg'),'Mot de passe : 6 caractères minimum.','err');if(mode==='signup'&&pseudo.length<2)return msg($('authMsg'),'Pseudo : 2 caractères minimum.','err');this.disabled=true;try{var d=await api(mode==='signup'?'/api/register':'/api/login',mode==='signup'?{pseudo:pseudo,email:email,password:pass}:{email:email,password:pass});state.user=d.user;renderAuth();msg($('authMsg'),mode==='signup'?'Compte créé avec 5 crédits. Chaque crédit = 1 recherche.':'Connexion réussie.','ok');setTimeout(function(){go('recherche')},300)}catch(e){msg($('authMsg'),e.message,'err')}finally{this.disabled=false}});
$('logoutBtn').addEventListener('click',async function(){try{await api('/api/logout',{})}catch(e){}state.user=null;renderAuth();msg($('accountMsg'),'Déconnexion effectuée.','ok');go('accueil')});
$('changePasswordBtn').addEventListener('click',async function(){try{await api('/api/change-password',{old:$('accountOldPass').value,new:$('accountNewPass').value});msg($('accountMsg'),'Mot de passe mis à jour.','ok')}catch(e){msg($('accountMsg'),e.message,'err')}});
$('deleteAccountBtn').addEventListener('click',async function(){if(!state.user||!confirm('Supprimer le compte ?'))return;try{await api('/api/delete-account',{});state.user=null;renderAuth();go('accueil')}catch(e){msg($('accountMsg'),e.message,'err')}});

// Administration: zone invisible à gauche de Accueil, sans l'afficher dans la navigation.
$('adminHotspot').addEventListener('click',function(){go('admin')});
$('adminLoginBtn').addEventListener('click',async function(){try{await api('/api/admin/login',{password:$('adminPassword').value});$('adminLoginPanel').hidden=true;$('adminPanel').hidden=false;loadAdminUsers()}catch(e){msg($('adminMsg'),e.message,'err')}});
$('adminRefresh').addEventListener('click',loadAdminUsers);
async function loadAdminUsers(){try{var r=await fetch('/api/admin/users',{cache:'no-store',credentials:'same-origin'});var d=await r.json();if(!r.ok)throw new Error(d.error||'Admin requis.');var box=$('adminUsers');box.innerHTML=d.users.length?d.users.map(function(u){return '<div class="admin-user '+(u.banned?'is-banned':'')+'"><div><strong>'+esc(u.pseudo)+'</strong><span>'+esc(u.email)+'</span></div><div class="admin-user-meta"><b>'+u.credits+' crédits</b><button class="secondary tiny" data-admin-credit="1" data-email="'+esc(u.email)+'">+1</button><button class="secondary tiny" data-admin-credit="-1" data-email="'+esc(u.email)+'">−1</button><button class="secondary tiny" data-admin-credit="5" data-email="'+esc(u.email)+'">+5</button><button class="secondary tiny" data-admin-credit="-5" data-email="'+esc(u.email)+'">−5</button><button class="secondary tiny" data-admin-set-credit="1" data-email="'+esc(u.email)+'">Définir</button><button class="secondary tiny" data-admin-reset="1" data-email="'+esc(u.email)+'">↻ Usage</button><button class="'+(u.banned?'primary':'danger')+' tiny" data-admin-ban="'+(!u.banned)+'" data-email="'+esc(u.email)+'">'+(u.banned?'Autoriser':'Interdire')+'</button><button class="danger tiny" data-admin-delete="1" data-email="'+esc(u.email)+'">Supprimer</button></div></div>'}).join(''):'<div class="empty">Aucun compte enregistré.</div>'}catch(e){msg($('adminMsg'),e.message,'err')}}
document.addEventListener('click',async function(e){var c=e.target.closest('[data-admin-credit]');if(c){try{await api('/api/admin/credits',{email:c.dataset.email,delta:Number(c.dataset.adminCredit)});await refreshMe();await loadAdminUsers()}catch(err){msg($('adminMsg'),err.message,'err')}}var set=e.target.closest('[data-admin-set-credit]');if(set){var amount=prompt('Nouveau nombre de crédits :');if(amount!==null){try{await api('/api/admin/set-credits',{email:set.dataset.email,credits:Number(amount)});await refreshMe();await loadAdminUsers()}catch(err){msg($('adminMsg'),err.message,'err')}}}var reset=e.target.closest('[data-admin-reset]');if(reset){try{await api('/api/admin/reset-usage',{email:reset.dataset.email});await refreshMe();await loadAdminUsers()}catch(err){msg($('adminMsg'),err.message,'err')}}var b=e.target.closest('[data-admin-ban]');if(b){try{await api('/api/admin/ban',{email:b.dataset.email,banned:b.dataset.adminBan==='true'});await refreshMe();await loadAdminUsers()}catch(err){msg($('adminMsg'),err.message,'err')}}var del=e.target.closest('[data-admin-delete]');if(del&&confirm('Supprimer définitivement ce compte ?')){try{await api('/api/admin/delete-user',{email:del.dataset.email});await refreshMe();await loadAdminUsers()}catch(err){msg($('adminMsg'),err.message,'err')}}});
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function normValue(s){return normalize(s).replace(/[^a-z0-9]/g,'')}
var aliases={nom:'nom',surname:'nom',lastname:'nom',last_name:'nom',familyname:'nom',family_name:'nom',prenom:'prenom',firstname:'prenom',first_name:'prenom',name:'nom',fullname:'fullname',full_name:'fullname',email:'email',mail:'email',courriel:'email',ville:'ville',city:'ville',codepostal:'codepostal',code_postal:'codepostal',cp:'codepostal',postal:'codepostal',naissance:'naissance',birth:'naissance',birthdate:'naissance',annee:'naissance',telephone:'telephone',tel:'telephone',phone:'telephone',mobile:'telephone',entreprise:'entreprise',company:'entreprise',societe:'entreprise',pseudo:'pseudo',username:'pseudo',identifiant:'pseudo',pays:'pays',country:'pays',adresse:'adresse',address:'adresse',secteur:'secteur',contact:'contact'};
function canonical(k){var n=normalize(k).replace(/[^a-z0-9_ ]/g,'').replace(/\s+/g,'_');return aliases[n]||n}
function parseLine(line){var raw=line.trim(),r={_raw:raw};if(!raw)return r;var parts=raw.split('|');parts.forEach(function(part){var p=part.split('=');if(p.length>1){var key=canonical(p.shift());var value=p.join('=').trim();if(key)value&&(r[key]=value)}else{var colon=part.indexOf(':');if(colon>0){var k=canonical(part.slice(0,colon));var v=part.slice(colon+1).trim();if(k&&v)r[k]=v}}});if(Object.keys(r).length===1){var sep=raw.split(/[;,\t]/).map(function(x){return x.trim()}).filter(Boolean);if(sep.length>=2){if(!r.prenom&&!r.nom){r.prenom=sep[0];r.nom=sep[1]}}}return r}
function inferNameFields(record){var r={};Object.keys(record||{}).forEach(function(k){if(k!=='_raw')r[canonical(k)]=record[k]});if(!r.nom&&!r.prenom&&r.fullname){var t=String(r.fullname).trim().split(/\s+/);if(t.length>1){r.prenom=t.slice(0,-1).join(' ');r.nom=t[t.length-1]}else r.nom=t[0]}if(!r.nom&&!r.prenom&&r._raw){var raw=r._raw.replace(/\|/g,' ');var m=raw.match(/(?:^|\s)([A-Za-zÀ-ÿ'-]+)\s+([A-Za-zÀ-ÿ'-]+)(?:\s|$)/);if(m){r.prenom=m[1];r.nom=m[2]}}return r}
async function loadDatabase(){
  try{
    var res=await fetch('database/index.json',{cache:'no-store'});
    if(!res.ok)throw new Error('Impossible de lire database/index.json');
    var data=await res.json(), names=Array.isArray(data.files)?data.files:[];
    state.manifest=[];
    for(var i=0;i<names.length;i++){
      var n=names[i];
      if(!/^[^/\\]+\.(txt|csv|json)$/i.test(n))continue;
      try{
        var test=await fetch('database/'+encodeURIComponent(n),{method:'HEAD',cache:'no-store'});
        if(test.ok)state.manifest.push(n);
      }catch(e){}
    }
    if(!state.manifest.length && names.length){
      state.manifest=names.filter(function(n){return /^[^/\\]+\.(txt|csv|json)$/i.test(n)});
    }
    state.files=state.manifest.map(function(n){return{name:n,lines:null}});
    refreshInfo();
  }catch(e){msg($('searchMsg'),'Impossible de charger la base : '+esc(e.message),'err')}
}

function refreshInfo(){
  if(!$('corpusInfo'))return;
  $('corpusInfo').textContent=state.files.length+' base(s) · lecture à la demande';
}

async function collect(){return{records:[],failed:[]}}

function matches(record,key,value){var v=normValue(value);if(!v)return true;var r=inferNameFields(record);var raw=normValue(record&&record._raw||'');if(raw&&raw.includes(v))return true;if(key==='telephone'){return normValue(r.telephone||'').includes(v)}if(key==='codepostal'){return normValue(r.codepostal||'')===v||normValue(r.codepostal||'').includes(v)}if(key==='naissance'){return normValue(r.naissance||'').includes(v)}var candidates=[];if(key==='nom')candidates=[r.nom];else if(key==='prenom')candidates=[r.prenom];else if(key==='email')candidates=[r.email];else if(key==='ville')candidates=[r.ville];else if(key==='entreprise')candidates=[r.entreprise];else if(key==='pseudo')candidates=[r.pseudo,r.identifiant];else if(key==='pays')candidates=[r.pays];else if(key==='adresse')candidates=[r.adresse];else candidates=Object.keys(r).map(function(k){return r[k]});return candidates.some(function(x){return normValue(x).includes(v)})}
function doFilter(records,criteria,limit){return records.filter(function(r){return Object.keys(criteria).every(function(k){return matches(r,k,criteria[k])})}).slice(0,limit)}
function initials(r){return ((r.prenom||'')[0]||'')+((r.nom||'')[0]||'')||'?'}
function renderResults(records){var zone=$('resultZone');if(!records.length){zone.innerHTML='<div class="empty">Aucun résultat trouvé.</div>';return}zone.innerHTML='<div class="results">'+records.map(function(x){var r=inferNameFields(x),name=[r.prenom,r.nom].filter(Boolean).join(' ')||r.entreprise||'Fiche';var rows=['email','ville','codepostal','naissance','telephone','entreprise','pseudo','pays','adresse','secteur','contact'].filter(function(k){return r[k]}).slice(0,7).map(function(k){var l={email:'Email',ville:'Ville',codepostal:'Code postal',naissance:'Naissance',telephone:'Téléphone',entreprise:'Entreprise',pseudo:'Pseudo',pays:'Pays',adresse:'Adresse',secteur:'Secteur',contact:'Contact'}[k]||k;return '<dt>'+l+'</dt><dd>'+esc(r[k])+'</dd>'}).join('');return '<article class="rcard"><div class="name"><span class="avatar">'+esc(initials(r))+'</span>'+esc(name)+'</div><dl class="kv">'+rows+'</dl></article>'}).join('')+'</div>'}
function criteriaFromForm(){var c={};Object.keys(fields).forEach(function(id){var el=$(id);if(el){var v=el.value.trim();if(v)c[fields[id]]=v}});var q=$('quickSearch').value.trim();if(q)c._all=q;return c}
async function consumeCredit(){if(!state.user){go('auth');return false}try{var d=await api('/api/use-credit',{});state.user.credits=d.credits;state.user.dailyRemaining=d.daily_remaining;updateCreditCounter();return true}catch(e){msg($('searchMsg'),e.message,'err');updateCreditCounter();return false}}
function refreshUsage(){updateCreditCounter()}

function renderGeminiResult(data){
  var zone=$('resultZone'); if(!zone)return;
  var columns=Array.isArray(data.columns)?data.columns:[];
  var rows=Array.isArray(data.rows)?data.rows.slice(0,5):[];
  if(!rows.length){zone.innerHTML='<div class="empty"><div style="font-size:28px">⌕</div><strong>Aucun résultat trouvé par Nexus.</strong><p>Nexus n’a trouvé aucune correspondance suffisamment fiable dans les données fournies.</p></div>';return;}
  if(!columns.length){columns=rows[0].map(function(_,i){return '📌 Champ '+(i+1)})}
  var html='<div class="ai-inline fiche-results"><div class="ai-inline-title">✦ Réponse Nexus</div>'+rows.map(function(row){
    var fields=columns.map(function(label,i){return {label:String(label).replace(/^[^A-Za-zÀ-ÿ0-9]+/,'').trim()||('Champ '+(i+1)),value:row&&row[i]!=null?row[i]:''}}).filter(function(item){return String(item.value).trim()});
    var firstName=fields.find(function(item){return /^(prenom|prénom|first name)$/i.test(item.label)}),lastName=fields.find(function(item){return /^(nom|lastname|surname)$/i.test(item.label)});
    var title=firstName&&lastName?String(firstName.value)+' '+String(lastName.value):(row&&row[0]!=null?String(row[0]):'Fiche Nexus');
    var copyText=title+'\n'+fields.map(function(item){return item.label+' : '+item.value}).join('\n');
    return '<article class="identity-result"><div class="identity-heading"><h3>'+esc(title)+'</h3><button class="copy-result" type="button" data-copy-result="'+esc(copyText)+'">⧉ Copier</button></div><dl>'+fields.map(function(item){return '<div><dt>'+esc(item.label)+'</dt><dd>'+esc(item.value)+'</dd></div>'}).join('')+'</dl></article>';
  }).join('')+(Array.isArray(data.sources)&&data.sources.length?'<div class="result-sources"><strong>Sources :</strong> '+data.sources.map(esc).join(', ')+'</div>':'')+'<div class="result-signature">by Nexus Legacy</div>'+(data.note?'<div class="ai-note">'+esc(data.note)+'</div>':'')+'</div>';
  zone.innerHTML=html;
}
document.addEventListener('click',function(e){
  var button=e.target.closest('[data-copy-result]');
  if(!button)return;
  var text=button.getAttribute('data-copy-result')||'';
  navigator.clipboard.writeText(text).then(function(){
    button.textContent='✓ Copié';
    setTimeout(function(){button.textContent='⧉ Copier'},1400);
  }).catch(function(){
    button.textContent='Copie impossible';
    setTimeout(function(){button.textContent='⧉ Copier'},1600);
  });
});
function buildGeminiCandidates(records,criteria){
  var terms=[];Object.keys(criteria||{}).forEach(function(k){String(criteria[k]||'').toLowerCase().split(/[^a-z0-9à-ÿ]+/i).filter(function(x){return x.length>=2}).forEach(function(x){terms.push(x)})});
  if(!terms.length)return records.slice(0,500);
  var scored=records.map(function(r,i){var raw=normValue(r&&r._raw||'')+' '+Object.keys(r||{}).filter(function(k){return k!=='_source'}).map(function(k){return normValue(r[k])}).join(' ');var score=terms.reduce(function(n,t){return n+(raw.indexOf(t)>=0?1:0)},0);return {r:r,i:i,score:score}});
  scored.sort(function(a,b){return b.score-a.score||a.i-b.i});
  var positive=scored.filter(function(x){return x.score>0}).slice(0,500);
  return (positive.length?positive:scored.slice(0,500)).map(function(x){return x.r});
}
async function search(){
  var criteria=criteriaFromForm();
  if(!Object.keys(criteria).length)return msg($('searchMsg'),'Renseignez au moins un critère.','err');
  var currentUser=await ensureAuth();
  if(!currentUser){go('auth');return msg($('searchMsg'),'Connectez-vous pour utiliser une recherche.','err')}
  if(Number(state.user.credits||0)<=0)return msg($('searchMsg'),'Vous n’avez plus de crédit. Chaque recherche consomme 1 crédit.','err');
  var btn=$('searchBtn'),qbtn=$('searchQuickBtn');btn.disabled=qbtn.disabled=true;btn.innerHTML='<span class="spin"></span> Recherche';qbtn.innerHTML='<span class="spin"></span> Recherche';msg($('searchMsg'),'Analyse des bases en streaming puis recherche Nexus...');
  try{
    var res=await api('/api/database-search',{criteria:criteria});
    if(!res.ok)throw new Error(res.error||'Nexus indisponible');
    if(!(await consumeCredit()))return;
    renderGeminiResult(res);refreshUsage();
    var shown=Math.min(5,(res.rows||[]).length), failed=res.failed||[];
    msg($('searchMsg'),'Recherche terminée par Nexus · '+shown+' résultat(s) maximum affichés : 5.'+(failed.length?' Fichier(s) illisible(s) ignoré(s) : '+failed.join(', ')+'.':''),'ok');
  }catch(e){msg($('searchMsg'),'Échec de la recherche Nexus : '+esc(e.message),'err')}
  finally{btn.disabled=qbtn.disabled=false;btn.textContent='⌕ Rechercher';qbtn.innerHTML='⌕ &nbsp; Lancer la recherche <span>→</span>'}
}

$('searchBtn').addEventListener('click',search);$('searchQuickBtn').addEventListener('click',search);$('quickSearch').addEventListener('keydown',function(e){if(e.key==='Enter')search()});
$('resetBtn').addEventListener('click',function(){Object.keys(fields).forEach(function(id){if($(id))$(id).value='';});$('quickSearch').value='';$('resultZone').innerHTML='<div class="welcome-result"><div class="check">✓</div><h3>Merci d\'utiliser Nexus Legacy Searcher !</h3><p>Lancez une recherche pour afficher les correspondances.</p></div>';msg($('searchMsg'),'')});
$('toggleFilters').addEventListener('click',function(){var f=$('advancedFilters');var hidden=f.style.display==='none';f.style.display=hidden?'grid':'none';this.textContent=hidden?'⌃':'⌄'});
document.querySelectorAll('[data-search]').forEach(function(b){b.addEventListener('click',function(){go('recherche');var key=b.dataset.search,map={codepostal:'f-code-postal',ip:'quickSearch',identifiant:'f-pseudo',naissance:'f-naissance',pseudo:'f-pseudo',pays:'f-pays'};setTimeout(function(){var id=map[key]||'quickSearch';$(id).focus()},50)})});
document.querySelectorAll('#searchChips [data-key]').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('#searchChips button').forEach(function(x){x.classList.remove('active')});b.classList.add('active');var k=b.dataset.key,map={email:'f-email',telephone:'f-tel',nomprenom:'f-nom',entreprise:'f-entreprise',adresse:'quickSearch',ville:'f-ville',codepostal:'f-code-postal',pseudo:'f-pseudo',pays:'f-pays'};var id=map[k]||'quickSearch';$(id).focus()})});
$('exportBtn').addEventListener('click',function(){var cards=[].slice.call(document.querySelectorAll('.rcard'));if(!cards.length)return;var text=cards.map(function(c){return c.innerText}).join('\n\n');var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.download='nexus-results.txt';a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},500)});
$('pseudoLabel').style.display='none';$('au-pseudo').style.display='none';renderAuth();refreshUsage();refreshMe().then(function(){state.authReady=true;renderAuth()});loadDatabase();
})();
