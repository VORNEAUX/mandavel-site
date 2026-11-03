const S={a:['Lasci la bici o prendi un appuntamento','Controlliamo freni, cambio, trasmissione e gomme','Ti diciamo cosa serve e quanto costa, prima di toccare qualcosa','Ritiri la bici con l’elenco di ciò che è stato fatto'],b:['Descrivi il guasto nel modulo','Ti rispondiamo con una valutazione e i tempi','Se accetti, si ripara; i pezzi da cambiare si concordano','Ritiro in officina'],c:['Indichi indirizzo e fascia oraria','Passiamo a prendere la bici','Ti scriviamo la valutazione prima di intervenire','La riportiamo a casa tua']};
const $=i=>document.getElementById(i),btn=[...document.querySelectorAll('.pick button')];
function show(k){btn.forEach(b=>b.setAttribute('aria-checked',b.dataset.k===k));$('steps').innerHTML=S[k].map(x=>'<li>'+x+'</li>').join('')}
btn.forEach(b=>b.onclick=()=>show(b.dataset.k));show('a');
const err=(id,m)=>{const e=$(id);e.textContent=m||'';e.hidden=!m;return !m};
$('f').onsubmit=e=>{e.preventDefault();
const a=err('en',$('n').value.trim().length<2?'Scrivi il tuo nome.':''),b=err('em',/^\S+@\S+\.\S+$/.test($('m').value)?'':'Controlla l’indirizzo email.'),c=err('ed',$('d').value.trim().length<15?'Descrivi il problema in almeno 15 caratteri.':'');
if(!(a&&b&&c))return;$('f').hidden=true;const o=$('ok');o.hidden=false;o.textContent='Richiesta compilata correttamente. Questa è una dimostrazione: nessun dato è stato inviato. In un sito reale, la richiesta arriverebbe a chi gestisce l’attività.'};
