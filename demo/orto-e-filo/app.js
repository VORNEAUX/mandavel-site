const P=[['Kit basilico genovese','Kit','Vasetto, terriccio e semi per il basilico: da tenere in cucina.',14,'#2e6b2e'],['Set erbe aromatiche','Kit','Prezzemolo, salvia e rosmarino in tre vasetti.',24,'#5a7d2a'],['Semi di pomodoro antico','Kit','Bustina di semi di una varietà non ibrida.',5,'#b5472f'],['Vaso in terracotta 20 cm','Vasi','Vaso con sottovaso, drenaggio incluso.',12,'#a8643a'],['Vaso da balcone 60 cm','Vasi','Fioriera lunga per ringhiere.',29,'#8a5a3a'],['Annaffiatoio 2 L','Attrezzi','Zincato, con rosa removibile.',19,'#4a6a7a'],['Guanti da orto','Attrezzi','Palmo rinforzato, taglia unica.',9,'#6a5a7a'],['Forbici da potatura','Attrezzi','Lame in acciaio, blocco di sicurezza.',22,'#3a4a5a']];
const $=i=>document.getElementById(i),eur=n=>n.toLocaleString('it-IT',{style:'currency',currency:'EUR'}),cart={};let cat='Tutti',cur=0;
$('fl').innerHTML=['Tutti','Kit','Vasi','Attrezzi'].map(c=>'<button type="button" aria-pressed="'+(c===cat)+'">'+c+'</button>').join('');
$('fl').onclick=e=>{if(e.target.tagName!=='BUTTON')return;cat=e.target.textContent;[...$('fl').children].forEach(b=>b.setAttribute('aria-pressed',b===e.target));grid()};
function grid(){$('g').innerHTML=P.map((p,i)=>cat==='Tutti'||p[1]===cat?'<article class="p" style="--c:'+p[4]+'"><div class="im" aria-hidden="true">'+p[0][0]+'</div><h3>'+p[0]+'</h3><small>'+p[1]+'</small><div><b>'+eur(p[3])+'</b><span><button data-o="'+i+'" type="button" class="l">Dettagli</button> <button data-a="'+i+'" type="button">Aggiungi</button></span></div></article>':'').join('')}
$('g').onclick=e=>{const t=e.target;if(t.dataset.a!==undefined)add(+t.dataset.a);if(t.dataset.o!==undefined){cur=+t.dataset.o;$('dt').textContent=P[cur][0];$('dd').textContent=P[cur][2];$('dp').textContent=eur(P[cur][3]);$('d').showModal()}};
$('da').onclick=()=>{add(cur);$('d').close()};$('dx').onclick=()=>$('d').close();
function add(i){cart[i]=(cart[i]||0)+1;draw()}
function draw(){const k=Object.keys(cart).filter(i=>cart[i]>0),n=k.reduce((a,i)=>a+cart[i],0),s=k.reduce((a,i)=>a+cart[i]*P[i][3],0),sp=s===0||s>=60?0:5.9;$('cn').textContent=n;
$('cl').innerHTML=k.length?k.map(i=>'<li><span>'+P[i][0]+'</span><b>'+eur(cart[i]*P[i][3])+'</b><span><button data-m="'+i+'" type="button" aria-label="Meno">−</button> '+cart[i]+' <button data-p="'+i+'" type="button" aria-label="Più">+</button></span></li>').join(''):'<li>Il carrello è vuoto.</li>';
$('ct').innerHTML='Prodotti '+eur(s)+'<br>Spedizione '+(s>=60?'gratuita (da 60 €)':eur(sp))+'<br><b>Totale '+eur(s+sp)+'</b>'}
$('cl').onclick=e=>{const t=e.target;if(t.dataset.m){cart[t.dataset.m]--;draw()}if(t.dataset.p)add(+t.dataset.p)};
$('cb').onclick=()=>{$('c').hidden=false;$('cx').focus()};$('cx').onclick=()=>{$('c').hidden=true;$('cb').focus()};
$('co').onclick=()=>{$('cm').textContent='Dimostrazione: qui un negozio reale aprirebbe il pagamento. Nessun ordine né pagamento viene effettuato.'};
grid();draw();
