// ============ Stato ============
const state = {
  year: 1,
  month: 1,
  players: [],
  structures: [],
  logs: [], // 👈 aggiungi questa riga
  params: {
    priceSens: 1.8,
    priceRevSens: 0.9,
    reviewBias: 1.0,
    avgSpend: 120,
    localCompetition: 1.0,
    segEconomy: 1.0,
    segMid: 1.0,
    segLuxury: 1.0,
    occupancyBoost: 1.0,
    eventProbMonth: 8
  },
  borgoValues: { 'Montepulciano': 1, 'San Gimignano': 2.0, 'Chianciano': 0.7, 'Pienza': 1.5, 'Siena': 1.8 },
  annualBook: {},
lastAnnualReport: null,   // 👈 AGGIUNGI QUESTA

warShock: {
  active: false,
  monthsLeft: 0
},

};

// =========================
// Flag locale: evita riapertura multipla report annuale
// =========================
let _lastAnnualShownTs = null;

window.state = state; // ✅ rende lo state visibile a Firebase live sync

// ============ Accesso locale (Master / Giocatore) ============
const ACCESS_KEY = 'bt_access_name';

function normName(s){ return (s || '').trim().toLowerCase(); }

function applyRoleUI(){
  const isMaster = !!state.access?.isMaster;

  // ✅ classe globale per CSS (player vs master)
  document.body.classList.toggle('is-player', !isMaster);

  // sezione parametri admin
  const params = document.getElementById('paramsSection');
  if(params) params.style.display = isMaster ? '' : 'none';

  // form giocatori
  const addPlayerForm = document.getElementById('add-player-form');
  if(addPlayerForm) addPlayerForm.style.display = isMaster ? '' : 'none';

  // bottoni master
  const ids = ['removePlayerBtn','btnCalcMonth','btnNextMonth','newGameBtn','saveBtn','loadBtn'];
ids.forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.disabled = !isMaster;
});

// ✅ Report annuale visibile a tutti
const repBtn = document.getElementById('btnShowAnnual');
if (repBtn) repBtn.disabled = false;
 

  // form aggiungi struttura: solo master
  const addStructForm = document.getElementById('add-structure-form');
  if(addStructForm) addStructForm.style.display = isMaster ? '' : 'none';

  // ✅ BLOCCO BORGHI PER PLAYER
  const borgoIds = ['wMon','wSan','wChi','wPie','wSie'];
  borgoIds.forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.disabled = !isMaster;
  });

}

function enforcePlayerView(){
  // Master: nessun filtro
  if (state.access?.isMaster) return;

  const pid = state.access?.playerId;
  if (!pid) return;

  // forza sempre "attivo" il player loggato
  state.players.forEach(p => p.active = (p.id === pid));
}

function visibleStructures(){
  // TUTTI vedono tutto
  return state.structures;
}

state.access = state.access || {
  name: localStorage.getItem(ACCESS_KEY) || '',
  isMaster: false,
  playerId: null
};

function chooseAccessIdentity(){
  let name = state.access.name;

  if(!name){
    name = prompt('Chi sei? Scrivi il nome giocatore ESATTO oppure "master":') || '';
    name = name.trim();
    localStorage.setItem(ACCESS_KEY, name);
  }

  state.access.name = name;
  state.access.isMaster = (normName(name) === 'master');
  state.access.playerId = null;

  // ✅ classe globale per CSS (player vs master)
  document.body.classList.toggle('is-player', !state.access.isMaster);

  const badge = document.getElementById('accessBadge');
  if(badge){
    badge.textContent = state.access.isMaster ? '👑 MASTER' : `🎮 ${state.access.name || ''}`;
  }
}

let _missingPlayerWarned = false;

function syncAccessAfterStateLoaded(){
  // Se master, niente da fare
  if (state.access?.isMaster) {
    state.access.playerId = null;
    _missingPlayerWarned = false;
    return;
  }

  const name = state.access?.name;
  if(!name) return;

  const p = (state.players || []).find(x => normName(x.name) === normName(name));
  state.access.playerId = p ? p.id : null;

  // Se trovato, rendilo attivo (così vede subito la sua scheda)
  if (p) {
    state.players.forEach(x => x.active = (x.id === p.id));
    _missingPlayerWarned = false;
    return;
  }

  // Se NON trovato, avvisa solo DOPO che è arrivato Firebase (e solo una volta)
  if (!_missingPlayerWarned && (state.players || []).length > 0) {
    _missingPlayerWarned = true;
    alert(`Giocatore "${name}" non trovato nello stato della partita. Controlla maiuscole/spazi oppure fatti aggiungere dal Master.`);
  }
}


// utility permessi

function requireMaster(){
  if(state.access.isMaster) return true;
  alert('Azione riservata al Master.');
  return false;
}

const MONTH_NAMES = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

// ===============================
// ORDINAMENTO STRUTTURE (solo UI)
// ===============================
state.ui = state.ui || { structSort: 'structAsc' };

function getStructuresSortMode() {
  const sel = document.getElementById('structuresSort');
  // se esiste il select usa quello, altrimenti fallback allo state.ui
  return sel?.value || state.ui.structSort || 'structAsc';
}

function getBorgoName(s){
  return (s.borgo || '').toLowerCase();
}

function sortStructuresForView(list) {
  const mode = getStructuresSortMode();

  const getOwnerName = (s) => {
    const owner = state.players.find(p => p.id === s.ownerId);
    return (owner?.name || '').toLowerCase();
  };
  const getStructName = (s) => (s.nome || '').toLowerCase();
  const getBorgoName  = (s) => (s.borgo || '').toLowerCase(); // ✅ qui

  const arr = [...list];

  arr.sort((a, b) => {
  if (mode === 'structAsc')  return getStructName(a).localeCompare(getStructName(b), 'it');
  if (mode === 'structDesc') return getStructName(b).localeCompare(getStructName(a), 'it');

  if (mode === 'borgoAsc') {
    return (a.borgo || '').localeCompare((b.borgo || ''), 'it', { sensitivity: 'base' });
  }
  if (mode === 'borgoDesc') {
    return (b.borgo || '').localeCompare((a.borgo || ''), 'it', { sensitivity: 'base' });
  }

  if (mode === 'ownerAsc')   return getOwnerName(a).localeCompare(getOwnerName(b), 'it');
  if (mode === 'ownerDesc')  return getOwnerName(b).localeCompare(getOwnerName(a), 'it');
  return 0;
});

  return arr;
}

// ============ Utils ============
function uid(p='id'){ return p + Math.random().toString(36).slice(2,9); }
function fmt(n){ return Number(n).toLocaleString('it-IT'); }
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function annualSeenKey(){
  const who = (state.access?.name || 'guest').toLowerCase();
  return `bt_lastAnnualSeenTs_${who}`;
}

function hasSeenAnnual(ts){
  if(!ts) return true;
  return localStorage.getItem(annualSeenKey()) === ts;
}

function markSeenAnnual(ts){
  if(!ts) return;
  localStorage.setItem(annualSeenKey(), ts);
}

function updateWarShock(){
  // se già attiva, non fare nulla
  if (state.warShock.active) return;

  // 5% di probabilità mensile
  if (Math.random() < 0.05){
    state.warShock.active = true;
    state.warShock.monthsLeft = 12;
    log('🌍 Guerra internazionale: turismo premium -70% per 12 mesi');
  }
}

function tickWarShockEndOfMonth(){
  if (!state.warShock.active) return;

  state.warShock.monthsLeft--;

  if (state.warShock.monthsLeft <= 0){
    state.warShock.active = false;
    state.warShock.monthsLeft = 0;
    log('🕊️ Fine guerra internazionale: turismo premium in ripresa');
  }
}

// ====== Colori righe per proprietario ======
const PLAYER_ROW_PALETTE = [
  '#ffe5e5', // rosso tenue
  '#e8f7e8', // verde tenue
  '#e7f0ff', // blu tenue
  '#fff4d6', // giallo tenue
  '#f1e8ff', // viola tenue
  '#e7fbff', // azzurro tenue
  '#fff0f6', // rosa tenue
  '#f3f4f6', // grigio tenue
];

function ownerRowColor(ownerId){
  if(!ownerId) return '';
  const idx = (state.players || []).findIndex(p => p.id === ownerId);
  if(idx < 0) return '';
  return PLAYER_ROW_PALETTE[idx % PLAYER_ROW_PALETTE.length];
}

function daysInMonth(m){ return [31,28,31,30,31,30,31,31,30,31,30,31][m-1] || 30; }

function dynamicTargetPrice(s, state, seas, P){
  // ✅ fallback anti-crash
  P = P || state?.params || {};
  seas = seas || { demand: 1, priceAmp: 1 };
  state = state || { borgoValues:{}, structures:[] };

  // 1) centro domanda macro del mese
  const base =
    (P.avgSpend || 120) *
    (0.92 + 0.10 * (seas.demand - 1));

  // 2) qualità (premium cresce più che linearmente)
  const q = s.qualita || 3;
  const qMul =
    q === 1 ? 0.55 :
    q === 2 ? 0.80 :
    q === 3 ? 1.05 :
    q === 4 ? 1.35 :
              1.70; // Q5

  // 3) borgo (pesa di più per premium/luxury)
  const borgoW = (state.borgoValues?.[s.borgo] || 1);
  const borgoMul = Math.pow(borgoW, q >= 3 ? 0.45 : 0.25);

  // 4) servizi
  const poolMul = s.piscina ? 1.10 : 1.00;

  // 5) concorrenza nello stesso segmento
  const competitors = (state.structures || []).filter(x =>
    !x.closed &&
    x.id !== s.id &&
    Math.abs((x.qualita || 0) - q) <= 1
  ).length;

  const compMul = 1 / (1 + 0.03 * competitors);

  return base * qMul * borgoMul * poolMul * compMul;
}
function maybeAutoOpenAnnualReport(){
  const ts = state.lastAnnualReport?.ts;
  if(!ts) return;

  // apri SOLO all’inizio dell’anno nuovo (dopo finalize)
  if(state.month !== 1) return;

  const lastSeen = localStorage.getItem('bt_lastAnnualSeenTs') || '';
  if(lastSeen === ts) return;

  localStorage.setItem('bt_lastAnnualSeenTs', ts);

  setTimeout(() => openAnnualReport(true), 300);
}


function log(msg, playerId = null, structId = null) {
  const el = document.getElementById('reportLog');
  const player = playerId ? state.players.find(p => p.id === playerId) : null;
  const struct = structId ? state.structures.find(s => s.id === structId) : null;

  const prefix = `[Anno ${state.year}, ${MONTH_NAMES[state.month - 1]}]`;
  const who = player ? ` — Giocatore: ${player.name}` : '';
  const what = struct ? ` — Struttura: ${struct.nome}` : '';
  const text = `${prefix}${who}${what} → ${msg}`;

  // ✅ Mostra nella pagina principale
  if (el) {
    const d = document.createElement('div');
    d.textContent = text;
    el.prepend(d);
    // limita la lunghezza a 200 righe
    while (el.childNodes.length > 200) el.removeChild(el.lastChild);
  }

  // ✅ Salva anche nel log globale per Firebase e viewer
  if (!state.reportLog) state.reportLog = [];
  state.reportLog.unshift(text);
  if (state.reportLog.length > 200) state.reportLog.pop();

  // ✅ Sincronizza subito con Firebase
 if (window.saveToFirebase && state.access?.isMaster) {
  saveToFirebase(state);
  }
}

function renderLog(){
  const el = document.getElementById('reportLog');
  if(!el) return;

  el.innerHTML = '';

  const rows = (state.reportLog || []);
  rows.slice(0, 200).forEach(line=>{
    const d = document.createElement('div');
    d.textContent = line;
    el.appendChild(d);
  });
}

function ensureYearBook(pid){ if(!state.annualBook[pid]) state.annualBook[pid]={ gross:0, mgmt:0, taxes:0, upgrades:0, interest:0, extraExp:0, extraInc:0, marketing:0 }; }

function canEditStruct(s){
  // Master può sempre
  if (state.access?.isMaster) return true;

  // Se non ho fatto login, nessuno può editare
  if (!state.access?.playerId) return false;

  // Il player può editare solo le sue strutture
  return s.ownerId === state.access.playerId;
}

function bankOfferForStruct(s){
  // ✅ Se hai già una logica “ufficiale” dentro sellToBank, mettila QUI,
  // e poi fai usare QUESTA funzione anche a sellToBank e alla classifica.

  // Fallback ragionevole: replica il costo base di acquisto (come in add-structure-form)
  // e applica una percentuale “banco” (es. 70%). Se vuoi, cambia 0.70.
  const roomCost = q => ({1:5000,2:10000,3:20000,4:30000,5:40000}[q]||20000);
  const poolCost = q => ({1:50000,2:80000,3:100000,4:150000,5:250000}[q]||100000);
  const buyCost  = q => (q<=1?10000 : q===2?30000 : 50000);

  const qualita = Number(s.qualita || 3);
  const camere  = Number(s.camere || 1);

  let value = buyCost(qualita) + roomCost(qualita)*camere + (s.piscina ? poolCost(qualita) : 0);

  const borgoAdjustments = {
    'Chianciano': -20000,
    'Montepulciano': +30000,
    'Pienza': +50000,
    'Siena': +60000,
    'San Gimignano': +70000
  };
  if (s.borgo in borgoAdjustments) value += borgoAdjustments[s.borgo];

  // “banco paga %”
  const BANK_RATE = 0.70;
  return Math.max(0, Math.round(value * BANK_RATE));
}

function calcPlayerPatrimony(p){
  const budget = Number(p.budget || 0);

  const props = (state.structures || [])
    .filter(s => !s.closed && s.ownerId === p.id) // closed: decidi tu se contano; io qui le escludo
    .reduce((sum, s) => sum + bankOfferForStruct(s), 0);

  return { budget, props, total: budget + props };
}

function renderLeaderboard(){
  const el = document.getElementById('leaderboard');
  if(!el) return;

  const rows = (state.players || []).map(p => {
    const v = calcPlayerPatrimony(p);
    return { id:p.id, name:p.name, ...v };
  }).sort((a,b)=> b.total - a.total);

  if(!rows.length){
    el.innerHTML = '<em>Nessun giocatore</em>';
    return;
  }

  el.innerHTML = rows.map((r, i) => {
    const cls = (i===0) ? 'leader-1' : (i===1) ? 'leader-2' : (i===2) ? 'leader-3' : 'leader-other';
    return `
      <div class="leader-row ${cls}">
        <div>
          #${i+1} ${r.name}
          <br><small>Budget: €${fmt(r.budget)} • Proprietà (valore banco): €${fmt(r.props)}</small>
        </div>
        <div>€${fmt(r.total)}</div>
      </div>
    `;
  }).join('');
}


// ============ Bind sliders ============
bindSlider('priceSens','priceSens','priceSensLabel');
bindSlider('priceRevSens','priceRevSens','priceRevSensLabel');
bindSlider('reviewBias','reviewBias','reviewBiasLabel');
bindSlider('avgSpend','avgSpend','avgSpendLabel');
bindSlider('localCompetition','localCompetition','localCompetitionLabel');
bindSlider('segEconomy','segEconomy','segEconomyLabel');
bindSlider('segMid','segMid','segMidLabel');
bindSlider('segLuxury','segLuxury','segLuxuryLabel');
bindSlider('occupancyBoost','occupancyBoost','occupancyBoostLabel');
bindSlider('monthEventProb','eventProbMonth','monthEventProbLabel');

function bindSlider(id,key,label){
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('input',e=>{
    state.params[key]=Number(e.target.value);
    const lab=document.getElementById(label);
    if(lab) lab.textContent=e.target.value;
  });
}

// ============ Giocatori ============
function totalLoans(p){ return (p.loans||[]).reduce((sum,l)=>sum+(l.principal||l),0); }

function renderPlayers(){
  const tabs = document.getElementById('playersTabs');
  tabs.innerHTML = '';

  const isMaster = !!state.access?.isMaster;
  const pid = state.access?.playerId;

  const list = isMaster ? state.players : state.players.filter(p => p.id === pid);

  list.forEach(p=>{
    const b=document.createElement('button');
    b.className='tab'+(p.active?' active':'');
    b.textContent=`${p.name} (€${fmt(p.budget)})`;

    // SOLO master può cambiare player attivo
    b.onclick = isMaster
      ? ()=>{ state.players.forEach(x=>x.active=false); p.active=true; renderPlayers(); renderPlayerCard(); }
      : null;

    tabs.appendChild(b);
  });
}

function isDebtLockedPlayer(p){
  return (totalLoans(p) > 99999);
}
function isDebtLockedByOwnerId(ownerId){
  const p = state.players.find(x => x.id === ownerId);
  return p ? isDebtLockedPlayer(p) : false;
}

function renderPlayerCard(){
  const p=state.players.find(x=>x.active);
  const card=document.getElementById('playerCard');
  if(!p){ card.innerHTML='<em>Seleziona un giocatore</em>'; return; }
  const loans = totalLoans(p);
const loanRows = (p.loans && p.loans.length)
  ? p.loans.map((L,i)=>`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span>Prestito #${i+1} (€${fmt(L.principal)}) — ${L.year}</span>
        <button class="ghost" onclick="repaySingleLoan('${p.id}', ${i})">Rimborsa</button>
      </div>`).join('')
  : '<em>Nessun prestito attivo</em>';
  card.innerHTML = `
    <div><strong>${p.name}</strong></div>
    <div>Budget: <strong>€ ${fmt(p.budget)}</strong></div>
    <div>Prestiti attivi: <strong>€ ${fmt(loans)}</strong> (20% annuo)</div>

    <div style="margin-top:8px">
      <label>Spese extra <input id="extraExp" type="number" value="0"></label>
      <button id="applyExtra">Addebita</button>
      <label>Introiti extra <input id="extraInc" type="number" value="0"></label>
      <button id="applyExtraInc">Accredita</button>
    </div>

    <div style="margin-top:8px">
      <label>Marketing €/mese <input id="marketingInput" type="number" value="${p.marketing||0}"></label>
      <button id="applyMarketing">Aggiorna Marketing</button>
    </div>

    <div style="margin-top:8px">
      <label>Prestito: <input id="loanAmount" type="number" placeholder="Importo"></label>
      <button id="takeLoanBtn">Prendi prestito</button>
      <label>Rimborso: <input id="repayAmount" type="number" placeholder="Importo"></label>
      <button id="repayLoanBtn">Rimborsa prestito</button>
    </div>
  `;

// ===== Punto 5: blocco azioni non consentite ai player =====
if (!state.access?.isMaster) {

  // disabilita input numerici
  card.querySelectorAll('input').forEach(i => {
    i.disabled = true;
  });

  // disabilita bottoni
  card.querySelectorAll('button').forEach(b => {
    b.disabled = true;
  });

}

if (!state.access?.isMaster) {
  card.innerHTML = `<em>Seleziona le tue strutture nella tabella.</em>`;
  return;
}


  document.getElementById('applyExtra').onclick=()=>{
    const e=Number(document.getElementById('extraExp').value)||0;
    p.budget-=e; ensureYearBook(p.id); state.annualBook[p.id].extraExp+=e; log(`${p.name} spese extra €${fmt(e)}`); renderPlayers(); renderPlayerCard();
if(window.saveToFirebase) saveToFirebase(state);
  };
  document.getElementById('applyExtraInc').onclick=()=>{
    const i=Number(document.getElementById('extraInc').value)||0;
    p.budget+=i; ensureYearBook(p.id); state.annualBook[p.id].extraInc+=i; log(`${p.name} introiti extra €${fmt(i)}`); renderPlayers(); renderPlayerCard();
if(window.saveToFirebase) saveToFirebase(state);
  };
  document.getElementById('applyMarketing').onclick=()=>{
    p.marketing=Number(document.getElementById('marketingInput').value)||0;
  
    log(`${p.name} marketing a €${fmt(p.marketing)}/mese`); renderPlayers(); renderPlayerCard();
if(window.saveToFirebase) saveToFirebase(state);
  };
  document.getElementById('takeLoanBtn').onclick=()=>{
    const val=Number(document.getElementById('loanAmount').value)||0; if(val<=0){alert('Importo non valido');return;}
    if(!p.loans) p.loans=[]; p.loans.push({principal:val,rate:0.20,year:state.year}); p.budget+=val;
    log(`${p.name} prende prestito €${fmt(val)} (20% annuo)`); renderPlayers(); renderPlayerCard();
if(window.saveToFirebase) saveToFirebase(state);
  };
  document.getElementById('repayLoanBtn').onclick=()=>{
    let val=Number(document.getElementById('repayAmount').value)||0; if(val<=0){alert('Importo non valido');return;}
    if(val>p.budget){alert('Budget insufficiente');return;}
    if(!p.loans || !p.loans.length){alert('Nessun prestito');return;}
    let remain=val; for(const L of p.loans){ if(remain<=0) break; const pay=Math.min(L.principal,remain); L.principal-=pay; remain-=pay; }
    p.loans=p.loans.filter(L=>L.principal>0); p.budget -= (val-remain);
    log(`${p.name} rimborsa €${fmt(val-remain)} (residuo €${fmt(totalLoans(p))})`); renderPlayers(); renderPlayerCard();
if(window.saveToFirebase) saveToFirebase(state);
  };
}

document.getElementById('add-player-form').addEventListener('submit', e=>{
  e.preventDefault();
  const name=document.getElementById('player-name').value.trim();
  const budget=Number(document.getElementById('player-budget').value)||0;
  if(!name) return;
  state.players.forEach(p=>p.active=false);
  state.players.push({ id:uid('pl_'), name, budget, active:true, structures:[], loans:[], marketing:0, historyAnnual:[], historyMonthly:[] });
  renderPlayers(); renderPlayerCard();
  e.target.reset();
if(window.saveToFirebase) saveToFirebase(state);
});
document.getElementById('removePlayerBtn').onclick=()=>{
  const p=state.players.find(x=>x.active); if(!p){alert('Seleziona un giocatore');return;}
  if(!confirm(`Rimuovere ${p.name}?`))return;
  state.structures=state.structures.filter(s=>s.ownerId!==p.id);
  state.players=state.players.filter(x=>x.id!==p.id);
  if(state.players[0]) state.players[0].active=true;
  renderPlayers(); renderPlayerCard(); renderStructures();
if(window.saveToFirebase) saveToFirebase(state);
};
document.getElementById('showPlayerHistoryBtn').onclick=()=>{
  const p=state.players.find(x=>x.active); if(!p){alert('Seleziona un giocatore');return;}
  const modal=document.getElementById('modal'); const body=document.getElementById('modalBody');
  const rows = p.historyAnnual.map(h=>`<tr><td>${h.year}</td><td>€ ${fmt(h.gross)}</td><td>€ ${fmt(h.mgmt)}</td><td>€ ${fmt(h.taxes)}</td><td>€ ${fmt(h.interest)}</td><td>€ ${fmt(h.upgrades)}</td><td>€ ${fmt(h.marketing)}</td><td>€ ${fmt(h.extra)}</td><td><strong>€ ${fmt(h.net)}</strong></td><td>€ ${fmt(h.budget)}</td></tr>`).join('');
  body.innerHTML=`
    <h3>Storico — ${p.name}</h3>
    <table>
      <tr><th>Anno</th><th>Lordo</th><th>Gestione</th><th>Tasse</th><th>Interessi</th><th>Upgrade</th><th>Marketing</th><th>Extra</th><th>Netto</th><th>Budget</th></tr>
      ${rows || '<tr><td colspan="10"><em>Nessun dato</em></td></tr>'}
    </table>`;
  modal.classList.remove('hidden');
};
document.getElementById('modalClose').onclick=()=> document.getElementById('modal').classList.add('hidden');

// ============ Borghi ============
function readBorgoValues(){
  state.borgoValues = {
    'Montepulciano': Number(document.getElementById('wMon').value)||1,
    'San Gimignano': Number(document.getElementById('wSan').value)||1,
    'Chianciano':    Number(document.getElementById('wChi').value)||1,
    'Pienza':        Number(document.getElementById('wPie').value)||1,
    'Siena':         Number(document.getElementById('wSie').value)||1
  };
}

// ============ Strutture ============
const tableBody = document.querySelector('#structuresTable tbody');

function renderStructures(){
  tableBody.innerHTML='';
  const list = sortStructuresForView(visibleStructures());
list.forEach((s,i)=>{
    const owner=state.players.find(p=>p.id===s.ownerId);
const debtLocked = owner ? isDebtLockedPlayer(owner) : false;
    const tr=document.createElement('tr');

const bg = ownerRowColor(s.ownerId);
if (bg) tr.style.background = bg;

// (opzionale) se la struttura è chiusa, “desatura” un filo
if (s.closed) {
  tr.style.filter = 'grayscale(35%)';
  tr.style.opacity = '0.85';
}

 const nameDisplay = s.closed
  ? `<span style="color:red; font-weight:bold;">${s.nome}</span>`
  : s.nome;

// Solo il Master vede questi bottoni
const canAct = state.access?.isMaster === true;

const toggleBtn   = canAct
  ? `<button class="ghost" onclick="toggleStructStatus('${s.id}')">${s.closed ? 'Riapri' : 'Chiudi'}</button>`
  : '';

const transferBtn = canAct
  ? `<button class="ghost" onclick="transferStruct('${s.id}')">Trasferisci</button>`
  : '';

const sellBtn     = canAct
  ? `<button class="ghost" onclick="sellToBank('${s.id}')">Vendi al Banco</button>`
  : '';

const delBtn      = canAct
  ? `<button class="danger" onclick="deleteStruct('${s.id}')">Elimina</button>`
  : '';

tr.innerHTML = `
  <td>${i+1}</td>
  <td>${owner ? owner.name : '-'}</td>
  <td>${s.borgo}</td>
  <td>${nameDisplay}</td>
<td>
  <input class="cell" type="number" min="1" max="5"
    value="${s.qualita}"
    data-id="${s.id}" data-f="qualita"
    ${(s.closed || !state.access?.isMaster || debtLocked) ? 'disabled' : ''}>
</td>

<td>
  <input class="cell" type="number" min="1" max="3"
    value="${s.pulizie}"
    data-id="${s.id}" data-f="pulizie"
    ${(s.closed || !state.access?.isMaster) ? 'disabled' : ''}>
</td>

<td>
  <input class="cell" type="number"
    min="1"
    max="${s.qualita <= 3 ? 10 : s.qualita === 4 ? 6 : 7}"
    value="${s.camere}"
    data-id="${s.id}" data-f="camere"
    ${(s.closed || !state.access?.isMaster || debtLocked) ? 'disabled' : ''}>
</td>

<td>
  <select class="cell"
    data-id="${s.id}" data-f="piscina"
    ${(s.closed || !state.access?.isMaster || debtLocked) ? 'disabled' : ''}>
    <option value="no"${!s.piscina ? ' selected' : ''}>No</option>
    <option value="si"${s.piscina ? ' selected' : ''}>Sì</option>
  </select>
</td>

<td>
  <input class="cell" type="number" min="10" step="5"
    value="${s.prezzo}"
    data-id="${s.id}" data-f="prezzo"
    ${(s.closed || !(state.access?.isMaster || (state.access?.playerId && s.ownerId === state.access.playerId)))
      ? 'disabled'
      : ''}>
</td>

  <td>${s.lastNotti ?? '-'}</td>
  <td>${s.lastOcc ?? '-'}</td>
  <td>${s.recensioni?.toFixed ? s.recensioni.toFixed(1) : (s.recensioni || '-')}</td>
  <td>${s.lastRevenue ? '€' + fmt(s.lastRevenue) : '-'}</td>

  <td>
    ${toggleBtn}
    <button class="ghost" onclick="showStructHistory('${s.id}')">Storico</button>
    ${transferBtn}
    ${sellBtn}
    ${delBtn}
  </td>
`;
    tableBody.appendChild(tr);
  });


tableBody.querySelectorAll('.cell').forEach(el=>{
  el.addEventListener('change', e=>{
    const id = e.target.dataset.id;
    const f  = e.target.dataset.f;
    const s  = state.structures.find(x => x.id === id);
    if(!s) return;

    // =========================
    // PLAYER: può cambiare SOLO il prezzo
    // =========================
    if (!state.access?.isMaster) {

      if (f !== 'prezzo') {
        // sicurezza: ripristina valore originale
        renderStructures();
        return;
      }

      const newPrice = Number(e.target.value);
      if (isNaN(newPrice) || newPrice <= 0) {
        renderStructures();
        return;
      }

      // aggiorna localmente
      s.prezzo = newPrice;

      // 🔥 salva su Firebase prezzi (live, visibile a tutti)
      if (window.submitPriceChange) {
        window.submitPriceChange(s.id, newPrice);
      }

      return;
    }

    // =========================
    // MASTER: può fare tutto
    // =========================
    if (f === 'piscina') {
      s[f] = (e.target.value === 'si');
    } else {
      s[f] = Number(e.target.value);
    }

    s._edited = true;

    // il master salva lo state completo
    if (window.saveToFirebase) {
      window.saveToFirebase(state);
    }
  });
});

}

// Funzione per chiudere/riaprire strutture
window.toggleStructStatus = function(id){
  const s = state.structures.find(x=>x.id===id);
  if(!s) return;
  s.closed = !s.closed;
  log(`${s.nome} è stato ${s.closed ? 'chiuso' : 'riaperto'}.`);
  renderStructures();
  if(window.saveToFirebase) saveToFirebase(state);
};

window.showStructHistory = function(id){
  const s=state.structures.find(x=>x.id===id); if(!s) return;
  const modal=document.getElementById('modal'); const body=document.getElementById('modalBody');
  const rows = s.historyMonthly.map(h=>
  `<tr>
     <td>${h.y}</td>
     <td>${MONTH_NAMES[h.m-1]}</td>
     <td>${h.notti}</td>
     <td>${h.occ}%</td>
     <td>€ ${fmt(h.revenue)}</td>
   </tr>`
).join('');
  body.innerHTML=`
    <h3>Storico struttura — ${s.nome}</h3>
    <table>
      <tr><th>Anno</th><th>Mese</th><th>Notti</th><th>Occ</th><th>Ricavi</th></tr>
      ${rows || '<tr><td colspan="5"><em>Nessun dato</em></td></tr>'}
    </table>`;
  modal.classList.remove('hidden');
};
window.transferStruct = function(id){
  const s = state.structures.find(x => x.id === id);
  if (!s) return;

  const seller = state.players.find(p => p.id === s.ownerId);
  const buyerName = prompt('Trasferire a (nome esatto del giocatore acquirente):');
  if (!buyerName) return;

  const buyer = state.players.find(p => p.name.trim().toLowerCase() === buyerName.trim().toLowerCase());
  if (!buyer) {
    alert('Giocatore non trovato');
    return;
  }

  if (buyer.id === seller.id) {
    alert('Il venditore e l’acquirente coincidono!');
    return;
  }

  // chiedi prezzo di vendita
  const priceStr = prompt(`Inserisci il prezzo di vendita in € per "${s.nome}":`);
  const price = Number(priceStr);
  if (isNaN(price) || price <= 0) {
    alert('Prezzo non valido.');
    return;
  }

  // controlla che l'acquirente abbia abbastanza denaro
  if (buyer.budget < price) {
    alert(`${buyer.name} non ha abbastanza budget per acquistare (budget attuale: €${fmt(buyer.budget)}).`);
    return;
  }

  // effettua la transazione
  buyer.budget -= price;
  seller.budget += price;

  // trasferisci la proprietà
  if (seller) seller.structures = seller.structures.filter(x => x !== s.id);
  s.ownerId = buyer.id;
  buyer.structures.push(s.id);

  // log dell’operazione
  log(`"${s.nome}" venduta da ${seller ? seller.name : '-'} a ${buyer.name} per €${fmt(price)}`, seller?.id, s.id);

  // aggiorna interfaccia
  renderStructures();
  renderPlayers();
if(window.saveToFirebase) saveToFirebase(state);

};

// =========================
// VENDI AL BANCO (solo Master - chiamata da onclick)
// =========================
window.sellToBank = function sellToBank(id){
  const s = state.structures.find(x => x.id === id);
  if(!s) return;

  const owner = state.players.find(p => p.id === s.ownerId);

  // calcolo valore "di riferimento" come costo di acquisto base
  const roomCost = q => ({1:5000,2:10000,3:20000,4:30000,5:40000}[q]||20000);
  const poolCost = q => ({1:50000,2:80000,3:100000,4:150000,5:250000}[q]||100000);
  const buyCost  = q => (q<=1?10000 : q===2?30000 : 50000);

  let baseValue = buyCost(s.qualita) + roomCost(s.qualita) * (s.camere || 0) + (s.piscina ? poolCost(s.qualita) : 0);

  const borgoAdjustments = {
    'Chianciano': -20000,
    'Montepulciano': +30000,
    'Pienza': +50000,
    'Siena': +60000,
    'San Gimignano': +70000
  };
  if (s.borgo in borgoAdjustments) baseValue += borgoAdjustments[s.borgo];

  // il Banco compra con sconto (puoi cambiare 0.65)
  const BANK_RATE = 0.65;
  const price = Math.max(0, Math.round(baseValue * BANK_RATE));

  const ok = confirm(`Vendi "${s.nome}" al Banco per €${fmt(price)}?`);
  if(!ok) return;

  // accredita
  if (owner) owner.budget += price;

  // rimuove struttura
  state.structures = state.structures.filter(x => x.id !== id);
  if (owner && owner.structures) owner.structures = owner.structures.filter(x => x !== id);

  log(`"${s.nome}" venduta al Banco per €${fmt(price)}`, owner?.id, id);

  renderStructures();
  renderPlayers();
  renderPlayerCard();
renderLeaderboard();

  if (window.saveToFirebase) saveToFirebase(state);
};

window.deleteStruct=function(id){
  const s=state.structures.find(x=>x.id===id); if(!s) return;
  if(!confirm('Eliminare struttura?')) return;
  state.structures=state.structures.filter(x=>x.id!==id);
  state.players.forEach(p=> p.structures = p.structures.filter(x=>x!==id));
  renderStructures();renderLeaderboard();
if(window.saveToFirebase) saveToFirebase(state);
};

// ============ Rimborso singolo prestito ============
window.repaySingleLoan = function(pid, index){
  const p = state.players.find(x=>x.id===pid);
  if(!p || !p.loans[index]) return;
  const L = p.loans[index];
  if(p.budget < L.principal){ 
    alert('Budget insufficiente per estinguere questo prestito'); 
    return; 
  }
  p.budget -= L.principal;
  p.loans.splice(index,1);
  log(`${p.name} ha estinto un prestito di €${fmt(L.principal)}`);
  renderPlayers(); 
  renderPlayerCard();
if(window.saveToFirebase) saveToFirebase(state);
};

// aggiungi struttura (form)
document.getElementById('add-structure-form').addEventListener('submit', e => {
  e.preventDefault();
  const owner = state.players.find(p => p.active);
  if (!owner) { alert('Seleziona un giocatore attivo'); return; }

if (isDebtLockedPlayer(owner)) {
  alert(`${owner.name} ha oltre €99.999 di prestiti: non può acquistare nuove strutture finché non rientra sotto soglia.`);
  return;
}

  const nome = (document.getElementById('struct-name').value || '').trim();
  const borgo = document.getElementById('struct-borgo').value;
  const qualita = Number(document.getElementById('struct-qualita').value);
  const pulizie = Number(document.getElementById('struct-pulizie').value);
  const camere = Number(document.getElementById('struct-camere').value);
const maxCamere = qualita <= 3 ? 10 : qualita === 4 ? 6 : 7;
if (camere > maxCamere) {
  alert(`Le strutture di qualità ${qualita} possono avere al massimo ${maxCamere} camere.`);
  return;
}
  const piscina = (document.getElementById('struct-piscina').value === 'si');
  const prezzo = Number(document.getElementById('struct-prezzo').value);
  if (!nome) { alert('Nome mancante'); return; }

  const s = {
    id: uid('s_'),
    ownerId: owner.id,
    nome,
    borgo,
    qualita,
    pulizie,
    camere,
    piscina,
    prezzo,
    recensioni: (qualita <= 3 ? 8.5 : 7.5),
    lastNotti: 0,
    lastOcc: '-',
    lastRevenue: 0,
    historyMonthly: [],
    historyAnnual: [],
    snap: { qualita, pulizie, camere, piscina }
  };

  // costi base di acquisto
  const roomCost = q => ({1:5000,2:10000,3:20000,4:30000,5:40000}[q]||20000);
  const poolCost = q => ({1:50000,2:80000,3:100000,4:150000,5:250000}[q]||100000);
  const buyCost  = q => (q<=1?10000 : q===2?30000 : 50000); // costo base banco

  let costo = buyCost(qualita) + roomCost(qualita)*camere + (piscina?poolCost(qualita):0);

  // 💰 aggiustamento costo per borgo
  const borgoAdjustments = {
    'Chianciano': -20000,
    'Montepulciano': +30000,
    'Pienza': +50000,
    'Siena': +60000,
    'San Gimignano': +70000
  };
  let borgoNote = '';
  if (borgo in borgoAdjustments) {
    const adj = borgoAdjustments[borgo];
    costo += adj;
    borgoNote = adj > 0
      ? `(+€${fmt(adj)} costo borgo)`
      : `(−€${fmt(Math.abs(adj))} bonus borgo)`;
  }

  // addebita il costo totale al giocatore
  owner.budget -= costo;
  ensureYearBook(owner.id);
  state.annualBook[owner.id].upgrades += costo;

  state.structures.push(s);
  owner.structures.push(s.id);

  log(`${owner.name} acquista "${nome}" (${borgo}, Q${qualita}, Camere ${camere}${piscina?', piscina':''}) — costo totale €${fmt(costo)} ${borgoNote}`);
  renderStructures();
  renderPlayers();
renderLeaderboard();
  e.target.reset();
  if (window.saveToFirebase) window.saveToFirebase(state);
});
// ============ Upgrade costi ============
function chargeUpgradesIfAny(s, owner){
  const prev=s.snap || {qualita:s.qualita, pulizie:s.pulizie, camere:s.camere, piscina:s.piscina};
// =========================
// BLOCCO DEBITO: > 99.999€ => NO camere/qualità/piscina, SOLO pulizie
// =========================
if (isDebtLockedPlayer(owner)) {
  const touchedForbidden =
    (s.camere !== prev.camere) ||
    (s.qualita !== prev.qualita) ||
    (s.piscina !== prev.piscina);

  if (touchedForbidden) {
    // ripristina i campi vietati
    s.camere = prev.camere;
    s.qualita = prev.qualita;
    s.piscina = prev.piscina;

    log(`⚠️ Blocco debito: ${owner.name} ha >€99.999 di prestiti. Vietati upgrade (camere/qualità/piscina). Consentite solo Pulizie.`);
  }
}
  let costo=0;

  const roomCost = q => ({1:5000,2:10000,3:20000,4:30000,5:40000}[q]||20000);
  const poolCost = q => ({1:50000,2:80000,3:100000,4:150000,5:250000}[q]||100000);

  // Camere
  if(s.camere>prev.camere){ costo += (s.camere-prev.camere)*roomCost(s.qualita); }
  // Qualità
  if(s.qualita>prev.qualita){
    for(let q=prev.qualita; q<s.qualita; q++){
      if(q===1 && q+1===2) costo += 30000;
      else if(q===2 && q+1===3) costo += 50000;
      else if(q===3 && q+1===4) costo += 70000 + (10000 * s.camere);
      else if(q===4 && q+1===5) costo += 90000 + (10000 * s.camere);
    }
  }
  // Pulizie (aumento)
  if(s.pulizie>prev.pulizie){
    const basePul = (s.camere<=3? 10000 : 20000);
    const addPul2 = 20000; // +20k rispetto a pulizie1
    const addPul3 = 40000; // +40k rispetto a pulizie1
    if(prev.pulizie===1 && s.pulizie===2) costo += basePul + addPul2;
    if(prev.pulizie===1 && s.pulizie===3) costo += basePul + addPul3;
    if(prev.pulizie===2 && s.pulizie===3) costo += addPul3;
  }
  // Piscina
  if(!prev.piscina && s.piscina){ costo += poolCost(s.qualita); }

  if(costo>0){
    owner.budget -= costo; ensureYearBook(owner.id); state.annualBook[owner.id].upgrades += costo;
    log(`${owner.name} investe €${fmt(costo)} upgrade su "${s.nome}"`);
if(window.saveToFirebase) saveToFirebase(state);
  }
  s.snap={qualita:s.qualita, pulizie:s.pulizie, camere:s.camere, piscina:s.piscina};
  s._edited=false;
}

// ===============================
// LUXURY DEMAND MODEL (Logit choice)
// ===============================
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// domanda base luxury: % di notti vendibili che il mercato luxury “riempie” in quel mese
// (puoi tararla: alzando questi valori aumenti l’intero mercato luxury)
function luxuryMarketFill(seas){
  const base = 0.45;              // NON 0.25
  const seasonal = 0.40 * seas.demand;
  return clamp01(base + seasonal);
}



// ===============================
// PREMIUM DEMAND MODEL (Logit choice) — Q3–Q5
// ===============================


function premiumMarketFill(seas){
  const demand = (seas && typeof seas.demand === 'number') ? seas.demand : 1;
  const base = 0.70;
  const seasonal = 0.45 * demand;
  return clamp01(base + seasonal);
}

function premiumChoiceShare(structs, s, state, seas, P){
  // Prezzo RELATIVO: 10% sopra target deve pesare tanto
  const BETA_LOG_PRICE = 1.35;   // ↑ aumenta se vuoi più sensibilità al prezzo
  const BETA_QUAL  = 0.42;       // ↑ qualità più “forte” (Q4/Q5 non devono perdere vs Q3 per 10€)
  const BETA_POOL  = 0.20;
  const BETA_BORGO = 0.25;
  const BETA_CLEAN = 0.14;
  const BETA_REVIEW= 0.10;

  const OUTSIDE_U = -0.80;       // più negativo => meno “fuga” fuori mercato => occ più alta

  const maxBorgo = Math.max(...Object.values(state.borgoValues || {Montepulciano:1}));
P = P || state?.params || {};

  function U(x){
    const bw = (state.borgoValues?.[x.borgo] || 1) / maxBorgo;
    const qStep  = Math.max(0, (x.qualita || 0) - 3); // Q3=0 Q4=1 Q5=2
    const clean  = (x.pulizie || 2) - 2;
    const review = (typeof x.recensioni === 'number') ? x.recensioni : 7.5;

    const t = dynamicTargetPrice(x, state, seas, P);
    const rel = (x.prezzo || 1) / Math.max(1, t);      // prezzo/target
    const relClamped = Math.max(0.40, Math.min(3.00, rel)); // evita estremi assurdi
    const logRel = Math.log(relClamped);               // <0 se sotto target => bonus, >0 se sopra => malus

    return (
      (BETA_QUAL   * qStep) +
      (BETA_BORGO  * bw) +
      (BETA_POOL   * (x.piscina ? 1 : 0)) +
      (BETA_CLEAN  * clean) +
      (BETA_REVIEW * ((review - 7.0) / 3.0)) -
      (BETA_LOG_PRICE * logRel)
    );
  }

  const exps = structs.map(x => Math.exp(U(x)));
  const outside = Math.exp(OUTSIDE_U);
  const denom = exps.reduce((a,b)=>a+b,0) + outside;

  const idx = structs.findIndex(x => x.id === s.id);
  return (idx >= 0) ? (exps[idx] / denom) : 0;
}

// ============ Calcolo mensile ============
document.getElementById('btnCalcMonth').addEventListener('click', ()=>{
  if(!requireMaster()) return;
  calcMonth();
});
document.getElementById('btnNextMonth').addEventListener('click', ()=>{
  if(!requireMaster()) return;
  stepMonth();
});
document.getElementById('btnShowAnnual').addEventListener('click', ()=>{
  // se esiste un report congelato, mostra quello (anche ai player)
  if (state.lastAnnualReport?.ts) openAnnualReport(true);
  else openAnnualReport(false);
});
document.getElementById('closeAnnualReport').addEventListener('click', ()=> document.getElementById('annualReportModal').classList.add('hidden'));

function seasonality(month){
  if(month===1)  return { demand:0.55, priceAmp:1.8, label:'Inverno basso' };
  if(month===2)  return { demand:0.60, priceAmp:1.7, label:'Inverno basso' };
  if(month===3)  return { demand:0.75, priceAmp:1.2, label:'Media' };
  if(month===4)  return { demand:0.90, priceAmp:1.0, label:'Medio-alta' };
  if(month===5)  return { demand:1.10, priceAmp:0.9, label:'Alta' };
  if(month===6)  return { demand:1.20, priceAmp:0.9, label:'Alta' };
  if(month===7)  return { demand:1.35, priceAmp:0.85, label:'Estate' };
  if(month===8)  return { demand:1.40, priceAmp:0.85, label:'Estate' };
  if(month===9)  return { demand:1.00, priceAmp:1.0, label:'Media' };
  if(month===10) return { demand:0.85, priceAmp:1.1, label:'Medio-bassa' };
  if(month===11) return { demand:0.60, priceAmp:1.6, label:'Inverno basso' };
  if(month===12) return { demand:1.25, priceAmp:1.0, label:'Natale' };
  return { demand:1.0, priceAmp:1.0, label:'Normale' };
}

function monthlyShock(){
  if (Math.random()*100 < state.params.eventProbMonth){
    const types = ['borgo','economy','mid','luxury'];
    const t = types[Math.floor(Math.random()*types.length)];
    const sign = Math.random() < 0.5 ? -1 : 1;
    const mag = 0.2;
    const factor = 1 + sign * mag;

    if (t === 'borgo') {
      const borghi = Object.keys(state.borgoValues || {});
      const borgoScelto = borghi[Math.floor(Math.random() * borghi.length)];

      return {
        active: true,
        target: 'borgo',
        borgo: borgoScelto,
        factor,
        desc: `${sign < 0 ? 'Crisi' : 'Boom'} turistico a ${borgoScelto} (${sign < 0 ? '-' : '+'}20%)`
      };
    }

    return {
      active: true,
      target: t,
      factor,
      desc: `${t} ${sign < 0 ? '-' : '+'}20%`
    };
  }

  return { active:false, factor:1, desc:'' };
}

// =========================
// WAR SHOCK — Guerre internazionali
// =========================
function updateWarShock(){
  if (!state.warShock) {
    state.warShock = { active:false, monthsLeft:0 };
  }

  // parte solo se non già attivo
  if (!state.warShock.active && Math.random() < 0.05) {
    state.warShock.active = true;
    state.warShock.monthsLeft = 12;
    log('🌍 Guerra internazionale: turismo premium -70% per 12 mesi');
  }
}

function tickWarShockEndOfMonth(){
  if (!state.warShock?.active) return;

  state.warShock.monthsLeft--;

  if (state.warShock.monthsLeft <= 0) {
    state.warShock.active = false;
    state.warShock.monthsLeft = 0;
    log('🕊️ Fine guerra internazionale: turismo premium in ripresa');
  }
}

    // altri shock (come prima)
    return {
      active: true,
      target: t,
      factor,
      desc: `${t} ${sign<0?'-':'+'}20%`
    };
  }

  return { active:false, factor:1, desc:'' };
}

function calcReviews(s, priceRatio, borgoW, P){
  // base rating influenced by quality, pulizie and piscina
  let base = 7.0 + (s.qualita - 3) * 0.6 + (s.pulizie - 2) * 0.5 + (s.piscina ? 0.3 : 0) + (borgoW - 1) * 0.2;
  base += (Math.random() - 0.5) * 0.4; // variazione casuale minore

  // penalità per prezzo troppo alto rispetto al target
  if (priceRatio > 1) base -= (priceRatio - 1) * P.priceRevSens * 2.0;

  // bonus per prezzo inferiore, ma con effetto limitato
  if (priceRatio < 1) base += (1 - priceRatio) * P.priceRevSens * 0.8;

  // effetto "diminishing returns" per qualità alte
  if (s.qualita >= 4 && base > 9.3) base = 9.3 + Math.random() * 0.3;

  // limite massimo e minimo più realistico in base alla qualità
  const maxByQuality = {1: 8.0, 2: 8.4, 3: 8.8, 4: 9.3, 5: 9.8};
  const minByQuality = {1: 5.0, 2: 5.5, 3: 6.0, 4: 6.5, 5: 7.0};
  base = clamp(base, minByQuality[s.qualita], maxByQuality[s.qualita]);

  // bias globale del gioco
  base *= P.reviewBias;

  return clamp(base, 1, 10);
}
function monthlyMgmtCost(s){
  // base annuale su pulizie e qualità
  const basePul = (s.camere <= 3 ? 10000 : 20000);
  const extraPul = (s.pulizie === 1 ? 0 : s.pulizie === 2 ? 20000 : 40000);
  let annual = basePul + extraPul;

  // moltiplicatori per qualità
  if (s.qualita === 4) annual *= 2;
  if (s.qualita === 5) annual *= 3;

// incremento pulizie dalla 6ª alla 10ª camera: +5% ciascuna sul totale pulizie
if (s.camere > 5) {
  const extraRooms = Math.min(s.camere, 10) - 5; // max fino a 10
  const scaleFactor = 1 + (0.05 * extraRooms);
  annual *= scaleFactor;
}

  return Math.round(annual / 12); // costo mensile
}
function taxesForAnnualGross(g){
  if(g<=100000) return 0;
  if(g<=500000) return g*0.25;
  if(g<=1000000) return g*0.35;
  return g*0.50;
}

function calcMonth(){
  readBorgoValues();
  const P = state.params;

  updateWarShock(); // ✅ decide se parte la guerra questo mese
  const warFactor = state.warShock?.active ? 0.30 : 1.0; // ✅ 70% di taglio su Q3–Q5

  // ✅ MIGRAZIONE prestiti: forza 20% su tutti i prestiti esistenti
  state.players.forEach(p => {
    if (!p.loans) return;
    p.loans = p.loans.map(L => {
      if (typeof L === 'number') return { principal: L, rate: 0.20, year: state.year };
      if (typeof L === 'object') {
        if (typeof L.rate !== 'number' || L.rate === 0.10) L.rate = 0.20;
        return L;
      }
      return L;
    });
  });

  const seas = seasonality(state.month);
  const shock = monthlyShock();
  if (shock.active) log(`Evento: ${shock.desc}`);

  const days = daysInMonth(state.month);

  
state.structures.forEach(s=>{
  const owner = state.players.find(p => p.id === s.ownerId);
  if (!owner) return;

  // struttura chiusa
  if (s.closed) {
    s.lastNotti = 0;
    s.lastOcc = '0%';
    s.lastRevenue = 0;
    s.historyMonthly.push({ y: state.year, m: state.month, notti: 0, occ: 0, revenue: 0 });
    log(`${s.nome} è chiuso per il mese di ${MONTH_NAMES[state.month - 1]}`);
    return;
  }

  if (s._edited) chargeUpgradesIfAny(s, owner);
const target = dynamicTargetPrice(s, state, seas, P);
const priceRatio = s.prezzo / Math.max(1, target);

// =========================
// OCCUPANCY (Q1–Q2 classico) + PREMIUM LOGIT (Q3–Q5)
// =========================

const borgoW_here = state.borgoValues[s.borgo] || 1;

let occ = 0;

// ---------- Q1–Q2: curva “classica” prezzo/target ----------
if (s.qualita <= 2) {
  const priceSensEff = P.priceSens * seas.priceAmp;
  occ = 0.70 * Math.exp(-priceSensEff * (priceRatio - 1));

  occ *= (1 + 0.08 * (s.pulizie - 2));
  if (s.piscina) occ *= 1.15;
  occ *= borgoW_here;
  occ *= 1 / Math.max(0.5, P.localCompetition);

  occ *= P.segEconomy;

  if (shock.active) {
    if (shock.target === 'borgo' && shock.borgo === s.borgo) occ *= shock.factor;
    if (shock.target === 'economy') occ *= shock.factor;
  }

  occ *= P.occupancyBoost;
  occ *= (0.95 + Math.random() * 0.10);
  occ = occ * seas.demand; // stagionalità solo qui
}

// ---------- Q3–Q5: PREMIUM LOGIT ----------
else {
  const premGroup = state.structures.filter(x => x.qualita >= 3 && !x.closed);

  const share = premiumChoiceShare(premGroup, s, state, seas, P);
const marketFill = premiumMarketFill(seas);

const N = Math.max(1, premGroup.length);  // numero strutture premium aperte
occ = marketFill * share * N;             // ✅ quota -> occupancy “per struttura”

// penalità lieve per sottoprezzo “sospetto” (premium)
const targetPrem = {3:130, 4:180, 5:230}[s.qualita] || target;


  // soft-floor realistico SOLO se il prezzo è vicino al target elastico
const floorBase =
  (s.qualita === 3) ? 0.25 :
  (s.qualita === 4) ? 0.35 :
                      0.42; // Q5

// finestra: ±35% dal target. Se spari 1500€, floor ~0.
const floorWeight = Math.exp(-Math.pow((priceRatio - 1) / 0.35, 2));
const softFloor = floorBase * floorWeight;

occ = Math.max(occ, softFloor);

  if (shock.active) {
    if (shock.target === 'borgo' && shock.borgo === s.borgo) occ *= shock.factor;
    if (shock.target === 'mid'    && s.qualita === 3) occ *= shock.factor;
    if (shock.target === 'luxury' && s.qualita >= 4) occ *= shock.factor;
  }

  occ *= P.occupancyBoost;

  // pulizie pessime: impatta davvero
  if (s.pulizie === 1) occ *= 0.25;
  else if (s.pulizie === 2) occ *= 0.70;

  // micro-random UNA volta sola
  occ *= (0.97 + Math.random() * 0.06);

// ✅ shock guerra: Q3–Q5 -70% notti vendute
occ *= warFactor;

}

// ---------- marketing ----------
const marketing = Math.min(owner.marketing || 0, 5000);
if (marketing > 0) {
  const dist = Math.abs(s.prezzo - P.avgSpend);
  const sigmaM = 100;
  const marketingEffect = Math.exp(-Math.pow(dist, 2) / (2 * sigmaM * sigmaM));
  const marketingBoost = 1 + (marketing / 5000) * 0.20 * marketingEffect;
  occ *= marketingBoost;
}

// ✅ clamp finale unico (dopo TUTTO)
occ = clamp(occ, 0.01, 0.98);


// ---------- notti e ricavi ----------
const nightsMax = s.camere * days;
const nights = Math.round(nightsMax * occ);
let revenue = nights * s.prezzo;
if (s.piscina) revenue *= 1.30;


// === Calcolo recensione base ===
const rec = calcReviews(s, priceRatio, borgoW_here, P);
s.recensioni = Math.round(rec * 10) / 10;


    s.lastNotti = nights;
    s.lastOcc = Math.round(occ*1000)/10 + '%';
    s.lastRevenue = Math.round(revenue);
    s.historyMonthly.push({ y:state.year, m:state.month, notti:nights, occ:Math.round(occ*1000)/10, revenue:s.lastRevenue });

    // gestione mensile e accredito sul budget (lordo, gestione a fine anno in report)
    ensureYearBook(owner.id);
    state.annualBook[owner.id].gross += s.lastRevenue;
    state.annualBook[owner.id].mgmt  += monthlyMgmtCost(s);

    owner.budget += s.lastRevenue;
  });

  renderStructures(); renderPlayers();

renderStructures();
renderPlayers();
renderLeaderboard();

// =========================
// INTERESSI PRESTITI — 20% annuo pagato mensilmente
// + PRESTITO AUTO se budget < -50k
// =========================
state.players.forEach(p=>{
  ensureYearBook(p.id);

  // interessi mensili
  if (p.loans && p.loans.length) {
    let interest = 0;

    p.loans.forEach(L=>{
      const principal = (typeof L === 'number') ? L : (L.principal || 0);
      const r = (typeof L === 'object' && typeof L.rate === 'number') ? L.rate : 0.20;
      interest += principal * (r / 12);
    });

    interest = Math.round(interest);

    if (interest > 0){
      p.budget -= interest;
      state.annualBook[p.id].interest += interest;
      log(`Interessi prestiti ${p.name} (mensili): €${fmt(interest)}`);
    }
  }

  // prestito automatico se troppo sotto
  if (p.budget < -50000){
    const need = Math.abs(p.budget);
    if(!p.loans) p.loans = [];
    p.loans.push({ principal: need, rate: 0.20, year: state.year }); // ✅ qui NON prevYear
    p.budget += need;
    log(`${p.name} prestito automatico €${fmt(need)} (20% annuo)`);
  }
});

tickWarShockEndOfMonth();


stepMonth(true);

// salva una volta sola anche dopo interessi/prestiti
if (window.saveToFirebase) saveToFirebase(state);

}

function stepMonth(autoReport=false){
  state.month++;
  if(state.month>12){
    state.month=1; state.year++;
    document.getElementById('yearLabel').textContent=state.year;
    finalizeAnnualAndShowReport(); // auto report
  }
  document.getElementById('monthLabel').textContent=state.month;
  document.getElementById('monthName').textContent=MONTH_NAMES[state.month-1];
}

// ============ Annual closing / Report ============
function finalizeAnnualAndShowReport(){
  const prevYear = state.year-1;

  // calcola gross annuo per struttura
  const structAnnualGross = new Map();
  state.structures.forEach(s=>{
    const sum = s.historyMonthly.filter(h=>h.y===prevYear).reduce((a,b)=>a+(b.revenue||0),0);
    structAnnualGross.set(s.id, sum);
  });

  // gestione sconto <80k e tasse per struttura
  state.structures.forEach(s=>{
    const owner=state.players.find(p=>p.id===s.ownerId); if(!owner) return;
    const gross = structAnnualGross.get(s.id)||0;

    // sconto gestione se fatturato <80k
    if(gross < 80000){
      const annualMgmt = monthlyMgmtCost(s)*12;
      const refund = Math.round(annualMgmt/2);
      ensureYearBook(owner.id);
      state.annualBook[owner.id].mgmt -= refund;
      log(`Sconto gestione "${s.nome}" (gross <80k): -€${fmt(refund)}`);
    }

    // tasse progressive (per struttura)
    const t = taxesForAnnualGross(gross);
    ensureYearBook(owner.id);
    state.annualBook[owner.id].taxes += t;
    owner.budget -= t;
  });

// =========================
// MARKETING — conguaglio annuale (marketing €/mese * 12)
// =========================
state.players.forEach(p=>{
  ensureYearBook(p.id);

  const mktMonthly = Math.max(0, Math.min(p.marketing || 0, 5000));
  const mktAnnual = Math.round(mktMonthly * 12);

  if (mktAnnual > 0) {
    p.budget -= mktAnnual;
    state.annualBook[p.id].marketing += mktAnnual;
    log(`Marketing annuale ${p.name}: €${fmt(mktAnnual)} (da €${fmt(mktMonthly)}/mese)`);
  }
});

// ✅ Congela report (visibile a tutti, anche dopo reset annualBook)
state.lastAnnualReport = {
  year: prevYear,
  book: JSON.parse(JSON.stringify(state.annualBook || {})),
  loans: (state.players || []).reduce((acc, p) => {
    acc[p.id] = {
      total: (p.loans || []).reduce(
        (sum, L) => sum + (typeof L === 'number' ? L : (L.principal || 0)),
        0
      ),
      list: (p.loans || []).map(L =>
        (typeof L === 'number')
          ? { principal: L, rate: 0.20 }
          : { principal: L.principal || 0, rate: (typeof L.rate === 'number' ? L.rate : 0.20), year: L.year }
      ),
      budget: p.budget
    };
    return acc;
  }, {}),
  ts: new Date().toISOString()
};

// 👇 METTI QUESTO SUBITO QUI
console.log(
  "✅ creato lastAnnualReport",
  state.lastAnnualReport.ts,
  "players in book:",
  Object.keys(state.lastAnnualReport.book || {})
);

// ✅ salva SUBITO così i player ricevono lastAnnualReport
if (state.access?.isMaster && window.saveToFirebase) {
  saveToFirebase(state);
}

// mostra report (local)
openAnnualReport(true);

// 🔁 reset accumulatori SOLO per l'anno nuovo
state.annualBook = {};

// (opzionale) salva anche il reset
if (state.access?.isMaster && window.saveToFirebase) {
  saveToFirebase(state);
}

}

function openAnnualReport(fromFinalize){
  // ✅ se fromFinalize usa lo snapshot congelato
  const snapshot = state.lastAnnualReport || null;

  const y = fromFinalize
    ? (snapshot?.year ?? (state.year - 1))
    : state.year;

  const book = fromFinalize
    ? (snapshot?.book || {})
    : (state.annualBook || {});

  const loansSnap = snapshot?.loans || {};

  const cont = document.getElementById('annualReportContent');
  cont.innerHTML='';

  const isMaster = !!state.access?.isMaster;
  const pid = state.access?.playerId;

  // ✅ player vede solo se stesso (se vuoi che veda tutti, usa semplicemente state.players)
  const list = state.players;

  list.forEach(p=>{
    const b = book[p.id] || { gross:0, mgmt:0, taxes:0, upgrades:0, interest:0, extraExp:0, extraInc:0, marketing:0 };

    const gross=b.gross||0, mgmt=b.mgmt||0, taxes=b.taxes||0, up=b.upgrades||0, intr=b.interest||0, mkt=b.marketing||0;
    const extra=(b.extraInc||0)-(b.extraExp||0);
    const net=Math.round(gross - mgmt - taxes - up - intr - mkt + extra);

    // ✅ prestiti attivi (dal snapshot congelato se disponibile)
    const loanInfo = loansSnap[p.id] || {
      total: (p.loans || []).reduce((sum, L) => sum + (typeof L === 'number' ? L : (L.principal || 0)), 0),
      list: (p.loans || []).map(L => (typeof L === 'number'
        ? { principal: L, rate: 0.20 }
        : { principal: L.principal || 0, rate: (typeof L.rate === 'number' ? L.rate : 0.20), year: L.year }
      )),
      budget: p.budget
    };

    const loansTotal = Math.round(loanInfo.total || 0);
    const loansRows = (loanInfo.list && loanInfo.list.length)
      ? loanInfo.list.map(L => `€${fmt(Math.round(L.principal||0))} @ ${Math.round((L.rate||0.20)*100)}%`).join(' · ')
      : '<em>Nessun prestito</em>';

    const budgetShown = (loanInfo.budget ?? p.budget);

    const box=document.createElement('div');
    box.className='player-card';
    box.innerHTML=`
      <h4>${p.name} — Anno ${y}</h4>
      <div><strong>Prestiti attivi:</strong> € ${fmt(loansTotal)} <span style="opacity:.8">(${loansRows})</span></div>

      <table>
        <tr><th>Lordo</th><th>Gestione</th><th>Tasse</th><th>Upgrade</th><th>Interessi</th><th>Marketing</th><th>Extra</th><th>Netto</th><th>Budget</th></tr>
        <tr>
          <td>€ ${fmt(gross)}</td><td>€ ${fmt(mgmt)}</td><td>€ ${fmt(taxes)}</td><td>€ ${fmt(up)}</td>
          <td>€ ${fmt(intr)}</td><td>€ ${fmt(mkt)}</td><td>€ ${fmt(extra)}</td>
          <td><strong>€ ${fmt(net)}</strong></td><td><strong>€ ${fmt(budgetShown)}</strong></td>
        </tr>
      </table>
    `;
    cont.appendChild(box);

    // (se vuoi tenere storico annuale, puoi lasciarlo come prima, ma fallo SOLO al finalize per evitare duplicati)
  });

  document.getElementById('annualReportModal').classList.remove('hidden');
}

// // ===== LOAD =====
document.getElementById('loadBtn').addEventListener('click', ()=>{
  const data = localStorage.getItem('bt_state_v78');
  if(!data){ alert('Nessun salvataggio locale trovato'); return; }

  const loaded = JSON.parse(data);

  // preserva access locale
const keepAccess = state.access;

Object.keys(state).forEach(k => delete state[k]);
Object.assign(state, loaded);

// ripristina access locale
state.access = keepAccess;

// 🔴 QUI VA IL PUNTO 3
syncAccessAfterStateLoaded();

// ORA puoi renderizzare
renderPlayers();
renderPlayerCard();
renderStructures();

document.getElementById('yearLabel').textContent = state.year;
document.getElementById('monthLabel').textContent = state.month;
document.getElementById('monthName').textContent = MONTH_NAMES[(state.month || 1) - 1];
  alert('Caricato da locale');

  if (state.access?.isMaster && window.saveToFirebase) {
    window.saveToFirebase(state);
  }
});

// ===== NEW GAME =====
document.getElementById('newGameBtn').addEventListener('click', ()=>{
  if(!confirm('Nuova partita?')) return;

  state.year = 1;
  state.month = 1;
  state.players = [];
  state.structures = [];
  state.annualBook = {};
  state.logs = [];

  document.getElementById('yearLabel').textContent = 1;
  document.getElementById('monthLabel').textContent = 1;
  document.getElementById('monthName').textContent = MONTH_NAMES[0];
  document.getElementById('reportLog').innerHTML = '';

  renderPlayers();
  renderPlayerCard();
  renderStructures();

  if (state.access?.isMaster && window.saveToFirebase) {
    window.saveToFirebase(state);
  }
});


// ===============================
// FIREBASE LIVE SYNC (v8 compat) — Master scrive state, tutti leggono + prezzi live
// ===============================

window.startFirebaseLive = function startFirebaseLive(){
  if (!window.firebase || !firebase.firestore) {
    console.warn("Firebase non disponibile: controlla l'ordine degli script in index.html");
    return;
  }

  const db = firebase.firestore();
  const gameRef   = db.collection("game").doc("state");   // stato ufficiale (solo master scrive)
  const pricesRef = db.collection("game").doc("prices");  // prezzi live (anche player scrivono)

  let ignoreNextSnapshot = false;

  // cache locale prezzi live
  if (!state.prices) state.prices = {};

  // =========================
  // ✅ SOLO MASTER salva state (e non salva state.access)
  // =========================
  window.saveToFirebase = async function saveToFirebaseSafe(currState){
    if(!currState?.access?.isMaster) return;

    const payload = JSON.parse(JSON.stringify(currState));
    delete payload.access;
    payload._updatedAt = new Date().toISOString();

    ignoreNextSnapshot = true;
    await gameRef.set(payload);
    console.log("✅ Master ha salvato STATE su Firebase");
  };

  // =========================
  // ✅ TUTTI possono salvare SOLO il prezzo (su pricesRef)
  // =========================
  window.submitPriceChange = async function submitPriceChange(structId, newPrice){
    const p = Number(newPrice);
    if(!structId || isNaN(p) || p <= 0) return;

    // aggiorna subito local (UI reattiva)
    state.prices[structId] = p;

    // aggiorna anche lo state locale (così il master vede subito anche senza re-render totale)
    const s = state.structures?.find(x => x.id === structId);
    if (s) s.prezzo = p;

    await pricesRef.set({
      [structId]: {
        prezzo: p,
        by: state.access?.name || 'player',
        ts: new Date().toISOString()
      }
    }, { merge: true });

    console.log("💸 Prezzo salvato (live)", structId, p);
  };

  // =========================
  // ✅ LISTENER STATE (tutti leggono)
  // =========================
  gameRef.onSnapshot((snap) => {
    if(!snap.exists){
      // se non esiste ancora lo stato, lo crea SOLO il Master
      if(state?.access?.isMaster){
        console.warn("Nessuno state su Firebase: inizializzo dal Master…");
        window.saveToFirebase(state);
      }
      return;
    }

    // evita rimbalzo immediato del nostro stesso set
    if(ignoreNextSnapshot){
      ignoreNextSnapshot = false;
      return;
    }

    const remote = snap.data();

    // mantieni access locale
    const keepAccess = state.access;
    const keepPrices = state.prices || {};

    // applica remote nello state
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, remote);

console.log("📦 remote keys:", Object.keys(remote || {}));
console.log("📌 lastAnnualReport ts:", state.lastAnnualReport?.ts, "book keys:", Object.keys(state.lastAnnualReport?.book || {}));

    // ripristina access + prezzi locali
    state.access = keepAccess;
    state.prices = keepPrices;

    // riallinea prezzi live sullo state appena arrivato
    if (state.structures && state.prices) {
      state.structures.forEach(s => {
        const p = state.prices[s.id];
        if (p != null) s.prezzo = p;
      });
    }
    // ricalcola access / UI
    if (window.syncAccessAfterStateLoaded) syncAccessAfterStateLoaded();
    if (window.applyRoleUI) applyRoleUI();

document.body.classList.toggle('is-player', !state.access?.isMaster);

// render
renderPlayers();
renderPlayerCard();
renderStructures();
renderLeaderboard();
renderLog();

  // label mese/anno
const yl = document.getElementById('yearLabel');
const ml = document.getElementById('monthLabel');
const mn = document.getElementById('monthName');
if (yl) yl.textContent = state.year;
if (ml) ml.textContent = state.month;
if (mn) mn.textContent = MONTH_NAMES[(state.month || 1) - 1];

// 🔔 AUTO-OPEN REPORT ANNUALE (solo 1 volta per ts, anche dopo refresh)
const ts = state.lastAnnualReport?.ts;
if (ts && !hasSeenAnnual(ts)) {
  markSeenAnnual(ts); // prima lo marchi, poi apri
  setTimeout(() => openAnnualReport(true), 250);
}
console.log("🔄 STATE aggiornato da Firebase (live)");
  });


  // =========================
  // ✅ LISTENER PREZZI (tutti leggono)
  // =========================
  pricesRef.onSnapshot((snap) => {
    if(!snap.exists) return;

    const remotePrices = snap.data() || {};

    if (!state.prices) state.prices = {};

    for (const [sid, obj] of Object.entries(remotePrices)) {
      const p = Number(obj?.prezzo);
      if (!isNaN(p) && p > 0) state.prices[sid] = p;
    }

    // applica i prezzi live alle strutture locali
    if (state.structures && state.prices) {
      state.structures.forEach(s => {
        const p = state.prices[s.id];
        if (p != null) s.prezzo = p;
      });
    }

    // re-render tabella (basta questo)
    renderStructures();
    renderPlayers();

    console.log("💸 PREZZI aggiornati da Firebase (live)");
  });
};


// ============ INIT (senza demo) ============
(function init(){
  // labels iniziali (safe)
  const m = state.month || 1;
  document.getElementById('yearLabel').textContent = state.year || 1;
  document.getElementById('monthLabel').textContent = m;
  document.getElementById('monthName').textContent = MONTH_NAMES[m - 1];

  // login (master / player)
  chooseAccessIdentity();

document.body.classList.toggle('is-player', !state.access?.isMaster);

  // avvia sync Firebase
  if (window.startFirebaseLive) {
    window.startFirebaseLive();
    console.log("✅ startFirebaseLive() chiamata");
  } else {
    console.warn("⚠️ startFirebaseLive non definita");
  }

  // primo render “vuoto”: poi gli snapshot riempiono e ri-renderizzano
  renderPlayers();
  renderPlayerCard();
  renderStructures();
renderLog();

const sortSel = document.getElementById('structuresSort');
if (sortSel) {
  sortSel.addEventListener('change', () => {
    state.ui = state.ui || {};
    state.ui.structSort = sortSel.value; // memorizza scelta UI
    renderStructures();
  });
}

})();