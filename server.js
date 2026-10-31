'use strict';
/* MANDAVEL server: statico + API (voti, proposte, richieste, moderazione). Node >= 22.13, nessuna dipendenza. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=+process.env.PORT||3000,ROOT=__dirname,PUB=path.join(ROOT,'public'),PRIV=path.join(ROOT,'private');
const DATA=process.env.DATA_DIR||path.join(ROOT,'data'),ADMIN=process.env.ADMIN_TOKEN||'',TRUST=process.env.TRUST_PROXY==='1',SECURE=process.env.COOKIE_SECURE==='1';
fs.mkdirSync(DATA,{recursive:true});
let SECRET;const kf=path.join(DATA,'secret.key');
try{SECRET=fs.readFileSync(kf,'utf8')}catch{SECRET=crypto.randomBytes(32).toString('hex');fs.writeFileSync(kf,SECRET,{mode:0o600})}
const db=new DatabaseSync(path.join(DATA,'mandavel.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY,name TEXT NOT NULL,summary TEXT NOT NULL,audience TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'in_votazione',origin TEXT NOT NULL DEFAULT 'proposta',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS votes(service_id TEXT NOT NULL,voter TEXT NOT NULL,iph TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(service_id,voter));
CREATE INDEX IF NOT EXISTS v_iph ON votes(service_id,iph);
CREATE TABLE IF NOT EXISTS proposals(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,problem TEXT NOT NULL,expected TEXT NOT NULL,audience TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',service_id TEXT,voter TEXT NOT NULL,iph TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,service TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,budget TEXT,timing TEXT,ref TEXT,name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT,company TEXT,status TEXT NOT NULL DEFAULT 'nuova',iph TEXT NOT NULL,created_at INTEGER NOT NULL);`);
/* seed: solo l'elenco dei servizi "prossimamente" del catalogo, mai voti */
if(!db.prepare('SELECT COUNT(*) n FROM services').get().n){
  const cat=JSON.parse(fs.readFileSync(path.join(ROOT,'catalog.json'),'utf8')).services.filter(s=>!s.launch);
  const ins=db.prepare('INSERT INTO services(id,name,summary,audience,status,origin,created_at) VALUES(?,?,?,?,?,?,?)');
  cat.forEach(s=>ins.run(s.id,s.name,s.problem,s.audience_type==='privati'?'privati':'aziende','in_votazione','catalogo',Date.now()));
}
const STATUS={in_votazione:'Approvata e in votazione',in_valutazione:'In valutazione per lo sviluppo',in_realizzazione:'In fase di realizzazione',disponibile:'Disponibile su MANDAVEL',non_prevista:'Non prevista al momento'};
const VOTABLE=['in_votazione','in_valutazione'],AUD=['aziende','professionisti','privati',''];
const hits=new Map();
const limit=(k,max,ms)=>{const n=Date.now(),a=(hits.get(k)||[]).filter(t=>n-t<ms);if(a.length>=max){hits.set(k,a);return false}a.push(n);hits.set(k,a);return true};
setInterval(()=>{const n=Date.now();for(const[k,a]of hits){const f=a.filter(t=>n-t<864e5);f.length?hits.set(k,f):hits.delete(k)}},6e5).unref();
const clean=(s,m)=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0,m);
const hmac=s=>crypto.createHmac('sha256',SECRET).update(s).digest('hex');
const code=()=>crypto.randomBytes(6).toString('base64url').replace(/[-_]/g,'x').toUpperCase().slice(0,8);
const ipOf=r=>{let ip=r.socket.remoteAddress||'';if(TRUST){const x=String(r.headers['x-forwarded-for']||'').split(',')[0].trim();if(x)ip=x}return ip};
const cookies=r=>Object.fromEntries(String(r.headers.cookie||'').split(';').map(c=>c.trim().split('=')).filter(c=>c[0]).map(c=>[c[0],c.slice(1).join('=')]));
const SEC={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(),microphone=(),geolocation=()',
'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const send=(res,code,body,type='application/json',extra={})=>{res.writeHead(code,{'Content-Type':type+(type.startsWith('text')||type.includes('json')||type.includes('javascript')?'; charset=utf-8':''),...SEC,...extra});res.end(type==='application/json'&&typeof body!=='string'?JSON.stringify(body):body)};
const fail=(res,c,error,codeStr)=>send(res,c,{error,code:codeStr});
const readBody=r=>new Promise((ok,ko)=>{let n=0,b=[];r.on('data',c=>{n+=c.length;if(n>24e3){ko(Object.assign(new Error('big'),{status:413}));r.destroy()}else b.push(c)});r.on('end',()=>{try{ok(b.length?JSON.parse(Buffer.concat(b)):{})}catch{ko(Object.assign(new Error('json'),{status:400}))}});r.on('error',ko)});
const isAdmin=r=>{const c=cookies(r).mv_a;if(!c)return false;const[e,h]=c.split('.');if(!e||!h||+e<Date.now())return false;const x=hmac('adm'+e);return h.length===x.length&&crypto.timingSafeEqual(Buffer.from(h),Buffer.from(x))};
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain'};
const counts=(voter)=>db.prepare(`SELECT s.id,s.name,s.summary,s.audience,s.status,s.origin,(SELECT COUNT(*) FROM votes v WHERE v.service_id=s.id) votes,(SELECT COUNT(*) FROM votes v WHERE v.service_id=s.id AND v.voter=?) voted FROM services s ORDER BY votes DESC,s.created_at ASC,s.name ASC`).all(voter).map(x=>({...x,voted:!!x.voted,label:STATUS[x.status],open:VOTABLE.includes(x.status)}));

async function api(req,res,url){
  const m=req.method,p=url.pathname,ck=cookies(req);let voter=ck.mv_v,setC={};
  if(!/^[a-f0-9]{32}$/.test(voter||'')){voter=crypto.randomBytes(16).toString('hex');setC['Set-Cookie']=`mv_v=${voter}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${SECURE?'; Secure':''}`}
  const out=(c,b)=>send(res,c,b,'application/json',setC);
  const ipLabel=ipOf(req),iph=hmac('ip'+ipLabel);
  if(m==='POST'||m==='DELETE'){
    if(req.headers['x-mv']!=='1')return fail(res,403,'Richiesta non valida','csrf');
    const o=req.headers.origin;if(o){try{if(new URL(o).host!==req.headers.host)return fail(res,403,'Origine non consentita','origin')}catch{return fail(res,403,'Origine non valida','origin')}}
  }
  if(m==='GET'&&p==='/api/health')return out(200,{ok:true});
  if(m==='GET'&&p==='/api/future')return out(200,{services:counts(voter),statuses:STATUS});
  if(m==='POST'&&p==='/api/vote'){
    const b=await readBody(req),id=clean(b.id,20),on=b.on!==false,s=db.prepare('SELECT status FROM services WHERE id=?').get(id);
    if(!s)return fail(res,404,'Servizio non trovato','nf');
    if(!VOTABLE.includes(s.status))return fail(res,409,'Le votazioni per questo servizio sono chiuse','closed');
    if(!limit('v'+iph,60,36e5))return fail(res,429,'Troppe operazioni, riprova più tardi','rate');
    if(on){
      if(db.prepare('SELECT COUNT(*) n FROM votes WHERE iph=? AND created_at>?').get(iph,Date.now()-864e5).n>=25)return fail(res,429,'Limite giornaliero di voti raggiunto','daily');
      if(db.prepare('SELECT COUNT(DISTINCT voter) n FROM votes WHERE service_id=? AND iph=? AND voter<>?').get(id,iph,voter).n>=3)return fail(res,429,'Troppi voti da questa rete per questo servizio','net');
      db.prepare('INSERT OR IGNORE INTO votes(service_id,voter,iph,created_at) VALUES(?,?,?,?)').run(id,voter,iph,Date.now());
    }else db.prepare('DELETE FROM votes WHERE service_id=? AND voter=?').run(id,voter);
    return out(200,{services:counts(voter)});
  }
  if(m==='POST'&&p==='/api/proposals'){
    const b=await readBody(req);
    if(b.website)return out(200,{ok:true,code:'XXXXXXXX'});/* honeypot */
    if(+b.t<4000)return fail(res,400,'Compila il modulo con calma e riprova','fast');
    const name=clean(b.name,80),problem=clean(b.problem,600),expected=clean(b.expected,600),audience=AUD.includes(b.audience)?b.audience:'';
    if(name.length<3)return fail(res,400,'Indica il nome del servizio (almeno 3 caratteri)','name');
    if(problem.length<20)return fail(res,400,'Descrivi il problema in almeno 20 caratteri','problem');
    if(expected.length<20)return fail(res,400,'Descrivi la soluzione attesa in almeno 20 caratteri','expected');
    if(!limit('p'+voter,3,864e5)||!limit('pi'+iph,10,864e5))return fail(res,429,'Hai già inviato diverse proposte oggi. Riprova domani','rate');
    const c=code();db.prepare('INSERT INTO proposals(code,name,problem,expected,audience,voter,iph,created_at) VALUES(?,?,?,?,?,?,?,?)').run(c,name,problem,expected,audience,voter,iph,Date.now());
    return out(200,{ok:true,code:c});
  }
  let mm;
  if(m==='GET'&&(mm=p.match(/^\/api\/proposals\/([A-Z0-9]{8})$/))){
    const r=db.prepare('SELECT name,status,service_id FROM proposals WHERE code=?').get(mm[1]);if(!r)return fail(res,404,'Codice non trovato','nf');
    const s=r.service_id&&db.prepare('SELECT name,status FROM services WHERE id=?').get(r.service_id);
    const st=r.status==='pending'?'In attesa di revisione':r.status==='rejected'?STATUS.non_prevista:r.status==='merged'?'Unita a una proposta già in elenco'+(s?`: ${s.name}`:''):(s?STATUS[s.status]:'Approvata');
    return out(200,{name:r.name,status:st});
  }
  if(m==='POST'&&p==='/api/requests'){
    const b=await readBody(req),f={service:clean(b.service,60),kind:clean(b.kind,60),body:clean(b.body,1500),budget:clean(b.budget,40),timing:clean(b.timing,40),ref:clean(b.ref,300),name:clean(b.name,80),email:clean(b.email,120),phone:clean(b.phone,30),company:clean(b.company,80)};
    if(b.website)return out(200,{ok:true,code:'XXXXXXXX'});
    if(!f.service)return fail(res,400,'Scegli il servizio richiesto','service');
    if(f.body.length<30)return fail(res,400,'Descrivi il progetto in almeno 30 caratteri','body');
    if(f.name.length<2)return fail(res,400,'Inserisci nome e cognome','name');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email))return fail(res,400,'Inserisci un indirizzo email valido','email');
    if(b.consent!==true)return fail(res,400,'Serve confermare di aver letto l’informativa privacy','consent');
    if(f.ref&&!/^https?:\/\//i.test(f.ref))return fail(res,400,'Il link di riferimento deve iniziare con http:// o https://','ref');
    if(!limit('r'+iph,5,36e5))return fail(res,429,'Troppe richieste ravvicinate, riprova più tardi','rate');
    const c=code();db.prepare('INSERT INTO requests(code,service,kind,body,budget,timing,ref,name,email,phone,company,iph,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(c,f.service,f.kind,f.body,f.budget,f.timing,f.ref,f.name,f.email,f.phone,f.company,iph,Date.now());
    return out(200,{ok:true,code:c});
  }
  /* ---- amministrazione ---- */
  if(m==='POST'&&p==='/api/admin/login'){
    if(!ADMIN||ADMIN.length<12)return fail(res,503,'Amministrazione non configurata (ADMIN_TOKEN)','cfg');
    if(!limit('al'+iph,5,9e5))return fail(res,429,'Troppi tentativi, riprova tra qualche minuto','rate');
    const b=await readBody(req),a=crypto.createHash('sha256').update(String(b.token||'')).digest(),z=crypto.createHash('sha256').update(ADMIN).digest();
    if(!crypto.timingSafeEqual(a,z))return fail(res,401,'Credenziali non valide','auth');
    const e=String(Date.now()+288e5);return send(res,200,{ok:true},'application/json',{'Set-Cookie':`mv_a=${e}.${hmac('adm'+e)}; Path=/; Max-Age=28800; HttpOnly; SameSite=Strict${SECURE?'; Secure':''}`});
  }
  if(p.startsWith('/api/admin/')){
    if(!isAdmin(req))return fail(res,401,'Accesso riservato','auth');
    if(m==='POST'&&p==='/api/admin/logout')return send(res,200,{ok:true},'application/json',{'Set-Cookie':'mv_a=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict'});
    if(m==='GET'&&p==='/api/admin/data')return out(200,{statuses:STATUS,
      proposals:db.prepare("SELECT id,code,name,problem,expected,audience,status,service_id,created_at FROM proposals ORDER BY (status='pending') DESC,created_at DESC").all(),
      services:counts(''),requests:db.prepare('SELECT id,code,service,kind,body,budget,timing,ref,name,email,phone,company,status,created_at FROM requests ORDER BY created_at DESC LIMIT 300').all(),
      stats:{votes:db.prepare('SELECT COUNT(*) n FROM votes').get().n,voters:db.prepare('SELECT COUNT(DISTINCT voter) n FROM votes').get().n}});
    const b=await readBody(req);
    if(m==='POST'&&(mm=p.match(/^\/api\/admin\/proposals\/(\d+)\/(approve|reject|merge)$/))){
      const pr=db.prepare('SELECT * FROM proposals WHERE id=?').get(+mm[1]);if(!pr)return fail(res,404,'Proposta non trovata','nf');
      if(pr.status!=='pending')return fail(res,409,'Proposta già gestita','done');
      if(mm[2]==='reject'){db.prepare("UPDATE proposals SET status='rejected' WHERE id=?").run(pr.id);return out(200,{ok:true})}
      if(mm[2]==='merge'){const t=clean(b.into,20);if(!db.prepare('SELECT 1 FROM services WHERE id=?').get(t))return fail(res,404,'Servizio di destinazione non trovato','nf');db.prepare("UPDATE proposals SET status='merged',service_id=? WHERE id=?").run(t,pr.id);return out(200,{ok:true})}
      const id='P'+pr.id,name=clean(b.name,80)||pr.name,summary=clean(b.summary,300)||pr.problem.slice(0,300);
      db.prepare('INSERT INTO services(id,name,summary,audience,status,origin,created_at) VALUES(?,?,?,?,?,?,?)').run(id,name,summary,pr.audience,'in_votazione','proposta',Date.now());
      db.prepare("UPDATE proposals SET status='approved',service_id=? WHERE id=?").run(id,pr.id);return out(200,{ok:true,id});
    }
    if(m==='POST'&&(mm=p.match(/^\/api\/admin\/services\/([A-Za-z0-9]+)$/))){
      const s=db.prepare('SELECT * FROM services WHERE id=?').get(mm[1]);if(!s)return fail(res,404,'Servizio non trovato','nf');
      const st=b.status in STATUS?b.status:s.status,name=clean(b.name,80)||s.name,summary=clean(b.summary,300)||s.summary;
      db.prepare('UPDATE services SET status=?,name=?,summary=? WHERE id=?').run(st,name,summary,s.id);return out(200,{ok:true});
    }
    if(m==='POST'&&(mm=p.match(/^\/api\/admin\/requests\/(\d+)$/))){
      const st=['nuova','in_corso','conclusa','archiviata'].includes(b.status)?b.status:'nuova';db.prepare('UPDATE requests SET status=? WHERE id=?').run(st,+mm[1]);return out(200,{ok:true});
    }
  }
  return fail(res,404,'Endpoint non trovato','nf');
}
const serveFile=(res,file,cache)=>{fs.readFile(file,(e,d)=>{if(e)return send(res,404,'Non trovato','text/plain');send(res,200,d,MIME[path.extname(file)]||'application/octet-stream',{'Cache-Control':cache})})};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://x'),p=decodeURIComponent(url.pathname);
    if(p.startsWith('/api/'))return await api(req,res,url);
    if(p==='/admin'||p==='/admin/')return serveFile(res,path.join(PRIV,isAdmin(req)?'admin.html':'login.html'),'no-store');
    if(p==='/admin/admin.js')return isAdmin(req)?serveFile(res,path.join(PRIV,'admin.js'),'no-store'):send(res,401,'Accesso riservato','text/plain');
    const f=path.normalize(path.join(PUB,p==='/'?'index.html':p));
    if(!f.startsWith(PUB+path.sep))return send(res,403,'Vietato','text/plain');
    return serveFile(res,f,/\.(webp|png|svg|ico)$/.test(f)?'public, max-age=604800':'no-cache');
  }catch(e){const c=e.status||500;if(c===500)console.error(e);if(!res.headersSent)fail(res,c,c===500?'Errore interno':c===413?'Richiesta troppo grande':'Richiesta non valida','err')}
}).listen(PORT,()=>console.log(`MANDAVEL su http://localhost:${PORT}`+(ADMIN.length>=12?'':'  (ADMIN_TOKEN assente o troppo corto: amministrazione disattivata)')));
