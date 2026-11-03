# MANDAVEL — sito con voto dei servizi futuri

Sito statico + piccolo server Node (nessuna dipendenza esterna: il database SQLite è incluso in Node).

## Requisiti
- Node.js **22.13 o superiore** (usa `node:sqlite`).

## Avvio
```
ADMIN_TOKEN="una-chiave-lunga-e-casuale" PORT=3000 node server.js
```
- Sito: http://localhost:3000
- Amministrazione: http://localhost:3000/admin (chiave = `ADMIN_TOKEN`, minimo 12 caratteri; senza, l'amministrazione resta disattivata)

## Variabili d'ambiente
| Variabile | Significato |
|---|---|
| `ADMIN_TOKEN` | chiave dell'area admin (obbligatoria per moderare) |
| `PORT` | porta (default 3000) |
| `DATA_DIR` | cartella del database (default `./data`): **va salvata e sottoposta a backup** |
| `TRUST_PROXY=1` | se dietro proxy/CDN: usa `X-Forwarded-For` per riconoscere la rete |
| `COOKIE_SECURE=1` | cookie solo HTTPS (da attivare in produzione) |

## Cosa è operativo
- Voto ai servizi "Prossimamente" (un voto per persona, annullabile), conteggio e classifica reali (partono da zero).
- Proposte di nuovi servizi con codice di tracciamento pubblico; nessuna pubblicazione senza approvazione.
- Admin: approva / rifiuta / unisci proposte, cambia stato dei servizi futuri (6 stati), vede e gestisce le richieste ricevute.
- Richieste di servizio salvate nel database (senza allegati).

## Protezioni
Validazione lato server di ogni campo; cookie admin HttpOnly + SameSite=Strict firmato; header `X-MV` e controllo `Origin` contro CSRF; limiti di frequenza per rete e per votante; tetto di voti giornalieri per rete e di votanti per rete per servizio; honeypot e tempo minimo sui moduli; CSP restrittiva; dati personali minimi (l'IP non è salvato: solo un'impronta non reversibile).

## Limiti noti
- L'antifrode è "per quanto tecnicamente possibile": chi cambia browser **e** rete può votare più volte. Una protezione forte richiede la verifica via email (servizio email non incluso).
- Non esistono pagamenti, area clienti né invio di email: le richieste si leggono nell'admin.
- Il database è un file: per più server o alta disponibilità serve un database condiviso.
- Backup, HTTPS e dominio vanno configurati sull'hosting scelto.
- I testi legali sono bozze da far rivedere.
- Aperto direttamente da file (senza server) il sito si vede, ma voto, proposte e richieste sono disattivati e lo dichiara.
