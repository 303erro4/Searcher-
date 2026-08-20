import json, os, re, hashlib, secrets, base64
from datetime import date
import traceback
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
DB = ROOT / 'database'
USERS = DATA / 'users.json'
ADMIN_PASSWORD = os.getenv('NEXUS_ADMIN_PASSWORD', 'nexus')
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.6-flash')
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('PORT', '8000'))
sessions = {}


def load_env():
    env = {}
    p = ROOT / '.env'
    if p.exists():
        for line in p.read_text(encoding='utf-8').splitlines():
            line=line.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            k,v=line.split('=',1); env[k.strip()]=v.strip().strip('"').strip("'")
    env.update({k:v for k,v in os.environ.items() if k in ('GEMINI_API_KEY','GEMINI_MODEL','NEXUS_ADMIN_PASSWORD')})
    return env


def load_users():
    DATA.mkdir(exist_ok=True)
    if not USERS.exists():
        USERS.write_text('{}', encoding='utf-8')
        return {}
    try:
        data=json.loads(USERS.read_text(encoding='utf-8'))
        if isinstance(data, dict):
            return data
        # Migrate older/invalid user stores safely.
        if isinstance(data, list):
            out={}
            for u in data:
                if isinstance(u, dict) and u.get('email'):
                    out[str(u['email']).strip().lower()]=u
            save_users(out)
            return out
        return {}
    except Exception:
        # Never let a broken JSON file take down every API route.
        try:
            USERS.write_text('{}', encoding='utf-8')
        except Exception:
            pass
        return {}


def save_users(users):
    DATA.mkdir(exist_ok=True)
    tmp=USERS.with_suffix('.tmp'); tmp.write_text(json.dumps(users,ensure_ascii=False,indent=2),encoding='utf-8'); tmp.replace(USERS)


def hash_pw(pw, salt=None):
    salt=salt or secrets.token_bytes(16)
    digest=hashlib.pbkdf2_hmac('sha256',pw.encode(),salt,180000)
    return base64.b64encode(salt).decode()+':'+base64.b64encode(digest).decode()


def check_pw(pw, stored):
    try:
        a,b=stored.split(':',1); salt=base64.b64decode(a); expected=base64.b64decode(b)
        got=hashlib.pbkdf2_hmac('sha256',pw.encode(),salt,180000)
        return secrets.compare_digest(got,expected)
    except Exception: return False


def public_user(u):
    return {'email':u['email'],'pseudo':u['pseudo'],'credits':int(u.get('credits',5)),'banned':bool(u.get('banned',False))}


def send_json(h,code,obj,cookie=None):
    raw=json.dumps(obj,ensure_ascii=False).encode(); h.send_response(code); h.send_header('Content-Type','application/json; charset=utf-8'); h.send_header('Content-Length',str(len(raw)))
    if cookie: h.send_header('Set-Cookie',cookie+'; Path=/; HttpOnly; SameSite=Lax')
    h.end_headers(); h.wfile.write(raw)


def body(h):
    try:
        n=int(h.headers.get('Content-Length','0'))
        raw=h.rfile.read(n) if n else b'{}'
        data=json.loads(raw or b'{}')
        return data if isinstance(data,dict) else {}
    except Exception:
        return {}


def cookie_token(h, name):
    c=h.headers.get('Cookie','')
    return next((x.split('=',1)[1] for x in c.split('; ') if x.startswith(name+'=')),None)

def session(h):
    return sessions.get(cookie_token(h,'NXSESS'))

def admin_session(h):
    return sessions.get(cookie_token(h,'NXADMIN'))


def new_session(kind,email=None):
    token=secrets.token_urlsafe(32); sessions[token]={'kind':kind,'email':email}; return token


def call_gemini_search(payload):
    """Use Gemini as the semantic search/ranking + presentation layer."""
    env=load_env(); key=env.get('GEMINI_API_KEY',''); model=env.get('GEMINI_MODEL',GEMINI_MODEL)
    if not key:
        return {'ok':False,'error':'GEMINI_API_KEY manquante dans .env'}
    criteria=payload.get('criteria',{}) or {}
    records=payload.get('records',[]) or []
    if not isinstance(records,list):
        return {'ok':False,'error':'Liste de données invalide.'}
    records=records[:500]
    indexed=[]
    for i,r in enumerate(records):
        if isinstance(r,dict): indexed.append({'index':i,'record':r})
        else: indexed.append({'index':i,'record':{'_raw':str(r)}})
    prompt=("Tu es le moteur de recherche intelligent de Nexus Legacy Searcher.\n\n"
        "Ta tâche est de rechercher DANS LES LIGNES FOURNIES uniquement. Les critères peuvent être formulés naturellement et les lignes peuvent avoir des formats totalement différents: pas de noms de colonnes, champs dans un ordre différent, texte libre, séparateurs | ; , tabulations, espaces, JSON aplati, etc.\n"
        "Tu dois faire toi-même la correspondance sémantique entre les critères et le contenu des lignes. Ne te limite pas aux noms de champs. Une information équivalente ou clairement correspondante peut être reconnue même si le champ porte un autre nom.\n"
        "IMPORTANT: n'invente aucune valeur, ne complète aucune information absente et n'utilise aucune information extérieure aux lignes fournies. Si aucune ligne ne correspond réellement, retourne matches=[] et rows=[]. Maximum 5 correspondances.\n\n"
        "Retourne UNIQUEMENT un JSON valide avec cette structure exacte: {\"matches\":[{\"index\":0,\"score\":0.98}],\"columns\":[\"👤 Nom\",\"✉️ Email\"],\"rows\":[[\"...\",\"...\"]],\"note\":\"...\"}\n"
        "Les index doivent correspondre exactement aux index des lignes fournies. Les columns et rows doivent contenir uniquement des informations réellement présentes dans les lignes sélectionnées. Ajoute des emojis utiles aux noms de colonnes. Maximum 5 lignes.\n\n"
        "Critères de recherche:\n"+json.dumps(criteria,ensure_ascii=False)+"\n\n"
        "Lignes candidates (index + données brutes/champs):\n"+json.dumps(indexed,ensure_ascii=False))
    body_data={'contents':[{'parts':[{'text':prompt}]}], 'generationConfig':{'responseMimeType':'application/json','temperature':0.1}}
    url=f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}'
    req=Request(url,data=json.dumps(body_data).encode(),headers={'Content-Type':'application/json'},method='POST')
    try:
        with urlopen(req,timeout=60) as r: data=json.loads(r.read().decode())
        text=data['candidates'][0]['content']['parts'][0]['text'].strip()
        text=re.sub(r'^```json\s*|^```\s*|\s*```$','',text,flags=re.I)
        out=json.loads(text)
        matches=out.get('matches',[])
        matches=[m for m in matches if isinstance(m,dict) and isinstance(m.get('index'),int) and 0 <= m.get('index') < len(records)][:5]
        columns=out.get('columns',[]) if isinstance(out.get('columns',[]),list) else []
        rows=out.get('rows',[]) if isinstance(out.get('rows',[]),list) else []
        rows=[r for r in rows if isinstance(r,list)][:5]
        return {'ok':True,'matches':matches,'columns':[str(x) for x in columns], 'rows':rows, 'note':str(out.get('note',''))}
    except HTTPError as e:
        try: detail=e.read().decode('utf-8','ignore')[:500]
        except Exception: detail=''
        return {'ok':False,'error':f'Gemini HTTP {e.code}'+(f' — {detail}' if detail else '')}
    except (URLError,TimeoutError): return {'ok':False,'error':'Connexion Gemini impossible'}
    except Exception: return {'ok':False,'error':'Réponse Gemini invalide.'}


def _search_terms(criteria):
    terms=[]
    for k,v in (criteria or {}).items():
        for part in re.findall(r"[\wÀ-ÿ@.+'-]+", str(v).lower()):
            if len(part) >= 2:
                terms.append(part)
    return list(dict.fromkeys(terms))


def _csv_line_record(raw, row_number, filename):
    """Parse one CSV row without requiring a header.

    The row is always preserved as _raw. Generic positional fields are exposed
    as column_1, column_2, ... so Gemini can reason about headerless CSV files.
    """
    import csv
    try:
        values = next(csv.reader([raw], delimiter=',', quotechar='"'))
    except Exception:
        values = raw.split(',')
    record = {'_raw': raw, '_source': filename, '_row': row_number}
    for i, value in enumerate(values, 1):
        record[f'column_{i}'] = value.strip()
    return record, values


def _looks_like_csv_header(values):
    """Conservative header detection; ordinary data rows are kept as data."""
    if not values:
        return False
    labels = {
        'name','nom','prenom','prénom','email','mail','phone','telephone',
        'téléphone','address','adresse','city','ville','country','pays',
        'zip','zipcode','postal','code_postal','company','entreprise',
        'username','pseudo','id','date','birthdate','naissance'
    }
    normalized = [re.sub(r'[^a-zà-ÿ0-9_]+','', str(v).strip().lower()) for v in values]
    hits = sum(1 for v in normalized if v in labels)
    # A header usually has several descriptive labels and very few numeric/date-like cells.
    return hits >= 2 or (hits == 1 and len(values) <= 4)


def _candidate_score(raw, values, terms):
    low = raw.lower()
    score = sum(1 for t in terms if t in low)
    # Reward exact token/field matches, while keeping the original line available to Gemini.
    for value in values:
        vl = str(value).strip().lower()
        if not vl:
            continue
        for t in terms:
            if vl == t:
                score += 2
    return score


def stream_database_candidates(criteria, limit=120):
    """Stream database files line-by-line. Headerless CSV is supported without loading large files."""
    terms=_search_terms(criteria)
    results=[]; failed=[]; seq=0
    manifest=DB / 'index.json'
    try:
        idx=json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else {}
        names=idx.get('files',[]) if isinstance(idx,dict) else []
    except Exception:
        names=[]
    for name in names:
        if not isinstance(name,str) or not re.match(r'^[^/\\]+\.(txt|csv|json)$',name,re.I):
            continue
        path=DB/name
        if not path.exists():
            failed.append(name); continue
        try:
            ext=path.suffix.lower()
            if ext=='.txt':
                with path.open('r',encoding='utf-8',errors='replace',newline='') as f:
                    for line in f:
                        raw=line.strip()
                        if not raw or raw.startswith('#'): continue
                        low=raw.lower()
                        score=sum(1 for t in terms if t in low)
                        if score>0:
                            results.append((score,seq,{'_raw':raw,'_source':name}))
                            if len(results)>limit*4:
                                results.sort(key=lambda x:(-x[0],x[1])); results=results[:limit*2]
                        seq+=1
            elif ext=='.csv':
                # Read the first physical line only to decide whether it is a header.
                # Headerless files keep that first line as data.
                with path.open('r',encoding='utf-8',errors='replace',newline='') as f:
                    first=f.readline()
                    if first:
                        first_raw=first.rstrip('\r\n')
                        try:
                            import csv
                            first_values=next(csv.reader([first_raw], delimiter=',', quotechar='"'))
                        except Exception:
                            first_values=first_raw.split(',')
                        if not _looks_like_csv_header(first_values):
                            rec, values = _csv_line_record(first_raw, 1, name)
                            score=_candidate_score(first_raw, values, terms)
                            if score>0:
                                results.append((score,seq,rec))
                            seq+=1
                    row_number=2
                    for line in f:
                        raw=line.rstrip('\r\n')
                        if not raw: row_number+=1; continue
                        rec, values = _csv_line_record(raw, row_number, name)
                        score=_candidate_score(raw, values, terms)
                        if score>0:
                            results.append((score,seq,rec))
                        if len(results)>limit*4:
                            results.sort(key=lambda x:(-x[0],x[1])); results=results[:limit*2]
                        seq+=1; row_number+=1
            else:
                # Avoid loading huge JSON files. Stream line-delimited JSON when possible.
                with path.open('r',encoding='utf-8',errors='replace') as f:
                    for line in f:
                        raw=line.strip()
                        if not raw: continue
                        low=raw.lower(); score=sum(1 for t in terms if t in low)
                        if score>0: results.append((score,seq,{'_raw':raw,'_source':name}))
                        if len(results)>limit*4:
                            results.sort(key=lambda x:(-x[0],x[1])); results=results[:limit*2]
                        seq+=1
        except Exception:
            failed.append(name)
    results.sort(key=lambda x:(-x[0],x[1]))
    return [r for _,_,r in results[:limit]], failed


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self,*args):
        pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin','*'))
        self.send_header('Access-Control-Allow-Credentials','true')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
        self.end_headers()
    def do_GET(self):
        try:
            return self._do_GET()
        except Exception as exc:
            print('API GET error:', repr(exc))
            traceback.print_exc()
            return send_json(self, 500, {'error':'Erreur serveur interne. Vérifiez le terminal du serveur.'})

    def _do_GET(self):
        p=urlparse(self.path).path; users=load_users(); s=session(self)
        if p=='/api/health':
            return send_json(self,200,{'ok':True,'service':'Nexus Legacy API','port':PORT})
        if p=='/api/me':
            if s and s.get('kind')=='user' and s.get('email') in users: return send_json(self,200,{'ok':True,'user':public_user(users[s['email']])})
            return send_json(self,401,{'ok':False})
        if p=='/api/admin/users':
            a=admin_session(self)
            if not a or a.get('kind')!='admin': return send_json(self,403,{'error':'Admin requis.'})
            return send_json(self,200,{'users':[public_user(u) for u in users.values()]})
        return super().do_GET()
    def do_POST(self):
        try:
            return self._do_POST()
        except Exception as exc:
            print('API POST error:', repr(exc))
            traceback.print_exc()
            return send_json(self, 500, {'error':'Erreur serveur interne. Vérifiez le terminal du serveur.'})

    def _do_POST(self):
        p=urlparse(self.path).path; data=body(self); users=load_users()
        if p=='/api/register':
            email=str(data.get('email','')).strip().lower(); pseudo=str(data.get('pseudo','')).strip(); pw=str(data.get('password',''))
            if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$',email) or len(pseudo)<2 or len(pw)<6: return send_json(self,400,{'error':'Pseudo, email et mot de passe valides requis.'})
            if email in users: return send_json(self,409,{'error':'Ce compte existe déjà.'})
            if any(u.get('pseudo','').lower()==pseudo.lower() for u in users.values()): return send_json(self,409,{'error':'Ce pseudo est déjà utilisé.'})
            users[email]={'email':email,'pseudo':pseudo,'password':hash_pw(pw),'credits':5,'banned':False}; save_users(users)
            token=new_session('user',email); return send_json(self,200,{'ok':True,'user':public_user(users[email])},'NXSESS='+token)
        if p=='/api/login':
            email=str(data.get('email','')).strip().lower(); pw=str(data.get('password','')); u=users.get(email)
            if not u or not check_pw(pw,u.get('password','')): return send_json(self,401,{'error':'Email ou mot de passe incorrect.'})
            if u.get('banned'): return send_json(self,403,{'error':'Ce compte est interdit du site.'})
            token=new_session('user',email); return send_json(self,200,{'ok':True,'user':public_user(u)},'NXSESS='+token)
        if p=='/api/logout':
            s=session(self)
            if s:
                for k,v in list(sessions.items()):
                    if v is s: sessions.pop(k,None)
            return send_json(self,200,{'ok':True},'NXSESS=; Max-Age=0')
        if p=='/api/use-credit':
            s=session(self); email=s.get('email') if s and s.get('kind')=='user' else None; u=users.get(email) if email else None
            if not u: return send_json(self,401,{'error':'Connexion requise.'})
            if u.get('banned'): return send_json(self,403,{'error':'Compte interdit.'})
            today=date.today().isoformat()
            if u.get('daily_date')!=today: u['daily_date']=today; u['daily_used']=0
            if int(u.get('credits',0))<=0: return send_json(self,402,{'error':'Vous n’avez plus de crédit.'})
            u['credits']=max(0,int(u.get('credits',0))-1); u['daily_used']=int(u.get('daily_used',0))+1; save_users(users); return send_json(self,200,{'credits':u['credits'],'searches_remaining':u['credits'],'searches_used_total':u['daily_used']})
        if p=='/api/change-password':
            s=session(self); email=s.get('email') if s and s.get('kind')=='user' else None; u=users.get(email) if email else None
            if not u: return send_json(self,401,{'error':'Connexion requise.'})
            old=str(data.get('old','')); new=str(data.get('new',''))
            if not check_pw(old,u.get('password','')): return send_json(self,400,{'error':'Mot de passe actuel incorrect.'})
            if len(new)<6: return send_json(self,400,{'error':'6 caractères minimum.'})
            u['password']=hash_pw(new); save_users(users); return send_json(self,200,{'ok':True})
        if p=='/api/delete-account':
            s=session(self); email=s.get('email') if s and s.get('kind')=='user' else None
            if not email or email not in users: return send_json(self,401,{'error':'Connexion requise.'})
            users.pop(email); save_users(users); return send_json(self,200,{'ok':True},'NXSESS=; Max-Age=0')
        if p=='/api/admin/login':
            if str(data.get('password','')) != load_env().get('NEXUS_ADMIN_PASSWORD',ADMIN_PASSWORD): return send_json(self,403,{'error':'Mot de passe admin incorrect.'})
            token=new_session('admin'); return send_json(self,200,{'ok':True},'NXADMIN='+token)
        if p=='/api/admin/credits':
            s=admin_session(self)
            if not s or s.get('kind')!='admin': return send_json(self,403,{'error':'Admin requis.'})
            email=str(data.get('email','')).strip().lower(); u=users.get(email)
            if not u:return send_json(self,404,{'error':'Utilisateur introuvable.'})
            delta=int(data.get('delta',0)); u['credits']=max(0,int(u.get('credits',0))+delta); save_users(users); return send_json(self,200,{'user':public_user(u)})
        if p=='/api/admin/set-credits':
            s=admin_session(self)
            if not s or s.get('kind')!='admin': return send_json(self,403,{'error':'Admin requis.'})
            email=str(data.get('email','')).strip().lower(); u=users.get(email)
            if not u:return send_json(self,404,{'error':'Utilisateur introuvable.'})
            try: amount=max(0,int(data.get('credits',0)))
            except Exception: return send_json(self,400,{'error':'Nombre de crédits invalide.'})
            u['credits']=amount; save_users(users); return send_json(self,200,{'user':public_user(u)})
        if p=='/api/admin/reset-usage':
            s=admin_session(self)
            if not s or s.get('kind')!='admin': return send_json(self,403,{'error':'Admin requis.'})
            email=str(data.get('email','')).strip().lower(); u=users.get(email)
            if not u:return send_json(self,404,{'error':'Utilisateur introuvable.'})
            u['daily_date']=date.today().isoformat(); u['daily_used']=0; save_users(users); return send_json(self,200,{'user':public_user(u)})
        if p=='/api/admin/delete-user':
            s=admin_session(self)
            if not s or s.get('kind')!='admin': return send_json(self,403,{'error':'Admin requis.'})
            email=str(data.get('email','')).strip().lower()
            if email not in users:return send_json(self,404,{'error':'Utilisateur introuvable.'})
            users.pop(email); save_users(users); return send_json(self,200,{'ok':True})
        if p=='/api/admin/ban':
            s=admin_session(self)
            if not s or s.get('kind')!='admin': return send_json(self,403,{'error':'Admin requis.'})
            email=str(data.get('email','')).strip().lower(); u=users.get(email)
            if not u:return send_json(self,404,{'error':'Utilisateur introuvable.'})
            u['banned']=bool(data.get('banned')); save_users(users); return send_json(self,200,{'user':public_user(u)})
        if p=='/api/database-search':
            s=session(self); email=s.get('email') if s and s.get('kind')=='user' else None
            if not email or email not in users: return send_json(self,401,{'error':'Connexion requise.'})
            if users[email].get('banned'): return send_json(self,403,{'error':'Compte interdit.'})
            criteria=data.get('criteria',{}) or {}
            candidates,failed=stream_database_candidates(criteria,120)
            out=call_gemini_search({'criteria':criteria,'records':candidates})
            if not out.get('ok'):
                return send_json(self,503,{'ok':False,'error':out.get('error','Gemini indisponible'),'failed':failed})
            source_names=[]
            for match in out.get('matches',[]):
                index=match.get('index') if isinstance(match,dict) else None
                if isinstance(index,int) and 0 <= index < len(candidates):
                    source=candidates[index].get('_source') if isinstance(candidates[index],dict) else None
                    if source and source not in source_names:
                        source_names.append(source)
            out['sources']=source_names
            out['failed']=failed
            return send_json(self,200,out)
        if p in ('/api/gemini','/api/gemini-search'):
            s=session(self); email=s.get('email') if s and s.get('kind')=='user' else None
            if not email or email not in users: return send_json(self,401,{'error':'Connexion requise.'})
            if users[email].get('banned'): return send_json(self,403,{'error':'Compte interdit.'})
            out=call_gemini_search(data); return send_json(self,200 if out.get('ok') else 503,out)
        return send_json(self,404,{'error':'Route inconnue.'})

if __name__=='__main__':
    os.chdir(ROOT)
    class ReusableHTTPServer(ThreadingHTTPServer):
        allow_reuse_address = True
    print(f'Nexus Legacy sur http://localhost:{PORT}')
    try:
        ReusableHTTPServer((HOST,PORT),Handler).serve_forever()
    except OSError as exc:
        print(f'Impossible de démarrer le serveur sur le port {PORT}: {exc}')
        print('Essayez par exemple : PORT=8001 python server.py')
