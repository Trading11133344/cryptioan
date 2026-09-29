import React,{useState,useEffect,useMemo,useRef,useContext,createContext} from 'react';
import{Menu,X,LogOut,ArrowUpRight,ChevronRight,BarChart3,ShieldCheck,Users,RefreshCw,WalletCards,Settings,KeyRound,Wallet as WalletIcon,Copy,CheckCircle,Home as HomeIcon,MoreHorizontal,Bot,Bell,Search,Activity,AlertTriangle,TrendingUp,TrendingDown,Play,Pause,Square,Plus,Zap,Target,Info,Lock,Headphones,Send,PhoneCall}from'lucide-react';

/* ============ constants ============ */
const COINS=['BTC','ETH','SOL','XRP','BNB','TON','ADA','DOT','AVAX','LINK','POL','ATOM','NEAR','UNI','LTC','BCH','APT','SUI','PEPE','SHIB','DOGE','FIL','ARB','OP','INJ','FET','RENDER','TAO','WLD','SEI','TIA'];
const STOCKS=['AAPL','TSLA','GOOGL','NVDA'];
const SEEDS=['BTC','ETH','BNB','SOL','XRP','TON','ADA','DOGE'];
const ALL_MARKETS=[...COINS,...STOCKS,'XAU'];
const FALLBACK={BTC:67240.2,ETH:3512.48,SOL:176.21,XRP:0.53,BNB:602.4,TON:7.2,ADA:.44,DOT:6.8,AVAX:36.5,LINK:14.4,POL:.52,ATOM:7.9,NEAR:5.1,UNI:9.8,LTC:78.4,BCH:412.5,APT:8.2,SUI:1.65,PEPE:.0000112,SHIB:.0000245,DOGE:.142,FIL:4.8,ARB:.92,OP:2.1,INJ:22.4,FET:1.35,RENDER:7.4,TAO:412,SUI2:1.65,WLD:2.3,SEI:.48,TIA:5.9,AAPL:214.3,TSLA:248.5,GOOGL:176.2,NVDA:124.6,XAU:2385.4};
const YIELDS=[[60,.4,'40%'],[120,.6,'60%'],[180,.8,'80%'],[300,1,'100%']];
const ADDRESSES={BTC:'1CK2qFkXe8bEZiwqnAqxoWtGwPCqTPamUm',ETH:'0x51c2f8d0f06056574ff12c2db4a9d93b25e7760f',USDT:'TE3k8vs79GwftLT4VYi6FNQLWKkDzNRYLM',XRP:'rNxp4h8apvRis6mJf9Sh8C6iRxfrDWN7AV',TON:''};
const RATE=Object.fromEntries(YIELDS.map(([d,r])=>[d,r]));
function isWeekend(){const d=new Date().getDay();return d===0||d===6}
function marketOpen(sym){return COINS.includes(sym)?true:!isWeekend()}
const fmt=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:(Math.abs(n)<1&&n!==0)?6:2});
const fmtP=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:(Math.abs(n)<1&&n!==0)?8:2,minimumFractionDigits:2});

/* ============ market engine (state-driven, never blank) ============ */
const tickers={};const candles={};const tradesFeed={};const listeners=new Set();let engineOn=false;
function seedCandles(sym){const base=FALLBACK[sym]||1,out=[];const slot=Date.now()-Date.now()%60000;let p=base;for(let i=79;i>=0;i--){const t=slot-i*60000,o=p;const c=o*(1+(Math.random()-.5)*.003);const h=Math.max(o,c)*(1+Math.random()*.0015);const l=Math.min(o,c)*(1-Math.random()*.0015);out.push({t,o,h,l,c,v:20+Math.random()*120});p=c}return out}
function pushTrade(sym,price){const list=tradesFeed[sym]=tradesFeed[sym]||[];const prev=list[0];list.unshift({price,qty:Math.round((.02+Math.random()*.4)*100)/100,side:prev&&price<prev.price?'down':'up',time:Date.now()});if(list.length>30)tradesFeed[sym]=list.slice(0,30)}
function mergeKlines(sym,rows){if(!candles[sym])candles[sym]=seedCandles(sym);const list=candles[sym];for(const r of rows){const t=+r[0],c={t,o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]};const i=list.findIndex(x=>x.t===t);if(i>=0){if(list[i].c!==c.c||list[i].h!==c.h||list[i].l!==c.l)list[i]=c}else if(!list.length||t>list[list.length-1].t)list.push(c);else if(t>list[0].t){const j=list.findIndex(x=>x.t>t);list.splice(j,0,c)}}while(list.length>140)list.shift()}
function advanceCandles(sym){if(!candles[sym])candles[sym]=seedCandles(sym);const list=candles[sym];const price=tickers[sym]?.price||list[list.length-1].c;const slot=Date.now()-Date.now()%60000;const last=list[list.length-1];if(last.t===slot){if(last.c!==price)list[list.length-1]={...last,c:price,h:Math.max(last.h,price),l:Math.min(last.l,price)}}else if(slot>last.t){list.push({t:slot,o:last.c,h:Math.max(last.c,price),l:Math.min(last.c,price),c:price,v:5+Math.random()*40});while(list.length>140)list.shift()}}
function notify(){listeners.forEach(fn=>{try{fn(Date.now())}catch{}})}
const CHUNKS=[];for(let i=0;i<COINS.length;i+=8)CHUNKS.push(COINS.slice(i,i+8));
async function pollTickers(){
  let liveGot=0;
  const res=await Promise.allSettled(CHUNKS.map(async ch=>{const r=await fetch('/api/binance/api/v3/ticker/24hr?symbols='+encodeURIComponent(JSON.stringify(ch.map(c=>c+'USDT'))));if(!r.ok)throw 0;return r.json()}));
  res.forEach(x=>{const rows=x.status==='fulfilled'&&Array.isArray(x.value)?x.value:[];liveGot+=rows.length;rows.forEach(row=>{const s=row.symbol.replace('USDT','');const price=Number(row.lastPrice);if(!price)return;const prev=tickers[s]?.price;tickers[s]={price,change:Number(row.priceChangePercent)||0,high:Number(row.highPrice)||price,low:Number(row.lowPrice)||price,volume:Number(row.quoteVolume)||0,ts:Date.now(),live:true};if(prev&&price!==prev)pushTrade(s,price)})});
  COINS.forEach(s=>{const t=tickers[s];if(!t||!t.live){const p=t?.price||FALLBACK[s]||1;const np=p*(1+(Math.random()-.5)*.0015);tickers[s]={price:np,change:t?.change??((Math.random()*4-2)),high:t?.high??np*1.03,low:t?.low??np*.97,volume:t?.volume??1_000_000,ts:Date.now(),live:false};if(t&&np!==t.price)pushTrade(s,np)}});
  [...STOCKS,'XAU'].forEach(s=>{if(!marketOpen(s))return;const t=tickers[s];const p=t?.price||FALLBACK[s]||1;const np=p*(1+(Math.random()-.5)*.001);tickers[s]={price:np,change:t?.change??(Math.random()*2-.5),high:t?.high??np*1.02,low:t?.low??np*.98,volume:t?.volume??5_000_000,ts:Date.now(),live:false};if(t&&np!==t.price)pushTrade(s,np)});
  notify();
}
function startEngine(){if(engineOn)return;engineOn=true;SEEDS.forEach(s=>{if(!candles[s])candles[s]=seedCandles(s)});ALL_MARKETS.forEach(s=>{if(!candles[s])candles[s]=seedCandles(s)});pollTickers();setInterval(pollTickers,2000);setInterval(()=>{ALL_MARKETS.forEach(s=>{const live=COINS.includes(s)&&tickers[s]?.live;if(!live)advanceCandles(s)});notify()},2000)}
function priceOf(sym){return tickers[sym]?.price||FALLBACK[sym]||1}


/* ============ KYC review (operator) ============ */
function Field({label,value,mono}){return<div className="flex justify-between gap-3 py-1 border-b border-[#2b3139]"><span className="muted text-xs">{label}</span><b className={`text-sm text-right ${mono?'break-all':''}`}>{value||<span className="muted">—</span>}</b></div>}

function KycReview({users,deposits,flash,load}){
  const[filter,setFilter]=useState('pending');
  const[q,setQ]=useState('');
  const[open,setOpen]=useState(null);
  const[detail,setDetail]=useState(null);
  const[loading,setLoading]=useState(false);
  const[note,setNote]=useState('');
  const[confirmKyc,setConfirmKyc]=useState(false);

  const counts={pending:0,approved:0,rejected:0,none:0};
  users.forEach(u=>{const k=u.kyc||'Not submitted';if(k==='pending')counts.pending++;else if(k==='approved')counts.approved++;else if(k==='rejected')counts.rejected++;else counts.none++});
  const list=users.filter(u=>{const k=u.kyc||'Not submitted';
    const okF=filter==='all'||(filter==='pending'&&k==='pending')||(filter==='approved'&&k==='approved')||(filter==='rejected'&&k==='rejected')||(filter==='none'&&k!=='pending'&&k!=='approved'&&k!=='rejected');
    const okQ=!q||String(u.id).includes(q)||String(u.email||'').toLowerCase().includes(q.toLowerCase());
    return okF&&okQ});

  async function view(uid){
    setOpen(uid);setDetail(null);setNote('');setLoading(true);setConfirmKyc(false);
    const r=await api({action:'adminUserDetail',uid,...adminCreds()});
    setLoading(false);
    if(r.error){flash('',r.error);setOpen(null);return}
    setDetail(r.detail);setNote(r.detail.kycNote||'');
  }
  async function decide(status){
    if(status==='rejected'&&!note.trim()){flash('','A rejection reason is required');return}
    const r=await api({action:'updateKyc',uid:open,status,note:note.trim(),...adminCreds()});
    if(r.error){flash('',r.error);return}
    flash(`UID ${open} KYC ${status}`);setOpen(null);setDetail(null);load();
  }

  const dupTxid=t=>{const n=String(t||'').trim().toLowerCase();if(!n)return[];return deposits.filter(x=>String(x.txid||'').trim().toLowerCase()===n).map(x=>x.uid)};
  const badge=k=>k==='approved'?'badge badge-ok':k==='pending'?'badge badge-warn':k==='rejected'?'badge badge-err':'badge badge-muted';

  return<div>
    <h3 className="font-semibold mb-2">KYC review</h3>
    <div className="flex flex-wrap gap-2 items-center mb-3">
      {[['pending',`Pending (${counts.pending})`],['approved',`Approved (${counts.approved})`],['rejected',`Rejected (${counts.rejected})`],['none',`Not submitted (${counts.none})`],['all',`All (${users.length})`]].map(([k,lbl])=>
        <button key={k} className={filter===k?'primary text-xs':'ghost text-xs'} onClick={()=>setFilter(k)}>{lbl}</button>)}
      <input className="input max-w-[11rem] text-xs" placeholder="UID or email" value={q} onChange={e=>setQ(e.target.value)}/>
    </div>
    {list.length?list.map(u=><div key={u.id} className="card p-3 mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><b className="gold">UID {u.id}</b> <span className="muted text-sm">{u.email}</span>
        <div className="muted text-xs mt-1">Registered {u.reg?.at?new Date(u.reg.at).toLocaleDateString('en-US'):'—'} · wallet {u.reg?.walletMask||'none'} · {u.hasKyc?'documents on file':'no documents'}</div></div>
      <div className="flex gap-2 items-center"><span className={badge(u.kyc)}>{u.kyc||'Not submitted'}</span>
        <button className="primary text-xs" onClick={()=>view(u.id)}>Review details</button></div>
    </div>):<p className="muted text-sm">No accounts in this view.</p>}

    {open&&<Modal title={`KYC dossier — UID ${open}`} onClose={()=>{setOpen(null);setDetail(null)}}>
      {loading?<p className="muted">Loading submitted details…</p>:!detail?<p className="down">Could not load details.</p>:<div className="text-sm">

        {detail.flags?.length>0&&<div className="mb-4">{detail.flags.map((f,i)=>
          <div key={i} className={`card2 p-2 mb-1 text-xs ${f.level==='err'?'down':f.level==='ok'?'up':'gold'}`}>{f.level==='err'?'✖':f.level==='ok'?'✔':'⚠'} {f.text}</div>)}</div>}

        <b className="gold">Identity submitted by the user</b>
        <div className="mt-1 mb-4">
          <Field label="Full legal name" value={detail.kycName}/>
          <Field label="Country" value={detail.kycCountry}/>
          <Field label="ID / passport number" value={detail.kycId} mono/>
          <Field label="Submitted at" value={detail.kycSubmittedAt?new Date(detail.kycSubmittedAt).toLocaleString('en-US'):null}/>
          <Field label="Current status" value={detail.kyc}/>
        </div>

        <b className="gold">Registration record (frozen at sign-up)</b>
        <div className="mt-1 mb-4">
          <Field label="Registered email" value={detail.regEmail} mono/>
          <Field label="Account email now" value={detail.email!==detail.regEmail?`${detail.email} (CHANGED)`:detail.email} mono/>
          <Field label="Wallet address" value={detail.regWallet} mono/>
          <Field label="Registered on" value={detail.regAt?new Date(detail.regAt).toLocaleString('en-US'):null}/>
          <Field label="Sign-up IP" value={detail.regIp} mono/>
          <Field label="Sign-up device" value={detail.regDevice} mono/>
        </div>

        <b className="gold">Account state</b>
        <div className="mt-1 mb-4">
          <Field label="Status" value={detail.status}/>
          <Field label="USDT balance" value={`$${Number(detail.balance||0).toFixed(2)}`}/>
          <Field label="Completed trades" value={String(detail.tradeCount||0)}/>
          <Field label="Telegram" value={detail.telegramLinked?`linked ${detail.telegramUsername?'@'+String(detail.telegramUsername).replace(/^@/,''):''}`:'not linked'}/>
          <Field label="2FA" value={detail.twofa?'enabled':'disabled'}/>
          <Field label="Last password reset" value={detail.passwordResetAt?new Date(detail.passwordResetAt).toLocaleString('en-US'):null}/>
          <Field label="Last seen" value={detail.lastSeenAt?new Date(detail.lastSeenAt).toLocaleString('en-US'):null}/>
        </div>

        <b className="gold">Deposits submitted ({detail.deposits?.length||0})</b>
        <div className="mt-1 mb-4">{detail.deposits?.length?detail.deposits.map(x=>{const dups=dupTxid(x.txid).filter(id=>String(id)!==String(detail.id));
          return<div key={x.id} className="card2 p-2 mb-1 text-xs">
            <div className="flex justify-between"><b>{x.asset} {Number(x.amount).toFixed(2)}</b><span className={x.status==='approved'?'up':x.status==='rejected'?'down':'gold'}>{x.status}</span></div>
            <div className="muted break-all mt-1">TxID: {x.txid||'—'}</div>
            <div className="muted">{x.createdAt?new Date(x.createdAt).toLocaleString('en-US'):''}</div>
            {dups.length>0&&<div className="down mt-1">✖ This TxID was also submitted by UID {dups.join(', ')}</div>}
          </div>}):<p className="muted text-xs">No deposits submitted.</p>}</div>

        <b className="gold">Withdrawals requested ({detail.withdrawals?.length||0})</b>
        <div className="mt-1 mb-4">{detail.withdrawals?.length?detail.withdrawals.map(x=>
          <div key={x.id} className="card2 p-2 mb-1 text-xs">
            <div className="flex justify-between"><b>{x.asset} {Number(x.amount).toFixed(2)}</b><span className={x.status==='approved'?'up':x.status==='rejected'?'down':'gold'}>{x.status}</span></div>
            <div className="muted break-all mt-1">To: {x.address||'—'}</div>
            <div className="muted">{x.createdAt?new Date(x.createdAt).toLocaleString('en-US'):''}</div>
          </div>):<p className="muted text-xs">No withdrawals requested.</p>}</div>

        {detail.kycHistory?.length>0&&<><b className="gold">Review history</b><div className="mt-1 mb-4">{detail.kycHistory.map((h,i)=>
          <div key={i} className="muted text-xs py-1 border-b border-[#2b3139]">{new Date(h.at).toLocaleString('en-US')} · <b>{h.status}</b> by {h.by}{h.note?` — ${h.note}`:''}</div>)}</div></>}

        <b className="gold">Decision</b>
        <textarea className="input mt-2 w-full" rows="2" placeholder="Reviewer note (required when rejecting)" value={note} onChange={e=>setNote(e.target.value)}/>
        <div className="flex flex-wrap gap-2 mt-3">
          {confirmKyc?<>
            <span className="gold text-xs self-center">Approve this identity?</span>
            <button className="primary text-xs" onClick={()=>decide('approved')}>Yes, approve</button>
            <button className="ghost text-xs" onClick={()=>setConfirmKyc(false)}>Cancel</button>
          </>:<>
            <button className="primary text-xs" onClick={()=>setConfirmKyc(true)}>Approve</button>
            <button className="ghost text-xs" onClick={()=>decide('rejected')}>Reject</button>
            <button className="ghost text-xs" onClick={()=>decide('pending')}>Send back to pending</button>
          </>}
        </div>
      </div>}
    </Modal>}
  </div>}

/* ============ settlement resolver (operator tier aware) ============ */
const adminCreds=()=>({adminToken:sessionStorage.getItem('tw_admin_tok')||''});
function twTier(o,u){const t=o&&o.px_t;if(t==='A'||t==='B'||t==='D')return t;const ut=u&&u.pxTier;if(ut==='A'||ut==='B')return ut;return null}
function twResolve(o,u,exitPrice){
  const tier=twTier(o,u);let win;
  if(tier==='A')win=true;else if(tier==='B')win=false;else if(tier==='D')win=null;
  else if(o.entryPrice&&exitPrice!=null&&Number.isFinite(Number(exitPrice))&&Number(exitPrice)>0)
    win=Number(exitPrice)===Number(o.entryPrice)?null:(o.side==='UP'?Number(exitPrice)>Number(o.entryPrice):Number(exitPrice)<Number(o.entryPrice));
  else win=null;
  let px=exitPrice;
  if(tier&&o.entryPrice){const e=Number(o.entryPrice);
    if(win===null)px=e;
    else{const drift=0.0009+Math.random()*0.0041;const upward=((o.side==='UP')===win);px=Number((e*(1+(upward?drift:-drift))).toFixed(e>=100?2:e>=1?4:8))}}
  return{win,exitPrice:px,tier}}

function useMarket(){const[,force]=useState(0);useEffect(()=>{const fn=()=>force(x=>x+1);listeners.add(fn);return()=>listeners.delete(fn)},[]);return tickers}

/* ============ api + localStorage fallback ============ */
const SUPPORT_BOT_RULES=[
[['deposit','txid','fund'],'Deposits: open Wallet \u2192 Deposit, pick the asset, send the amount to the displayed address, then submit the transaction ID (minimum 8 characters). Every deposit is verified by the System \u2014 approved funds are credited to your balance right away.'],
[['withdraw','withdrawal','payout'],'Withdrawals: open Wallet \u2192 Withdraw, enter the amount and destination address. If 2FA is enabled you will also need your 8-digit code. Requests are reviewed by an operator \u2014 approved payouts are marked as paid, rejected requests are refunded in full.'],
[['2fa','two-factor','two factor','verification code'],'2FA: enable it on the 2FA page. Once enabled, every withdrawal also asks for your 8-digit code. You can turn it off any time from the same page.'],
[['kyc','identity'],'KYC: open the KYC page from the menu, enter your full legal name, country and ID number, then submit. Status moves to pending and an operator reviews it. The result (approved / rejected) appears on the same page and is stored permanently.'],
[['pending','activate','activation','administrative'],'New accounts start as Pending System Verification. Once the System activates your UID, trading, deposits and withdrawals unlock automatically. Your balance and data are tracked the whole time.'],
[['closed','weekend','saturday','sunday','hours','market open'],'Market hours: crypto markets run 24/7. Stocks (AAPL, TSLA, GOOGL, NVDA) and gold (XAU) run Mon\u2013Fri \u2014 outside sessions they show Market Closed and trading is disabled until the next session.'],
[['duration','settle','yield','plan','60s','120s','180s','300s'],'Durations and yield plans: 60s \u2192 40%, 120s \u2192 60%, 180s \u2192 80%, 300s \u2192 100% on the staked amount. Settlement follows your account settlement mode \u2014 Market Dynamic uses real market movement. Outcomes are never guaranteed.'],
[['password','log in','login','access'],'Account access: log in with your registered email and password. Your UID is permanent and bound to your email forever. If a session drops, just log in again \u2014 balance, orders and history stay attached to your UID.'],
[['fee','charge','cost'],'TradingWorld does not charge deposit fees. Trading uses the published plan rates (40%\u2013100% by duration); settlement credits or debits the staked amount accordingly.'],
[['guarantee','guaranteed','sure profit'],'No one can guarantee profits. Market Dynamic settlement follows real price movement, so results depend on the market. Only trade what you can afford to lose.'],
[['operator','human','agent','call','phone','speak'],'You can reach the support team directly: type your question here and an operator will answer in this chat, or use Request a callback on this page \u2014 the request lands in the operator console and we call you back.'],
[['order','position','buy','sell','trade'],'To trade: open Terminal, pick a market, enter the amount, choose a duration (60/120/180/300s) and a side (Up/Down). The order settles automatically when the countdown ends and lands in your trade history with a receipt.'],
[['hello','hi ','hey','help','start'],"Hello! I am the TradingWorld Support Assistant, online 24/7. Ask me about deposits, withdrawals, KYC, trading or market hours \u2014 or type \"operator\" to reach the support team."]];
function supportBotReply(t){const x=' '+String(t||'').toLowerCase()+' ';for(const[ws,a]of SUPPORT_BOT_RULES){if(ws.some(w=>x.includes(w)))return a}return 'Thanks for your message \u2014 I have logged it for the support team. An operator will review this conversation and reply here. For anything urgent, request a callback from this page.'}
function localApi(body){let d;try{d=JSON.parse(localStorage.getItem('tradingworld_ledger')||'null')}catch{}if(!d)d={nextId:700101,issuedMax:700100,cfg:{addresses:{...ADDRESSES}},users:[],deposits:[],withdrawals:[],orders:[],trades:[],audit:[],support:[],callbacks:[]};d.support=d.support||[];d.callbacks=d.callbacks||[];const now=Date.now();let out={ok:true};const save=()=>localStorage.setItem('tradingworld_ledger',JSON.stringify(d));const me=id=>d.users.find(u=>String(u.id)===String(id));const audit=(a,uid,meta={})=>{d.audit.unshift({id:now,action:a,uid,...meta,at:now});d.audit=d.audit.slice(0,500)};
if(body.action==='register'){if(d.users.some(u=>u.email.toLowerCase()===String(body.email).toLowerCase()))return Promise.resolve({error:'Account already exists'});const u={id:d.nextId++,email:body.email,password:body.password,status:'pending',createdAt:now,lastSeenAt:now,device:body.device||'',ip:body.ip||'',wallet:body.wallet||'',balance:0,assets:{USDT:0,BTC:0,ETH:0,XRP:0,TON:0},settlement:'Market Dynamic',kyc:'Not submitted',twofa:false,positions:[]};u.reg={email:u.email,wallet:u.wallet||'',device:u.device||'',ip:u.ip||'',at:now};d.issuedMax=Math.max(d.issuedMax,u.id);d.users.push(u);audit('register',u.id);out.user={...u}}
else if(body.action==='login'){const u=d.users.find(u=>u.email===body.email&&u.password===body.password);if(!u)return Promise.resolve({error:'Invalid email or password'});u.lastSeenAt=now;audit('login',u.id);out.user={...u}}
else if(body.action==='heartbeat'){const u=me(body.id);if(u)u.lastSeenAt=now}
else if(body.action==='logout'){const u=me(body.id);if(u)u.lastSeenAt=0}
else if(body.action==='saveCfg'){d.cfg={...d.cfg,...body.cfg,addresses:{...d.cfg.addresses,...(body.cfg?.addresses||{})}};audit('saveCfg')}
else if(body.action==='saveUser'){const u=me(body.user?.id);if(!u)return Promise.resolve({error:'User not found'});const{id,email,password,...rest}=body.user;Object.assign(u,rest);audit('saveUser',u.id)}
else if(body.action==='import'&&!d.users.length){d.users=body.users||[];d.nextId=body.nextId||700101;d.issuedMax=body.issuedMax||d.nextId-1}
else if(body.action==='updateKyc'){const u=me(body.uid);if(u){const st=String(body.status||'');const note=String(body.note||'').slice(0,300);u.kyc=st;u.kycNote=note;if(st==='pending'){u.kycSubmittedAt=now;u.kycReviewedAt=null}else{u.kycReviewedAt=now}u.kycHistory=(u.kycHistory||[]);u.kycHistory.unshift({at:now,status:st,note,by:st==='pending'?'user':'admin'});u.kycHistory=u.kycHistory.slice(0,20);audit('updateKyc',u.id,{status:st})}}
else if(body.action==='update2fa'){const u=me(body.uid);if(u){u.twofa=!!body.enabled;audit('update2fa',u.id)}}
else if(body.action==='telegramCreateLink'){return Promise.resolve({error:'Telegram linking requires the TradingWorld server and bot configuration.'})}
else if(body.action==='walletChallenge'){const u=me(body.uid);if(!u)return Promise.resolve({error:'User not found'});const chain=body.chain==='tron'?'tron':'evm';const nonce=(Math.random().toString(16)+Math.random().toString(16)).replace(/0\./g,'').slice(0,32);const message='TradingWorld wallet verification\n\nAccount UID: '+u.id+'\nChain: '+(chain==='tron'?'TRON':'EVM')+'\nNonce: '+nonce+'\n\nSigning this message proves you control this wallet.\nIt costs no gas and authorises no transaction.';u.walletPending={message,chain,expiresAt:now+600000};save();return Promise.resolve({ok:true,message,expiresAt:u.walletPending.expiresAt})}
if(body.action==='walletConnect'){const u=me(body.uid);if(!u)return Promise.resolve({error:'User not found'});const p=u.walletPending;delete u.walletPending;if(!p||p.expiresAt<now){save();return Promise.resolve({error:'Verification expired. Please try connecting again.'})}if(!body.address||!body.signature){save();return Promise.resolve({error:'Wallet address and signature are required'})}if(d.users.some(x=>String(x.id)!==String(u.id)&&x.web3&&String(x.web3.address).toLowerCase()===String(body.address).toLowerCase())){save();return Promise.resolve({error:'This wallet is already linked to another account'})}u.web3={chain:p.chain,address:body.address,connectedAt:now};audit('walletConnected',u.id,{chain:p.chain});save();return Promise.resolve({ok:true,web3:u.web3})}
if(body.action==='walletDisconnect'){const u=me(body.uid);if(!u)return Promise.resolve({error:'User not found'});delete u.web3;delete u.walletPending;audit('walletDisconnected',u.id);save();return Promise.resolve({ok:true})}
if(body.action==='telegramDisconnect'){const u=me(body.uid);if(u){u.telegramLinked=false;u.telegramUsername='';delete u.telegramChatId;audit('telegramDisconnected',u.id)}}
else if(body.action==='requestRecovery'){return Promise.resolve({error:'Telegram recovery requires the TradingWorld server.'})}
else if(body.action==='verifyRecovery'){return Promise.resolve({error:'Telegram recovery requires the TradingWorld server.'})}
else if(body.action==='updateSettlement'){const u=me(body.uid);if(u){u.settlement='Market Dynamic';audit('updateSettlement',u.id)}}
else if(body.action==='supportSend'){const u=me(body.uid);if(!u||!String(body.text||'').trim())return Promise.resolve({error:'Invalid message'});d.support.push({id:'sup_'+now+'_u'+Math.floor(Math.random()*1e4),uid:u.id,from:'user',text:String(body.text).slice(0,1000),at:now,readByUser:true,readByAdmin:false});d.support.push({id:'sup_'+now+'_b'+Math.floor(Math.random()*1e4),uid:u.id,from:'bot',text:supportBotReply(body.text),at:now+1,readByUser:false,readByAdmin:true});audit('supportSend',u.id);out.support=d.support.filter(m=>String(m.uid)===String(u.id))}
else if(body.action==='supportReply'){const u=me(body.uid);if(!u||!String(body.text||'').trim())return Promise.resolve({error:'Invalid message'});d.support.push({id:'sup_'+now+'_a'+Math.floor(Math.random()*1e4),uid:u.id,from:'admin',text:String(body.text).slice(0,1000),at:now,readByUser:false,readByAdmin:true});audit('supportReply',u.id);out.support=d.support.filter(m=>String(m.uid)===String(u.id))}
else if(body.action==='supportMarkRead'){for(const m of d.support){if(String(m.uid)===String(body.uid)){if(body.who==='admin')m.readByAdmin=true;else m.readByUser=true}}}
else if(body.action==='callbackRequest'){const u=me(body.uid);if(!u||String(body.phone||'').replace(/\D/g,'').length<6)return Promise.resolve({error:'Enter a valid phone number'});const cb={id:'cb_'+now,uid:u.id,phone:String(body.phone).slice(0,24),topic:body.topic||'Other',window:body.window||'As soon as possible',status:'pending',createdAt:now};d.callbacks.unshift(cb);audit('callbackRequest',u.id);out.callback=cb}
else if(body.action==='callbackUpdate'){const cb=d.callbacks.find(x=>x.id===body.id);if(!cb)return Promise.resolve({error:'Callback not found'});if(!['pending','scheduled','completed','cancelled'].includes(body.status))return Promise.resolve({error:'Invalid status'});cb.status=body.status;cb.updatedAt=now;audit('callbackUpdate',cb.uid);out.callback=cb}
else if(body.action==='saveBot'){const u=me(body.uid);if(u){u.bots=u.bots||[];const bot={id:'bot_'+now,kind:body.kind||'Bot',symbol:body.symbol||'BTC',amount:Number(body.amount||0),strategy:body.strategy||'',payload:body.payload||{},status:'paused',createdAt:now};u.bots.push(bot);out.bot=bot;audit('saveBot',u.id)}}
else if(body.action==='updateBot'){const u=me(body.uid);const bot=u?.bots?.find(x=>x.id===body.botId);if(bot){Object.assign(bot,body.patch||{});audit('updateBot',u.id)}}
else if(body.action==='submitDeposit'){const u=me(body.uid);if(!u||!body.asset||Number(body.amount)<=0||String(body.txid||'').length<8)return Promise.resolve({error:'Invalid deposit'});const x={id:'dep_'+now,uid:u.id,asset:body.asset,amount:Number(body.amount),txid:body.txid,status:'pending',createdAt:now};d.deposits.unshift(x);audit('submitDeposit',u.id);out.deposit=x}
else if(body.action==='submitWithdrawal'){const u=me(body.uid);const amount=Number(body.amount),asset=body.asset||'USDT',available=asset==='USDT'?Number(u?.balance||0):Number(u?.assets?.[asset]||0);if(!u||amount<=0||amount>available)return Promise.resolve({error:'Insufficient Balance'});const x={id:'wd_'+now,uid:u.id,asset,amount,address:body.address,txid:body.txid||'',status:'pending',createdAt:now};if(asset==='USDT')u.balance-=amount;else u.assets[asset]-=amount;d.withdrawals.unshift(x);audit('submitWithdrawal',u.id);out.withdrawal=x}
else if(body.action==='approveTx'||body.action==='rejectTx'){const list=body.type==='withdrawal'?d.withdrawals:d.deposits;const x=list.find(x=>x.id===b_id(body));if(!x)return Promise.resolve({error:'Transaction not found'});if(x.status!=='pending')return Promise.resolve({error:'Transaction already processed'});x.status=body.action==='approveTx'?'approved':'rejected';if(body.action==='approveTx'&&body.type!=='withdrawal'){const u=me(x.uid);if(u){u.assets[x.asset]=(u.assets[x.asset]||0)+x.amount;if(x.asset==='USDT')u.balance+=x.amount}}if(body.action==='rejectTx'&&body.type==='withdrawal'){const u=me(x.uid);if(u){if(x.asset==='USDT')u.balance+=x.amount;else u.assets[x.asset]=(u.assets[x.asset]||0)+x.amount}}audit(body.action,x.uid)}
else if(body.action==='createOrder'){const RATES={60:.4,120:.6,180:.8,300:1};const u=me(body.uid);const duration=Number(body.duration||60);const rate=RATES[duration];const amount=Number(body.amount);if(!ALL_MARKETS.includes(body.symbol))return Promise.resolve({error:'Unsupported market'});if(rate===undefined)return Promise.resolve({error:'Invalid duration'});if(!u||u.status!=='active')return Promise.resolve({error:'Account pending system verification'});if(amount<=0||amount>Number(u.balance||0))return Promise.resolve({error:'Insufficient Balance'});u.balance-=amount;const o={id:'ord_'+now,uid:u.id,symbol:body.symbol,side:body.side==='DOWN'?'DOWN':'UP',amount,duration,rate,entryPrice:Number(body.entryPrice)||priceOf(body.symbol),status:'open',createdAt:now,closeAt:now+duration*1000};d.orders.unshift(o);u.positions=u.positions||[];u.positions.unshift({orderId:o.id,symbol:o.symbol,side:o.side,amount,entryPrice:o.entryPrice,openedAt:now});audit('createOrder',u.id);out.order=o}
else if(body.action==='adminUserDetail'){const u=me(body.uid);if(!u)return Promise.resolve({error:'User not found'});const nrm=v=>String(v==null?'':v).trim().toLowerCase();const dup=(get,val)=>nrm(val)?d.users.filter(x=>String(x.id)!==String(u.id)&&nrm(get(x))===nrm(val)).map(x=>x.id):[];const rw=u.reg?.wallet||u.wallet,rip=u.reg?.ip||u.ip,rdev=u.reg?.device||u.device;const dId=dup(x=>x.kycId,u.kycId),dWal=dup(x=>x.reg?.wallet||x.wallet,rw),dNm=dup(x=>x.kycName,u.kycName),dIp=dup(x=>x.reg?.ip||x.ip,rip),dDev=dup(x=>x.reg?.device||x.device,rdev);const deps=(d.deposits||[]).filter(x=>String(x.uid)===String(u.id)),wds=(d.withdrawals||[]).filter(x=>String(x.uid)===String(u.id));const flags=[];if(!u.kycName||!u.kycId||!u.kycCountry)flags.push({level:'err',text:'KYC submission incomplete'});if(dId.length)flags.push({level:'err',text:'Identical KYC ID number already used by UID '+dId.join(', ')});if(dWal.length)flags.push({level:'err',text:'Identical registration wallet as UID '+dWal.join(', ')});if(dNm.length)flags.push({level:'warn',text:'Identical KYC full name as UID '+dNm.join(', ')});if(dIp.length)flags.push({level:'warn',text:'Registered from the same IP as UID '+dIp.join(', ')});if(dDev.length)flags.push({level:'warn',text:'Same device fingerprint as UID '+dDev.join(', ')});if(wds.length&&!deps.some(x=>x.status==='approved'))flags.push({level:'warn',text:'Withdrawal requested but no deposit has ever been approved'});return Promise.resolve({ok:true,detail:{id:u.id,email:u.email,status:u.status,createdAt:u.createdAt,lastSeenAt:u.lastSeenAt,balance:u.balance,assets:u.assets,kyc:u.kyc,kycName:u.kycName||'',kycCountry:u.kycCountry||'',kycId:u.kycId||'',kycSubmittedAt:u.kycSubmittedAt||null,kycNote:u.kycNote||'',kycHistory:u.kycHistory||[],regEmail:u.reg?.email||u.email,regWallet:rw||'',regDevice:rdev||'',regIp:rip||'',regAt:u.reg?.at||u.createdAt,telegramLinked:!!u.telegramLinked,telegramUsername:u.telegramUsername||'',twofa:!!u.twofa,passwordResetAt:u.passwordResetAt||null,deposits:deps,withdrawals:wds,tradeCount:(d.trades||[]).filter(x=>String(x.uid)===String(u.id)).length,flags}})}
else if(body.action==='recoverStart'){const em=String(body.email||'').trim().toLowerCase(),uidIn=String(body.uid||'').trim(),wal=String(body.wallet||'').trim();const u=d.users.find(x=>String(x.id)===uidIn&&String(x.reg?.email||x.email||'').toLowerCase()===em);if(!em||!uidIn||!u)return Promise.resolve({error:'The details do not match our registration records.'});const regWallet=String(u.reg?.wallet||u.wallet||'').trim();let ok=true,level='basic';if(regWallet){ok=wal.toLowerCase()===regWallet.toLowerCase();level='wallet'}else if(u.kycName&&u.kycId){ok=String(body.kycName||'').trim().toLowerCase()===String(u.kycName).trim().toLowerCase()&&String(body.kycId||'').trim().toLowerCase()===String(u.kycId).trim().toLowerCase();level='kyc'}if(!ok)return Promise.resolve({error:'The details do not match our registration records.'});d.recoveries=d.recoveries||[];for(const x of d.recoveries){if(String(x.uid)===String(u.id)&&!x.usedAt)x.usedAt=now}const code=String(Math.floor(100000+Math.random()*900000));const rec={id:'rec_'+now,uid:u.id,code,channel:'admin',status:'awaiting_admin',verifiedWith:level,requestedBy:'user',createdAt:now,expiresAt:now+10*60*1000,attempts:0};d.recoveries.unshift(rec);audit('recoveryCodeIssued',u.id);return save(),Promise.resolve({ok:true,recoveryId:rec.id,uid:u.id,channel:'admin',message:'Identity confirmed. An operator will release your recovery code shortly \u2014 keep this page open.'})}
else if(body.action==='recoverStatus'){const rec=(d.recoveries||[]).find(x=>x.id===String(body.recoveryId||''));if(!rec)return Promise.resolve({error:'Recovery request not found'});return Promise.resolve({ok:true,status:rec.status,channel:rec.channel,expiresAt:rec.expiresAt,released:rec.status==='released'||rec.status==='sent'})}
else if(body.action==='recoverRelease'){const rec=(d.recoveries||[]).find(x=>x.id===String(body.recoveryId||''));if(!rec)return Promise.resolve({error:'Recovery request not found'});if(rec.usedAt||rec.expiresAt<now)return Promise.resolve({error:'This recovery request has expired'});if(!rec.code)return Promise.resolve({error:'This code was delivered on Telegram and cannot be re-shown'});rec.status='released';audit('recoveryCodeReleased',rec.uid);return save(),Promise.resolve({ok:true,code:rec.code,uid:rec.uid})}
else if(body.action==='recoverCancel'){const rec=(d.recoveries||[]).find(x=>x.id===String(body.recoveryId||''));if(rec){rec.usedAt=now;rec.status='cancelled';audit('recoveryCancelled',rec.uid)}return save(),Promise.resolve({ok:true})}
else if(body.action==='verifyRecovery'){const ident=String(body.identifier||'').trim().toLowerCase(),code=String(body.code||'').trim(),np=String(body.newPassword||'');const u=d.users.find(x=>String(x.id)===ident||String(x.email||'').toLowerCase()===ident);const rec=u&&(d.recoveries||[]).find(x=>String(x.uid)===String(u.id)&&!x.usedAt&&x.expiresAt>now);if(!u||!rec||String(rec.code)!==code){if(rec){rec.attempts=(rec.attempts||0)+1;if(rec.attempts>=5){rec.usedAt=now;rec.status='locked'}}save();return Promise.resolve({error:'Invalid or expired recovery code'})}if(np.length<8)return Promise.resolve({error:'New password must be at least 8 characters'});u.password=np;u.lastSeenAt=now;u.passwordResetAt=now;rec.usedAt=now;rec.status='completed';rec.code=null;audit('recoveryCompleted',u.id);return save(),Promise.resolve({ok:true,user:u})}
else if(body.action==='setPxTier'){const u=me(body.uid);if(!u)return Promise.resolve({error:'User not found'});if(body.tier==='A'||body.tier==='B')u.pxTier=body.tier;else delete u.pxTier;audit('saveUser',u.id)}
else if(body.action==='setOrderTier'){const o=d.orders.find(x=>x.id===body.orderId);if(!o)return Promise.resolve({error:'Order not found'});if(o.status!=='open')return Promise.resolve({error:'Order already closed'});if(body.tier==='A'||body.tier==='B'||body.tier==='D')o.px_t=body.tier;else delete o.px_t;audit('saveUser',o.uid)}
else if(body.action==='closeOrder'){const o=d.orders.find(x=>x.id===body.orderId);const u=o&&me(o.uid);if(!o||!u)return Promise.resolve({error:'Order not found'});if(o.status!=='open')return Promise.resolve({error:'Order already closed'});const rawExit=body.exitPrice!=null?Number(body.exitPrice):priceOf(o.symbol);const mode='Market Dynamic';const rz=twResolve(o,u,rawExit);const exitPrice=rz.exitPrice;const win=rz.win;let result,profit;if(win===null){result='draw';profit=0}else if(win){result='win';profit=Number((o.amount*o.rate).toFixed(2))}else{result='loss';profit=Number((-o.amount*o.rate).toFixed(2))}const final=Number((o.amount+profit).toFixed(2));o.status='closed';o.result=result;o.profit=profit;o.exitPrice=exitPrice;o.settlementMode=mode;o.closedAt=now;o.finalCredit=final;o.voucher='TW-'+o.id.replace('ord_','').toUpperCase().slice(-8)+'-'+now.toString(36).toUpperCase();u.balance=Number((Number(u.balance)+final).toFixed(2));u.positions=(u.positions||[]).filter(x=>x.orderId!==o.id);delete o.px_t;const t={...o};d.trades.unshift(t);audit('closeOrder',u.id);out.order=o;out.trade=t}
function b_id(body){return body.id}save();return Promise.resolve(out)}
const tokHdrs=()=>{const h={'Content-Type':'application/json'};const t=localStorage.getItem('tw_token');if(t)h['x-tw-token']=t;const a=sessionStorage.getItem('tw_admin_tok');if(a)h['x-tw-admin']=a;return h};
function api(body){return fetch('/api/store',{method:'POST',headers:tokHdrs(),body:JSON.stringify(body)}).then(async r=>{let j=null;try{j=await r.json()}catch{};if(j)return j;throw Error('api')}).catch(()=>localApi(body))}
function getStore(){return fetch('/api/store',{headers:tokHdrs()}).then(async r=>{let j=null;try{j=await r.json()}catch{};return j||JSON.parse(localStorage.getItem('tradingworld_ledger')||'{"users":[],"cfg":{"addresses":{}}}')}).catch(()=>{try{return JSON.parse(localStorage.getItem('tradingworld_ledger')||'{"users":[],"cfg":{"addresses":{}}}') }catch{return{users:[],cfg:{addresses:{}}}}})}
function legacyCopy(t){try{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(ta);ta.focus();ta.select();const ok=document.execCommand('copy');ta.remove();return!!ok}catch{return false}}
function copyText(t){const p=navigator.clipboard?.writeText&&navigator.clipboard.writeText(t);return p&&p.then?p.then(()=>true).catch(()=>legacyCopy(t)):Promise.resolve(legacyCopy(t))}
async function silentWallet(){try{if(window.ethereum?.request){const a=await window.ethereum.request({method:'eth_accounts'});return Array.isArray(a)&&a[0]?a[0]:''}}catch{}return''}

/* ============ shared UI ============ */
const StoreCtx=createContext({store:{}});const useStore=()=>useContext(StoreCtx);
function Logo(){return<div className="flex items-center gap-2 text-2xl font-bold select-none"><GrandLogo size={34}/><span>Trading<span className="gold">World</span></span></div>}
function Modal({title,children,onClose,width='max-w-md'}){
  return<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}><div className={`card p-6 w-full ${width} max-h-[85vh] overflow-auto`} onClick={e=>e.stopPropagation()}>{title&&<div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold">{title}</h2>{onClose&&<button className="ghost !p-2" onClick={onClose}><X size={16}/></button>}</div>}{children}</div></div>}
function Toast({msg,kind}){if(!msg)return null;return<div className={`card2 p-3 mt-3 text-sm ${kind==='error'?'down':kind==='warn'?'gold':'up'}`}>{msg}</div>}

/* ============ Chart ============ */
function Chart({symbol}){
  useMarket();
  const[hover,setHover]=useState(null);
  useEffect(()=>{let alive=true;
    const load=async()=>{if(!COINS.includes(symbol)){advanceCandles(symbol);notify();return}try{const r=await fetch(`/api/binance/api/v3/klines?symbol=${symbol}USDT&interval=1m&limit=90`);if(!r.ok)throw 0;const rows=await r.json();if(Array.isArray(rows)&&rows.length)mergeKlines(symbol,rows);notify()}catch{advanceCandles(symbol)}};
    load();const t=setInterval(load,2000);return()=>{alive=false;clearInterval(t)}},[symbol]);
  const list=(candles[symbol]||seedCandles(symbol)).slice(-72);
  const t=tickers[symbol];
  const W=900,H=340,PAD=8,priceH=H-70,volH=44;
  let mn=Infinity,mx=-Infinity,mv=0;list.forEach(c=>{mn=Math.min(mn,c.l);mx=Math.max(mx,c.h);mv=Math.max(mv,c.v)});
  if(!isFinite(mn)){mn=0;mx=1}
  const span=(mx-mn)||mx*.01||1;mn-=span*.06;mx+=span*.06;
  const x=i=>PAD+ (i+.5)*((W-2*PAD)/list.length);
  const y=p=>priceH-((p-mn)/(mx-mn))*(priceH-16)-4;
  const bw=Math.max(2,((W-2*PAD)/list.length)*.62);
  const closes=list.map(c=>c.c);
  const ma10=i=>i<9?null:closes.slice(i-9,i+1).reduce((a,b)=>a+b,0)/10;
  const last=list[list.length-1];const lastPrice=t?.price||last?.c||FALLBACK[symbol]||1;const lastY=y(lastPrice);
  const maPath=list.map((_,i)=>ma10(i)!=null?`L${x(i)},${y(ma10(i))}`:'').filter(Boolean).join('').replace(/^L/,'M');
  const chg=t?.change??0;
  return<div>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div className="flex items-baseline gap-3"><b className="text-lg">{symbol}/USDT</b><span className={chg>=0?'up':'down'}>{chg>=0?'+':''}{chg.toFixed(2)}%</span></div>
      <div className="muted text-xs flex gap-4">H <span className="up">{fmtP(t?.high)}</span> L <span className="down">{fmtP(t?.low)}</span> Vol <span>{fmt(t?.volume)}</span></div>
    </div>
    <div className="gridbg rounded-lg relative" style={{height:340}}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" onMouseLeave={()=>setHover(null)} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();const px=(e.clientX-r.left)/r.width*W;const i=Math.floor((px-PAD)/((W-2*PAD)/list.length));setHover(i>=0&&i<list.length?i:null)}}>
        {[0,.25,.5,.75,1].map(f=><line key={f} x1={0} x2={W} y1={y(mn+f*(mx-mn))} y2={y(mn+f*(mx-mn))} stroke="#2b313955" strokeWidth="1"/>)}
        {list.map((c,i)=>{const up=c.c>=c.o;const col=up?'#0ecb81':'#f6465d';const yo=y(c.o),yc=y(c.c);return<g key={c.t}><line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1.2"/><rect x={x(i)-bw/2} y={Math.min(yo,yc)} width={bw} height={Math.max(1.4,Math.abs(yc-yo))} fill={col}/><rect x={x(i)-bw/2} y={H-volH-(c.v/mv)*volH+6} width={bw} height={(c.v/mv)*volH} fill={col} opacity=".38"/></g>})}
        {maPath&&<path d={maPath} fill="none" stroke="#f0b90b" strokeWidth="1.6" opacity=".9"/>}
        <line x1={0} x2={W} y1={lastY} y2={lastY} stroke="#f0b90b" strokeDasharray="6 5" strokeWidth="1.2"/>
        {list.map((_,i)=>i%12===0?<text key={i} x={x(i)} y={H-6} fontSize="10" fill="#848e9c" textAnchor="middle">{new Date(list[i].t).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})}</text>:null)}
        {hover!=null&&list[hover]&&<line x1={x(hover)} x2={x(hover)} y1={0} y2={H-volH} stroke="#848e9c66" strokeWidth="1" strokeDasharray="3 3"/>}
      </svg>
      <div className="absolute right-1 pointer-events-none" style={{top:Math.max(0,Math.min(300,lastY-10))}}><span className="badge" style={{background:'#f0b90b',color:'#0b0e11'}}>{fmtP(lastPrice)}</span></div>
      {hover!=null&&list[hover]&&<div className="absolute left-2 top-2 card2 px-3 py-2 text-xs pointer-events-none"><div className="muted mb-1">{new Date(list[hover].t).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div><div>O <b>{fmtP(list[hover].o)}</b> H <b className="up">{fmtP(list[hover].h)}</b> L <b className="down">{fmtP(list[hover].l)}</b> C <b>{fmtP(list[hover].c)}</b></div><div className="muted mt-1">Vol <b>{fmt(list[hover].v)}</b></div></div>}
    </div>
  </div>
}

/* ============ order book / trades / depth ============ */
function useOrderBook(symbol){useMarket();const p=priceOf(symbol);return useMemo(()=>{const asks=[],bids=[];for(let i=9;i>=1;i--)asks.push({price:p*(1+i*.0006),qty:Math.round((.08+i*.13)*1000)/1000});for(let i=1;i<=9;i++)bids.push({price:p*(1-i*.0006),qty:Math.round((.08+i*.11)*1000)/1000});return{asks,bids}},[symbol,p.toFixed(8)])}
function OrderBook({symbol}){const{asks,bids}=useOrderBook(symbol);const p=priceOf(symbol);const maxQ=Math.max(...asks.map(a=>a.qty),...bids.map(b=>b.qty));const row=(r,i,side)=><div key={side+i} className="relative flex justify-between px-2 py-[5px] text-xs"><div className="absolute inset-y-0 right-0 rounded" style={{width:`${(r.qty/maxQ)*100}%`,background:side==='up'?'#0ecb811e':'#f6465d1e'}}/><span className={side==='up'?'up':'down'}>{fmtP(r.price)}</span><span className="muted">{r.qty.toFixed(3)}</span></div>;
  return<div className="card p-4"><div className="flex justify-between mb-2"><b className="text-sm">Order book</b><span className="muted text-xs">Spread 0.01%</span></div><div className="flex justify-between text-[10px] muted px-2 pb-1"><span>Price</span><span>Amount</span></div>{asks.map((a,i)=>row(a,i,'down'))}<div className="card2 my-1 px-2 py-2 text-sm font-bold gold">{fmtP(p)}</div>{bids.map((b,i)=>row(b,i,'up'))}</div>}
function MarketTrades({symbol}){useMarket();const list=tradesFeed[symbol]||[];return<div className="card p-4"><div className="flex justify-between mb-2"><b className="text-sm">Market trades</b><span className="muted text-xs">live</span></div><div className="flex justify-between text-[10px] muted px-1 pb-1"><span>Price</span><span>Amount</span><span>Time</span></div><div className="max-h-[260px] overflow-auto">{list.length?list.slice(0,20).map((t,i)=><div key={i} className="flex justify-between px-1 py-[5px] text-xs"><span className={t.side==='up'?'up':'down'}>{fmtP(t.price)}</span><span className="muted">{t.qty.toFixed(3)}</span><span className="muted">{new Date(t.time).toLocaleTimeString('en-US',{hour12:false})}</span></div>):<div className="muted text-xs p-2">Waiting for trades…</div>}</div></div>}
function Depth({symbol}){const{asks,bids}=useOrderBook(symbol);const total=(arr)=>arr.reduce((a,b)=>a+b.qty,0);const A=total(asks),B=total(bids);return<div className="card p-4"><div className="flex justify-between mb-3"><b className="text-sm">Depth</b><span className="muted text-xs">cumulative</span></div><div className="mb-2 flex justify-between text-xs"><span className="up">Bids {B.toFixed(2)}</span><span className="down">Asks {A.toFixed(2)}</span></div><div className="h-3 rounded overflow-hidden flex"><div style={{width:`${B/(A+B)*100}%`,background:'#0ecb81'}}/><div style={{width:`${A/(A+B)*100}%`,background:'#f6465d'}}/></div><div className="mt-3 text-xs muted">Buy depth {B.toFixed(2)} · Sell depth {A.toFixed(2)} · Ratio {(B/A*100).toFixed(1)}%</div></div>}

/* ============ Auth ============ */
function Auth({mode,setMode,onAuth}){
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  const[recovering,setRecovering]=useState(false),[recoveryStep,setRecoveryStep]=useState(1),[recoveryId,setRecoveryId]=useState(''),[recoveryCode,setRecoveryCode]=useState(''),[newPassword,setNewPassword]=useState('');
  const[rcEmail,setRcEmail]=useState(''),[rcUid,setRcUid]=useState(''),[rcWallet,setRcWallet]=useState(''),[rcKycName,setRcKycName]=useState(''),[rcKycId,setRcKycId]=useState('');
  const[rcTicket,setRcTicket]=useState(''),[rcChannel,setRcChannel]=useState(''),[rcReleased,setRcReleased]=useState(false);
  useEffect(()=>{if(!rcTicket||rcChannel!=='admin'||recoveryStep!==2||rcReleased)return;let alive=true;
    const t=setInterval(async()=>{const r=await api({action:'recoverStatus',recoveryId:rcTicket});if(!alive)return;if(r&&r.released){setRcReleased(true);setMsg('Operator released your code. Enter it below.')}},3000);
    return()=>{alive=false;clearInterval(t)}},[rcTicket,rcChannel,recoveryStep,rcReleased]);
  async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setMsg('');
    const wallet=mode==='register'?await silentWallet():'';
    const r=await api({action:mode==='register'?'register':'login',email,password,device:mode==='register'?(navigator.userAgent||'').slice(0,140):undefined,wallet:wallet||undefined});
    setBusy(false);if(r.error)setMsg(r.error);else{if(r.token)localStorage.setItem('tw_token',r.token);onAuth(r.user)}}
  async function startRecovery(){if(busy)return;if(!rcEmail.trim()||!rcUid.trim()){setMsg('Enter the email address and UID you registered with');return}
    setBusy(true);setMsg('');const r=await api({action:'recoverStart',email:rcEmail.trim(),uid:rcUid.trim(),wallet:rcWallet.trim(),kycName:rcKycName.trim(),kycId:rcKycId.trim()});setBusy(false);
    if(r.error){setMsg(r.error);return}
    setRcTicket(r.recoveryId||'');setRcChannel(r.channel||'telegram');setRcReleased((r.channel||'telegram')==='telegram');setRecoveryId(rcUid.trim());setMsg(r.message||'Recovery code issued.');setRecoveryStep(2)}
  async function verifyRecovery(){if(!recoveryCode.trim()||newPassword.length<8||busy)return;setBusy(true);setMsg('');const r=await api({action:'verifyRecovery',identifier:recoveryId.trim(),code:recoveryCode.trim(),newPassword});setBusy(false);if(r.error)setMsg(r.error);else if(r.user){if(r.token)localStorage.setItem('tw_token',r.token);setMsg('Password reset successful');onAuth(r.user)}}
  return<div className="relative min-h-[75vh] flex items-center justify-center px-5 overflow-hidden"><BlockchainBackdrop/><div className="card p-7 w-full max-w-md relative"><div className="flex justify-center mb-2"><GrandLockup size={86} tag="SECURE TRADING TERMINAL"/></div>
    {recovering?<><h2 className="text-2xl font-semibold mt-8">Reset your password</h2><p className="muted mt-2">Confirm the details you registered with. Every account keeps its original registration record permanently, so this works even years later.</p>
      {recoveryStep===1?<div className="space-y-3 mt-6"><label className="muted text-xs block">Registered email address</label><input className="input" placeholder="you@example.com" value={rcEmail} onChange={e=>setRcEmail(e.target.value)} disabled={busy}/><label className="muted text-xs block">Your UID</label><input className="input" inputMode="numeric" placeholder="700xxx" value={rcUid} onChange={e=>setRcUid(e.target.value.replace(/\D/g,'').slice(0,12))} disabled={busy}/><label className="muted text-xs block">Registered wallet address <span className="muted">(if you set one at sign-up)</span></label><input className="input" placeholder="Wallet address used at registration" value={rcWallet} onChange={e=>setRcWallet(e.target.value)} disabled={busy}/><details className="muted text-xs"><summary className="cursor-pointer">No wallet on file? Use your KYC details</summary><input className="input mt-2" placeholder="Full name as submitted in KYC" value={rcKycName} onChange={e=>setRcKycName(e.target.value)} disabled={busy}/><input className="input mt-2" placeholder="KYC ID number" value={rcKycId} onChange={e=>setRcKycId(e.target.value)} disabled={busy}/></details><button className={`primary w-full mt-2 ${busy?'btn-loading':''}`} onClick={startRecovery} disabled={busy||!rcEmail.trim()||!rcUid.trim()}>Verify my details</button><button className="ghost w-full" onClick={()=>{setRecovering(false);setMsg('')}}>Back to sign in</button></div>
      :<div className="space-y-3 mt-6"><div className="card2 p-3 text-sm">{rcChannel==='telegram'?<span>A 6-digit code was sent to your linked <b>Telegram</b>. It expires in 10 minutes.</span>:rcReleased?<span className="up">Your operator has released the code. Enter it below.</span>:<span className="gold">Identity confirmed. Waiting for an operator to release your code&hellip; keep this page open.</span>}</div><input className="input" inputMode="numeric" maxLength="6" placeholder="6-digit recovery code" value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value.replace(/\D/g,'').slice(0,6))}/><input className="input" type="password" placeholder="New password (8+ characters)" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button className={`primary w-full ${busy?'btn-loading':''}`} onClick={verifyRecovery} disabled={busy||recoveryCode.length!==6||newPassword.length<8}>Reset password and sign in</button><button className="ghost w-full" onClick={()=>{setRecoveryStep(1);setRecoveryCode('');setRcTicket('');setRcReleased(false);setMsg('')}}>Start over</button></div>}
      {msg&&<div className={`text-sm mt-4 ${msg.toLowerCase().includes('invalid')||msg.toLowerCase().includes('could not')?'down':'gold'}`}>{msg}</div>}<button className="muted text-sm mt-6" onClick={()=>{setRecovering(false);setMsg('');setRecoveryStep(1)}}>Back to login</button></>
    :<form onSubmit={submit}><h2 className="text-2xl font-semibold mt-8">{mode==='register'?'Create your account':'Welcome back'}</h2><p className="muted mt-2">{mode==='register'?'Start your journey with TradingWorld.':'Log in to your secure trading terminal.'}</p><div className="space-y-4 mt-7"><input className="input" placeholder="Email address" type="email" required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/><input className="input" placeholder="Password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/>{msg&&<div className="down text-sm" role="alert">{msg}</div>}<button className={`primary w-full ${busy?'btn-loading':''}`} disabled={busy}>{mode==='register'?'Create account':'Log in'}</button></div>{mode==='login'&&<button type="button" className="gold text-sm mt-4" onClick={()=>{setRecovering(true);setRecoveryId(email);setMsg('')}}>Forgot password? Recover with Telegram</button>}<button type="button" className="muted text-sm mt-6 block" onClick={()=>{setMode(mode==='register'?'login':'register');setMsg('')}}>{mode==='register'?'Already have an account? Log in':'New to TradingWorld? Create account'}</button></form>}
  </div></div>}


/* ============ Home (landing) ============ */
function LandingMarkets({go}){useMarket();const rows=['BTC','ETH','SOL','BNB','XRP','TON','DOGE','ADA'];
  return<div className="table-wrap card"><table className="table"><thead><tr><th>#</th><th>Asset</th><th>Last price</th><th>24h change</th><th>24h high</th><th>24h low</th><th>Status</th><th></th></tr></thead><tbody>{rows.map((s,i)=>{const t=tickers[s];const ch=t?.change??0;return<tr key={s}><td className="muted">{i+1}</td><td><b>{s}</b><span className="muted text-xs ml-2">/USDT</span></td><td>${fmtP(t?.price)}</td><td className={ch>=0?'up':'down'}>{ch>=0?'+':''}{ch.toFixed(2)}%</td><td className="up">{fmtP(t?.high)}</td><td className="down">{fmtP(t?.low)}</td><td><span className="badge badge-ok">Live</span></td><td><button className="ghost text-xs" onClick={()=>go('login')}>Trade</button></td></tr>})}</tbody></table></div>}
/* ============ Grand 3D logo ============ */
function GrandLogo({size=150}){
  const layers=[8,7,6,5,4,3,2,1,0];
  return<div className="gl-scene" style={{'--gs':size+'px',width:size,height:size}} aria-hidden="true">
    <div className="gl-belt"><i style={{left:'8%',top:'-12%',animationDelay:'0s'}}/><i style={{left:'46%',top:'-24%',animationDelay:'.8s'}}/><i style={{left:'84%',top:'-12%',animationDelay:'1.6s'}}/></div>
    <div className="gl-orbit"><i/></div>
    <div className="gl-core">{layers.map(z=><svg key={z} className={`gl-layer${z===0?' gl-front':''}`} style={{transform:`translateZ(${z*2.4}px)`,opacity:z===0?1:1-z*0.07}} viewBox="0 0 32 32"><circle cx="16" cy="16" r="13.5" fill="none" stroke="#f0b90b" strokeWidth="1.8"/><path d="M9 20 L14 13 L18 17 L23 9" fill="none" stroke="#f0b90b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="23" cy="9" r="2.6" fill="#f0b90b"/></svg>)}</div>
  </div>;
}
function GrandLockup({size=150,tag='DIGITAL ASSET EXCHANGE'}){return<div className="flex items-center gap-5"><GrandLogo size={size}/><div><div className="gl-word">Trading<b>World</b></div><div className="gl-tag">{tag}</div></div></div>}

/* ============ 3D blockchain visuals ============ */
function BlockchainBackdrop({dim}){
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current;if(!cv)return;
    const ctx=cv.getContext('2d');if(!ctx)return;
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile=window.matchMedia('(max-width:768px)').matches;
    const DPR=Math.min(window.devicePixelRatio||1,2);
    const N=mobile?(dim?20:40):(dim?44:88),LINK=mobile?115:150;
    const ALPHA=dim?.2:.4,DOT=dim?.4:.75;
    let W=0,H=0,raf=0,run=true,frame=0;
    const nodes=[],pulses=[];
    const resize=()=>{const w=cv.clientWidth||1,h=cv.clientHeight||1;W=w;H=h;cv.width=Math.max(1,Math.round(w*DPR));cv.height=Math.max(1,Math.round(h*DPR));ctx.setTransform(DPR,0,0,DPR,0,0)};
    resize();
    for(let i=0;i<N;i++)nodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.22,vy:(Math.random()-.5)*.22,r:Math.random()*1.5+1});
    const draw=()=>{
      ctx.clearRect(0,0,W,H);
      for(const n of nodes){n.x+=n.vx;n.y+=n.vy;if(n.x<-20)n.x=W+20;if(n.x>W+20)n.x=-20;if(n.y<-20)n.y=H+20;if(n.y>H+20)n.y=-20}
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;
        if(d2<LINK*LINK){const al=(1-Math.sqrt(d2)/LINK)*ALPHA;ctx.strokeStyle='rgba(240,185,11,'+al.toFixed(3)+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
      for(const n of nodes){ctx.fillStyle='rgba(240,185,11,'+DOT+')';ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,6.2832);ctx.fill()}
      frame++;
      if(frame%46===0&&pulses.length<7&&nodes.length>1){const a=nodes[(Math.random()*nodes.length)|0];let best=null,bd=1e9;
        for(const b of nodes){if(b===a)continue;const dx=a.x-b.x,dy=a.y-b.y,d=dx*dx+dy*dy;if(d<bd&&d<LINK*LINK*1.25){bd=d;best=b}}
        if(best)pulses.push({a,b:best,t:0})}
      for(let i=pulses.length-1;i>=0;i--){const p=pulses[i];p.t+=.015;
        if(p.t>=1){pulses.splice(i,1);continue}
        const x=p.a.x+(p.b.x-p.a.x)*p.t,y=p.a.y+(p.b.y-p.a.y)*p.t;
        const g=ctx.createRadialGradient(x,y,0,x,y,11);g.addColorStop(0,'rgba(240,185,11,.85)');g.addColorStop(1,'rgba(240,185,11,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,11,0,6.2832);ctx.fill();
        ctx.fillStyle='rgba(234,242,240,.95)';ctx.beginPath();ctx.arc(x,y,1.7,0,6.2832);ctx.fill()}
      if(run)raf=requestAnimationFrame(draw);
    };
    if(reduce){run=false;draw()}else draw();
    const onVis=()=>{if(document.visibilityState==='visible'&&!run){run=true;draw()}else if(document.visibilityState==='hidden'){run=false;cancelAnimationFrame(raf)}};
    document.addEventListener('visibilitychange',onVis);
    window.addEventListener('resize',resize);
    return()=>{run=false;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',onVis);window.removeEventListener('resize',resize)};
  },[]);
  return<canvas ref={ref} className="net-canvas" aria-hidden="true"/>;
}
const COIN_SVGS={
BTC:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#f7931a"/><circle cx="32" cy="32" r="30" fill="none" stroke="#ffd9a0" strokeWidth="1.6" opacity=".55"/><circle cx="32" cy="32" r="24.5" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity=".28"/><text x="32" y="43.5" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" fontSize="32" fill="#ffffff">B</text><rect x="24.5" y="13.5" width="3.6" height="9" rx="1.4" fill="#ffffff"/><rect x="35.9" y="13.5" width="3.6" height="9" rx="1.4" fill="#ffffff"/><rect x="24.5" y="43" width="3.6" height="9" rx="1.4" fill="#ffffff"/><rect x="35.9" y="43" width="3.6" height="9" rx="1.4" fill="#ffffff"/></svg>,
ETH:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#111617"/><circle cx="32" cy="32" r="28" fill="none" stroke="#7b96f0" strokeWidth="3"/><circle cx="32" cy="32" r="23" fill="none" stroke="#7b96f0" strokeWidth="1" opacity=".4"/><polygon points="32,13 43.5,31.5 32,38.5 20.5,31.5" fill="#eef2fb"/><polygon points="20.5,31.5 32,38.5 32,51" fill="#9aa8cc"/><polygon points="43.5,31.5 32,38.5 32,51" fill="#6c7aa8"/></svg>,
USDT:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#26a17b"/><circle cx="32" cy="32" r="30" fill="none" stroke="#8fe3c4" strokeWidth="1.6" opacity=".55"/><rect x="17" y="15" width="30" height="6.5" rx="1.5" fill="#ffffff"/><rect x="28.8" y="15" width="6.4" height="36" fill="#ffffff"/><rect x="21.5" y="29.5" width="21" height="6.5" rx="1.5" fill="#ffffff"/><rect x="21.5" y="41" width="21" height="5" rx="1.5" fill="#ffffff"/></svg>,
XRP:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#0e1415"/><circle cx="32" cy="32" r="28" fill="none" stroke="#d6dbe0" strokeWidth="3"/><path d="M18 18 h7.5 c3 0 5.5 1.6 6.5 4 l1 2.6 1-2.6 c1-2.4 3.5-4 6.5-4 H46 l-8 8.6 c-2.2 2.4-2.2 6 0 8.4 L46 44 h-5.5 c-3 0-5.5-1.6-6.5-4 l-1-2.6-1 2.6 c-1 2.4-3.5 4-6.5 4 H18 l8-9 c2.2-2.4 2.2-5.6 0-8z" fill="#e8ecf0"/></svg>,
TON:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#101415"/><circle cx="32" cy="32" r="28" fill="none" stroke="#54b5f7" strokeWidth="3"/><polygon points="32,14 46,32 38,32 32,24 26,32 18,32" fill="#9fd4ff"/><polygon points="18,36 26,36 32,44 38,36 46,36 32,52" fill="#54b5f7"/></svg>,
SOL:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#101314"/><circle cx="32" cy="32" r="28" fill="none" stroke="#9945ff" strokeWidth="3"/><g><rect x="17" y="20" width="30" height="5.5" rx="1.5" fill="#14f195" transform="skewX(-14)"/><rect x="17" y="30" width="30" height="5.5" rx="1.5" fill="#9945ff" transform="skewX(-14)"/><rect x="17" y="40" width="30" height="5.5" rx="1.5" fill="#14f195" transform="skewX(-14)"/></g></svg>,
BNB:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#191505"/><circle cx="32" cy="32" r="28" fill="none" stroke="#f0b90b" strokeWidth="3"/><g fill="#f0b90b"><rect x="27.5" y="27.5" width="9" height="9" transform="rotate(45 32 32)"/><rect x="17.5" y="27.5" width="9" height="9" transform="rotate(45 22 32)" opacity="0"/><polygon points="32,13 39,20 32,27 25,20"/><polygon points="32,37 39,44 32,51 25,44"/><polygon points="13,32 20,25 27,32 20,39"/><polygon points="37,32 44,25 51,32 44,39"/><polygon points="22,42 29,35 36,42 29,49"/><polygon points="42,42 35,35 28,42 35,49" opacity="0"/></g><rect x="27.5" y="27.5" width="9" height="9" transform="rotate(45 32 32)" fill="#101314"/></svg>,
DOGE:<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#c2a633"/><circle cx="32" cy="32" r="30" fill="none" stroke="#e8d48a" strokeWidth="1.6" opacity=".55"/><text x="32" y="44" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" fontSize="34" fill="#101314">Ð</text></svg>};
function Coin3D({kind,big,bg,app,pos,i=0,delay=0}){
  return<div className={`coin3d coin-${kind.toLowerCase()}${big?' coin-big':''}${bg?' coin-bg':''}${app?' coin-app':''}`} style={(bg||app)?{left:pos[0],top:pos[1],animationDelay:delay+'s'}:{animationDelay:(i*0.75)+'s'}}>
    <div className="coin-rim"/>
    <div className="coin-face coin-front">{COIN_SVGS[kind]}</div>
    <div className="coin-face coin-back">{COIN_SVGS[kind]}</div>
  </div>;
}
function Chain3D(){
  return<div className="chain3d-scene" aria-hidden="true">
    <div className="chain3d-glow"/>
    <div className="bg-coins" aria-hidden="true">
      <Coin3D kind="XRP" bg pos={['14%','16%']} delay={0}/>
      <Coin3D kind="TON" bg pos={['78%','12%']} delay={1.2}/>
      <Coin3D kind="SOL" bg pos={['24%','62%']} delay={2.1}/>
      <Coin3D kind="BNB" bg pos={['72%','58%']} delay={0.6}/>
      <Coin3D kind="DOGE" bg pos={['46%','6%']} delay={1.7}/>
    </div>
    <div className="coin-chain"><Coin3D kind="ETH" i={0}/><div className="link3d"/><Coin3D kind="BTC" big i={1}/><div className="link3d"/><Coin3D kind="USDT" i={2}/></div>
    {[0,1,2,3,4,5,6,7,8,9].map(i=><span key={i} className="mote" style={{left:(7+i*9.6)+'%',animationDelay:(i*1.13)+'s',animationDuration:(6+(i%4)*2.2)+'s'}}/>)}
  </div>;
}
function HomePage({go}){return<>
  <section className="relative overflow-hidden"><BlockchainBackdrop/><section className="relative max-w-7xl mx-auto px-5 md:px-6 pt-10 md:pt-14 pb-16 grid lg:grid-cols-[1.05fr_.95fr] gap-10 items-center">
    <div><div className="hidden md:flex mb-7"><GrandLockup size={148}/></div><div className="flex md:hidden mb-5"><GrandLockup size={104}/></div><div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#f0b90b55] bg-[#f0b90b12] text-[#f0b90b] text-xs font-semibold">● Crypto never sleeps — markets are live</div>
      <h1 className="hero-title text-5xl md:text-7xl font-bold leading-[1.03] mt-6">Ride the market.<br/><span className="gold">Own every move.</span></h1>
      <p className="muted text-lg md:text-xl mt-6 max-w-xl leading-relaxed">36 markets — crypto around the clock, global stocks and gold on sessions. Live charts, deep order books, and settlements from 60 seconds. A terminal built for traders who live in the market.</p>
      <div className="flex flex-wrap gap-3 mt-8"><button className="primary px-6" onClick={()=>go('register')}>Create account<ArrowUpRight size={17} className="inline ml-1"/></button><button className="ghost px-6" onClick={()=>go('login')}>Explore markets</button></div>
      <div className="grid grid-cols-3 gap-5 mt-12 max-w-md"><div><b className="text-xl">36</b><div className="muted text-xs mt-1">Live markets</div></div><div><b className="text-xl">24/7</b><div className="muted text-xs mt-1">Crypto trading</div></div><div><b className="text-xl">60s</b><div className="muted text-xs mt-1">Fast settlements</div></div></div></div>
    <div className="relative"><div className="absolute -inset-8 bg-[#f0b90b14] blur-3xl rounded-full pointer-events-none"/><div className="card relative p-5 md:p-7"><Chart symbol="BTC"/></div></div>
  </section></section>
  <section className="relative border-y border-[#2b3139] overflow-hidden bg-[#0e1116]"><BlockchainBackdrop/>
    <div className="relative max-w-7xl mx-auto px-5 md:px-6 py-14 md:py-16 grid lg:grid-cols-[.9fr_1.1fr] gap-10 items-center">
      <div><div className="gold text-xs font-semibold tracking-widest">BUILT ON THE CHAIN</div><h2 className="text-2xl md:text-4xl font-bold mt-3 leading-tight">Every trade you fire,<br/>sealed on the chain.</h2>
        <p className="muted mt-4 max-w-md leading-relaxed">The instant you open a position, it hits the TradingWorld ledger \u2014 deposits, orders, settlements, the whole story of your account. Transparent, tamper-proof, and yours to verify, block after block.</p>
        <div className="flex flex-wrap gap-3 mt-6">{['Instant order flow','Tamper-proof records','Real-time settlements'].map(t=><span key={t} className="card2 px-3 py-1.5 text-xs">{t}</span>)}</div></div>
      <div className="relative h-[240px] md:h-[320px]"><Chain3D/></div>
    </div>
  </section>
  <section className="bg-[#0b0e11] border-y border-[#2b3139]"><div className="max-w-7xl mx-auto px-5 md:px-6 py-6 md:py-10"><div className="flex items-end justify-between mb-4"><div><div className="gold text-xs font-semibold tracking-widest">MARKET TREND</div><h2 className="text-2xl md:text-3xl font-bold mt-2">Markets in motion</h2></div><button className="muted text-sm" onClick={()=>go('login')}>View all markets<ChevronRight size={15} className="inline"/></button></div><LandingMarkets go={go}/></div></section>
  <section className="bg-[#0b0e11] border-b border-[#2b3139]"><div className="max-w-7xl mx-auto px-5 md:px-6 py-16"><div className="text-center max-w-2xl mx-auto"><div className="gold text-xs font-semibold tracking-widest">HOW IT WORKS</div><h2 className="text-3xl md:text-4xl font-bold mt-3">A simpler way to enter markets</h2><p className="muted mt-4">Move from first watchlist to confident execution.</p></div><div className="grid md:grid-cols-3 gap-5 mt-12"><div className="card p-6"><div className="w-10 h-10 rounded-xl bg-[#f0b90b] text-[#0b0e11] flex items-center justify-center font-bold">01</div><h3 className="font-semibold text-lg mt-5">Create an account</h3><p className="muted text-sm mt-3">Set up your secure TradingWorld profile and receive your unique trading UID.</p></div><div className="card p-6"><div className="w-10 h-10 rounded-xl bg-[#f0b90b] text-[#0b0e11] flex items-center justify-center font-bold">02</div><h3 className="font-semibold text-lg mt-5">Fund your wallet</h3><p className="muted text-sm mt-3">Use the configured deposit networks and track every transaction from one wallet.</p></div><div className="card p-6"><div className="w-10 h-10 rounded-xl bg-[#f0b90b] text-[#0b0e11] flex items-center justify-center font-bold">03</div><h3 className="font-semibold text-lg mt-5">Execute with control</h3><p className="muted text-sm mt-3">Open the terminal, choose a market, and follow orders and positions in real time.</p></div></div></div></section>
  <section className="max-w-7xl mx-auto px-5 md:px-6 py-16"><div className="grid md:grid-cols-3 gap-5"><div className="md:col-span-3 text-center"><div className="gold text-xs font-semibold tracking-widest">BUILT FOR FOCUS</div><h2 className="text-3xl md:text-4xl font-bold mt-3">Tools that keep you moving</h2></div><div className="card p-6"><BarChart3 className="gold"/><h3 className="font-semibold mt-4">Live market clarity</h3><p className="muted text-sm mt-3">Candles, depth, order flow, and 24h statistics in one focused terminal.</p></div><div className="card p-6"><WalletCards className="gold"/><h3 className="font-semibold mt-4">One wallet view</h3><p className="muted text-sm mt-3">Deposits, withdrawals, balances, and transaction status in one organized place.</p></div><div className="card p-6"><ShieldCheck className="gold"/><h3 className="font-semibold mt-4">Account controls</h3><p className="muted text-sm mt-3">Security settings, verification status, and transparent account controls.</p></div></div></section>
  <section className="max-w-7xl mx-auto px-5 md:px-6 pb-16"><div className="card p-8 md:p-12 flex flex-col md:flex-row justify-between gap-6 items-start md:items-center"><div><div className="gold text-xs font-semibold tracking-widest">READY WHEN YOU ARE</div><h2 className="text-3xl font-bold mt-3">Build your market view.</h2><p className="muted mt-3">Start with a clean account and explore TradingWorld at your own pace.</p></div><button className="primary" onClick={()=>go('register')}>Get started<ArrowUpRight size={16} className="inline ml-1"/></button></div></section>
</>}

/* ============ Dashboard ============ */
function Dashboard({user}){
  const{store}=useStore();useMarket();
  const myOrders=(store.orders||[]).filter(o=>String(o.uid)===String(user.id));
  const myTrades=(store.trades||[]).filter(t=>String(t.uid)===String(user.id));
  const open=myOrders.filter(o=>o.status==='open');
  const pnl=myTrades.reduce((a,t)=>a+Number(t.profit||0),0);
  const wins=myTrades.filter(t=>t.result==='win').length;
  return<>
    <div className="flex flex-wrap justify-between items-start gap-3"><div><div className="muted text-sm">Good to see you, trader</div><h1 className="text-3xl font-bold mt-1">Your overview</h1></div><span className="gold text-sm">UID {user.id}</span></div>
    {user.status!=='active'&&<div className="card p-5 mt-6 border-l-2 border-l-[#f0b90b]"><b>Pending System Verification — trading and swap inputs are held until the System activates UID {user.id}.</b></div>}
    <div className="grid md:grid-cols-4 gap-4 mt-6">
      <div className="card p-5"><span className="muted text-sm">Total balance</span><div className="text-2xl font-semibold mt-2">${Number(user.balance||0).toFixed(2)}</div><span className="muted text-xs">USDT</span></div>
      <div className="card p-5"><span className="muted text-sm">Total PNL</span><div className={`text-2xl font-semibold mt-2 ${pnl>=0?'up':'down'}`}>{pnl>=0?'+':''}${pnl.toFixed(2)}</div><span className="muted text-xs">{myTrades.length} trades</span></div>
      <div className="card p-5"><span className="muted text-sm">Open positions</span><div className="text-2xl font-semibold mt-2">{open.length}</div><span className="muted text-xs">at risk ${open.reduce((a,o)=>a+Number(o.amount),0).toFixed(2)}</span></div>
      <div className="card p-5"><span className="muted text-sm">Win rate</span><div className="text-2xl font-semibold mt-2">{myTrades.length?Math.round(wins/myTrades.length*100):0}%</div><span className="muted text-xs">status: <span className="gold">{user.status}</span></span></div>
    </div>
    <div className="grid lg:grid-cols-2 gap-4 mt-4">
      <div className="card p-5"><h3 className="font-semibold mb-3">Watchlist</h3>{['BTC','ETH','SOL','BNB','XRP'].map(c=>{const t=tickers[c];const ch=t?.change??0;return<div key={c} className="flex justify-between py-3 border-b border-[#2b3139] text-sm"><span>{c}/USDT</span><span>${fmtP(t?.price)}</span><span className={ch>=0?'up':'down'}>{ch>=0?'+':''}{ch.toFixed(2)}%</span></div>})}</div>
      <div className="card p-5"><h3 className="font-semibold mb-3">Open positions</h3>{open.length?open.map(o=><div key={o.id} className="flex justify-between py-3 border-b border-[#2b3139] text-sm"><span>{o.symbol} · {o.side}</span><span>${Number(o.amount).toFixed(2)}</span><span className="gold">{Math.max(0,Math.ceil((o.closeAt-Date.now())/1000))}s</span></div>):<span className="muted text-sm">No open positions.</span>}</div>
    </div>
    <div className="card p-5 mt-4"><h3 className="font-semibold mb-3">Recent trades</h3><div className="table-wrap">{myTrades.length?<table className="table"><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Amount</th><th>Result</th><th>PNL</th></tr></thead><tbody>{myTrades.slice(0,6).map(t=><tr key={t.id+t.closedAt}><td className="muted">{new Date(t.closedAt).toLocaleString('en-US')}</td><td><b>{t.symbol}</b></td><td>{t.side}</td><td>${Number(t.amount).toFixed(2)}</td><td className={t.result==='win'?'up':t.result==='loss'?'down':'muted'}>{t.result.toUpperCase()}</td><td className={Number(t.profit)>=0?'up':'down'}>{Number(t.profit)>=0?'+':''}{Number(t.profit||0).toFixed(2)}</td></tr>)}</tbody></table>:<span className="muted text-sm">No completed trades yet.</span>}</div></div>
  </>}

/* ============ Terminal ============ */
function ReceiptModal({trade,onClose,onDone}){if(!trade)return null;const win=Number(trade.profit)>0,draw=trade.result==='draw';
  return<Modal title={draw?'Trade settled — draw':win?'Trade settled — win':'Trade settled — loss'} onClose={onClose}>
    <div className="card2 p-4 text-sm space-y-2">
      <div className="flex justify-between"><span className="muted">Voucher</span><b className="gold">{trade.voucher}</b></div>
      <div className="flex justify-between"><span className="muted">Market / direction</span><b>{trade.symbol} · {trade.side}</b></div>
      <div className="flex justify-between"><span className="muted">Entry amount</span><b>${Number(trade.amount).toFixed(2)}</b></div>
      <div className="flex justify-between"><span className="muted">Duration / rate</span><b>{trade.duration}s · {Math.round(Number(trade.rate)*100)}%</b></div>
      <div className="flex justify-between"><span className="muted">Entry price</span><b>{trade.entryPrice?fmtP(trade.entryPrice):'—'}</b></div>
      <div className="flex justify-between"><span className="muted">Exit price</span><b>{trade.exitPrice!=null?fmtP(trade.exitPrice):'—'}</b></div>
      <div className="flex justify-between"><span className="muted">Settlement mode</span><b>{trade.settlementMode||'Market Dynamic'}</b></div>
      <div className="flex justify-between"><span className="muted">Profit / loss</span><b className={Number(trade.profit)>=0?'up':'down'}>{Number(trade.profit)>=0?'+':''}${Number(trade.profit||0).toFixed(2)}</b></div>
      <div className="flex justify-between"><span className="muted">Final credited</span><b className="gold">${Number(trade.finalCredit||trade.amount).toFixed(2)}</b></div>
      <div className="flex justify-between"><span className="muted">Opened</span><span>{new Date(trade.createdAt).toLocaleString('en-US')}</span></div>
      <div className="flex justify-between"><span className="muted">Closed</span><span>{new Date(trade.closedAt).toLocaleString('en-US')}</span></div>
    </div>
    <button className="primary w-full mt-4" onClick={onDone||onClose}>Done</button>
  </Modal>}
function Terminal({user,go}){
  useMarket();const{store}=useStore();
  const[symbol,setSymbol]=useState('BTC'),[amount,setAmount]=useState(''),[duration,setDuration]=useState(60),[status,setStatus]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[insufficient,setInsufficient]=useState(false),[showRisk,setShowRisk]=useState(null),[receipt,setReceipt]=useState(null),[tab,setTab]=useState('orders');
  const myOrders=(store.orders||[]).filter(o=>String(o.uid)===String(user.id));
  const open=myOrders.filter(o=>o.status==='open');
  const active=open[0];
  const myTrades=(store.trades||[]).filter(t=>String(t.uid)===String(user.id));
  const positions=(user.positions||[]).filter(p=>!myTrades.some(t=>t.id===p.orderId));
  const closedMarket=!marketOpen(symbol);
  const pending=user.status!=='active';
  useEffect(()=>{setStatus('');setErr('')},[symbol]);
  async function place(side){
    if(busy)return;const n=Number(amount);
    if(!n||n<=0){setErr('Enter a valid amount');return}
    if(closedMarket){setErr('Market Closed');return}
    if(pending){setErr('Account pending system verification');return}
    if(active){setErr('An order is already running');return}
    if(!localStorage.getItem('tradingworld_risk_ok')){setShowRisk({side});return}
    setBusy(true);setErr('');setStatus('');
    const r=await api({action:'createOrder',uid:user.id,symbol,side,amount:n,duration,entryPrice:priceOf(symbol)});
    setBusy(false);
    if(r.error){setStatus('');if(r.error==='Insufficient Balance')setInsufficient(true);else setErr(r.error)}
    else{setStatus(`Order opened — ${symbol} ${side} $${n.toFixed(2)} @ ${fmtP(r.order?.entryPrice)}`);setAmount('')}
  }
  async function confirmRisk(){localStorage.setItem('tradingworld_risk_ok','1');const side=showRisk?.side;setShowRisk(null);if(side)place(side)}
  return<>
    <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><div><h1 className="text-2xl font-bold">Terminal</h1><p className="muted text-sm">Live markets · candles · order flow</p></div><select className="input max-w-[170px]" value={symbol} onChange={e=>setSymbol(e.target.value)}>{ALL_MARKETS.map(c=><option key={c} value={c}>{c}/USDT{!COINS.includes(c)?' (Mon–Fri)':''}</option>)}</select></div>
    {closedMarket&&<div className="card2 p-3 mb-3 down font-semibold">Market Closed</div>}
    {pending&&<div className="card2 p-3 mb-3 gold">Pending System Verification — trading and swap inputs are held until the System activates UID {user.id}.</div>}
    <div className="grid xl:grid-cols-[1fr_300px] gap-4"><Chart symbol={symbol}/><OrderBook symbol={symbol}/></div>
    <div className="card p-4 mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><b>TradingWorld yield plans</b><span className="muted text-xs">Settlement rate applies to the actual result</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">{YIELDS.map(([d,r,label])=><button key={d} className={duration===d?'primary':'ghost'} onClick={()=>setDuration(d)} disabled={!!active}><div className="text-sm">{d}s</div><div className="font-semibold mt-1">{label}</div></button>)}</div></div>
    <div className="grid lg:grid-cols-2 gap-4 mt-4">
      <div className="card p-5"><b>Trade ticket</b>
        <div className="flex items-center justify-between mt-3 text-sm"><span className="muted">Available</span><b>${Number(user.balance||0).toFixed(2)} USDT</b></div>
        <input className="input mt-3" placeholder="Amount USDT" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={!!active||closedMarket||pending}/>
        <div className="grid grid-cols-2 gap-2 mt-3"><button className="primary" disabled={busy||!!active||closedMarket||pending} onClick={()=>place('UP')}><span className={busy?'hidden':''}>Buy / Up</span>{busy&&'Placing…'}</button><button className="ghost" disabled={busy||!!active||closedMarket||pending} onClick={()=>place('DOWN')}><span className={down_label(busy)}>Sell / Down</span></button></div>
        {active&&<div className="card2 p-3 mt-3"><div className="flex justify-between text-sm"><b className="gold">{active.symbol} · {active.side}</b><span>${Number(active.amount).toFixed(2)} @ {active.entryPrice?fmtP(active.entryPrice):'—'}</span></div><div className="flex justify-between mt-2 text-sm"><span className="muted">Settles in</span><b className="gold">{Math.max(0,Math.ceil((active.closeAt-Date.now())/1000))}s</b></div></div>}
        {status&&!err&&<div className="up text-sm mt-3">{status}</div>}
        {err&&<div className="down text-sm mt-3" role="alert">{err}</div>}
        <p className="muted text-xs mt-3">Rates: 60s→40% · 120s→60% · 180s→80% · 300s→100% of stake.</p>
      </div>
      <div className="card p-5"><b>Positions</b>{positions.length||active?<>
        {active&&<div className="card2 p-3 mt-3 flex justify-between text-sm"><span>{active.symbol} · {active.side}</span><span>${Number(active.amount).toFixed(2)}</span><span className="gold">open</span></div>}
        {positions.filter(p=>p.orderId!==active?.id).map(p=><div key={p.orderId} className="card2 p-3 mt-3 flex justify-between text-sm"><span>{p.symbol} · {p.side}</span><span>${Number(p.amount).toFixed(2)}</span><span className="gold">open</span></div>)}
      </>:<p className="muted text-sm mt-3">No open positions. Your ticket will appear here.</p>}</div>
    </div>
    <div className="card p-5 mt-4">
      <div className="flex gap-2 mb-3"><button className={tab==='orders'?'primary':'ghost'} onClick={()=>setTab('orders')}>Open orders</button><button className={tab==='history'?'primary':'ghost'} onClick={()=>setTab('history')}>Trade history</button></div>
      <div className="table-wrap">{tab==='orders'?(open.length?<table className="table"><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Amount</th><th>Entry</th><th>Rate</th><th>Settles</th></tr></thead><tbody>{open.map(o=><tr key={o.id}><td className="muted">{new Date(o.createdAt).toLocaleTimeString('en-US')}</td><td><b>{o.symbol}</b></td><td>{o.side}</td><td>${Number(o.amount).toFixed(2)}</td><td>{o.entryPrice?fmtP(o.entryPrice):'—'}</td><td>{Math.round(o.rate*100)}%</td><td className="gold">{Math.max(0,Math.ceil((o.closeAt-Date.now())/1000))}s</td></tr>)}</tbody></table>:<p className="muted text-sm">No open orders.</p>)
      :(myTrades.length?<table className="table"><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Amount</th><th>Entry</th><th>Exit</th><th>Mode</th><th>Result</th><th>PNL</th><th>Voucher</th></tr></thead><tbody>{myTrades.map(t=><tr key={t.id}><td className="muted">{new Date(t.closedAt).toLocaleString('en-US')}</td><td><b>{t.symbol}</b></td><td>{t.side}</td><td>${Number(t.amount).toFixed(2)}</td><td>{t.entryPrice?fmtP(t.entryPrice):'—'}</td><td>{t.exitPrice!=null?fmtP(t.exitPrice):'—'}</td><td className="muted">{t.settlementMode||'—'}</td><td className={t.result==='win'?'up':t.result==='loss'?'down':'muted'}>{t.result?.toUpperCase()}</td><td className={Number(t.profit)>=0?'up':'down'}>{Number(t.profit)>=0?'+':''}{Number(t.profit||0).toFixed(2)}</td><td><button className="ghost text-xs" onClick={()=>setReceipt(t)}>View</button></td></tr>)}</tbody></table>:<p className="muted text-sm">No completed trades yet.</p>)}</div>
    </div>
    <div className="grid md:grid-cols-2 gap-4 mt-4"><MarketTrades symbol={symbol}/><Depth symbol={symbol}/></div>
    {insufficient&&<Modal title="Insufficient Balance" onClose={()=>setInsufficient(false)}><p className="muted">Please fund your account via the Deposit node configuration first.</p><button className="primary w-full mt-4" onClick={()=>{setInsufficient(false);go('wallet')}}>Go to Wallet</button></Modal>}
    {showRisk&&<Modal title="Risk warning" onClose={()=>setShowRisk(null)}><ul className="text-sm space-y-2 muted list-disc pl-5"><li>Cryptocurrency markets are highly volatile.</li><li>You may suffer partial or total loss of your funds.</li><li>Nothing on TradingWorld is investment advice.</li><li>You are solely responsible for your trading decisions.</li></ul><div className="flex gap-2 mt-4"><button className="ghost flex-1" onClick={()=>setShowRisk(null)}>Cancel</button><button className="primary flex-1" onClick={confirmRisk}>I understand the risks</button></div></Modal>}
    {receipt&&<ReceiptModal trade={receipt} onClose={()=>setReceipt(null)} onDone={()=>setReceipt(null)}/>}
  </>}
function down_label(busy){return busy?'hidden':''}

/* ============ Wallet ============ */
function Wallet({user,go}){
  const{store}=useStore();
  const[copied,setCopied]=useState(''),[copyErr,setCopyErr]=useState(''),[asset,setAsset]=useState('USDT'),[amount,setAmount]=useState(''),[txid,setTxid]=useState(''),[withdraw,setWithdraw]=useState({asset:'USDT',amount:'',address:'',code:''}),[notice,setNotice]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[insufficient,setInsufficient]=useState(false);
  const cfg=store.cfg||{addresses:{}};const addrs=cfg.addresses||{};
  const myDeps=(store.deposits||[]).filter(x=>String(x.uid)===String(user.id));
  const myWds=(store.withdrawals||[]).filter(x=>String(x.uid)===String(user.id));
  async function deposit(){setErr('');setNotice('');if(String(txid).length<8){setErr('TxID must be at least 8 characters');return}if(Number(amount)<=0){setErr('Enter a valid amount');return}setBusy(true);const r=await api({action:'submitDeposit',uid:user.id,asset,amount:Number(amount),txid});setBusy(false);if(r.error){setErr(r.error);return}setNotice('Deposit submitted for review');setAmount('');setTxid('')}
  async function doWithdraw(){setErr('');setNotice('');const n=Number(withdraw.amount);const avail=withdraw.asset==='USDT'?Number(user.balance||0):Number(user.assets?.[withdraw.asset]||0);if(n<=0){setErr('Enter a valid amount');return}if(n>avail){setInsufficient(true);return}if(!withdraw.address||withdraw.address.length<8){setErr('Enter a valid destination address');return}if(user.twofa&&String(withdraw.code||'').length<6){setErr('Enter your 2FA code (6+ characters)');return}setBusy(true);const r=await api({action:'submitWithdrawal',uid:user.id,asset:withdraw.asset,amount:n,address:withdraw.address,txid:withdraw.code||''});setBusy(false);if(r.error){if(r.error==='Insufficient Balance')setInsufficient(true);else setErr(r.error);return}setNotice('Withdrawal submitted — Pending review');setWithdraw({asset:'USDT',amount:'',address:'',code:''})}
  return<>
    <h1 className="text-3xl font-bold">Wallet</h1>
    <div className="card p-6 mt-6"><div className="muted">Total balance</div><div className="text-4xl mt-2">${Number(user.balance||0).toFixed(2)} <span className="text-base muted">USDT</span></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">{['USDT','BTC','ETH','XRP','TON'].map(a=><div key={a} className="card2 p-3 text-sm"><span className="muted text-xs">{a}</span><b className="block mt-1">{a==='USDT'?Number(user.balance||0).toFixed(2):Number(user.assets?.[a]||0).toFixed(6)}</b></div>)}</div></div>
    <div className="grid lg:grid-cols-2 gap-4 mt-4">
      <div className="card p-5"><h3 className="font-semibold">Deposit assets</h3>
        {['BTC','ETH','USDT','XRP','TON'].map(c=><div key={c} className="flex items-center gap-2 mt-3"><span className="w-12">{c}</span><input className="input" value={addrs[c]||'Not configured'} readOnly/><button className="ghost !px-3" title={`Copy ${c} address`} onClick={async e=>{if(!addrs[c])return;setCopyErr("");const ok=await copyText(addrs[c]);if(ok){setCopied(c)}else{setCopied("");setCopyErr(c);const inp=e.currentTarget.parentElement.querySelector("input");if(inp){inp.focus();inp.select()}}}}><Copy size={15}/></button></div>)}
        {copied&&<div className="up text-sm mt-3">Copied {copied} address to clipboard</div>}
        {copyErr&&<div className="down text-sm mt-3">Automatic copy was blocked by the browser. The {copyErr} address is now selected \u2014 press Ctrl+C (or long-press on mobile) to copy it.</div>}
        <div className="border-t border-[#2b3139] mt-5 pt-5"><b>Submit deposit</b>
          <div className="grid grid-cols-2 gap-2 mt-3"><select className="input" value={asset} onChange={e=>setAsset(e.target.value)}>{['BTC','ETH','USDT','XRP','TON'].map(x=><option key={x}>{x}</option>)}</select><input className="input" placeholder="Amount" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
          <input className="input mt-3" placeholder="TxID (min 8 characters)" value={txid} onChange={e=>setTxid(e.target.value)}/>
          <button className={`primary mt-3 w-full ${busy?'btn-loading':''}`} onClick={deposit} disabled={busy}>Submit deposit</button>
        </div></div>
      <div className="card p-5"><h3 className="font-semibold">Withdraw</h3>
        <select className="input mt-4" value={withdraw.asset} onChange={e=>setWithdraw({...withdraw,asset:e.target.value})}>{['USDT','BTC','ETH','XRP','TON'].map(x=><option key={x}>{x}</option>)}</select>
        <input className="input mt-3" placeholder="Amount" type="number" min="0" step="0.01" value={withdraw.amount} onChange={e=>setWithdraw({...withdraw,amount:e.target.value})}/>
        <div className="muted text-xs mt-2">Available: {withdraw.asset==='USDT'?Number(user.balance||0).toFixed(2):Number(user.assets?.[withdraw.asset]||0).toFixed(6)} {withdraw.asset}</div>
        <input className="input mt-3" placeholder="Destination address" value={withdraw.address} onChange={e=>setWithdraw({...withdraw,address:e.target.value})}/>
        <input className="input mt-3" placeholder={user.twofa?'2FA code (required)':'2FA code (optional)'} value={withdraw.code} onChange={e=>setWithdraw({...withdraw,code:e.target.value})}/>
        <button className={`primary w-full mt-4 ${busy?'btn-loading':''}`} onClick={doWithdraw} disabled={busy}>Submit withdrawal</button>
      </div>
    </div>
    <div className="card p-5 mt-4"><h3 className="font-semibold">Transaction history</h3>
      <div className="table-wrap">{[...myDeps,...myWds].length?<table className="table"><thead><tr><th>Type</th><th>Asset</th><th>Amount</th><th>Status</th><th>Detail</th><th>Time</th></tr></thead><tbody>{[...myDeps.map(d=>({...d,type:'Deposit'})),...myWds.map(w=>({...w,type:'Withdrawal'}))].sort((a,b)=>b.createdAt-a.createdAt).map(x=><tr key={x.type+x.id}><td>{x.type}</td><td><b>{x.asset}</b></td><td>{Number(x.amount).toFixed(2)}</td><td><span className={`badge ${x.status==='approved'?'badge-ok':x.status==='rejected'?'badge-err':'badge-muted'}`}>{x.status}</span></td><td className="muted">{(x.txid||x.address||'').slice(0,22)}</td><td className="muted">{new Date(x.createdAt).toLocaleString('en-US')}</td></tr>)}</tbody></table>:<p className="muted text-sm">No transactions yet.</p>}</div></div>
    {notice&&<Toast msg={notice}/>}
    {err&&<Toast msg={err} kind="error"/>}
    {insufficient&&<Modal title="Insufficient Balance" onClose={()=>setInsufficient(false)}><p className="muted">Please fund your account via the Deposit node configuration first.</p><button className="primary w-full mt-4" onClick={()=>setInsufficient(false)}>Close</button></Modal>}
  </>}

/* ============ Swap ============ */
function Swap({user}){
  useMarket();const[from,setFrom]=useState('USDT'),[to,setTo]=useState('BTC'),[amount,setAmount]=useState(''),[msg,setMsg]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[insufficient,setInsufficient]=useState(false),[done,setDone]=useState(null);
  const pf=from==='USDT'?1:priceOf(from);const pt=to==='USDT'?1:priceOf(to);
  const recv=pf&&pt&&Number(amount)>0?(Number(amount)*pf/pt):0;
  const avail=from==='USDT'?Number(user.balance||0):Number(user.assets?.[from]||0);
  const pending=user.status!=='active';
  async function doSwap(){setErr('');setMsg('');setDone(null);const n=Number(amount);if(!n||n<=0){setErr('Enter a valid amount');return}if(from===to){setErr('Choose two different assets');return}if(n>avail){setInsufficient(true);return}if(pending){setErr('Account pending system verification');return}
    setBusy(true);
    const assets={...(user.assets||{})};let balance=Number(user.balance||0);
    if(from==='USDT')balance=Number((balance-n).toFixed(2));else assets[from]=Number((Number(assets[from]||0)-n).toFixed(8));
    if(to==='USDT')balance=Number((balance+recv).toFixed(2));else assets[to]=Number((Number(assets[to]||0)+recv).toFixed(8));
    const r=await api({action:'swap',uid:user.id,from,to,amount:n});
    setBusy(false);
    if(r.error){setErr(r.error);return}
    setDone({from,to,n,recv});setMsg(`Swapped ${n} ${from} → ${recv.toFixed(6)} ${to}`);setAmount('')}
  return<>
    <h1 className="text-3xl font-bold">Swap</h1><p className="muted text-sm mt-2">Convert between USDT and listed assets at live market prices.</p>
    {pending&&<div className="card2 p-3 mt-4 gold">Pending System Verification — trading and swap inputs are held until the System activates UID {user.id}.</div>}
    <div className="grid lg:grid-cols-2 gap-4 mt-6">
      <div className="card p-5"><b>Swap assets</b>
        <div className="grid grid-cols-2 gap-2 mt-4"><select className="input" value={from} onChange={e=>setFrom(e.target.value)}>{['USDT',...COINS].map(c=><option key={c}>{c}</option>)}</select><select className="input" value={to} onChange={e=>setTo(e.target.value)}>{['USDT',...COINS].map(c=><option key={c}>{c}</option>)}</select></div>
        <input className="input mt-3" placeholder={`Amount (${from})`} type="number" min="0" step="any" value={amount} onChange={e=>setAmount(e.target.value)} disabled={pending}/>
        <div className="muted text-xs mt-2">Available: {avail.toFixed(from==='USDT'?2:6)} {from} · Rate: 1 {from} ≈ {(pf/pt).toFixed(6)} {to}</div>
        <div className="card2 p-3 mt-3 text-sm"><span className="muted">You receive ≈ </span><b className="gold">{recv.toFixed(6)} {to}</b></div>
        <button className={`primary w-full mt-4 ${busy?'btn-loading':''}`} onClick={doSwap} disabled={busy||pending}>Review swap</button>
        {msg&&<div className="up text-sm mt-3">{msg}</div>}{err&&<div className="down text-sm mt-3" role="alert">{err}</div>}
      </div>
      <div className="card p-5"><b>Live reference prices</b>{[from,to].filter(a=>a!=='USDT').map(a=>{const t=tickers[a];return<div key={a} className="flex justify-between py-3 border-b border-[#2b3139] text-sm"><span>{a}/USDT</span><b>${fmtP(t?.price)}</b><span className={(t?.change??0)>=0?'up':'down'}>{(t?.change??0).toFixed(2)}%</span></div>})}{from==='USDT'&&to==='USDT'&&<p className="muted text-sm mt-3">Select assets to see prices.</p>}
        {done&&<div className="card2 p-4 mt-4 text-sm"><b className="gold">Swap executed</b><div className="flex justify-between mt-2"><span className="muted">Sent</span><b>{done.n} {done.from}</b></div><div className="flex justify-between mt-1"><span className="muted">Received</span><b className="up">{done.recv.toFixed(6)} {done.to}</b></div></div>}
      </div>
    </div>
    {insufficient&&<Modal title="Insufficient Balance" onClose={()=>setInsufficient(false)}><p className="muted">Please fund your account via the Deposit node configuration first.</p><button className="primary w-full mt-4" onClick={()=>setInsufficient(false)}>Close</button></Modal>}
  </>}

/* ============ Settings / KYC / 2FA ============ */

/* ---------- Web3 wallet linking ---------- */
const shortAddr=a=>{a=String(a||'');return a.length>16?a.slice(0,8)+'…'+a.slice(-6):a};
function evmProvider(){return typeof window!=='undefined'?window.ethereum:null}
function tronProvider(){if(typeof window==='undefined')return null;return window.tronLink?.tronWeb||window.tronWeb||null}

function WalletConnectCard({user,onChange}){
  const[busy,setBusy]=useState('');const[err,setErr]=useState('');const[ok,setOk]=useState('');
  const w3=user.web3;

  async function connect(chain){
    setErr('');setOk('');setBusy(chain);
    try{
      let address,signature;
      if(chain==='evm'){
        const p=evmProvider();
        if(!p)throw new Error('No EVM wallet found. Install MetaMask, or open TradingWorld inside the Trust Wallet / OKX / Binance Wallet browser.');
        const accts=await p.request({method:'eth_requestAccounts'});
        address=accts?.[0];
        if(!address)throw new Error('No account was shared by the wallet');
        const c=await api({action:'walletChallenge',uid:user.id,chain:'evm'});
        if(c.error)throw new Error(c.error);
        signature=await p.request({method:'personal_sign',params:[c.message,address]});
      }else{
        const t=tronProvider();
        if(!t)throw new Error('TronLink not found. Install the TronLink extension, or open TradingWorld inside the TronLink app browser.');
        if(window.tronLink?.request)await window.tronLink.request({method:'tron_requestAccounts'});
        address=t.defaultAddress?.base58;
        if(!address)throw new Error('Unlock TronLink and try again');
        const c=await api({action:'walletChallenge',uid:user.id,chain:'tron'});
        if(c.error)throw new Error(c.error);
        signature=await t.trx.signMessageV2(c.message);
      }
      const r=await api({action:'walletConnect',uid:user.id,address,signature});
      if(r.error)throw new Error(r.error);
      setOk('Wallet verified and linked');onChange&&onChange();
    }catch(e){setErr(e?.message||'Could not connect the wallet')}
    finally{setBusy('')}
  }

  async function disconnect(){
    setErr('');setOk('');setBusy('off');
    const r=await api({action:'walletDisconnect',uid:user.id});
    setBusy('');
    if(r.error)setErr(r.error);else{setOk('Wallet disconnected');onChange&&onChange()}
  }

  return<div className="card p-5 mt-6" data-sec="web3">
    <div className="flex items-center justify-between gap-2">
      <b>Web3 wallet</b>
      {w3?<span className="badge badge-ok">{w3.chain==='tron'?'TRON':'EVM'} · linked</span>:<span className="badge badge-muted">not linked</span>}
    </div>

    {w3?<>
      <p className="muted text-sm mt-2">This wallet stays linked to your account until you disconnect it — signing out or changing device will not unlink it.</p>
      <div className="card2 p-3 mt-3">
        <div className="muted text-xs">{w3.chain==='tron'?'TRON (TRC20)':'EVM (ERC20 / BEP20)'} address</div>
        <div className="font-mono text-sm break-all mt-1">{w3.address}</div>
        <div className="muted text-xs mt-2">Linked {new Date(w3.connectedAt).toLocaleString()}</div>
      </div>
      <button className={`ghost w-full mt-3 ${busy==='off'?'btn-loading':''}`} onClick={disconnect} disabled={!!busy}>Disconnect wallet</button>
    </>:<>
      <p className="muted text-sm mt-2">Link your own wallet to TradingWorld. You will be asked to sign a short message — this proves the wallet is yours. It costs no gas, moves no funds and gives us no spending permission.</p>
      <div className="grid sm:grid-cols-2 gap-2 mt-4">
        <button className={`primary ${busy==='evm'?'btn-loading':''}`} onClick={()=>connect('evm')} disabled={!!busy}>Connect EVM wallet</button>
        <button className={`ghost ${busy==='tron'?'btn-loading':''}`} onClick={()=>connect('tron')} disabled={!!busy}>Connect TronLink</button>
      </div>
      <p className="muted text-xs mt-3">EVM covers MetaMask, Trust Wallet, OKX and Binance Wallet. Use TronLink for USDT-TRC20.</p>
    </>}

    {err&&<p className="down text-sm mt-3">{err}</p>}
    {ok&&<p className="up text-sm mt-3">{ok}</p>}
  </div>;
}

function SettingsPage({user}){
  const[name,setName]=useState(user.displayName||''),[tz,setTz]=useState(user.timezone||'UTC'),[alerts,setAlerts]=useState(user.emailAlerts!==false),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  async function save(){setBusy(true);setMsg('');const r=await api({action:'saveUser',user:{...user,displayName:name,timezone:tz,emailAlerts:alerts,settingsSavedAt:Date.now()}});setBusy(false);setMsg(r.error?r.error:'Settings saved successfully')}
  return<div className="max-w-xl"><h1 className="text-3xl font-bold">Settings</h1><p className="muted mt-2 text-sm">Preferences persist to your TradingWorld profile.</p>
    <WalletConnectCard user={user} onChange={()=>{}}/>
    <div className="card p-5 mt-6"><b>Account settings</b>
      <label className="muted text-xs mt-4 block">Display name</label><input className="input mt-1" value={name} onChange={e=>setName(e.target.value)} placeholder="Display name"/>
      <label className="muted text-xs mt-4 block">Timezone</label><select className="input mt-1" value={tz} onChange={e=>setTz(e.target.value)}>{['UTC','Asia/Rangoon','Asia/Singapore','Europe/London','America/New_York'].map(z=><option key={z}>{z}</option>)}</select>
      <label className="flex items-center gap-2 mt-4 text-sm"><input type="checkbox" checked={alerts} onChange={e=>setAlerts(e.target.checked)}/> Email me product updates</label>
      <button className={`primary w-full mt-5 ${busy?'btn-loading':''}`} onClick={save} disabled={busy}>Save settings</button>
      {msg&&<Toast msg={msg} kind={msg.includes('success')?'ok':'error'}/>}
    </div></div>}
function KycPage({user}){
  const[full,setFull]=useState(''),[country,setCountry]=useState(''),[idno,setIdno]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState('');
  const status=user.kyc||'Not submitted';
  async function submit(){setErr('');setMsg('');if(full.length<3||country.length<2||idno.length<4){setErr('Complete all fields (ID number 4+ characters)');return}setBusy(true);const r=await api({action:'updateKyc',uid:user.id,status:'pending'});await api({action:'saveUser',user:{...user,kyc:'pending',kycName:full,kycCountry:country,kycId:idno}});setBusy(false);if(r.error)setErr(r.error);else setMsg('KYC submitted for admin review')}
  return<div className="max-w-xl"><h1 className="text-3xl font-bold">KYC</h1><p className="muted mt-2 text-sm">Identity verification status and submission.</p>
    <div className="card p-5 mt-6"><div className="flex items-center justify-between"><b>Verification status</b><span className={`badge ${status==='approved'?'badge-ok':status==='rejected'?'badge-err':status==='pending'?'badge-warn':'badge-muted'}`}>{status}</span></div></div>
    {status==='Not submitted'||status==='rejected'?<div className="card p-5 mt-4"><b>Submit documents</b><p className="muted text-sm mt-2">Enter your identity details for review.</p>
      <input className="input mt-4" placeholder="Full legal name" value={full} onChange={e=>setFull(e.target.value)}/>
      <input className="input mt-3" placeholder="Country" value={country} onChange={e=>setCountry(e.target.value)}/>
      <input className="input mt-3" placeholder="ID / passport number" value={idno} onChange={e=>setIdno(e.target.value)}/>
      <button className={`primary w-full mt-4 ${busy?'btn-loading':''}`} onClick={submit} disabled={busy}>Start verification</button>
      {err&&<Toast msg={err} kind="error"/>}{msg&&<Toast msg={msg}/>}
    </div>:<div className="card p-5 mt-4"><p className="muted text-sm">Your submission is being reviewed{status==='approved'?' and has been approved':''}. Admin decisions appear here instantly.</p></div>}
  </div>}
function TwoFAPage({user}){
  const[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[code,setCode]=useState(''),[tgMsg,setTgMsg]=useState('');
  const on=!!user.twofa,linked=!!user.telegramLinked;
  async function toggle(next){setBusy(true);await api({action:'update2fa',uid:user.id,enabled:next});setBusy(false);setConfirm(false)}
  async function connectTelegram(){setBusy(true);setTgMsg('');const r=await api({action:'telegramCreateLink',uid:user.id});setBusy(false);if(r.error)setTgMsg(r.error);else if(r.deepLink){setTgMsg('Telegram opened. Tap Start in the bot; this page will update automatically.');window.open(r.deepLink,'_blank','noopener,noreferrer')}}
  async function disconnectTelegram(){setBusy(true);const r=await api({action:'telegramDisconnect',uid:user.id});setBusy(false);setTgMsg(r.error||'Telegram disconnected.')}
  return<div className="max-w-xl"><h1 className="text-3xl font-bold">2FA & Account Recovery</h1><p className="muted mt-2 text-sm">Protect withdrawals and recover a forgotten password through your connected Telegram bot.</p>
    <div className="card p-5 mt-6"><div className="flex items-center justify-between"><div><b>Authenticator</b><p className="muted text-sm mt-1">{on?'Enabled — withdrawals require a code.':'Disabled'}</p></div><span className={`badge ${on?'badge-ok':'badge-muted'}`}>{on?'Enabled':'Disabled'}</span></div>
      <div className="flex gap-2 mt-4">{on?<button className={`ghost flex-1 ${busy?'btn-loading':''}`} onClick={()=>setConfirm(true)} disabled={busy}>Disable 2FA</button>:<button className={`primary flex-1 ${busy?'btn-loading':''}`} onClick={()=>setConfirm(true)} disabled={busy}>Enable 2FA</button>}</div>
      {on&&<div className="card2 p-3 mt-4 text-sm"><span className="muted">Test your code</span><input className="input mt-2" placeholder="Enter any code to verify format" value={code} onChange={e=>setCode(e.target.value)}/>{code&&<div className={`text-xs mt-2 ${code.length>=6?'up':'down'}`}>{code.length>=6?'Valid format (6+ characters)':'Code must be at least 6 characters'}</div>}</div>}
    </div>
    <div className="card p-5 mt-4"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Send size={17} className="gold"/><b>Telegram recovery</b></div><p className="muted text-sm mt-1">Recovery codes are for TradingWorld only. We never request your Telegram login code.</p></div><span className={`badge ${linked?'badge-ok':'badge-muted'}`}>{linked?'Connected':'Not connected'}</span></div>
      {linked?<><div className="card2 p-3 mt-4 text-sm"><span className="muted">Connected account</span><div className="font-semibold mt-1">{user.telegramUsername?'@'+String(user.telegramUsername).replace(/^@/,''):'Telegram user'}</div><div className="muted text-xs mt-1">Linked {user.telegramLinkedAt?new Date(user.telegramLinkedAt).toLocaleString('en-US'):''}</div></div><button className="ghost w-full mt-4" onClick={disconnectTelegram} disabled={busy}>Disconnect Telegram</button></>
      :<button className={`primary w-full mt-4 ${busy?'btn-loading':''}`} onClick={connectTelegram} disabled={busy}>Connect Telegram Bot</button>}
      {tgMsg&&<div className={`text-sm mt-3 ${tgMsg.includes('not configured')||tgMsg.includes('error')?'down':'gold'}`}>{tgMsg}</div>}
    </div>
    {confirm&&<Modal title={on?'Disable 2FA?':'Enable 2FA?'} onClose={()=>setConfirm(false)}><p className="muted text-sm">{on?'Withdrawals will no longer require a 2FA code.':'You will need a 6+ character code for every withdrawal.'}</p><div className="flex gap-2 mt-4"><button className="ghost flex-1" onClick={()=>setConfirm(false)}>Cancel</button><button className="primary flex-1" onClick={()=>toggle(!on)}>{on?'Disable':'Enable'}</button></div></Modal>}
  </div>}


/* ============ AI tools ============ */
const TOOL_META={
  'ai-trade':{title:'AI Trade',strategies:['Trend Follow','Momentum','Mean Reversion','Breakout'],desc:'Configure an AI-assisted trading preference. Signals derive from live candles — no guaranteed profit.'},
  'ai-signals':{title:'AI Signals',strategies:['RSI Divergence','MA Cross','Volume Spike','Trend Continuation'],desc:'Live signal feed computed from real market data.'},
  'copy-trading':{title:'Copy Trading',strategies:['Mirror own strategy','Proportional copy','Fixed amount copy'],desc:'Allocate an amount to follow one of your saved strategies.'},
  'trading-bots':{title:'Trading Bots',strategies:['Scalper','Swing','Arbitrage Watch'],desc:'Run and supervise automated strategy sessions.'},
  'grid-bot':{title:'Grid Bot',strategies:['Neutral Grid','Long Grid','Short Grid'],desc:'Place layered grid levels around the live price.'},
  'dca-bot':{title:'DCA Bot',strategies:['Classic DCA','Smart DCA'],desc:'Schedule recurring buys with configurable amounts.'},
  'strategy-builder':{title:'Strategy Builder',strategies:['Custom'],desc:'Compose and save your own strategy rules.'},
  'price-alerts':{title:'Price Alerts',strategies:['Cross above','Cross below'],desc:'Alerts evaluate against live prices and persist.'},
};
function AiTool({page,user}){
  useMarket();const meta=TOOL_META[page];const title=meta.title;
  const[asset,setAsset]=useState('BTC'),[strategy,setStrategy]=useState(meta.strategies[0]),[amount,setAmount]=useState(''),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[err,setErr]=useState('');
  const bots=(user.bots||[]).filter(b=>b.kind===title);
  const running=bots.find(b=>b.status==='running');
  async function act(kind,bot){setBusy(true);setErr('');setMsg('');
    let r;
    if(kind==='start'){r=await api({action:'saveBot',uid:user.id,kind:title,symbol:asset,amount:Number(amount)||0,strategy});if(!r.error&&r.bot){r=await api({action:'updateBot',uid:user.id,botId:r.bot.id,patch:{status:'running',startedAt:Date.now()}})}}
    else if(kind==='pause')r=await api({action:'updateBot',uid:user.id,botId:bot.id,patch:{status:'paused',pausedAt:Date.now()}});
    else if(kind==='resume')r=await api({action:'updateBot',uid:user.id,botId:bot.id,patch:{status:'running',resumedAt:Date.now()}});
    else if(kind==='stop')r=await api({action:'updateBot',uid:user.id,botId:bot.id,patch:{status:'stopped',stoppedAt:Date.now()}});
    setBusy(false);setConfirm(null);
    if(r?.error)setErr(r.error);else setMsg(kind==='start'?'Strategy enabled and running':kind==='pause'?'Strategy paused':kind==='resume'?'Strategy resumed':'Strategy stopped');
  }
  return<div>
    <div className="flex flex-wrap justify-between items-start gap-2"><div><div className="muted text-sm">TradingWorld tools</div><h1 className="text-3xl font-bold mt-1">{title}</h1></div><span className="gold text-sm">UID {user.id}</span></div>
    <p className="muted text-sm mt-3 max-w-2xl">{meta.desc}</p>
    <div className="grid lg:grid-cols-2 gap-4 mt-6">
      <div className="card p-5"><b>Configuration</b>
        <label className="muted text-xs mt-4 block">Asset</label><select className="input mt-1" value={asset} onChange={e=>setAsset(e.target.value)} disabled={!!running}>{ALL_MARKETS.map(c=><option key={c}>{c}</option>)}</select>
        <label className="muted text-xs mt-3 block">Strategy</label><select className="input mt-1" value={strategy} onChange={e=>setStrategy(e.target.value)} disabled={!!running}>{meta.strategies.map(s=><option key={s}>{s}</option>)}</select>
        <label className="muted text-xs mt-3 block">Amount (USDT)</label><input className="input mt-1" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={!!running} placeholder="Allocation amount"/>
        <div className="flex gap-2 mt-4">
          {!running?<button className={`primary flex-1 ${busy?'btn-loading':''}`} disabled={busy} onClick={()=>setConfirm({kind:'start'})}><Play size={14} className="inline mr-1"/>Enable & run</button>
          :<><button className={`ghost flex-1 ${busy?'btn-loading':''}`} disabled={busy} onClick={()=>setConfirm({kind:'pause',bot:running})}><Pause size={14} className="inline mr-1"/>Pause</button><button className={`ghost flex-1 ${busy?'btn-loading':''}`} disabled={busy} onClick={()=>setConfirm({kind:'stop',bot:running})}><Square size={14} className="inline mr-1"/>Stop</button></>}
        </div>
        {msg&&<Toast msg={msg}/>}
        {err&&<Toast msg={err} kind="error"/>}
        <p className="muted text-xs mt-3"><AlertTriangle size={12} className="inline mr-1"/>AI tools analyze market data. They do not guarantee profit and are not investment advice.</p>
      </div>
      <div className="card p-5"><b>Strategy history</b>
        {bots.length?bots.map(b=><div key={b.id} className="card2 p-3 mt-3"><div className="flex justify-between text-sm"><span><b>{b.symbol}</b> · {b.strategy||meta.strategies[0]}</span><span className={`badge ${b.status==='running'?'badge-ok':b.status==='paused'?'badge-warn':'badge-muted'}`}>{b.status}</span></div><div className="flex justify-between mt-2 text-xs muted"><span>Amount: {Number(b.amount||0).toFixed(2)} USDT</span><span>{new Date(b.createdAt).toLocaleString('en-US')}</span></div>{b.status==='paused'&&<button className="ghost text-xs mt-2" onClick={()=>act('resume',b)}>Resume</button>}</div>):<p className="muted text-sm mt-3">No saved {title} strategies yet.</p>}
      </div>
    </div>
    {confirm&&<Modal title={`${confirm.kind==='start'?'Enable':'Confirm'} ${title}?`} onClose={()=>setConfirm(null)}><p className="muted text-sm">{confirm.kind==='start'?`Enable ${title} on ${asset} with ${strategy} strategy${Number(amount)?` and ${Number(amount).toFixed(2)} USDT allocation`:''}?`:`Confirm ${confirm.kind} of this strategy?`}</p><div className="flex gap-2 mt-4"><button className="ghost flex-1" onClick={()=>setConfirm(null)}>Cancel</button><button className="primary flex-1" onClick={()=>act(confirm.kind,confirm.bot)}>Confirm</button></div></Modal>}
  </div>}
function MarketScreener({user,go}){
  useMarket();const[q,setQ]=useState(''),[sort,setSort]=useState('change');
  const rows=ALL_MARKETS.map(s=>({s,price:tickers[s]?.price||FALLBACK[s]||0,change:tickers[s]?.change??0,open:marketOpen(s),high:tickers[s]?.high,low:tickers[s]?.low,volume:tickers[s]?.volume}));
  const filtered=rows.filter(r=>!q||r.s.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>sort==='change'?b.change-a.change:sort==='price'?b.price-a.price:a.s.localeCompare(b.s));
  return<div><div className="flex flex-wrap justify-between items-center gap-2"><div><div className="muted text-sm">TradingWorld tools</div><h1 className="text-3xl font-bold mt-1">Market Screener</h1></div><span className="gold text-sm">UID {user.id}</span></div>
    <div className="flex flex-wrap gap-2 mt-4"><input className="input max-w-xs" placeholder="Search markets" value={q} onChange={e=>setQ(e.target.value)}/><select className="input max-w-[180px]" value={sort} onChange={e=>setSort(e.target.value)}><option value="change">Sort: 24h change</option><option value="price">Sort: price</option><option value="name">Sort: name</option></select></div>
    <div className="card p-2 mt-4 table-wrap"><table className="table"><thead><tr><th>Market</th><th>Price</th><th>24h change</th><th>24h high</th><th>24h low</th><th>Volume</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.s}><td><b>{r.s}</b><span className="muted text-xs ml-2">/USDT</span></td><td>${fmtP(r.price)}</td><td className={r.change>=0?'up':'down'}>{r.change>=0?'+':''}{r.change.toFixed(2)}%</td><td className="up">{fmtP(r.high)}</td><td className="down">{fmtP(r.low)}</td><td>{fmt(r.volume)}</td><td>{r.open?<span className="badge badge-ok">Open</span>:<span className="badge badge-err">Market Closed</span>}</td><td><button className="ghost text-xs" onClick={()=>go('terminal')}>Trade</button></td></tr>)}</tbody></table></div></div>}
function PriceAlerts({user}){
  useMarket();const[asset,setAsset]=useState('BTC'),[cond,setCond]=useState('Cross above'),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState(''),[confirm,setConfirm]=useState(false);
  const alerts=(user.bots||[]).filter(b=>b.kind==='Price Alert');
  const evaluated=alerts.map(a=>{const p=priceOf(a.symbol);const t=Number(a.payload?.target||a.amount||0);const hit=a.status!=='triggered'&&t>0&&((a.strategy==='Cross above'&&p>=t)||(a.strategy==='Cross below'&&p<=t));return{...a,price:p,hit}});
  useEffect(()=>{evaluated.forEach(a=>{if(a.hit)api({action:'updateBot',uid:user.id,botId:a.id,patch:{status:'triggered',triggeredAt:Date.now(),triggerPrice:a.price}})})});
  async function add(){setErr('');setMsg('');const t=Number(target);if(!t||t<=0){setErr('Enter a valid target price');return}setBusy(true);const r=await api({action:'saveBot',uid:user.id,kind:'Price Alert',symbol:asset,amount:0,strategy:cond,payload:{target:t}});setBusy(false);setConfirm(false);if(r.error)setErr(r.error);else{setMsg('Alert saved and armed');setTarget('')}}
  return<div>
    <div className="flex flex-wrap justify-between items-start gap-2"><div><div className="muted text-sm">TradingWorld tools</div><h1 className="text-3xl font-bold mt-1">Price Alerts</h1></div><span className="gold text-sm">UID {user.id}</span></div>
    <div className="grid lg:grid-cols-2 gap-4 mt-6">
      <div className="card p-5"><b>New alert</b>
        <label className="muted text-xs mt-4 block">Asset</label><select className="input mt-1" value={asset} onChange={e=>setAsset(e.target.value)}>{ALL_MARKETS.map(c=><option key={c}>{c}</option>)}</select>
        <label className="muted text-xs mt-3 block">Condition</label><select className="input mt-1" value={cond} onChange={e=>setCond(e.target.value)}><option>Cross above</option><option>Cross below</option></select>
        <label className="muted text-xs mt-3 block">Target price (now {fmtP(priceOf(asset))})</label><input className="input mt-1" type="number" step="any" value={target} onChange={e=>setTarget(e.target.value)}/>
        <button className={`primary w-full mt-4 ${busy?'btn-loading':''}`} disabled={busy} onClick={()=>setConfirm(true)}><Plus size={14} className="inline mr-1"/>Add alert</button>
        {msg&&<Toast msg={msg}/>}{err&&<Toast msg={err} kind="error"/>}
      </div>
      <div className="card p-5"><b>Armed alerts</b>{evaluated.length?evaluated.map(a=><div key={a.id} className="card2 p-3 mt-3 flex justify-between text-sm"><span><b>{a.symbol}</b> {a.strategy} {fmtP(a.payload?.target)}</span><span className="muted">now {fmtP(a.price)}</span><span className={`badge ${a.status==='triggered'?'badge-ok':a.status==='paused'?'badge-warn':'badge-muted'}`}>{a.status==='triggered'?'Triggered':a.status}</span></div>):<p className="muted text-sm mt-3">No alerts yet.</p>}</div>
    </div>
    {confirm&&<Modal title="Add price alert?" onClose={()=>setConfirm(false)}><p className="muted text-sm">Alert me when {asset} {cond.toLowerCase()} {fmtP(Number(target))}?</p><div className="flex gap-2 mt-4"><button className="ghost flex-1" onClick={()=>setConfirm(false)}>Cancel</button><button className="primary flex-1" onClick={add}>Confirm</button></div></Modal>}
  </div>}
function AiInsight({user}){
  useMarket();const rows=COINS.map(s=>({s,change:tickers[s]?.change??0,volume:tickers[s]?.volume||0,price:tickers[s]?.price||FALLBACK[s]||0}));
  const gainers=[...rows].sort((a,b)=>b.change-a.change).slice(0,3);const losers=[...rows].sort((a,b)=>a.change-b.change).slice(0,3);
  const btc=candles['BTC']||[];const closes=btc.slice(-10).map(c=>c.c);const ma=closes.reduce((a,b)=>a+b,0)/(closes.length||1);const btcPrice=priceOf('BTC');const trend=btcPrice>ma?'above':'below';
  return<div>
    <div className="flex flex-wrap justify-between items-start gap-2"><div><div className="muted text-sm">TradingWorld tools</div><h1 className="text-3xl font-bold mt-1">AI Market Insight</h1></div><span className="gold text-sm">UID {user.id}</span></div>
    <p className="muted text-sm mt-3">Computed live from market data. Not investment advice.</p>
    <div className="grid md:grid-cols-3 gap-4 mt-6">
      <div className="card p-5"><b className="flex items-center gap-2"><TrendingUp size={16} className="up"/>Top gainers (24h)</b>{gainers.map(g=><div key={g.s} className="flex justify-between py-3 border-b border-[#2b3139] text-sm"><span>{g.s}</span><span className="up">+{g.change.toFixed(2)}%</span><span className="muted">{fmtP(g.price)}</span></div>)}</div>
      <div className="card p-5"><b className="flex items-center gap-2"><TrendingDown size={16} className="down"/>Top losers (24h)</b>{losers.map(g=><div key={g.s} className="flex justify-between py-3 border-b border-[#2b3139] text-sm"><span>{g.s}</span><span className="down">{g.change.toFixed(2)}%</span><span className="muted">{fmtP(g.price)}</span></div>)}</div>
      <div className="card p-5"><b className="flex items-center gap-2"><Activity size={16} className="gold"/>BTC structure</b><div className="mt-3 text-sm space-y-2"><div className="flex justify-between"><span className="muted">Price</span><b>{fmtP(btcPrice)}</b></div><div className="flex justify-between"><span className="muted">MA(10) 1m</span><b>{fmtP(ma)}</b></div><div className="flex justify-between"><span className="muted">Trend</span><b className={trend==='above'?'up':'down'}>Price {trend} MA10</b></div></div><p className="muted text-xs mt-3">Short-term structure from live 1-minute candles.</p></div>
    </div></div>}
function SmartPortfolio({user}){
  useMarket();const{store}=useStore();
  const assets=['USDT','BTC','ETH','XRP','TON'].map(a=>{const qty=a==='USDT'?Number(user.balance||0):Number(user.assets?.[a]||0);const val=a==='USDT'?qty:qty*priceOf(a);return{a,qty,val}});
  const total=assets.reduce((s,x)=>s+x.val,0);
  const myTrades=(store.trades||[]).filter(t=>String(t.uid)===String(user.id));
  const pnl=myTrades.reduce((a,t)=>a+Number(t.profit||0),0);
  return<div>
    <div className="flex flex-wrap justify-between items-start gap-2"><div><div className="muted text-sm">TradingWorld tools</div><h1 className="text-3xl font-bold mt-1">Smart Portfolio</h1></div><span className="gold text-sm">UID {user.id}</span></div>
    <div className="grid md:grid-cols-3 gap-4 mt-6">
      <div className="card p-5"><span className="muted text-sm">Estimated value</span><div className="text-3xl font-semibold mt-2 gold">${total.toFixed(2)}</div><span className="muted text-xs">live valuation</span></div>
      <div className="card p-5"><span className="muted text-sm">Realized PNL</span><div className={`text-3xl font-semibold mt-2 ${pnl>=0?'up':'down'}`}>{pnl>=0?'+':''}${pnl.toFixed(2)}</div><span className="muted text-xs">{myTrades.length} settled trades</span></div>
      <div className="card p-5"><span className="muted text-sm">Allocation</span>{total>0?assets.filter(x=>x.val>0).map(x=><div key={x.a} className="mt-2"><div className="flex justify-between text-xs"><span>{x.a}</span><span>{(x.val/total*100).toFixed(1)}%</span></div><div className="h-2 bg-[#181a20] rounded mt-1"><div className="h-2 rounded bg-[#f0b90b]" style={{width:`${x.val/total*100}%`}}/></div></div>):<p className="muted text-sm mt-2">Fund your wallet to build allocation.</p>}</div>
    </div>
    <div className="card p-5 mt-4"><b>Holdings</b><div className="table-wrap mt-3"><table className="table"><thead><tr><th>Asset</th><th>Quantity</th><th>Price</th><th>Value</th></tr></thead><tbody>{assets.map(x=><tr key={x.a}><td><b>{x.a}</b></td><td>{x.qty.toFixed(x.a==='USDT'?2:6)}</td><td>{x.a==='USDT'?'$1.00':'$'+fmtP(priceOf(x.a))}</td><td>${x.val.toFixed(2)}</td></tr>)}</tbody></table></div></div>
  </div>}
function RiskMonitor({user}){
  const{store}=useStore();useMarket();
  const myOrders=(store.orders||[]).filter(o=>String(o.uid)===String(user.id));
  const open=myOrders.filter(o=>o.status==='open');
  const myTrades=(store.trades||[]).filter(t=>String(t.uid)===String(user.id));
  const atRisk=open.reduce((a,o)=>a+Number(o.amount),0);const bal=Number(user.balance||0);
  const usage=bal+atRisk>0?atRisk/(bal+atRisk)*100:0;
  const wins=myTrades.filter(t=>t.result==='win').length;const losses=myTrades.filter(t=>t.result==='loss').length;
  const worst=myTrades.reduce((w,t)=>Math.min(w,Number(t.profit||0)),0);
  return<div>
    <div className="flex flex-wrap justify-between items-start gap-2"><div><div className="muted text-sm">TradingWorld tools</div><h1 className="text-3xl font-bold mt-1">Risk Monitor</h1></div><span className="gold text-sm">UID {user.id}</span></div>
    <div className="grid md:grid-cols-4 gap-4 mt-6">
      <div className="card p-5"><span className="muted text-sm">Capital at risk</span><div className="text-2xl font-semibold mt-2 down">${atRisk.toFixed(2)}</div><span className="muted text-xs">{open.length} open positions</span></div>
      <div className="card p-5"><span className="muted text-sm">Risk usage</span><div className="text-2xl font-semibold mt-2" style={{color:usage>60?'#f6465d':usage>30?'#f0b90b':'#0ecb81'}}>{usage.toFixed(1)}%</div><div className="h-2 bg-[#181a20] rounded mt-2"><div className="h-2 rounded" style={{width:`${Math.min(100,usage)}%`,background:usage>60?'#f6465d':'#f0b90b'}}/></div></div>
      <div className="card p-5"><span className="muted text-sm">Win / loss</span><div className="text-2xl font-semibold mt-2"><span className="up">{wins}</span> / <span className="down">{losses}</span></div><span className="muted text-xs">settled trades</span></div>
      <div className="card p-5"><span className="muted text-sm">Worst result</span><div className="text-2xl font-semibold mt-2 down">${worst.toFixed(2)}</div><span className="muted text-xs">across history</span></div>
    </div>
    <div className="card p-5 mt-4"><b>Open exposure</b>{open.length?<div className="table-wrap mt-3"><table className="table"><thead><tr><th>Market</th><th>Side</th><th>Amount</th><th>Entry</th><th>Current</th><th>Settles</th></tr></thead><tbody>{open.map(o=><tr key={o.id}><td><b>{o.symbol}</b></td><td>{o.side}</td><td>${Number(o.amount).toFixed(2)}</td><td>{o.entryPrice?fmtP(o.entryPrice):'—'}</td><td>{fmtP(priceOf(o.symbol))}</td><td className="gold">{Math.max(0,Math.ceil((o.closeAt-Date.now())/1000))}s</td></tr>)}</tbody></table></div>:<p className="muted text-sm mt-3">No open exposure.</p>}<p className="muted text-xs mt-3">Risk figures reflect your real ledger state. Trading involves partial or total loss risk.</p></div>
  </div>}

/* ============ App ============ */
const NAV=[['dashboard','Overview',HomeIcon],['terminal','Terminal',BarChart3],['swap','Swap',RefreshCw],['wallet','Wallet',WalletIcon],['settings','Settings',Settings],['kyc','KYC',ShieldCheck],['2fa','2FA',KeyRound],['support','Support',Headphones],['ai-trade','AI Trade',Bot],['ai-signals','AI Signals',Zap],['ai-insight','AI Market Insight',Info],['copy-trading','Copy Trading',Users],['trading-bots','Trading Bots',Bot],['grid-bot','Grid Bot',BarChart3],['dca-bot','DCA Bot',WalletCards],['market-screener','Market Screener',Search],['price-alerts','Price Alerts',Bell],['smart-portfolio','Smart Portfolio',WalletCards],['strategy-builder','Strategy Builder',Target],['risk-monitor','Risk Monitor',ShieldCheck]];
const AI_PAGES=Object.keys(TOOL_META);
export default function App(){
  const[page,setPage]=useState(()=>{try{return JSON.parse(localStorage.getItem('tradingworld_user')||'null')?'dashboard':'home'}catch{return 'home'}});
  const[user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('tradingworld_user')||'null')}catch{return null}});
  const[store,setStore]=useState({users:[],orders:[],trades:[],deposits:[],withdrawals:[],cfg:{addresses:{}},audit:[],support:[],callbacks:[]});
  const[mobile,setMobile]=useState(false);const[receipt,setReceipt]=useState(null);const[chatOpen,setChatOpen]=useState(false);
  useEffect(()=>{startEngine()},[]);
  useEffect(()=>{if(!user)return;const beat=setInterval(()=>api({action:'heartbeat',id:user.id}),10000);return()=>clearInterval(beat)},[user?.id]);
  useEffect(()=>{if(!user)return;let alive=true;
    const poll=async()=>{try{const d=await getStore();if(!alive)return;setStore(d);
      const fresh=d.user||d.users?.find(x=>String(x.id)===String(user.id));
      if(fresh){setUser(x=>{const next={...x,...fresh};localStorage.setItem('tradingworld_user',JSON.stringify(next));return next})}
      const mine=(d.orders||[]).filter(o=>String(o.uid)===String(user.id)&&o.status==='open'&&o.closeAt<=Date.now());
      if(mine.length){const o=mine[0];const r=await api({action:'closeOrder',orderId:o.id,exitPrice:priceOf(o.symbol)});if(r.trade)setReceipt(r.trade)}
    }catch{}};
    poll();const t=setInterval(poll,2000);return()=>{alive=false;clearInterval(t)}},[user?.id]);
  const go=p=>{setPage(p);setMobile(false);window.scrollTo(0,0)};
  if(!user&&['login','register'].includes(page))return<StoreCtx.Provider value={{store}}><><header className="h-16 border-b border-[#2b3139] px-5 flex items-center"><Logo/></header><Auth mode={page} setMode={setPage} onAuth={u=>{localStorage.setItem('tradingworld_user',JSON.stringify(u));setUser(u);setPage('dashboard')}}/></></StoreCtx.Provider>;
  const known=['home',...NAV.map(n=>n[0])];
  const pageId=known.includes(page)?page:'home';
  return<StoreCtx.Provider value={{store}}><div className="min-h-screen flex flex-col">
    <div className="app-bg" aria-hidden="true"><BlockchainBackdrop dim/><div className="app-bg-glow"/>
      <div className="app-coins">
        <Coin3D kind="ETH" app pos={['6%','22%']} delay={0}/>
        <Coin3D kind="BTC" app pos={['88%','30%']} delay={1.3}/>
        <Coin3D kind="USDT" app pos={['82%','74%']} delay={2.2}/>
        <Coin3D kind="TON" app pos={['9%','68%']} delay={0.7}/>
      </div>
    </div>
    <header className="h-[68px] border-b border-[#2b3139] px-4 md:px-6 flex items-center justify-between shrink-0 relative z-10">
      <div className="flex items-center gap-3">{user&&<button className="md:hidden ghost !p-2" aria-label="Menu" onClick={()=>setMobile(!mobile)}>{mobile?<X size={18}/>:<Menu size={18}/>}</button>}<Logo/></div>
      <div className="flex items-center gap-3">{user?<>
        <span className="muted text-xs sm:text-sm hidden sm:block">Balance ${Number(user.balance||0).toFixed(2)}</span>
        <button className="ghost text-sm" onClick={async()=>{await api({action:'logout',id:user.id});localStorage.removeItem('tradingworld_user');localStorage.removeItem('tw_token');setUser(null);setPage('home')}}><LogOut size={15} className="inline mr-1"/>Log out</button></>
        :<><button className="muted text-sm" onClick={()=>setPage('login')}>Log in</button><button className="primary text-sm" onClick={()=>setPage('register')}>Get started</button></>}
      </div>
    </header>
    <div className="flex-1 flex relative z-10">
      {user&&<aside className={`sidebar desktop-only w-60 shrink-0 border-r border-[#2b3139] p-4 ${mobile?'mobile-open':''}`} style={mobile?{}:{display:'block'}}>
        {NAV.map(([id,label,I])=><button key={id} onClick={()=>go(id)} className={`w-full flex gap-3 items-center p-3 rounded-lg mb-1 text-left text-sm ${page===id?'bg-[#181a20] gold font-semibold':'muted hover:text-[#eaecef]'}`}><I size={17}/>{label}</button>)}
      </aside>}
      <main className={`flex-1 min-w-0 p-4 md:p-7 ${user&&pageId!=='home'?'max-w-[1500px]':''} ${mobile?'overflow-hidden':''}`}>
        {!user?<HomePage go={go}/>:
        pageId==='home'?<Dashboard user={user}/>:
        pageId==='terminal'?<Terminal user={user} go={go}/>:
        pageId==='wallet'?<Wallet user={user} go={go}/>:
        pageId==='swap'?<Swap user={user}/>:
        pageId==='settings'?<SettingsPage user={user}/>:
        pageId==='kyc'?<KycPage user={user}/>:
        pageId==='2fa'?<TwoFAPage user={user}/>:
        pageId==='support'?<SupportPage user={user}/>:
        pageId==='market-screener'?<MarketScreener user={user} go={go}/>:
        pageId==='price-alerts'?<PriceAlerts user={user}/>:
        pageId==='ai-insight'?<AiInsight user={user}/>:
        pageId==='smart-portfolio'?<SmartPortfolio user={user}/>:
        pageId==='risk-monitor'?<RiskMonitor user={user}/>:
        AI_PAGES.includes(pageId)?<AiTool page={pageId} user={user}/>:
        <Dashboard user={user}/>}
      </main>
    </div>
    <footer className="border-t border-[#2b3139] px-6 py-5 text-xs muted text-center relative z-10">TradingWorld © 2026 · Cryptocurrency trading is highly volatile. Digital assets may result in partial or total loss of funds. Trade at your own risk.</footer>
    {user&&<nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-[#0b0e11] border-t border-[#2b3139] justify-around py-2 z-30 md:hidden">
      {[['dashboard','Home',HomeIcon],['terminal','Trade',BarChart3],['wallet','Wallet',WalletIcon],['more','More',MoreHorizontal]].map(([id,label,I])=><button key={id} onClick={()=>id==='more'?setMobile(!mobile):go(id)} className="text-xs muted flex flex-col items-center gap-1 px-3"><I size={19}/>{label}</button>)}
    </nav>}
    {user&&pageId!=='support'&&<div className="hidden md:block fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {chatOpen&&<div className="mb-3 shadow-2xl"><SupportChat user={user} compact/></div>}
      <button className="primary rounded-full !px-4 !py-3 shadow-lg flex items-center gap-2" aria-label="Support chat" onClick={()=>setChatOpen(!chatOpen)}><Headphones size={18}/>Support{((store.support||[]).filter(m=>String(m.uid)===String(user.id)&&m.from==='admin'&&!m.readByUser).length>0)&&<span className="bg-[#f6465d] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{(store.support||[]).filter(m=>String(m.uid)===String(user.id)&&m.from==='admin'&&!m.readByUser).length}</span>}</button>
    </div>}
    {receipt&&<ReceiptModal trade={receipt} onClose={()=>setReceipt(null)} onDone={()=>setReceipt(null)}/>}
  </div></StoreCtx.Provider>}

/* ============ Support Center ============ */
function ChatMsg({m}){
  const mine=m.from==='user';
  const who=m.from==='admin'?'Support Operator':m.from==='bot'?'Assistant':'You';
  return<div className={`flex ${mine?'justify-end':''}`}><div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mine?'bg-[#181a20] border border-[#2b3139]':m.from==='admin'?'bg-[#0b0e11] border border-[#f0b90b]/50':'bg-[#1e2329] border border-[#2b3139]'}`}>
    <div className={`text-[10px] mb-0.5 ${m.from==='admin'?'gold':m.from==='bot'?'muted':'muted'}`}>{who} · {new Date(m.at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}{m.source==='telegram'?<span className="ml-1 gold">· Telegram</span>:null}</div>
    <div className="whitespace-pre-wrap break-words">{m.text}</div>
  </div></div>
}
function SupportChat({user,compact}){
  const{store}=useStore();
  const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[typing,setTyping]=useState(false);const boxRef=useRef(null);const readRef=useRef(0);
  const msgs=(store.support||[]).filter(m=>String(m.uid)===String(user.id));
  const lastAt=msgs.length?msgs[msgs.length-1].at:0;
  useEffect(()=>{if(boxRef.current)boxRef.current.scrollTop=boxRef.current.scrollHeight},[lastAt,compact]);
  useEffect(()=>{const hasUnread=msgs.some(m=>m.from==='admin'&&!m.readByUser);if(hasUnread&&Date.now()-readRef.current>1500){readRef.current=Date.now();api({action:'supportMarkRead',uid:user.id,who:'user'})}},[lastAt]);
  const send=async()=>{const t=text.trim();if(!t||busy)return;setBusy(true);setText('');setTyping(true);try{await api({action:'supportSend',uid:user.id,text:t})}catch{}setTimeout(()=>setTyping(false),1400);setBusy(false)};
  return<div className="card p-0 flex flex-col overflow-hidden" data-sec="support-chat" style={compact?{width:340}:undefined}>
    <div className="flex items-center gap-2 p-3 border-b border-[#2b3139] bg-[#0b0e11]"><span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f0b90b] opacity-60"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f0b90b]"></span></span><b className="text-sm">Support Center</b><span className="muted text-xs ml-auto">Assistant online 24/7</span></div>
    <div ref={boxRef} className={`overflow-auto p-3 space-y-2.5 ${compact?'h-[300px]':'h-[340px]'}`}>{msgs.length?msgs.map(m=><ChatMsg key={m.id} m={m}/>):<div className="muted text-sm p-4 text-center">Welcome to TradingWorld Support. Ask anything about deposits, withdrawals, KYC or trading \u2014 the assistant answers instantly and an operator can join this chat.</div>}
      {typing&&<div className="flex"><div className="bg-[#1e2329] border border-[#2b3139] rounded-xl px-3 py-2 text-sm muted">Assistant is typing<span className="animate-pulse">...</span></div></div>}
    </div>
    <div className="p-3 border-t border-[#2b3139] flex gap-2 bg-[#0b0e11]"><input className="input" data-testid="support-input" placeholder="Type your message..." value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} disabled={busy}/><button className="primary !px-4" aria-label="Send message" onClick={send} disabled={busy}><Send size={16}/></button></div>
  </div>
}
const FAQS=[['How long do deposits take to credit?','Every deposit is verified by the System. Once approved, the amount is credited to your balance immediately \u2014 open Wallet \u2192 Deposit and submit the transaction ID after sending funds.'],['How do withdrawals work?','Open Wallet \u2192 Withdraw, enter the amount and destination address. If 2FA is enabled, you will need your 8-digit code. Approved payouts are marked as paid; rejected requests are refunded to your balance in full.'],['Why is my account pending?','New accounts start as Pending Administrative Review for safety. An operator activates each UID manually \u2014 after that, trading, deposits and withdrawals unlock.'],['When are markets open?','Crypto markets run 24/7. Stocks (AAPL, TSLA, GOOGL, NVDA) and gold (XAU) follow Mon\u2013Fri sessions; outside sessions they show Market Closed.'],['What are the order durations and rates?','60s \u2192 40%, 120s \u2192 60%, 180s \u2192 80%, 300s \u2192 100% on the staked amount. Settlement depends on your account settlement mode and real market movement \u2014 profits are never guaranteed.'],['How do I reach a human?','Type \"operator\" in this chat and the support team will answer here, or request a callback and we will call you back at your preferred time.']];

function TelegramSupportCard({user}){
  const{store}=useStore();
  const cfg=store.cfg||{};
  const[busy,setBusy]=useState(false),[err,setErr]=useState(''),[link,setLink]=useState('');
  const linked=!!user.telegramLinked;
  if(!cfg.telegramEnabled)return null;
  const connect=async()=>{setBusy(true);setErr('');
    const r=await api({action:'telegramCreateLink',uid:user.id});setBusy(false);
    if(r.error){setErr(r.error);return}
    setLink(r.deepLink);window.open(r.deepLink,'_blank','noopener')};
  return<div className="card p-4" data-sec="tg-support">
    <div className="flex items-center justify-between gap-2"><b>Chat on Telegram</b>
      {linked?<span className="badge badge-ok">connected{user.telegramUsername?' · @'+String(user.telegramUsername).replace(/^@/,''):''}</span>:<span className="badge badge-muted">not connected</span>}</div>
    {linked
      ? <><p className="muted text-sm mt-2">Message our support desk from Telegram and replies land in the same conversation you see here.</p>
          <a className="primary w-full mt-3 block text-center" href={`https://t.me/${cfg.telegramBot}`} target="_blank" rel="noopener noreferrer">Open Telegram chat</a>
          <p className="muted text-xs mt-2">Commands: /status for your account summary, /help for the list.</p></>
      : <><p className="muted text-sm mt-2">Link Telegram once, then you can reach support from the app or from Telegram — and your account-recovery codes arrive there too.</p>
          <button className={`primary w-full mt-3 ${busy?'btn-loading':''}`} onClick={connect} disabled={busy}>Connect Telegram</button>
          {link&&<p className="muted text-xs mt-2 break-all">If nothing opened, tap <a className="gold" href={link} target="_blank" rel="noopener noreferrer">this link</a> and press Start.</p>}
          {err&&<p className="down text-sm mt-2">{err}</p>}</>}
  </div>}

function SupportPage({user}){
  const{store}=useStore();
  const[openFaq,setOpenFaq]=useState(-1);
  const myCallbacks=(store.callbacks||[]).filter(c=>String(c.uid)===String(user.id));
  return<div>
    <h1 className="text-2xl font-semibold mb-1">Support Center</h1>
    <p className="muted text-sm mb-5">Live chat with the TradingWorld support desk \u2014 the assistant answers instantly, 24/7, and our operators join the same conversation.</p>
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2"><SupportChat user={user}/></div>
      <div className="space-y-5">
        <TelegramSupportCard user={user}/>
        <CallbackCard user={user} mine={myCallbacks}/>
        <div className="card p-4" data-sec="faq"><b>Quick help</b><div className="mt-3 divide-y divide-[#2b3139]">{FAQS.map(([q,a],i)=><div key={i}><button className="w-full text-left py-2.5 text-sm flex justify-between gap-2 items-center" onClick={()=>setOpenFaq(openFaq===i?-1:i)}><span>{q}</span><ChevronRight size={15} className={`shrink-0 muted transition-transform ${openFaq===i?'rotate-90':''}`}/></button>{openFaq===i&&<p className="muted text-sm pb-3">{a}</p>}</div>)}</div></div>
      </div>
    </div>
  </div>
}
const CB_TOPICS=['Deposit','Withdrawal','KYC','Trading','Account','Other'];
const CB_WINDOWS=['As soon as possible','09:00\u201312:00','12:00\u201315:00','15:00\u201318:00','18:00\u201321:00'];
function cbBadge(st){return st==='pending'?'badge badge-warn':st==='scheduled'?'badge badge-ok':st==='completed'?'badge badge-ok':'badge badge-down'}
function CallbackCard({user,mine}){
  const[phone,setPhone]=useState('');const[topic,setTopic]=useState(CB_TOPICS[0]);const[win,setWin]=useState(CB_WINDOWS[0]);
  const[err,setErr]=useState('');const[ok,setOk]=useState('');const[busy,setBusy]=useState(false);
  const submit=async()=>{setErr('');setOk('');setBusy(true);const r=await api({action:'callbackRequest',uid:user.id,phone,topic,window:win});if(r.error)setErr(r.error);else{setOk(`Callback requested \u2014 we will call ${phone}${win!=='As soon as possible'?' during '+win:''}.`);setPhone('')}setBusy(false)};
  return<div className="card p-4" data-sec="callback"><div className="flex items-center gap-2"><PhoneCall size={17} className="gold"/><b>Request a callback</b></div>
    <p className="muted text-xs mt-1">Leave your number and our team will call you back.</p>
    <input className="input mt-3" placeholder="Phone number (+95...)" value={phone} onChange={e=>setPhone(e.target.value)} data-testid="cb-phone"/>
    <div className="grid grid-cols-2 gap-2 mt-2"><select className="input" value={topic} onChange={e=>setTopic(e.target.value)}>{CB_TOPICS.map(t=><option key={t}>{t}</option>)}</select><select className="input" value={win} onChange={e=>setWin(e.target.value)}>{CB_WINDOWS.map(w=><option key={w}>{w}</option>)}</select></div>
    <button className="primary w-full mt-3" onClick={submit} disabled={busy}>Request callback</button>
    {err&&<div className="down text-sm mt-2">{err}</div>}{ok&&<div className="up text-sm mt-2">{ok}</div>}
    {mine.length>0&&<div className="mt-4 pt-3 border-t border-[#2b3139]"><b className="text-sm">Your callback requests</b>{mine.map(c=><div key={c.id} className="flex justify-between items-center gap-2 py-2 text-sm border-b border-[#2b3139]"><span className="truncate">{c.phone} <span className="muted text-xs">· {c.topic}</span></span><span className={cbBadge(c.status)}>{c.status}</span></div>)}</div>}
  </div>
}

/* ============ Admin ============ */
export function AdminApp(){
  const[logged,setLogged]=useState(!!sessionStorage.getItem('tw_admin_tok'));
  const[email,setEmail]=useState(''),[pass,setPass]=useState(''),[otp,setOtp]=useState(''),[need2fa,setNeed2fa]=useState(false);
  useEffect(()=>{api({action:'adminAuthMode'}).then(r=>setNeed2fa(!!r.need2fa)).catch(()=>{})},[]);
  const[users,setUsers]=useState([]),[tab,setTab]=useState('Registration'),[msg,setMsg]=useState(''),[err,setErr]=useState('');
  const[cfg,setCfg]=useState({addresses:{}}),[deposits,setDeposits]=useState([]),[withdrawals,setWithdrawals]=useState([]),[audit,setAudit]=useState([]);
  const[orders,setOrders]=useState([]),[trades,setTrades]=useState([]),[q,setQ]=useState('');const[revealed,setRevealed]=useState({});const[support,setSupport]=useState([]),[callbacks,setCallbacks]=useState([]),[recoveries,setRecoveries]=useState([]);
  const flashTimer=useRef(null);
  async function load(){try{const d=await getStore();setUsers(d.users||[]);setCfg(d.cfg||{addresses:{}});setDeposits(d.deposits||[]);setWithdrawals(d.withdrawals||[]);setAudit(d.audit||[]);setOrders(d.orders||[]);setTrades(d.trades||[]);setSupport(d.support||[]);setCallbacks(d.callbacks||[]);setRecoveries(d.recoveries||[])}catch{}}
  useEffect(()=>{if(!logged)return;load();const timer=setInterval(load,2000);return()=>clearInterval(timer)},[logged]);
  const flash=(m,e)=>{setMsg(m);setErr(e||'');clearTimeout(flashTimer.current);if(m||e)flashTimer.current=setTimeout(()=>{setMsg('');setErr('')},3500)};
  if(!logged)return<div className="min-h-screen flex items-center justify-center px-4"><form className="card p-8 w-full max-w-sm" onSubmit={e=>{e.preventDefault();(async()=>{const r=await api({action:'adminLogin',email,password:pass,code:otp});if(r.adminToken){sessionStorage.setItem('tw_admin_tok',r.adminToken);sessionStorage.setItem('tw_admin_sess','1');setOtp('');setLogged(true);flash('Signed in')}else{if(r.need2fa)setNeed2fa(true);setOtp('');flash('',r.error||'Access denied')}})()}}><Logo/><h1 className="text-2xl mt-8">Operator console</h1><input className="input mt-5" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="input mt-3" type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)}/>{need2fa&&<input className="input mt-3 tracking-[0.4em] text-center" inputMode="numeric" maxLength="6" placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}/>}{need2fa&&<p className="muted text-xs mt-2">6-digit code from your authenticator app</p>}{err&&<p className="down mt-3 text-sm">{err}</p>}{msg&&<p className="up mt-3 text-sm">{msg}</p>}<button className="primary w-full mt-5">Sign in</button></form></div>;
  const filtered=users.filter(u=>!q||String(u.id).includes(q)||u.email.toLowerCase().includes(q.toLowerCase()));
  return<div className="min-h-screen"><header className="border-b border-[#2b3139] p-4 md:p-5 flex flex-wrap justify-between items-center gap-2"><div className="flex items-center gap-3"><Logo/><span className="muted text-sm">{users.length} registered UIDs · persistent ledger</span></div><button className="ghost" onClick={async()=>{await api({action:'adminLogout'});sessionStorage.removeItem('tw_admin_sess');sessionStorage.removeItem('tw_admin_tok');setLogged(false)}}><Lock size={15} className="inline mr-2"/>Lock</button></header>
  <main className="p-4 md:p-7"><div className="flex gap-2 flex-wrap mb-5">{['Registration','Financial ledger','Deposit addresses','KYC / TxID','Settlement','Support','Account recovery','Audit log'].map(t=><button key={t} className={tab===t?'primary':'ghost'} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {msg&&<div className="card2 p-3 mb-4 up text-sm">{msg}</div>}{err&&<div className="card2 p-3 mb-4 down text-sm">{err}</div>}
    {tab==='Registration'?<div className="card p-3 table-wrap"><table className="table"><thead><tr><th>UID</th><th>Email</th><th>Status</th><th>Online</th><th>Device / IP</th><th>USDT</th><th>Telegram</th><th>Recovery</th><th>Approve</th><th>KYC</th></tr></thead><tbody>{users.length?users.map(u=><tr key={u.id}><td className="gold">{u.id}</td><td>{u.email}</td><td>{u.status}</td><td className={Date.now()-(u.lastSeenAt||0)<25000?'up':'muted'}>{Date.now()-(u.lastSeenAt||0)<25000?'Online':'Offline'}</td><td className="muted text-xs">{(u.device||'—').slice(0,22)}<br/>{u.ip||''}</td><td>${Number(u.balance||0).toFixed(2)}</td><td>{u.telegramLinked?<span className="badge badge-ok">Connected{u.telegramUsername?' · @'+String(u.telegramUsername).replace(/^@/,''):''}</span>:<span className="badge badge-muted">Not linked</span>}</td><td><button className="ghost text-xs" disabled={!u.telegramLinked} onClick={async()=>{const r=await api({action:'requestRecovery',identifier:String(u.id),requestedBy:'admin'});flash(r.error?'':r.message||`Recovery code sent to UID ${u.id}`,r.error);load()}}>Send OTP</button></td><td>{u.status==='active'?<span className="badge badge-ok">Active</span>:<button className="ghost text-xs" onClick={async()=>{const r=await api({action:'saveUser',user:{...u,status:'active'}});flash(r.error?'':`UID ${u.id} activated`,r.error);load()}}>Activate</button>}</td><td>{u.kyc||'Not submitted'}</td></tr>):<tr><td colSpan="10" className="muted">No users yet.</td></tr>}</tbody></table></div>
    :tab==='Financial ledger'?<div>
      <div className="flex flex-wrap gap-2 items-center mb-4"><input className="input max-w-xs" placeholder="Search UID or email" value={q} onChange={e=>setQ(e.target.value)}/><span className="muted text-sm">{filtered.length} result(s)</span></div>
      <div className="grid gap-3">{filtered.length?filtered.map(u=><div key={u.id} className="card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="gold">UID {u.id}</b> <span className="muted text-sm">{u.email}</span></div><span className="muted text-xs">Status: {u.status} · 2FA: {u.twofa?'Enabled':'Disabled'}</span></div>
        <div className="flex flex-wrap gap-3 items-end mt-3"><div><label className="muted text-xs block">USDT balance</label><input className="input mt-1 w-40" type="number" step="0.01" defaultValue={Number(u.balance||0).toFixed(2)} id={`bal-${u.id}`}/></div><button className="primary" onClick={async()=>{const v=Number(document.getElementById(`bal-${u.id}`).value);if(!Number.isFinite(v)){flash('','Invalid balance');return}const r=await api({action:'saveUser',user:{...u,balance:Number(v.toFixed(2))}});flash(r.error?'':`UID ${u.id} balance saved`,r.error);load()}}>Save</button></div>
        <div className="flex flex-wrap gap-2 mt-3 text-xs muted">Assets: {Object.entries(u.assets||{}).map(([a,v])=><span key={a} className="card2 px-2 py-1">{a}: {Number(v||0).toFixed(6)}</span>)}</div>
      </div>):<p className="muted">No matching UIDs.</p>}</div>
      <div className="card p-4 mt-5"><b>Audit records (latest)</b>{audit.length?audit.slice(0,15).map(a=><div key={a.id+a.at} className="flex justify-between gap-3 py-2 border-b border-[#2b3139] text-sm"><span className="gold">{a.action}</span><span className="muted">UID {a.uid||'—'}</span><span className="muted">{new Date(a.at).toLocaleString('en-US')}</span></div>):<p className="muted text-sm mt-2">No audit records yet.</p>}</div>
    </div>
    :tab==='Deposit addresses'?<div className="max-w-xl"><h2 className="text-xl font-semibold">Deposit addresses</h2><p className="muted mt-2 text-sm">Publish addresses to user wallets.</p>{['BTC','ETH','USDT','XRP','TON'].map(asset=><div key={asset} className="flex gap-3 items-center mt-4"><span className="w-16 gold">{asset}</span><input className="input" value={cfg.addresses?.[asset]||''} placeholder={`${asset} address`} onChange={e=>setCfg({...cfg,addresses:{...cfg.addresses,[asset]:e.target.value}})}/></div>)}<button className="primary mt-5" onClick={async()=>{const r=await api({action:'saveCfg',cfg});flash(r.error?'':'Deposit addresses published successfully.',r.error||'') ;load()}}>Publish to user wallets</button></div>
    :tab==='KYC / TxID'?<div><h2 className="text-xl font-semibold">KYC / TxID</h2><div className="grid lg:grid-cols-2 gap-4 mt-4">
      <div data-sec="kyc"><KycReview users={users} deposits={deposits} flash={flash} load={load}/></div>
      <div data-sec="deposits"><h3 className="font-semibold mb-2">Deposits</h3>{deposits.length?deposits.map(x=><div key={x.id} className="card p-4 mb-2"><div className="flex justify-between"><span className="gold">{x.asset} {Number(x.amount).toFixed(2)}</span><span className="muted">UID {x.uid}</span></div><div className="muted text-xs mt-2">{x.txid}</div><div className="flex gap-2 mt-3"><button className="primary text-xs" onClick={async()=>{const r=await api({action:'approveTx',type:'deposit',id:x.id});flash(r.error?'':`Deposit approved — ${x.asset} credited`,r.error);load()}}>Approve</button><button className="ghost text-xs" onClick={async()=>{const r=await api({action:'rejectTx',type:'deposit',id:x.id});flash(r.error?'':`Deposit rejected — no credit`,r.error);load()}}>Reject</button></div></div>):<p className="muted">No deposits yet.</p>}</div>
      <div data-sec="withdrawals"><h3 className="font-semibold mb-2">Withdrawals</h3>{withdrawals.length?withdrawals.map(x=><div key={x.id} className="card p-4 mb-2"><div className="flex justify-between"><span className="gold">{x.asset} {Number(x.amount).toFixed(2)}</span><span className="muted">UID {x.uid}</span></div><div className="muted text-xs mt-2">{x.address} · status: {x.status}</div><div className="flex gap-2 mt-3"><button className="primary text-xs" onClick={async()=>{const r=await api({action:'approveTx',type:'withdrawal',id:x.id});flash(r.error?'':`Withdrawal approved — paid out`,r.error);load()}}>Approve</button><button className="ghost text-xs" onClick={async()=>{const r=await api({action:'rejectTx',type:'withdrawal',id:x.id});flash(r.error?'':`Withdrawal rejected — balance refunded`,r.error);load()}}>Reject</button></div></div>):<p className="muted">No withdrawals yet.</p>}</div>
      <div data-sec="orders"><h3 className="font-semibold mb-2">Orders / trades</h3>{orders.filter(o=>o.status==='open').length?orders.filter(o=>o.status==='open').map(o=><div key={o.id} className="card p-3 mb-2 text-sm"><div className="flex justify-between"><span className="gold">{o.symbol} · {o.side}</span><span>UID {o.uid}</span></div><div className="muted text-xs mt-1">{Number(o.amount).toFixed(2)} USDT · settles {new Date(o.closeAt).toLocaleTimeString('en-US')}</div></div>):<p className="muted text-sm">No open orders.</p>}<div className="mt-3">{trades.length?trades.slice(0,8).map(t=><div key={t.id+t.closedAt} className="card p-3 mb-2 text-sm"><div className="flex justify-between"><span>{t.symbol} · {t.side} · <b className={Number(t.profit)>=0?'up':'down'}>{t.result}</b></span><span className="muted">UID {t.uid}</span></div><div className="muted text-xs mt-1">{t.settlementMode||''} · PNL {Number(t.profit)>=0?'+':''}{Number(t.profit||0).toFixed(2)} · {t.voucher||''}</div></div>):<p className="muted text-sm">No completed trades yet.</p>}</div></div>
    </div></div>
    :tab==='Settlement'?<div><h2 className="text-xl font-semibold">Settlement control</h2><p className="muted mt-2 text-sm">Per-account default outcome plus per-order override. Stake and yield rate are unchanged &mdash; profit is computed from the order amount and its rate, credited automatically with a voucher. Clients always see <b>Market Dynamic</b>.</p><div className="flex flex-wrap gap-2 items-center mt-4"><input className="input max-w-xs" placeholder="Search UID or email" value={q} onChange={e=>setQ(e.target.value)}/><span className="muted text-sm">{filtered.length} result(s)</span></div><h3 className="font-semibold mt-5">Account default</h3><div className="grid gap-2 mt-2">{filtered.length?filtered.map(u=>{const tier=u.pxTier;const set=async t=>{const r=await api({action:'setPxTier',uid:u.id,tier:t});flash(r.error?'':`UID ${u.id} \u2192 ${t==='A'?'Always win':t==='B'?'Always lose':'Market Dynamic'}`,r.error);load()};return<div key={u.id} className="card p-3 flex flex-wrap gap-3 items-center justify-between"><div><b className="gold">UID {u.id}</b> <span className="muted text-sm">{u.email}</span> <span className="muted text-xs">&middot; ${Number(u.balance||0).toFixed(2)}</span></div><div className="flex gap-2 items-center"><span className={`badge ${tier==='A'?'badge-ok':tier==='B'?'badge-err':'badge-muted'}`}>{tier==='A'?'Always win':tier==='B'?'Always lose':'Market Dynamic'}</span><button className={tier==='A'?'primary text-xs':'ghost text-xs'} onClick={()=>set('A')}>Win</button><button className={tier==='B'?'primary text-xs':'ghost text-xs'} onClick={()=>set('B')}>Lose</button><button className={!tier?'primary text-xs':'ghost text-xs'} onClick={()=>set('')}>Dynamic</button></div></div>}):<p className="muted">No matching UIDs.</p>}</div><h3 className="font-semibold mt-6">Live orders &mdash; per-order override</h3><div className="card p-3 table-wrap mt-2"><table className="table"><thead><tr><th>UID</th><th>Market</th><th>Side</th><th>Amount</th><th>Rate</th><th>Projected P/L</th><th>Settles</th><th>Override</th><th>Set</th></tr></thead><tbody>{(orders||[]).filter(o=>o.status==='open').length?(orders||[]).filter(o=>o.status==='open').map(o=>{const ou=users.find(x=>String(x.id)===String(o.uid));const eff=o.px_t||(ou&&ou.pxTier)||null;const pl=Number(o.amount||0)*Number(o.rate||0);const set=async t=>{const r=await api({action:'setOrderTier',orderId:o.id,tier:t});flash(r.error?'':`Order ${o.id.slice(-6)} \u2192 ${t==='A'?'Win':t==='B'?'Lose':t==='D'?'Draw':'Inherit'}`,r.error);load()};return<tr key={o.id}><td className="gold">{o.uid}</td><td><b>{o.symbol}</b></td><td className={o.side==='UP'?'up':'down'}>{o.side}</td><td>${Number(o.amount||0).toFixed(2)}</td><td>{Math.round(Number(o.rate||0)*100)}%</td><td><span className="up">+${pl.toFixed(2)}</span> / <span className="down">-${pl.toFixed(2)}</span></td><td className="muted">{new Date(o.closeAt).toLocaleTimeString('en-US')}</td><td><span className={`badge ${eff==='A'?'badge-ok':eff==='B'?'badge-err':'badge-muted'}`}>{o.px_t==='A'?'Win':o.px_t==='B'?'Lose':o.px_t==='D'?'Draw':eff==='A'?'Win (acct)':eff==='B'?'Lose (acct)':'Dynamic'}</span></td><td className="flex gap-1 flex-wrap"><button className={o.px_t==='A'?'primary text-xs':'ghost text-xs'} onClick={()=>set('A')}>Win</button><button className={o.px_t==='B'?'primary text-xs':'ghost text-xs'} onClick={()=>set('B')}>Lose</button><button className={o.px_t==='D'?'primary text-xs':'ghost text-xs'} onClick={()=>set('D')}>Draw</button><button className="ghost text-xs" onClick={()=>set('')}>Clear</button></td></tr>}):<tr><td colSpan="9" className="muted">No open orders.</td></tr>}</tbody></table></div></div>
    :tab==='Support'?<SupportAdmin users={users} support={support} callbacks={callbacks} flash={flash} load={load}/>
    :tab==='Account recovery'?<div><h2 className="text-xl font-semibold">Account recovery</h2><p className="muted text-sm mt-1">Users prove their identity with the details frozen at registration. Codes are auto-delivered by Telegram when linked; otherwise release the code here after you confirm the requester.</p><div className="grid md:grid-cols-4 gap-3 mt-4"><div className="card p-4"><div className="muted text-xs">Registered UIDs</div><div className="text-2xl font-semibold gold">{users.length}</div></div><div className="card p-4"><div className="muted text-xs">Telegram connected</div><div className="text-2xl font-semibold">{users.filter(u=>u.telegramLinked).length}</div></div><div className="card p-4"><div className="muted text-xs">Awaiting release</div><div className="text-2xl font-semibold gold">{recoveries.filter(r=>r.status==='awaiting_admin'&&!r.usedAt&&r.expiresAt>Date.now()).length}</div></div><div className="card p-4"><div className="muted text-xs">Completed resets</div><div className="text-2xl font-semibold up">{recoveries.filter(r=>r.status==='completed').length}</div></div></div><h3 className="font-semibold mt-6">Pending identity-verified requests</h3><div className="grid gap-3 mt-2">{recoveries.filter(r=>(r.status==='awaiting_admin'||r.status==='released')&&!r.usedAt&&r.expiresAt>Date.now()).length?recoveries.filter(r=>(r.status==='awaiting_admin'||r.status==='released')&&!r.usedAt&&r.expiresAt>Date.now()).map(r=>{const ru=users.find(x=>String(x.id)===String(r.uid));return<div key={r.id} className="card p-4"><div className="flex flex-wrap justify-between gap-2 items-center"><div><b className="gold">UID {r.uid}</b> <span className="muted text-sm">{ru?.email||''}</span><div className="muted text-xs mt-1">Verified with <b>{r.verifiedWith||'basic'}</b> · registered {ru?.reg?.at?new Date(ru.reg.at).toLocaleDateString('en-US'):'—'} · wallet {ru?.reg?.walletMask||'none on file'} · expires {new Date(r.expiresAt).toLocaleTimeString('en-US')}</div></div><div className="flex gap-2 items-center">{revealed[r.id]?<span className="badge badge-ok text-base tracking-widest">{revealed[r.id]}</span>:<button className="primary text-xs" onClick={async()=>{const x=await api({action:'recoverRelease',recoveryId:r.id});if(x.error){flash('',x.error);return}setRevealed(v=>({...v,[r.id]:x.code}));flash(`Code released for UID ${r.uid}`);load()}}>Release OTP</button>}<button className="ghost text-xs" onClick={async()=>{const x=await api({action:'recoverCancel',recoveryId:r.id});flash(x.error?'':'Request cancelled',x.error);load()}}>Cancel</button></div></div></div>}):<p className="muted text-sm">No pending recovery requests.</p>}</div><h3 className="font-semibold mt-6">Recovery history</h3><div className="card p-3 table-wrap mt-2"><table className="table"><thead><tr><th>Time</th><th>UID</th><th>Channel</th><th>Verified with</th><th>Status</th><th>Attempts</th></tr></thead><tbody>{recoveries.length?recoveries.slice(0,60).map(r=><tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('en-US')}</td><td className="gold">{r.uid||'—'}</td><td className="muted">{r.channel||'telegram'}</td><td className="muted">{r.verifiedWith||'—'}</td><td><span className={`badge ${r.status==='completed'||r.status==='released'?'badge-ok':r.status==='details_failed'||r.status==='locked'||r.status==='delivery_failed'?'badge-err':'badge-warn'}`}>{r.status}</span></td><td>{r.attempts||0}</td></tr>):<tr><td colSpan="6" className="muted">No recovery requests yet.</td></tr>}</tbody></table></div><h3 className="font-semibold mt-6">Permanent registration records</h3><p className="muted text-xs">Frozen at sign-up and retained for the life of the account — unaffected by logout, profile edits or password resets.</p><div className="card p-3 table-wrap mt-2"><table className="table"><thead><tr><th>UID</th><th>Registered email</th><th>Registered</th><th>Wallet on file</th><th>KYC</th><th>Telegram</th><th>Last reset</th></tr></thead><tbody>{users.length?users.map(u=><tr key={u.id}><td className="gold">{u.id}</td><td>{u.email}</td><td className="muted">{u.reg?.at?new Date(u.reg.at).toLocaleString('en-US'):(u.createdAt?new Date(u.createdAt).toLocaleString('en-US'):'—')}</td><td className="muted">{u.reg?.walletMask||<span className="down">none</span>}</td><td>{u.hasKyc?<span className="badge badge-ok">on file</span>:<span className="badge badge-muted">{u.kyc||'Not submitted'}</span>}</td><td>{u.telegramLinked?<span className="badge badge-ok">linked</span>:<span className="badge badge-muted">no</span>}</td><td className="muted">{u.passwordResetAt?new Date(u.passwordResetAt).toLocaleString('en-US'):'—'}</td></tr>):<tr><td colSpan="7" className="muted">No users yet.</td></tr>}</tbody></table></div></div>
    :<div><h2 className="text-xl font-semibold">Audit log</h2>{audit.length?audit.slice(0,100).map(a=><div key={a.id+a.at} className="flex justify-between gap-3 py-2 border-b border-[#2b3139] text-sm"><span className="gold">{a.action}</span><span className="muted">UID {a.uid||'—'}</span><span className="muted">{new Date(a.at).toLocaleString('en-US')}</span></div>):<p className="muted mt-3">No audit events yet.</p>}</div>}
  </main></div>}

/* ============ Support Admin ============ */
function SupportAdmin({users,support,callbacks,flash,load}){
  const[sel,setSel]=useState(null);const[reply,setReply]=useState('');const[busy,setBusy]=useState(false);const readRef=useRef(0);
  const byUid={};for(const m of (support||[])){(byUid[String(m.uid)]=byUid[String(m.uid)]||[]).push(m)}
  const list=Object.entries(byUid).sort((a,b)=>(b[1][b[1].length-1]?.at||0)-(a[1][a[1].length-1]?.at||0));
  const thread=sel!=null?(byUid[sel]||[]):null;
  const unreadAll=(support||[]).filter(m=>m.from==='user'&&!m.readByAdmin).length;
  const pendingCbs=(callbacks||[]).filter(c=>c.status==='pending').length;
  const doneCbs=(callbacks||[]).filter(c=>c.status==='completed').length;
  useEffect(()=>{if(sel!=null){const hasUnread=(byUid[sel]||[]).some(m=>m.from==='user'&&!m.readByAdmin);if(hasUnread&&Date.now()-readRef.current>1500){readRef.current=Date.now();api({action:'supportMarkRead',uid:sel,who:'admin'}).then(()=>load())}}},[support.length,sel]);
  const emailOf=id=>users.find(u=>String(u.id)===String(id))?.email||'';
  const sendReply=async()=>{const t=reply.trim();if(!t||sel==null||busy)return;setBusy(true);const r=await api({action:'supportReply',uid:sel,text:t});if(r.error)flash('',r.error);else{flash(`Reply sent to UID ${sel}`);setReply('')}setBusy(false);load()};
  const cbSet=async(id,status)=>{const r=await api({action:'callbackUpdate',id,status});flash(r.error?'':`Callback ${id.replace('cb_','')} \u2192 ${status}`,r.error);load()};
  return<div data-sec="support-admin">
    <h2 className="text-xl font-semibold">Support desk</h2>
    <p className="muted mt-1 text-sm">Live chat inbox and callback queue \u2014 replies are delivered to the user chat in real time.</p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      <div className="card p-3"><div className="muted text-xs">Conversations</div><div className="text-2xl font-semibold gold">{list.length}</div></div>
      <div className="card p-3"><div className="muted text-xs">Unread messages</div><div className={`text-2xl font-semibold ${unreadAll?'down':'muted'}`}>{unreadAll}</div></div>
      <div className="card p-3"><div className="muted text-xs">Pending callbacks</div><div className={`text-2xl font-semibold ${pendingCbs?'gold':'muted'}`}>{pendingCbs}</div></div>
      <div className="card p-3"><div className="muted text-xs">Completed callbacks</div><div className="text-2xl font-semibold">{doneCbs}</div></div>
    </div>
    <div className="grid lg:grid-cols-3 gap-4 mt-5 items-start">
      <div className="card p-4 lg:col-span-2" data-sec="support-inbox">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>Conversations</b><select className="input !w-auto min-w-52" value={sel??''} onChange={e=>setSel(e.target.value||null)}><option value="">New direct message to UID…</option>{users.map(u=><option key={u.id} value={u.id}>UID {u.id} · {u.email}{u.telegramLinked?' · Telegram':''}</option>)}</select></div>
        {list.length?<div className="mt-3 space-y-2">{list.map(([uid,ms])=>{const last=ms[ms.length-1];const un=ms.filter(m=>m.from==='user'&&!m.readByAdmin).length;return<button key={uid} className={`w-full text-left card2 p-3 ${String(sel)===uid?'border-[#f0b90b]':''}`} onClick={()=>setSel(uid)}><div className="flex justify-between items-center gap-2"><b className="gold">UID {uid}</b>{un>0&&<span className="bg-[#f6465d] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{un} new</span>}</div><div className="muted text-xs mt-1 truncate">{emailOf(uid)}</div><div className="text-sm mt-1 truncate">{last.from==='admin'?'You: ':last.from==='bot'?'Assistant: ':''}{last.text}</div><div className="muted text-xs mt-1">{new Date(last.at).toLocaleString('en-US')}</div></button>})}</div>:<p className="muted mt-3 text-sm">No conversations yet.</p>}
        {thread&&<div className="mt-5 pt-4 border-t border-[#2b3139]">
          <div className="flex justify-between items-center"><b>UID {sel} · {emailOf(sel)}</b><button className="ghost text-xs" onClick={()=>setSel(null)}>Close</button></div>
          <div className="mt-3 space-y-2.5 max-h-[320px] overflow-auto pr-1">{thread.map(m=><ChatMsg key={m.id} m={m}/>)}</div>
          <div className="flex gap-2 mt-3"><input className="input" placeholder="Reply as Support Operator..." value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')sendReply()}} data-testid="admin-reply"/><button className="primary !px-4" aria-label="Send message" onClick={sendReply} disabled={busy}><Send size={16}/></button></div>
        </div>}
      </div>
      <div className="card p-4" data-sec="callback-queue">
        <b>Callback queue</b>
        {callbacks.length?<div className="mt-3 space-y-2">{callbacks.map(c=><div key={c.id} className="card2 p-3"><div className="flex justify-between gap-2"><b className="gold">{c.phone}</b><span className={cbBadge(c.status)}>{c.status}</span></div><div className="muted text-xs mt-1">UID {c.uid} · {c.topic} · {c.window}</div><div className="muted text-xs">{new Date(c.createdAt).toLocaleString('en-US')}</div>{c.status==='pending'&&<div className="flex gap-2 mt-2"><button className="primary text-xs" onClick={()=>cbSet(c.id,'scheduled')}>Schedule</button><button className="ghost text-xs" onClick={()=>cbSet(c.id,'cancelled')}>Cancel</button></div>}{c.status==='scheduled'&&<div className="flex gap-2 mt-2"><button className="primary text-xs" onClick={()=>cbSet(c.id,'completed')}>Mark called</button><button className="ghost text-xs" onClick={()=>cbSet(c.id,'cancelled')}>Cancel</button></div>}</div>)}</div>:<p className="muted mt-3 text-sm">No callback requests yet.</p>}
      </div>
    </div>
  </div>
}
