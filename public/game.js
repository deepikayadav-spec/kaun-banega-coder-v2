(function(){"use strict";
try{window.__kbcR1&&window.__kbcR1.abort()}catch(e){}
const AC=new AbortController();window.__kbcR1=AC;const SIG={signal:AC.signal};

/* ================= Config ================= */
const CFG={mastery:2,secs:60,dropAfterCheckpoint:false,variants:10,lockMs:1300};
/* a student's very first hot-seat question gets extra time: they are still finding their way around the screen */
const FIRST_SECS=70;
const seatSecsNote=()=>!P.runs?`Your first hot-seat question gives you <b>${FIRST_SECS} seconds</b> (60 after that)`:`<b>60 seconds</b> for each hot-seat question`;
/* 15 rungs: one per skill group of the CT skill graph (14 groups), and the last for finishing every group. */
/* one rung per skill group plus the finale, sized by the server from the live skill graph */
const LADDER=(window.KBC_BOOT&&KBC_BOOT.graph&&KBC_BOOT.graph.ladder)||[10,20,50,100,200,500,1000,5000,10000,1e5,1e6,5e6,1e7,3e7,7e7];
/* ================= Taxonomy from the server: checkpoint › skill group (row) › skill ================= */
const BOOT=window.KBC_BOOT,GR=BOOT.graph,ME=BOOT.me;
let ENGINE=BOOT.engine; /* progression state from the server (server/engine.js view) */
const PYD="https://docs.python.org/3/";
const ROWS=GR.groups.map(g=>({id:g.id,c:g.cp,name:g.name,skills:GR.skills.filter(s=>s.group===g.id).map(s=>({id:s.id,name:s.name,short:s.short||null,pre:[...new Set((s.req||[]).flat())],
 check:s.check,kps:s.kps||{},mistakes:s.mistakes||{}}))}));
const SK={};ROWS.forEach((r,i)=>r.skills.forEach(s=>{s.row=i;SK[s.id]=s}));
/* checkpoint labels sit on the rung of the last group of each checkpoint */
const CK={};ROWS.forEach((r,i)=>{if(!ROWS[i+1]||ROWS[i+1].c!==r.c)CK[i]=r.c});CK[LADDER.length-1]="FIN";
const TAG={};
const OPEN=LADDER.length;
/* Rung count reached at the last checkpoint at or below r (checkpoints sit at rung indexes in CK) */
const lastCkOf=r=>Object.keys(CK).map(Number).filter(i=>i+1<=r).reduce((m,i)=>Math.max(m,i+1),0);

/* ================= Variant generators =================
   Each skill × type has a seeded template. Variant .1–.10 is fixed by its seed, so T11.4 is always the same question.
   Every question carries five tags: C, P, G, S, T (+ variant). */
/*GEN-START*/
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function mkR(seed){const r=rng(seed);const R={int:(a,b)=>a+Math.floor(r()*(b-a+1)),pick:a=>a[Math.floor(r()*a.length)],
 shuffle:a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a},
 distinct:(n,a,b)=>{const s=new Set();while(s.size<n)s.add(R.int(a,b));return[...s]}};return R}
/*GEN-END*/

/* ================= Helpers ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtR=n=>(n=+n||0,n>=1e7)?`${(n/1e7).toLocaleString("en-IN")} crore`:n>=1e5?`${(n/1e5).toLocaleString("en-IN")} lakh`:""+n.toLocaleString("en-IN");
const KW=new Set("for in if elif else while break continue and or not True False None def return print len range input int str float type set sorted map".split(" "));
const RE=/("[^"\n]*"|'[^'\n]*')|\b([A-Za-z_]+)\b|\b(\d+)\b/g;
function hlLine(c){let o="",last=0;c.replace(RE,(m,s,w,n,off)=>{o+=esc(c.slice(last,off));o+=s?`<span class="s">${esc(s)}</span>`:w?(w==="____"?`<span class="b">____</span>`:KW.has(w)?`<span class="k">${w}</span>`:w):`<span class="n">${m}</span>`;last=off+m.length;return m});return o+esc(c.slice(last))}
const codeHTML=c=>`<pre class="code" aria-label="Code">${c.split("\n").map(l=>`<span class="ln">${hlLine(l)||" "}</span>`).join("")}</pre>`;
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const reduceMotion=(()=>{try{return matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return false}})();
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const dayKey=t=>{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const ICON={
 fifty:"50:50",
 hint:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>`,
 flip:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/></svg>`,
 book:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M20 19v3H6"/></svg>`,
 why:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01"/></svg>`
};
const LIFE=[{k:"fifty",name:"50:50",cap:"50:50",tip:"Removes two wrong answers. Works on four-option questions."},{k:"hint",name:"Ask the mentor",cap:"Mentor",tip:"A nudge from your buddy. No answer, just a hint."},{k:"flip",name:"Flip",cap:"Flip",tip:"Swap for a fresh question of the same kind."}];

/* ================= Reserve Bank of Coding notes =================
   Real Mahatma Gandhi New Series colours, sizes (2 px per mm) and monuments, printed by a fictional bank.
   Marked SPECIMEN, no portrait or security features. */
const NOTE={
 10:{mm:[123,63],c:["#9C6B4E","#D4A889","#3E2214"],draw:"konark",word:"TEN"},
 20:{mm:[129,63],c:["#B7C24A","#E2E79A","#3D4512"],draw:"ellora",word:"TWENTY"},
 50:{mm:[135,66],c:["#4FC3D9","#AEE9F2","#0E4A57"],draw:"hampi",word:"FIFTY"},
 100:{mm:[142,66],c:["#A493D6","#DCD3F5","#34265E"],draw:"vav",word:"ONE HUNDRED"},
 200:{mm:[146,66],c:["#F2BE3C","#FCE6A2","#5E4206"],draw:"sanchi",word:"TWO HUNDRED"},
 500:{mm:[150,66],c:["#9EA79B","#D3D9CF","#2F382C"],draw:"redfort",word:"FIVE HUNDRED"}};
const MON={
 konark:i=>{let s=`<circle cx="50" cy="42" r="34" fill="none" stroke="${i}" stroke-width="6"/><circle cx="50" cy="42" r="26" fill="none" stroke="${i}" stroke-width="2"/><circle cx="50" cy="42" r="8" fill="${i}"/>`;for(let k=0;k<16;k++){const a=k*Math.PI/8,w=k%2?1.6:4;s+=`<path d="M${50+8*Math.cos(a)} ${42+8*Math.sin(a)}L${50+31*Math.cos(a)} ${42+31*Math.sin(a)}" stroke="${i}" stroke-width="${w}"/>`}return s},
 ellora:i=>`<path d="M20 74V44h60v30z" fill="${i}" opacity=".85"/><path d="M28 44L50 10L72 44z" fill="${i}"/><path d="M36 30h28M32 37h36" stroke="rgba(255,255,255,.35)" stroke-width="2"/>${[26,38,50,62,74].map(x=>`<rect x="${x-3}" y="50" width="6" height="24" fill="rgba(255,255,255,.3)"/>`).join("")}<path d="M10 76h80" stroke="${i}" stroke-width="4"/>`,
 hampi:i=>`<path d="M30 58V34h40v24z" fill="${i}"/><path d="M26 34h48l-6-10H32z" fill="${i}"/><path d="M36 24l14-16 14 16z" fill="${i}"/><circle cx="34" cy="62" r="11" fill="none" stroke="${i}" stroke-width="4"/><circle cx="66" cy="62" r="11" fill="none" stroke="${i}" stroke-width="4"/><circle cx="34" cy="62" r="3" fill="${i}"/><circle cx="66" cy="62" r="3" fill="${i}"/><path d="M12 74h76" stroke="${i}" stroke-width="3"/>`,
 vav:i=>[0,1,2,3,4].map(k=>`<rect x="${8+k*7}" y="${14+k*12}" width="${84-k*14}" height="7" fill="${i}" opacity="${1-k*.12}"/>`).join("")+`<path d="M8 76h84" stroke="${i}" stroke-width="3"/>`,
 sanchi:i=>`<path d="M14 66a36 32 0 0 1 72 0z" fill="${i}"/><rect x="10" y="64" width="80" height="8" fill="${i}"/><rect x="44" y="26" width="12" height="8" fill="${i}"/><path d="M50 26V12M42 16h16M44 20h12" stroke="${i}" stroke-width="3"/><g fill="none" stroke="${i}" stroke-width="3"><path d="M20 76V50M34 76V50M16 52h22M16 58h22"/></g>`,
 redfort:i=>`<rect x="6" y="46" width="88" height="28" fill="${i}"/><path d="M40 74V58a10 10 0 0 1 20 0v16z" fill="rgba(255,255,255,.35)"/><rect x="30" y="32" width="40" height="14" fill="${i}"/>${[18,82].map(x=>`<path d="M${x-8} 46v-8h16v8z" fill="${i}"/><path d="M${x-8} 38a8 7 0 0 1 16 0z" fill="${i}"/>`).join("")}<path d="M42 32a8 7 0 0 1 16 0z" fill="${i}"/><path d="M50 25V4" stroke="${i}" stroke-width="2"/><rect x="50" y="4" width="16" height="4" fill="#FF9933"/><rect x="50" y="8" width="16" height="4" fill="#fff"/><rect x="50" y="12" width="16" height="4" fill="#138808"/>`};
const NFX=`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<filter id="nfibre" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 .2  0 0 0 0 .15  0 0 0 0 .1  0 0 0 .55 0"/></filter>
<linearGradient id="nbend" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".3" stop-color="#000" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset=".52" stop-color="#000" stop-opacity=".1"/><stop offset=".78" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
<linearGradient id="nholo" x1="0" y1="0" x2="0" y2="1" spreadMethod="reflect"><stop offset="0" stop-color="#7CF0AE"/><stop offset=".25" stop-color="#60A5FA"/><stop offset=".5" stop-color="#E879F9"/><stop offset=".75" stop-color="#FFC83D"/><stop offset="1" stop-color="#7CF0AE"/><animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="0 1" dur="3s" repeatCount="indefinite"/></linearGradient>
</defs></svg>`;
document.body.insertAdjacentHTML("afterbegin",NFX);
const nMicro=(x,y,w,i)=>`<text x="${x}" y="${y}" font-family="JetBrains Mono,monospace" font-size="4.2" fill="${i}" opacity=".55" textLength="${w}" lengthAdjust="spacingAndGlyphs">${"01001011 01000010 01000011 ".repeat(Math.ceil(w/60))}</text>`;
const nGuil=(W,H,l)=>{let g="";for(let k=0;k<7;k++){const y=H*.18+k*H*.1;g+=`<path d="M0 ${y}${Array.from({length:12},()=>` q${W/24} ${k%2?-6:6} ${W/12} 0`).join("")}" fill="none" stroke="${l}" stroke-width="1" opacity=".42"/>`}return g};
const nPaper=(W,H,lite)=>`<rect width="${W}" height="${H}" fill="url(#nbend)"/>${lite?"":`<rect width="${W}" height="${H}" filter="url(#nfibre)" opacity=".5"/>`}<path d="M${W*.5} 0V${H}" stroke="#000" stroke-opacity=".08" stroke-width="1.2"/>`;
const nSerial=(v,k)=>"0x"+((v*7919+k*104729)>>>0).toString(16).toUpperCase().padStart(6,"0").slice(-6);
function noteFront(v,lite){const n=NOTE[v],W=n.mm[0]*2,H=n.mm[1]*2,[b,l,i]=n.c,sx=W*.645;
 return {W,H,g:`<rect width="${W}" height="${H}" fill="${b}"/>${nGuil(W,H,l)}<rect x="5" y="5" width="${W-10}" height="${H-10}" rx="3" fill="none" stroke="${l}" stroke-width="1.6"/>
${lite?"":nMicro(10,10.5,W-20,i)+nMicro(10,H-7,W-20,i)}
<text x="16" y="${H*.2}" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="${H*.07}" fill="${i}" letter-spacing=".4">RESERVE BANK OF CODING</text>
<text x="16" y="${H*.28}" font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="${H*.048}" fill="${i}" opacity=".8" letter-spacing="1.4">GUARANTEED BY THE COMPILER</text>
<text x="16" y="${H*.56}" font-family="Unbounded,Arial Black" font-weight="900" font-size="${H*.22}" fill="${i}">${v}</text>
<text x="16" y="${H*.67}" font-family="JetBrains Mono,monospace" font-weight="700" font-size="${H*.06}" fill="${i}" opacity=".85">0b${v.toString(2)}</text>
<g font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="${H*.04}" fill="${i}" opacity=".9"><text x="16" y="${H*.74}">I PROMISE TO PAY THE BEARER</text><text x="16" y="${H*.795}">THE SUM OF ${n.word} RUPEES</text><text x="16" y="${H*.85}">ONCE YOUR CODE COMPILES.</text></g>
<text x="16" y="${H*.93}" font-family="JetBrains Mono,monospace" font-weight="700" font-size="${H*.05}" fill="${i}">${nSerial(v,1)}</text>
<rect x="${sx}" y="0" width="${W*.035}" height="${H}" fill="url(#nholo)" opacity=".9"/>
<ellipse cx="${W*.79}" cy="${H*.44}" rx="${H*.2}" ry="${H*.25}" fill="${l}" opacity=".65"/>
<text x="${W*.79}" y="${H*.47}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="700" font-size="${H*.13}" fill="${i}" opacity=".75">&lt;/&gt;</text>
<text x="${W-12}" y="${H*.2}" text-anchor="end" font-family="JetBrains Mono,monospace" font-weight="700" font-size="${H*.09}" fill="${i}">{ }</text>
<path d="M${W*.69} ${H*.8}c6-8 10 4 15-3s8 6 13-2 6 5 10 0" fill="none" stroke="${i}" stroke-width="1.6" stroke-linecap="round"/>
<text x="${W*.69}" y="${H*.87}" font-family="Plus Jakarta Sans,Arial" font-weight="700" font-size="${H*.036}" fill="${i}" opacity=".85">sudo GOVERNOR</text>
<text x="${W-12}" y="${H*.94}" text-anchor="end" font-family="JetBrains Mono,monospace" font-weight="700" font-size="${H*.06}" fill="${i}">${nSerial(v,2)}</text>
<text transform="translate(${W*.45} ${H*.42}) rotate(-14)" text-anchor="middle" font-family="Unbounded,Arial Black" font-weight="900" font-size="${H*.09}" fill="#C0263A" opacity=".22" letter-spacing="3">SPECIMEN</text>
${nPaper(W,H,lite)}`}}
function noteBack(v){const n=NOTE[v],W=n.mm[0]*2,H=n.mm[1]*2,[b,l,i]=n.c;
 return {W,H,g:`<rect width="${W}" height="${H}" fill="${b}"/>${nGuil(W,H,l)}<rect x="5" y="5" width="${W-10}" height="${H-10}" rx="3" fill="none" stroke="${l}" stroke-width="1.6"/>
${nMicro(10,10.5,W-20,i)}${nMicro(10,H-7,W-20,i)}
<g transform="translate(${W*.07} ${H*.2}) scale(${H*.0066})">${MON[n.draw](i)}</g>
<text x="${W*.5}" y="${H*.2}" text-anchor="middle" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="${H*.065}" fill="${i}" letter-spacing="1">IN CODE WE TRUST</text>
<g font-family="JetBrains Mono,monospace" font-weight="700" font-size="${H*.04}" fill="${i}" opacity=".85">${["Python","Java","C++","JavaScript","Go","Rust","SQL","Kotlin"].map((t,k)=>`<text x="${W*.47}" y="${H*.32+k*H*.065}">${t}</text>`).join("")}</g>
<text x="${W-14}" y="${H*.56}" text-anchor="end" font-family="Unbounded,Arial Black" font-weight="900" font-size="${H*.26}" fill="${i}">${v}</text>
<text x="${W-14}" y="${H*.68}" text-anchor="end" font-family="JetBrains Mono,monospace" font-weight="700" font-size="${H*.055}" fill="${i}" opacity=".85">return ${v}</text>
<text x="${W-14}" y="${H*.88}" text-anchor="end" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="${H*.05}" fill="${i}" opacity=".8" letter-spacing="1">SPECIMEN · KAUN BANEGA CODER</text>
${nPaper(W,H)}`}}
const nSvg=(o,lab)=>`<svg viewBox="0 0 ${o.W} ${o.H}" role="img" aria-label="${lab}">${o.g}</svg>`;
/* Big 3D bill (tap to flip), or "" when the amount isn't a single note */
function noteBig(v,cls){if(!NOTE[v])return "";return `<button class="bill3d ${cls||""}" type="button" aria-label="${v} note from the Reserve Bank of Coding. Tap to flip."><span class="b3-in"><span class="b3-face">${nSvg(noteFront(v),`${v} note, front`)}</span><span class="b3-face b3-back">${nSvg(noteBack(v),`${v} note, back`)}</span></span></button>`}
/* Tiny flat note for the board and progress line */
const noteThumb=v=>NOTE[v]?`<span class="nthumb" aria-hidden="true">${nSvg(noteFront(v,true),"")}</span>`:"";

/* Board note: the real note for 10–500, a small stack of 500s above that (banded from 10,000) */
/* Money icons that grow with the amount: fans of notes, banded bundles, a briefcase, then pyramids of cash */
const mn=(x,y,w,h,v,rot)=>{const [b,l]=NOTE[v].c;return `<g transform="rotate(${rot||0} ${x+w/2} ${y+h/2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${b}" stroke="rgba(0,0,0,.4)" stroke-width=".7"/><rect x="${x+1.5}" y="${y+1.5}" width="${w-3}" height="${h-3}" rx="1" fill="none" stroke="${l}" stroke-width=".7"/><circle cx="${x+w*.72}" cy="${y+h/2}" r="${h*.24}" fill="${l}" opacity=".85"/><rect x="${x+3}" y="${y+h*.35}" width="${w*.3}" height="${h*.3}" rx=".6" fill="rgba(0,0,0,.25)"/></g>`};
const bun=(x,y,w,h,v)=>[2,1,0].map(k=>mn(x+k*.9,y-k*1.3,w,h,v)).join("")+`<rect x="${x+w/2-1.6}" y="${y-3}" width="3.2" height="${h+4}" rx=".8" fill="#FF6A2B" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>`;
const gcoin=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#FFC83D" stroke="#9A5A05" stroke-width=".8"/><circle cx="${x-r*.3}" cy="${y-r*.3}" r="${r*.35}" fill="#FFF4C2" opacity=".8"/>`;
const spk=(x,y,s)=>`<path d="M${x} ${y-s}l${s*.3} ${s*.7} ${s*.7} ${s*.3}-${s*.7} ${s*.3}-${s*.3} ${s*.7}-${s*.3}-${s*.7}-${s*.7}-${s*.3} ${s*.7}-${s*.3}z" fill="#FFE08A"/>`;
const pyr=c=>[0,1,2].map(k=>bun(2+k*19,18,17,9,c[k])).join("")+[0,1].map(k=>bun(11+k*19,9,17,9,c[3+k])).join("")+bun(20,0.5,17,8,c[5]);
const MONEY={
 1000:mn(8,9,30,14,200,-12)+mn(20,7,30,14,500,8),
 2000:mn(4,11,27,13,500,-16)+mn(12,8,27,13,500,-6)+mn(21,8,27,13,500,5)+mn(29,11,27,13,500,15),
 50000:bun(4,12,26,12,500)+bun(30,12,26,12,500)+mn(17,2,26,11,200,-4),
 200000:bun(3,14,26,11,500)+bun(31,14,26,11,500)+bun(17,4,26,11,500)+gcoin(5,27,3)+gcoin(55,27,3),
 5000:mn(3,10,28,13,100,-16)+mn(15,7,28,13,200,0)+mn(27,9,28,13,500,14),
 10000:bun(13,10,34,15,500),
 100000:bun(3,11,26,13,200)+bun(31,11,26,13,500),
 1000000:bun(3,16,26,11,100)+bun(31,16,26,11,500)+bun(17,5,26,11,200),
 5000000:mn(14,3,22,10,500,-10)+mn(24,2,22,10,200,8)+`<rect x="8" y="9" width="44" height="19" rx="3" fill="#6B4423" stroke="#2A1608" stroke-width="1"/><path d="M24 9V6h12v3" fill="none" stroke="#2A1608" stroke-width="1.6"/><rect x="27" y="15" width="6" height="5" rx="1" fill="#FFC83D"/><path d="M8 14h44" stroke="#4A2C14" stroke-width="1"/>`,
 10000000:pyr([500,200,100,50,500,200]),
 30000000:pyr([200,500,50,100,200,500])+gcoin(4,26,3.5)+gcoin(56,26,3.5)+gcoin(9,27,3),
 70000000:pyr([500,100,200,500,50,200])+`<path d="M22 2l3-5 3 3 2-4 2 4 3-3 3 5z" fill="#FFC83D" stroke="#9A5A05" stroke-width=".7"/>`+spk(4,6,4)+spk(57,10,3.5)+gcoin(56,26,3.5)+gcoin(4,26,3.5)};
function boardNote(v){if(NOTE[v])return `<span class="bnote">${noteThumb(v)}</span>`;return `<span class="bnote"><svg viewBox="0 -6 60 36" aria-hidden="true">${MONEY[v]||moneyArt(v)}</svg></span>`}
/* Every amount on the board shows money. Amounts without their own art (a ladder an admin changes later) get notes,
   bundles or a pile that grows with the amount. */
function moneyArt(v){if(v<1000)return mn(16,8,28,14,v<=20?10:v<=100?50:v<=300?200:500,0);
 if(v<10000)return mn(6,10,27,13,500,-12)+mn(16,8,27,13,500,0)+mn(26,10,27,13,500,12);
 if(v<1e5)return bun(17,10,28,13,500);
 if(v<1e6)return bun(4,12,26,12,500)+bun(30,12,26,12,500);
 if(v<1e7)return bun(3,16,26,11,200)+bun(31,16,26,11,500)+bun(17,5,26,11,500);
 return pyr([500,200,500,100,500,200])}

/* Buddies: every character is the same rigged person in a different costume, so all poses and expressions work for each.
   All designs are original (no licensed characters). head/gold/white = gradient stops for helmet, suit and belly panel;
   sl = sleeve [outline, fill, highlight, elbow]; leg = [tights, core]. face is drawn on the head under the eyes, top over them,
   behind sits behind the head, cape behind the body. */
const RUPEE_EMBLEM=`<circle cx="100" cy="140" r="9" fill="url(#rWhite)" stroke="#C7760A" stroke-width="1.5"/><text x="100" y="144" text-anchor="middle" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="11" fill="#C7760A">{}</text>`;
const WEB=(()=>{let d="";for(let i=0;i<12;i++){const a=i/12*Math.PI*2;d+=`M100 70L${(100+57*Math.cos(a)).toFixed(1)} ${(70+52*Math.sin(a)).toFixed(1)}`}
 return `<path d="${d}" stroke="#1A0640" stroke-width="1.4" opacity=".45" fill="none"/><ellipse cx="100" cy="70" rx="22" ry="20" fill="none" stroke="#1A0640" stroke-width="1.4" opacity=".4"/><ellipse cx="100" cy="70" rx="40" ry="36" fill="none" stroke="#1A0640" stroke-width="1.4" opacity=".4"/>`})();
const COSTUMES={
 byte:{id:"byte",name:"Bolt",tag:"Tech",line:"Glossy robot. Runs on chai and clean code.",
  head:["#FFFFFF","#E9EBF4","#AEB3C8"],gold:["#FFE6A3","#FFB627","#C7760A"],white:["#FFFFFF","#C9CDDD"],
  sl:["#B86A08","#FFB627","#FFE08A","#E39A12"],cuff:"#F3F4FA",glove:"#9A9FB6",glove2:"#B4B8CB",leg:["#2A2E4A","#454B74"],emblem:RUPEE_EMBLEM},
 webby:{id:"webby",name:"Web Weaver",tag:"Superhero",line:"Swings from bug to bug. Spins loops, not webs.",
  head:["#B98CFF","#6D2FD6","#2E0E6B"],gold:["#B98CFF","#6D2FD6","#2E0E6B"],white:["#D9FF7A","#8FD400"],
  sl:["#2E0E6B","#6D2FD6","#B98CFF","#8FD400"],cuff:"#B6FF3B",glove:"#2E0E6B",glove2:"#4A1C9E",leg:["#1E0A4A","#3A1A80"],
  fins:false,ears:false,jaw:false,face:WEB,
  emblem:`<g transform="translate(100 141)" fill="#B6FF3B" stroke="#B6FF3B"><ellipse rx="4" ry="5.5" stroke="none"/><circle cy="-6.5" r="3" stroke="none"/><path d="M-3-2l-9-6M-3 1h-10M-3 3l-9 6M-2 5l-6 9M3-2l9-6M3 1h10M3 3l9 6M2 5l6 9" stroke-width="1.6" stroke-linecap="round" fill="none"/></g>`},
 captain:{id:"captain",name:"Captain Kode",tag:"Superhero",line:"Cape on, bugs gone. Saves the day one test at a time.",
  head:["#FFE3C8","#F4BE94","#C98A5E"],gold:["#9CC8FF","#2F6FE0","#163A85"],white:["#FFE27A","#E0A800"],
  sl:["#163A85","#2F6FE0","#9CC8FF","#E0322F"],cuff:"#E0322F",glove:"#E0322F",glove2:"#B02020",leg:["#163A85","#2F6FE0"],
  fins:false,ears:false,jaw:false,
  cape:`<path d="M76 124Q40 196 50 248H150Q160 196 124 124Z" fill="#E0322F"/><path d="M76 124Q52 190 58 248" stroke="#B02020" stroke-width="3" fill="none" opacity=".6"/>`,
  face:`<path d="M46 60Q48 12 100 14Q152 12 154 60Q140 32 100 34Q60 32 46 60Z" fill="#3B2A1E"/><path d="M52 64Q100 50 148 64L146 90Q100 78 54 90Z" fill="#163A85"/>`,
  emblem:`<circle cx="100" cy="141" r="11" fill="#E0322F"/><text x="100" y="146" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="800" font-size="13" fill="#FFE27A">{}</text>`},
 astro:{id:"astro",name:"Astro",tag:"Space",line:"Debugs in zero gravity. Thinks NASA should use Python. (It does.)",
  head:["#F2FAFF","#BFE4FF","#6FA8DC"],gold:["#FFFFFF","#E4E8F2","#A7AFC6"],white:["#FFB04D","#E06A00"],
  sl:["#8E97B3","#F4F6FB","#FFFFFF","#FF8A1F"],cuff:"#FF8A1F",glove:"#D9DEEA",glove2:"#B9C0D2",leg:["#C9CFDE","#EEF1F7"],
  fins:false,jaw:false,
  top:`<path d="M100 18V2" stroke="#8E97B3" stroke-width="3"/><circle cx="100" cy="0" r="5" fill="#FF8A1F"/><path d="M62 42Q80 24 108 22" stroke="#fff" stroke-width="5" fill="none" opacity=".75" stroke-linecap="round"/>`,
  emblem:`<path d="M100 131l3 6 6.5 1-4.7 4.5 1.1 6.5-5.9-3.1-5.9 3.1 1.1-6.5-4.7-4.5 6.5-1z" fill="#FF8A1F"/>`},
 sixer:{id:"sixer",name:"Sixer",tag:"Sports",line:"Hits every bug for six. Never leaves a loop unbowled.",
  head:["#F7D3B0","#D9A27A","#A86F48"],gold:["#7FB2FF","#1E5BD8","#0E2F7A"],white:["#FFFFFF","#D6DEEF"],
  sl:["#0E2F7A","#1E5BD8","#7FB2FF","#FF8A1F"],cuff:"#FF8A1F",glove:"#FFFFFF",glove2:"#D6DEEF",leg:["#E6EAF2","#FFFFFF"],
  fins:false,ears:false,jaw:false,
  top:`<path d="M44 64Q44 8 100 8Q156 8 156 64L148 56Q140 24 100 22Q60 24 52 56Z" fill="#0E2F7A"/><path d="M38 62Q100 48 162 62" stroke="#0E2F7A" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M84 18h32" stroke="#FF8A1F" stroke-width="4" stroke-linecap="round"/>`,
  emblem:`<text x="100" y="147" text-anchor="middle" font-family="Unbounded,Arial Black" font-weight="800" font-size="16" fill="#FF8A1F">6</text>`},
 ninja:{id:"ninja",name:"Shadow",tag:"Gaming",line:"Silent, fast, always first in Fastest Finger.",
  head:["#5A6080","#2C3048","#12131D"],gold:["#6B7194","#363B58","#181A28"],white:["#3A3F58","#1C1E2C"],
  sl:["#0B0C14","#2C3048","#4A4F6A","#E0322F"],cuff:"#E0322F",glove:"#24273A",glove2:"#3A3F58",leg:["#14151F","#2C3048"],
  fins:false,ears:false,jaw:false,
  face:`<path d="M48 58Q100 48 152 58V92Q100 84 48 92Z" fill="#F4C9A0"/><path d="M44 50Q100 34 156 50L155 58Q100 44 45 58Z" fill="#E0322F"/><path d="M152 52q22 4 30 18M150 56q18 12 20 28" stroke="#E0322F" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  emblem:`<text x="100" y="145" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="800" font-size="11" fill="#E0322F">&lt;/&gt;</text>`},
 mochi:{id:"mochi",name:"Mochi",tag:"Animals",line:"A cat who sits on your keyboard and somehow fixes the bug.",
  head:["#FFE0B8","#F7A350","#C0661C"],gold:["#FFE0B8","#F7A350","#C0661C"],white:["#FFF6E8","#F1D9BC"],
  sl:["#C0661C","#F7A350","#FFE0B8","#C0661C"],cuff:"#FFF6E8",glove:"#FFF6E8",glove2:"#F1D9BC",leg:["#C0661C","#F7A350"],
  fins:false,ears:false,jaw:false,
  behind:`<path d="M52 46L58 -2L98 22Z" fill="#F7A350"/><path d="M62 34L64 10L86 24Z" fill="#FF9EB0"/><path d="M148 46L142 -2L102 22Z" fill="#F7A350"/><path d="M138 34L136 10L114 24Z" fill="#FF9EB0"/>`,
  face:`<path d="M90 22q10 10 20 0M86 32q14 10 28 0" stroke="#C0661C" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  top:`<path d="M96 95l4 4 4-4z" fill="#FF7A95"/><path d="M60 96l-22-4M60 102l-22 2M140 96l22-4M140 102l22 2" stroke="#7A3E10" stroke-width="2" stroke-linecap="round"/>`,
  emblem:`<g fill="#C0661C"><circle cx="100" cy="144" r="4.5"/><circle cx="94" cy="137" r="2.2"/><circle cx="100" cy="135" r="2.2"/><circle cx="106" cy="137" r="2.2"/></g>`}};
let CHAR="pixel";
/* Mascot: a person in a costume (default Byte, a glossy toy robot: big white helmet head, huge dark eyes, gold ear discs and fins, slim body with a { } chest emblem, cuffed arms and chunky gold boots.
   Poses: idle, review, think, dance (happy), trophy, finish, bonk (sad), tired, stare, run, chai, zen. */
const POSE_ALIAS={happy:"dance",sad:"bonk"};
const BYTE_POSES=["panic","pointq","pointa","pointup","idle","review","think","dance","trophy","finish","bonk","tired","stare","run","chai","zen","warm","type","read","vibe","drink","stretch","streak","missed"];
/* ================= 3D mascots: every buddy is modelled in three.js and rendered once per pose into a cached image ================= */
const M3D=(()=>{let R=null,ok=null;const cache={};
 function init(){if(ok!==null)return ok;try{if(!window.THREE)return ok=false;const T=THREE,cv=document.createElement("canvas");cv.width=320;cv.height=400;
  R=new T.WebGLRenderer({canvas:cv,alpha:true,antialias:true,preserveDrawingBuffer:true});R.debug.checkShaderErrors=false;R.setPixelRatio(1);R.setSize(320,400,false);R.setClearColor(0,0);ok=true}catch(e){ok=false}return ok}
 const KIND={panic:"stare",pointq:"open",pointa:"down",pointup:"up",dance:"happy",trophy:"open",finish:"happy",chai:"open",think:"up",review:"down",bonk:"x",tired:"sleepy",stare:"stare",zen:"closed",run:"focus",warm:"happy",type:"down",read:"down",vibe:"happy",drink:"happy",stretch:"happy",streak:"happy",missed:"happy"};
 function pal(C){if(C.hero)return {head:C.cowl?C.mask:C.mask,face:C.skin||null,body:C.suit[1],bodyHi:C.suit[0],belly:C.suit[0],limb:C.limb,glove:C.glove,leg:C.limbDk||C.suit[2],boot:C.boot,lens:C.lens,glow:!!C.lensGlow,belt:C.belt,cape:C.cape||null,accent:C.buckle||C.belt};
  return {head:C.head[0],face:null,body:C.gold[1],bodyHi:C.gold[0],belly:C.white[0],limb:C.cuff||C.white[0],glove:C.glove,leg:C.leg[0],boot:C.gold[1],lens:null,glow:false,belt:null,cape:null,accent:C.gold[2]}}
 function emblemTex(col){const c=document.createElement("canvas");c.width=c.height=128;const g=c.getContext("2d");g.fillStyle=col;g.beginPath();g.arc(64,64,60,0,7);g.fill();g.lineWidth=8;g.strokeStyle="rgba(0,0,0,.35)";g.stroke();
  g.fillStyle="#2B1A0E";g.font="800 64px 'JetBrains Mono',monospace";g.textAlign="center";g.textBaseline="middle";g.fillText("{}",64,68);return new THREE.CanvasTexture(c)}
 function shadowTex(){const c=document.createElement("canvas");c.width=c.height=128;const g=c.getContext("2d"),r=g.createRadialGradient(64,64,4,64,64,62);r.addColorStop(0,"rgba(0,0,0,.55)");r.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=r;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)}
 function build(C,pose,t=0){const T=THREE,P=pal(C),id=C.id,kind=KIND[pose]||"open",W=Math.sin(t*Math.PI*2),W2=Math.sin(t*Math.PI*4),Wc=Math.cos(t*Math.PI*2);
  const mat=(c,o={})=>new T.MeshPhysicalMaterial(Object.assign({color:new T.Color(c),roughness:.32,metalness:.05,clearcoat:.7,clearcoatRoughness:.2},o));
  const M=(g,m,p=[0,0,0],s=[1,1,1],r=[0,0,0])=>{const x=new T.Mesh(g,m);x.position.set(...p);x.scale.set(...s);x.rotation.set(...r);return x};
  const sph=new T.SphereGeometry(1,40,28),cyl=(a,b,h)=>new T.CylinderGeometry(a,b,h,32),dark=mat("#14162A",{roughness:.15}),white=mat("#FFFFFF");
  const root=new T.Group(),body=new T.Group(),head=new T.Group();root.add(body);
  /* legs + boots */
  const run=pose==="run"||pose==="panic";
  if(id==="pixel"){const ring=M(new T.TorusGeometry(.42,.07,12,40),mat("#FF4F8B",{emissive:new T.Color("#FF4F8B"),emissiveIntensity:.8}),[0,.95,0],[1,1,1],[Math.PI/2,0,0]);body.add(ring);body.add(M(new T.ConeGeometry(.36,.55,28,1,true),new T.MeshBasicMaterial({color:0xFF7AA8,transparent:true,opacity:.25+.1*W2,side:T.DoubleSide}),[0,.62,0],[1,1,1],[Math.PI,0,0]));body.add(M(cyl(.32,.2,.25),mat("#2B2F44"),[0,1.06,0]))}
  else [-1,1].forEach(sd=>{const lg=new T.Group();lg.position.set(sd*.34,.95,0);lg.add(M(cyl(.17,.15,.62),mat(P.leg),[0,-.31,0]));lg.add(M(sph,mat(P.boot),[0,-.68,.08],[.3,.2,.4]));
   if(run)lg.rotation.x=sd*.75*W;if(pose==="dance")lg.rotation.z=sd*.12*W2;body.add(lg)});
  /* torso */
  const tor=new T.Group();tor.position.y=1.55;body.add(tor);
  tor.add(M(sph,mat(P.body),[0,0,0],[.78,.72,.62]));
  tor.add(M(sph,mat(P.belly,{clearcoat:.3}),[0,-.08,.36],[.46,.4,.28]));
  if(P.belt)tor.add(M(new T.TorusGeometry(.66,.07,12,40),mat(P.belt),[0,-.42,0],[1,1,.85],[Math.PI/2,0,0]));
  const em=new T.Mesh(new T.CircleGeometry(.2,32),new T.MeshStandardMaterial({map:emblemTex(P.bodyHi),roughness:.3}));em.position.set(0,.26,.6);tor.add(em);
  if(P.cape){const g=new T.PlaneGeometry(1.25,1.9,8,10),pos=g.attributes.position;for(let k=0;k<pos.count;k++){const x=pos.getX(k),y=pos.getY(k),down=(0.95-y)/1.9;pos.setX(k,x*(0.62+0.5*down));pos.setZ(k,-.18*Math.cos(x*2.2)-down*(.32+.12*W)+.06*Math.sin(x*4+t*12)*down)}g.computeVertexNormals();
   const cp=new T.Mesh(g,mat(P.cape,{side:T.DoubleSide,clearcoat:.2}));cp.position.set(0,-.62,-.52);tor.add(cp);[-1,1].forEach(sd=>tor.add(M(sph,mat(P.cape),[sd*.42,.5,-.38],[.12,.1,.1])))}
  /* arms: pivot at shoulder, hang down */
  const A={panic:[.2,.2,.9,-.9],pointq:[.18,.18,0,0],pointa:[.18,.18,0,0],pointup:[.18,.18,0,0],warm:[2.2,2.2,0,0],stretch:[2.95,2.95,0,0],type:[.32,.32,-1.15,-1.15],read:[.4,.4,-1.0,-1.0],vibe:[.18,.18,0,0],drink:[.18,.35,0,-2.3],streak:[.3,.3,0,0],missed:[.55,.55,-1.25,-1.25],idle:[.18,.18,0,0],review:[.25,.25,-.6,-.6],think:[.2,.5,0,-1.9],dance:[2.5,2.2,0,0],trophy:[2.95,2.95,0,0],finish:[2.6,2.6,0,0],bonk:[1.25,1.25,0,0],tired:[.06,.06,.2,.2],stare:[.18,.18,0,0],run:[.2,.2,.9,-.9],chai:[.15,.45,0,-1.35],zen:[.95,.95,.3,.3]}[pose]||[.18,.18,0,0];
  const hands={};
  [1,-1].forEach((sd,i)=>{const ar=new T.Group();ar.position.set(sd*.74,.32,0);tor.add(ar);
   ar.add(M(sph,mat(P.body),[0,0,0],[.21,.21,.21]));ar.add(M(cyl(.12,.11,.55),mat(P.limb),[0,-.32,0]));const hd=M(sph,mat(P.glove),[0,-.66,0],[.17,.17,.17]);ar.add(hd);
   let az=A[i],ax=A[2+i];
   if(pose==="idle"&&sd>0){az=1.45+.08*W;ax=-.25} /* points to the next lesson */
   if(pose==="pointq"&&sd>0){az=1.62+.06*W;ax=-.55} /* points at the question card */
   if(pose==="pointa"&&sd>0){az=1.05+.08*W;ax=-.75} /* points down at the answers */
   if(pose==="pointup"&&sd>0){az=2.55+.1*W;ax=-.2} /* points up the road to the next level */
   if((pose==="pointq"||pose==="pointa")&&sd<0){az=.25;ax=-.3}
   if(pose==="warm")az=2.2+.35*W*sd;
   if(pose==="stretch")az=2.95-.2*Math.abs(W);
   if(pose==="type")ax=-1.15+.12*(sd>0?W2:-W2);
   if(pose==="vibe")az=.18+.25*Math.abs(W2);
   if(pose==="drink"&&sd<0)ax=-2.3+.25*W;
   if(pose==="missed")ax=-1.25+.1*W;
   if(pose==="run"||pose==="panic")ax=(sd>0?1:-1)*(pose==="panic"?1.2:.95)*W;if(pose==="panic"&&sd>0)az=.9+.3*W2;
   if(pose==="dance")az=A[i]+.45*(sd>0?W2:-W2);
   if(pose==="trophy"||pose==="finish")az=A[i]-.25*Math.abs(W2);
   if(pose==="chai"&&sd<0)ax=-1.35-.35*(W>0?W:0);
   if(pose==="think"&&sd<0)ax=-1.9+.08*W;
   if(pose==="review")ax=A[2+i]+.12*W;
   if(pose==="bonk")az=1.25+.3*W2;
   if(pose==="zen")az=.95+.1*W;
   ar.rotation.z=sd*az;ar.rotation.x=ax;hands[sd>0?"L":"R"]=hd});
  /* props */
  if(pose==="trophy"){const cup=new T.Group(),g=mat("#FFC52E",{metalness:.6,roughness:.25});cup.add(M(cyl(.22,.08,.3),g,[0,.12,0]));cup.add(M(cyl(.05,.05,.12),g,[0,-.08,0]));cup.add(M(cyl(.12,.12,.04),g,[0,-.16,0]));cup.scale.setScalar(1/.17);cup.position.set(0,-.2/.17,0);hands.L.add(cup)}
  if(pose==="chai"){const cup=new T.Group();cup.add(M(cyl(.13,.1,.22),mat("#FFF7E6"),[0,0,0]));cup.add(M(cyl(.11,.11,.02),mat("#A0522D"),[0,.1,0]));cup.add(M(new T.TorusGeometry(.07,.02,8,16),mat("#FFF7E6"),[.14,0,0]));hands.R.add(cup);cup.scale.setScalar(1/.17);cup.position.set(0,.2,0)}
  /* head */
  head.position.y=2.62;body.add(head);body.add(M(cyl(.14,.16,.18),mat(P.leg),[0,2.08,0]));
  if(id==="pixel"){const sh=new T.Shape(),w=.78,h=.58,r=.26;sh.moveTo(-w+r,-h);sh.lineTo(w-r,-h);sh.quadraticCurveTo(w,-h,w,-h+r);sh.lineTo(w,h-r);sh.quadraticCurveTo(w,h,w-r,h);sh.lineTo(-w+r,h);sh.quadraticCurveTo(-w,h,-w,h-r);sh.lineTo(-w,-h+r);sh.quadraticCurveTo(-w,-h,-w+r,-h);
   const eg=new T.ExtrudeGeometry(sh,{depth:.8,bevelEnabled:true,bevelThickness:.14,bevelSize:.12,bevelSegments:6,curveSegments:16});eg.translate(0,0,-.47);head.add(new T.Mesh(eg,mat(P.head)));
   const scr=new T.Shape(),sw=.62,shh=.44,sr=.18;scr.moveTo(-sw+sr,-shh);scr.lineTo(sw-sr,-shh);scr.quadraticCurveTo(sw,-shh,sw,-shh+sr);scr.lineTo(sw,shh-sr);scr.quadraticCurveTo(sw,shh,sw-sr,shh);scr.lineTo(-sw+sr,shh);scr.quadraticCurveTo(-sw,shh,-sw,shh-sr);scr.lineTo(-sw,-shh+sr);scr.quadraticCurveTo(-sw,-shh,-sw+sr,-shh);
   const sm=new T.Mesh(new T.ShapeGeometry(scr,16),new T.MeshPhysicalMaterial({color:0x0E1220,roughness:.1,clearcoat:1}));sm.position.z=.48;head.add(sm);
   [-1,1].forEach(sd=>{head.add(M(cyl(.025,.025,.38),mat("#2B2F44"),[sd*.45,.78,0],[1,1,1],[0,0,-sd*.3]));head.add(M(sph,mat("#FFC52E",{emissive:new T.Color("#FFC52E"),emissiveIntensity:.6+.3*W2}),[sd*.52,.97,0],[.08,.08,.08]));head.add(M(cyl(.16,.16,.12),mat("#2B2F44"),[sd*.92,0,0],[1,1,1],[0,0,Math.PI/2]))})}
  else head.add(M(sph,mat(P.head),[0,0,0],[.84,.76,.74]));
  if(P.face)head.add(M(sph,mat(P.face,{clearcoat:.2}),[0,-.12,.34],[.56,.42,.4]));
  const ez=id==="pixel"?.5:P.face?.76:.7,ey=.04;
  const eye=x=>{const g=new T.Group();g.position.set(x,ey,ez);head.add(g);
   if(id==="pixel"){const em=mat("#5DE3C8",{emissive:new T.Color("#5DE3C8"),emissiveIntensity:1.1,roughness:.3}),px=(a,b,w=.075,h=.075)=>g.add(M(new T.BoxGeometry(w,h,.03),em,[a,b,0]));
    if(kind==="happy"){px(-.1,-.03);px(-.05,.03);px(0,.07);px(.05,.03);px(.1,-.03);return}
    if(kind==="closed"||kind==="sleepy"){px(0,-.02,.26,.06);return}
    if(kind==="x"){[-.08,-.04,0,.04,.08].forEach(k=>{px(k,k,.06,.06);px(k,-k,.06,.06)});return}
    const dy={up:.06,down:-.06}[kind]||0;px(0,dy,.16,kind==="focus"?.1:.2);px(.05,dy+.05,.04,.04);return}
   if(P.lens){const lm=mat(P.lens,P.glow?{emissive:new T.Color(P.lens),emissiveIntensity:.55}:{});
    if(kind==="happy"||kind==="closed"){g.add(M(new T.TorusGeometry(.13,.045,10,24,Math.PI),dark,[0,kind==="happy"?-.04:.06,.05],[1,1,1],[0,0,kind==="happy"?0:Math.PI]));return}
    if(kind==="x"){g.add(M(new T.BoxGeometry(.28,.06,.06),dark,[0,0,.06],[1,1,1],[0,0,.7]));g.add(M(new T.BoxGeometry(.28,.06,.06),dark,[0,0,.06],[1,1,1],[0,0,-.7]));return}
    g.add(M(sph,mat("#14162A",{roughness:.2}),[0,0,-.01],[.27,kind==="sleepy"?.13:.21,.1],[0,0,x>0?-.2:.2]));g.add(M(sph,lm,[0,0,.02],[.22,kind==="sleepy"?.09:.16,.1],[0,0,x>0?-.2:.2]));g.add(M(sph,white,[.06,.05,.1],[.045,.035,.02]));return}
   g.add(M(sph,white,[0,0,0],[.24,.27,.12]));
   if(kind==="happy"||kind==="closed"){g.add(M(new T.TorusGeometry(.11,.035,10,24,Math.PI),dark,[0,kind==="happy"?-.03:.05,.08],[1,1,1],[0,0,kind==="happy"?0:Math.PI]));return}
   if(kind==="x"){g.add(M(new T.BoxGeometry(.22,.05,.05),dark,[0,0,.09],[1,1,1],[0,0,.75]));g.add(M(new T.BoxGeometry(.22,.05,.05),dark,[0,0,.09],[1,1,1],[0,0,-.75]));return}
   if(kind==="stare"){g.add(M(sph,dark,[0,0,.08],[.04,.04,.03]));return}
   const dy={up:.07,down:-.07,sleepy:-.06}[kind]||0,sy=kind==="focus"?.1:.15;
   g.add(M(sph,mat("#14162A",{roughness:.08,clearcoat:1}),[0,dy,.06],[.14,sy,.07]));
   g.add(M(sph,white,[.05,dy+.06,.12],[.04,.04,.02]));g.add(M(sph,mat("#7CF0E4",{emissive:new T.Color("#7CF0E4"),emissiveIntensity:.6}),[-.04,dy-.06,.12],[.018,.018,.01]));
   if(kind==="sleepy")g.add(M(sph,mat(P.head),[0,.11,.04],[.23,.14,.1]))};
  eye(-.3);eye(.3);
  /* mouth */
  if(id==="pixel"){const mm=mat("#5DE3C8",{emissive:new T.Color("#5DE3C8"),emissiveIntensity:1});const smile=["dance","trophy","finish","chai","happy","vibe","streak","missed","warm","stretch","drink"].includes(pose);if(smile){[-.12,-.06,0,.06,.12].forEach((k,j)=>head.add(M(new T.BoxGeometry(.06,.05,.03),mm,[k,-.3+(j===0||j===4?.04:0),.5])))}else if(pose==="bonk")head.add(M(new T.BoxGeometry(.2,.05,.03),mm,[0,-.32,.5]));else head.add(M(new T.BoxGeometry(.12,.05,.03),mm,[0,-.3,.5]))}
  else if(["dance","trophy","finish","chai"].includes(pose))head.add(M(new T.TorusGeometry(.09,.025,8,20,Math.PI),dark,[0,-.3,.73],[1,1,1],[0,0,Math.PI]));
  else if(pose==="bonk")head.add(M(new T.TorusGeometry(.08,.022,8,20,Math.PI),dark,[0,-.36,.73]));
  else head.add(M(sph,dark,[0,-.32,.73],[.05,.04,.03]));
  /* costume details */
  const acc=P.accent,gold=mat(id==="byte"?C.gold[1]:acc);
  if(id==="byte"){[-1,1].forEach(sd=>{head.add(M(new T.ConeGeometry(.22,.5,24),mat(C.gold[1]),[sd*.52,.72,0],[1,1,.7],[0,0,-sd*.4]));head.add(M(cyl(.26,.26,.16),mat(C.gold[1]),[sd*.9,0,0],[1,1,1],[0,0,Math.PI/2]))})}
  if(id==="mochi"){[-1,1].forEach(sd=>head.add(M(new T.ConeGeometry(.24,.48,24),mat(P.head),[sd*.5,.72,0],[1,1,.7],[0,0,-sd*.35])));const tl=M(new T.TorusGeometry(.5,.07,10,30,Math.PI*1.2),mat(P.head),[.5,1.0,-.35],[1,1,1],[0,.4,-.6]);body.add(tl)}
  if(id==="astro"){head.add(M(sph,new T.MeshPhysicalMaterial({color:0xBFE4FF,transparent:true,opacity:.22,roughness:0,clearcoat:1}),[0,0,0],[1.08,1.0,.98]));head.add(M(cyl(.025,.025,.4),mat("#8E97B3"),[0,1.0,0]));head.add(M(sph,mat("#FF8A1F",{emissive:new T.Color("#FF8A1F"),emissiveIntensity:.5}),[0,1.22,0],[.08,.08,.08]))}
  if(id==="sixer"){head.add(M(new T.SphereGeometry(1,32,16,0,Math.PI*2,0,Math.PI/2),mat(C.suit?C.suit[1]:"#1E5BD8"),[0,.08,0],[.95,.8,.83]));head.add(M(cyl(.5,.5,.04),mat("#FF8A1F"),[0,.06,.55],[1,1,.55]))}
  if(id==="ninja"){head.add(M(new T.TorusGeometry(.86,.07,10,40),mat("#E0322F"),[0,.32,0],[1,1,.92],[Math.PI/2,0,0]));head.add(M(new T.BoxGeometry(.5,.08,.04),mat("#E0322F"),[.55,.3,-.7],[1,1,1],[0,.5,-.4]))}
  if(id==="captain"){[-1,1].forEach(sd=>head.add(M(new T.ConeGeometry(.1,.3,16),mat(P.head),[sd*.34,.82,0],[1,1,1],[0,0,-sd*.25])))}
  if(id==="prime"){head.add(M(new T.BoxGeometry(.24,.36,.9),mat(C.suit[1],{metalness:.5}),[0,.72,0]))}
  if(id==="webby"){head.add(M(new T.TorusGeometry(.5,.012,6,40),mat("#1A0640"),[0,.05,.55],[1,1,1]));head.add(M(new T.TorusGeometry(.3,.012,6,40),mat("#1A0640"),[0,.05,.66]))}
  /* ---- pose accessories (hats, glasses, props, floating icons) ---- */
  const isBolt=id==="byte",cyl2=(a,b,h,n=32)=>new T.CylinderGeometry(a,b,h,n);
  const icon=(txt,col,sz,pos)=>{const c=document.createElement("canvas");c.width=c.height=128;const g=c.getContext("2d");g.font=`900 ${sz}px 'Unbounded','Arial Black',sans-serif`;g.textAlign="center";g.textBaseline="middle";g.lineWidth=10;g.strokeStyle="#14162A";g.strokeText(txt,64,68);g.fillStyle=col;g.fillText(txt,64,68);
   const sp=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),transparent:true,depthTest:false}));sp.position.set(...pos);sp.scale.set(.8,.8,1);root.add(sp);return sp};
  const inHand=(h,o,p=[0,0,0])=>{o.scale.multiplyScalar(1/.17);o.position.set(p[0]/.17,p[1]/.17,p[2]/.17);h.add(o)};
  if(isBolt){/* round glasses + pose shirt colour */
   const fr=mat("#14162A",{roughness:.2});[-.3,.3].forEach(x=>head.add(M(new T.TorusGeometry(.2,.035,10,28),fr,[x,.04,.73])));head.add(M(cyl2(.025,.025,.2),fr,[0,.06,.75],[1,1,1],[0,0,Math.PI/2]));
   const shirt={run:"#E5484D",warm:"#E5484D",stretch:"#E5484D",drink:"#E5484D",read:"#3E7C59",chai:"#3E7C59",tired:"#9DB4E0",trophy:"#6E56CF",finish:"#6E56CF",dance:"#6E56CF",streak:"#6E56CF",vibe:"#6E56CF"}[pose];
   }
  const hat=(kind)=>{const h=new T.Group();h.position.set(0,.55,0);head.add(h);const H=c=>mat(c);
   if(kind==="cap"||kind==="capblue"){const c=kind==="cap"?"#E5484D":"#2F8CFF";h.add(M(new T.SphereGeometry(.78,32,16,0,Math.PI*2,0,Math.PI/2),H(c),[0,-.12,0],[1,.6,1]));h.add(M(cyl2(.62,.62,.04),H(c),[0,-.1,-.55],[1,1,.6]))}
   if(kind==="band"){head.add(M(new T.TorusGeometry(.8,.07,10,40),H("#FFFFFF"),[0,.32,0],[1.02,1,.95],[Math.PI/2,0,0]));head.add(M(new T.TorusGeometry(.8,.035,8,40),H("#E5484D"),[0,.32,0],[1.04,1,.97],[Math.PI/2,0,0]))}
   if(kind==="party"){h.add(M(new T.ConeGeometry(.3,.75,24),H("#FF4F8B"),[0,.3,0],[1,1,1],[0,0,.15]));h.add(M(sph,H("#FFE45C"),[.06,.7,0],[.08,.08,.08]))}
   if(kind==="grad"){h.add(M(new T.BoxGeometry(1.25,.06,1.25),H("#1C1E2C"),[0,.12,0],[1,1,1],[0,.6,0]));h.add(M(cyl2(.42,.46,.2),H("#1C1E2C"),[0,0,0]));h.add(M(cyl2(.012,.012,.4),H("#FFC52E"),[.45,-.05,.2],[1,1,1],[.2,0,.3]))}
   if(kind==="detective"||kind==="fedora"){h.add(M(cyl2(.75,.75,.04),H("#2C2C34"),[0,-.12,0]));h.add(M(cyl2(.42,.5,.38),H("#2C2C34"),[0,.06,0]));h.add(M(cyl2(.505,.505,.08),H("#C9A227"),[0,-.06,0]))}
   if(kind==="bucket"){h.add(M(cyl2(.48,.62,.36),H("#8EDB7A"),[0,0,0]));h.add(M(cyl2(.8,.8,.04),H("#6FC75A"),[0,-.17,0]))}
   if(kind==="night"){h.add(M(new T.ConeGeometry(.66,1.0,28),H("#5B6B9A"),[.15,.22,-.05],[1,1,1],[0,0,-.7]));h.add(M(new T.TorusGeometry(.6,.1,10,30),H("#FFFFFF"),[0,-.18,0],[1,1,1],[Math.PI/2,0,0]));h.add(M(sph,H("#FFFFFF"),[.6,-.05,0],[.12,.12,.12]))}};
  const shades=()=>{const sg=mat("#0B0B10",{roughness:.05,clearcoat:1});[-.3,.3].forEach(x=>head.add(M(sph,sg,[x,.05,.74],[.25,.17,.06])));head.add(M(new T.BoxGeometry(.25,.05,.05),sg,[0,.1,.76]))};
  const phones=()=>{const pm=mat("#5E5E5E"),cup=mat("#FF8A1F");head.add(M(new T.TorusGeometry(.86,.06,10,40,Math.PI),pm,[0,.05,0],[1,1,1],[0,0,0]));[-1,1].forEach(sd=>head.add(M(cyl2(.24,.24,.2),cup,[sd*.86,.02,0],[1,1,1],[0,0,Math.PI/2])))};
  const H={pointq:"cap",pointa:"cap",pointup:"cap",idle:"cap",run:"band",warm:"band",stretch:"band",finish:"party",trophy:"grad",review:"detective",type:"cap",dance:"bucket",vibe:"bucket",drink:"capblue",streak:"capblue",chai:"fedora",tired:"night"}[pose];


  if(pose==="vibe"){icon("♪","#5DE3C8",80,[1.0,3.4,0])}
  if(pose==="think")icon("?","#FFE45C",96,[1.0,3.35,0]);
  if(pose==="panic"){icon("!","#FF5468",100,[1.05,3.45,0]);const dr=icon("💧","#5BC0FF",60,[-.95,3.0-.15*Math.abs(W),0]);dr.scale.set(.55,.55,1)}
  if(pose==="pointq")icon("?","#5DE3C8",70,[1.55,2.85,0]);if(pose==="pointa")icon("✓","#3DD16F",70,[1.45,1.6,0]);if(pose==="pointup")icon("↑","#FFE45C",80,[1.2,3.7,0]);
  if(pose==="tired")icon("z","#FFFFFF",70,[1.0,3.5,0]),icon("Z","#FFFFFF",90,[1.35,3.95,0]);
  if(pose==="missed")icon("♥","#FF7AA8",100,[1.0,3.4,0]);
  if(pose==="streak"){const fl=new T.Group();fl.add(M(new T.ConeGeometry(.2,.55,20),mat("#FF7A1A",{emissive:new T.Color("#FF7A1A"),emissiveIntensity:.5}),[0,0,0]));fl.add(M(new T.ConeGeometry(.11,.3,16),mat("#FFE45C",{emissive:new T.Color("#FFE45C"),emissiveIntensity:.6}),[0,-.06,.06]));fl.position.set(0,1.2+.05*W2,0);fl.scale.y=1+.15*W2;head.add(fl)}
  if(pose==="bonk"){head.add(M(new T.BoxGeometry(.5,.13,.04),mat("#FFFFFF"),[.3,.55,.55],[1,1,1],[-.5,0,-.5]));icon("✦","#FFE45C",70,[-.9,3.2,0])}
  if(pose==="warm"||pose==="stretch"){icon("✦","#FFE45C",60,[-1.0,3.1,0]);icon("✦","#FFE45C",50,[1.05,3.3,0])}
  if(pose==="zen"){const ring=new T.Mesh(new T.RingGeometry(.6,1.0,40),new T.MeshBasicMaterial({color:0xFFE45C,transparent:true,opacity:.35,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.04;root.add(ring)}
  if(pose==="finish"){["#FF7AA8","#5DE3C8","#FFE45C","#7B5CFF","#3DD16F"].forEach((c,k)=>root.add(M(new T.BoxGeometry(.1,.1,.02),mat(c),[(k-2)*.45,3.6+.2*Math.sin(k*2+t*6.3),.2],[1,1,1],[k,k*2+t*6,0])))}
  if(pose==="review"){const mg=new T.Group();mg.add(M(new T.TorusGeometry(.18,.04,10,26),mat("#2C2C34"),[0,0,0]));mg.add(M(new T.CircleGeometry(.17,26),new T.MeshPhysicalMaterial({color:0xBFE4FF,transparent:true,opacity:.45,roughness:0}),[0,0,0]));mg.add(M(cyl2(.035,.035,.32),mat("#8A5300"),[0,-.33,0]));inHand(hands.L,mg,[0,.2,.12])}
  if(pose==="type"){const lp=new T.Group();lp.add(M(new T.BoxGeometry(1.1,.05,.7),mat("#3A3F58"),[0,0,0]));const scr=M(new T.BoxGeometry(1.1,.68,.04),mat("#2B2F44"),[0,.34,-.35],[1,1,1],[-.25,0,0]);lp.add(scr);lp.add(M(new T.PlaneGeometry(.95,.55),new T.MeshBasicMaterial({color:0x14C3A2}),[0,.34,-.32],[1,1,1],[-.25,0,0]));lp.position.set(0,1.2,.75);body.add(lp)}
  if(pose==="read"){const bk=new T.Group();[-1,1].forEach(sd=>bk.add(M(new T.BoxGeometry(.5,.62,.05),mat("#FFFFFF"),[sd*.26,0,0],[1,1,1],[0,sd*.35,0])));bk.add(M(new T.BoxGeometry(1.08,.66,.03),mat("#E5484D"),[0,0,-.06]));bk.position.set(0,1.45,.78);bk.rotation.x=-.35;body.add(bk)}
  if(pose==="drink"){const bt=new T.Group();bt.add(M(cyl2(.11,.11,.5),new T.MeshPhysicalMaterial({color:0x5BC0FF,transparent:true,opacity:.75,roughness:0,clearcoat:1}),[0,.15,0]));bt.add(M(cyl2(.07,.07,.08),mat("#FFFFFF"),[0,.44,0]));inHand(hands.R,bt,[0,.05,0]);icon("•","#5BC0FF",80,[1.1,3.3,0])}
  if(pose==="trophy"&&isBolt){}
  /* pose tilt */
  const tilt={panic:[-.1,0,.12*W2],pointq:[0,.55,0],pointa:[.25,.5,0],pointup:[-.3,.35,0],warm:[0,0,.1*W],stretch:[-.15,0,0],type:[.22,0,0],read:[.28,.08*W,0],vibe:[0,0,.15*W2],drink:[-.25,0,0],streak:[-.05,.1*W,0],missed:[0,0,.12*W],dance:[0,0,.12*W2],bonk:[0,0,.25*W2],tired:[.28,0,.05*W],think:[-.12,.15*W,-.1],review:[.18+.1*W,0,0],idle:[0,.18*W,.05*W],stare:[0,.12*W,0],chai:[-.05,0,.06*W],trophy:[-.15,0,.08*W2],finish:[-.1,0,.1*W2]}[pose]||[0,0,0];head.rotation.set(...tilt);
  const hop={panic:.18,dance:.16,trophy:.22,finish:.24,run:.12,vibe:.08,warm:.1,streak:.06}[pose];if(hop)body.position.y=hop*Math.abs(W2);
  if(pose==="dance")body.rotation.y=.35*W;if(pose==="zen")body.position.y=.18+.12*W;
  if(pose==="idle")tor.scale.set(1,1+.02*W2,1);
  if(run)body.rotation.x=.18;if(pose==="tired")body.rotation.z=.06*W;
  /* ground shadow */
  const sh=new T.Mesh(new T.PlaneGeometry(2.6,1.3),new T.MeshBasicMaterial({map:shadowTex(),transparent:true,depthWrite:false}));sh.rotation.x=-Math.PI/2;sh.position.y=.02;root.add(sh);
  if(id==="pixel")root.position.y+=.18+.1*W;
  root.rotation.y=["pointq","pointa","pointup"].includes(pose)?-.05:-.38;return root}
 const N=8;
 /* A pose takes 50–300 ms to model and render, so finished sprite sheets are kept in IndexedDB (read before the game starts,
    see index.html) under a key that changes whenever the costume or the modelling code changes. */
 const hash=t=>{let h=5381;for(let i=0;i<t.length;i++)h=(h*33^t.charCodeAt(i))>>>0;return h.toString(36)};
 let VER=null;const ver=()=>VER||(VER=hash(build.toString()+pal.toString()));
 const SAVED=window.KBC_M3D||{},pkey=(C,pose)=>"m3d|"+C.id+"|"+pose+"|"+ver()+"|"+hash(JSON.stringify(C));
 let pruned=false;
 function persist(k,v){try{const o=indexedDB.open("kbc-cache",1);o.onupgradeneeded=()=>o.result.createObjectStore("m3d");
  o.onsuccess=()=>{try{const st=o.result.transaction("m3d","readwrite").objectStore("m3d");st.put(v,k);
   if(!pruned){pruned=true;const c=st.openCursor();c.onsuccess=()=>{const x=c.result;if(!x)return;if(String(x.key).split("|")[3]!==ver())x.delete();x.continue()}}}catch(e){}}}catch(e){}}
 function render(C,pose){const key=C.id+"|"+pose;if(cache[key]!==undefined)return cache[key];
  const pk=pkey(C,pose);if(SAVED[pk])return cache[key]=SAVED[pk];if(!init())return null;
  try{const T=THREE,sheet=document.createElement("canvas");sheet.width=320*N;sheet.height=400;const g2=sheet.getContext("2d");
   for(let f=0;f<N;f++){const sc=new T.Scene();sc.add(new T.HemisphereLight(0xFFF4E0,0x2B1A0E,.85));
    const k=new T.DirectionalLight(0xFFFFFF,1.15);k.position.set(3,5,6);sc.add(k);const r1=new T.DirectionalLight(0x7CF0E4,.5);r1.position.set(-5,2,-3);sc.add(r1);const r2=new T.DirectionalLight(0xFF7AA8,.35);r2.position.set(5,1,-4);sc.add(r2);
    sc.add(build(C,pose,f/N));const cam=new T.PerspectiveCamera(28,320/400,.1,100);cam.position.set(0,2.05,10.2);cam.lookAt(0,1.85,0);
    R.render(sc,cam);g2.drawImage(R.domElement,f*320,0);/* materials are not disposed: that would drop their compiled shader programs and every frame would compile them again */
    sc.traverse(o=>{o.geometry&&o.geometry.dispose();if(o.material&&o.material.map)o.material.map.dispose()})}
   const url=sheet.toDataURL("image/png");persist(pk,url);return cache[key]=url}catch(e){return cache[key]=null}}
 /* draw the remaining poses of a costume one at a time while the browser is idle, so no screen waits for its mascot */
 function warm(C,poses){const todo=poses.filter(p=>cache[C.id+"|"+p]===undefined);const idle=window.requestIdleCallback||(f=>setTimeout(()=>f({timeRemaining:()=>50}),200));
  const step=d=>{if(!todo.length||AC.signal.aborted)return;if(d.timeRemaining()<8||document.hidden)return idle(step,{timeout:4000});render(C,todo.shift());setTimeout(()=>idle(step,{timeout:4000}),120)};
  idle(step,{timeout:4000})}
 return {render,warm}})();
function mascot(mood,size,cid){const C=COSTUMES[cid]||COSTUMES[CHAR]||COSTUMES.byte,K=C.id,m=BYTE_POSES.includes(POSE_ALIAS[mood]||mood)?(POSE_ALIAS[mood]||mood):"idle",DK="#2A2E4A",HAND=C.glove,INK="#14162A";
 {const U=M3D.render(C,m);if(U)return `<span class="mascot m3d ${m} c-${K}" style="width:${size}px" aria-hidden="true"><span class="m3s"><span class="m3strip" style="background-image:url(${U})"></span></span></span>`}
 if(C.hero)return heroMascot(m,size,C,K);
 /* ---- eyes: white rim + dark lens, shaped per pose ---- */
 const kind={dance:"happy",trophy:"happy",finish:"happy",chai:"happy",think:"up",review:"down",bonk:"x",tired:"sleepy",stare:"stare",zen:"closed",run:"focus"}[m]||"open";
 const lens=(x,y,rx,ry,blink)=>`${blink?'<g class="rblink">':""}<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#rLens)"/>${blink?"</g>":""}`;
 const eye=cx=>{const rim=`<ellipse cx="${cx}" cy="74" rx="17" ry="20" fill="url(#rRim)" stroke="#C3C7D8" stroke-width="1.4"/>`;
  if(kind==="happy")return rim+`<path d="M${cx-10} 78Q${cx} 62 ${cx+10} 78" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>`;
  if(kind==="closed")return rim+`<path d="M${cx-10} 72Q${cx} 82 ${cx+10} 72" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
  if(kind==="x")return rim+`<path d="M${cx-8} 66L${cx+8} 82M${cx+8} 66L${cx-8} 82" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
  if(kind==="stare")return rim+`<circle cx="${cx}" cy="74" r="3.6" fill="${INK}"/>`;
  if(kind==="sleepy")return rim+lens(cx,80,10,10)+`<path d="M${cx-18} 54H${cx+18}V76H${cx-18}Z" fill="#ECEEF6"/><path d="M${cx-16} 76H${cx+16}" stroke="#AEB3C8" stroke-width="2.2" stroke-linecap="round"/>`;
  if(kind==="up")return rim+lens(cx+4,69,10.5,13)+`<circle cx="${cx+7}" cy="64" r="3.4" fill="#fff"/><circle cx="${cx+1}" cy="75" r="1.5" fill="#7CF0E4"/>`;
  if(kind==="down")return rim+lens(cx+3,80,10.5,12.5)+`<circle cx="${cx+6}" cy="75" r="3.2" fill="#fff"/>`;
  if(kind==="focus")return rim+lens(cx,76,11,13)+`<circle cx="${cx+4}" cy="70" r="3.4" fill="#fff"/><path d="M${cx<100?cx-15:cx+15} 58L${cx<100?cx+11:cx-11} 64" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  return rim+lens(cx,75,11.5,14,true)+`<circle cx="${cx+4}" cy="69" r="3.6" fill="#fff"/><circle cx="${cx-3}" cy="81" r="1.6" fill="#7CF0E4"/>`};
 /* ---- mouths ---- */
 const mouth={dance:`<path d="M90 99Q100 116 110 99Z" fill="${INK}"/><path d="M95 106Q100 110 105 106" fill="#FF7A8A"/>`,
  trophy:`<path d="M90 99Q100 116 110 99Z" fill="${INK}"/><path d="M95 106Q100 110 105 106" fill="#FF7A8A"/>`,
  finish:`<path d="M90 99Q100 116 110 99Z" fill="${INK}"/><path d="M95 106Q100 110 105 106" fill="#FF7A8A"/>`,
  chai:`<path d="M94 101Q100 107 106 101" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  zen:`<path d="M95 102Q100 106 105 102" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  bonk:`<path d="M90 104q5-5 10 0t10 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  tired:`<ellipse cx="100" cy="104" rx="3.4" ry="4" fill="${INK}"/>`,
  stare:`<path d="M93 103H107" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  think:`<ellipse cx="103" cy="103" rx="2.6" ry="2.2" fill="${INK}"/>`,
  review:`<path d="M95 103H105" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  run:`<path d="M92 100Q100 110 108 100" fill="${INK}"/>`}[m]||`<ellipse cx="100" cy="102" rx="2.4" ry="1.6" fill="${INK}"/>`;
 /* ---- skeleton rig: Byte is a person in a costume. Every limb is a two-bone chain
    (shoulder→elbow→wrist, hip→knee→ankle); a pose only sets joint angles, so hands and boots
    always follow their forearm and shin. Angles in degrees: 0 = straight down, + = away from the body. ---- */
 const SH={L:[73,132],R:[127,132]},HP={L:[90,181],R:[110,181]},UA=24,FA=21,TH=22,SN=22;
 const dir=(s,a)=>{const r=a*Math.PI/180;return [s*Math.sin(r),Math.cos(r)]};
 const add=(p,d,l)=>[p[0]+d[0]*l,p[1]+d[1]*l];
 const r1=v=>Math.round(v*10)/10;
 /* rotation that turns local "down" (0,1) onto vector d */
 const rotOf=d=>r1(-Math.atan2(d[0],d[1])*180/Math.PI);
 function armChain(side,[a1,a2]){const s=side==="L"?-1:1,S0=SH[side],d1=dir(s,a1),E=add(S0,d1,UA),d2=dir(s,a2),W=add(E,d2,FA),Hd=add(W,d2,7);
  const P=p=>r1(p[0])+" "+r1(p[1]),cuff0=add(W,d2,-6);
  const svg=`<path d="M${P(S0)}L${P(E)}L${P(W)}" stroke="${C.sl[0]}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M${P(S0)}L${P(E)}L${P(W)}" stroke="${C.sl[1]}" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M${P(S0)}L${P(E)}" stroke="${C.sl[2]}" stroke-width="3" stroke-linecap="round" opacity=".7" transform="translate(${-s*1.5} -1.5)"/>
<path d="M${P(cuff0)}L${P(W)}" stroke="${C.cuff}" stroke-width="11" stroke-linecap="round"/>
<circle cx="${r1(E[0])}" cy="${r1(E[1])}" r="5.6" fill="${C.sl[3]}"/>
<g transform="translate(${P(Hd)}) rotate(${rotOf(d2)})"><path d="M-4 5v6M0 6v6.5M4 5v6" stroke="${HAND}" stroke-width="3.6" stroke-linecap="round"/><ellipse rx="7.6" ry="8.4" fill="${HAND}"/><ellipse cx="${-s*6.5}" cy="-1" rx="3" ry="4.6" fill="${C.glove2}"/></g>
<circle cx="${S0[0]}" cy="${S0[1]}" r="10" fill="url(#rGold)"/>`;
  return {svg,hand:add(Hd,d2,2)}}
 function legChain(side,[t1,t2,foot]){const s=side==="L"?-1:1,H0=HP[side],K=add(H0,dir(s,t1),TH),A=add(K,dir(s,t2),SN);
  const P=p=>r1(p[0])+" "+r1(p[1]),b=s<0?1:-1;
  return `<path d="M${P(H0)}L${P(K)}L${P(A)}" stroke="${C.leg[0]}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M${P(H0)}L${P(K)}L${P(A)}" stroke="${C.leg[1]}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<circle cx="${r1(K[0])}" cy="${r1(K[1])}" r="7.6" fill="url(#rGold)"/>
<g transform="translate(${P(A)}) rotate(${s<0?foot:-foot}) scale(.86)"><path d="M${-21*b} 28Q${-23*b} 6 ${-9*b} 0H${9*b}Q${17*b} 6 ${17*b} 16V28Z" fill="url(#rGold)"/><path d="M${-21*b} 28H${17*b}" stroke="#9A5A05" stroke-width="3"/><path d="M${-13*b} 8q${8*b}-4 ${16*b} 0" stroke="#fff" stroke-width="2" opacity=".5" fill="none"/></g>`}
 /* pose = {la,ra:[upper,fore], ll,rl:[thigh,shin,foot]}; foot + = toe up/outward */
 const ARM_DOWN=[10,5],LEG_STAND=[3,1,0];
 const POSES={
  idle:{la:ARM_DOWN,ra:ARM_DOWN,ll:LEG_STAND,rl:LEG_STAND},
  stare:{la:[6,2],ra:[6,2],ll:LEG_STAND,rl:LEG_STAND},
  review:{la:ARM_DOWN,ra:[38,196],ll:[8,0,0],rl:LEG_STAND},
  think:{la:[14,-30],ra:[-12,198],ll:LEG_STAND,rl:[-4,10,-6]},
  trophy:{la:[40,110],ra:[160,178],ll:[34,-30,6],rl:[34,-30,6]},
  finish:{la:[150,165],ra:[150,165],ll:[20,14,10],rl:[20,14,10]},
  bonk:{la:[6,0],ra:[62,182],ll:[-12,16,8],rl:[-12,16,8]},
  tired:{la:[4,-2],ra:[4,-2],ll:[8,-6,0],rl:[8,-6,0]},
  chai:{la:ARM_DOWN,ra:[-8,206],ll:LEG_STAND,rl:[12,-4,-14]},
  zen:{la:[42,-50],ra:[42,-50],ll:[72,-62,30],rl:[72,-62,30]},
  /* two-frame poses: frame A and frame B alternate */
  run:[{la:[50,170],ra:[18,-20],ll:[52,-18,-8],rl:[6,2,0]},{la:[18,-20],ra:[50,170],ll:[6,2,0],rl:[52,-18,-8]}],
  dance:[{la:[120,160],ra:[40,-50],ll:LEG_STAND,rl:[58,-12,-10]},{la:[40,-50],ra:[120,160],ll:[58,-12,-10],rl:LEG_STAND}]};
 const build=p=>{const L=armChain("L",p.la),R=armChain("R",p.ra);return {legs:legChain("L",p.ll)+legChain("R",p.rl),arms:L.svg+R.svg,hand:{L:L.hand,R:R.hand}}};
 const pz=POSES[m]||POSES.idle,two=Array.isArray(pz),fA=build(two?pz[0]:pz),fB=two?build(pz[1]):null;
 const legs=two?`<g class="rfa">${fA.legs}</g><g class="rfb">${fB.legs}</g>`:fA.legs;
 const arms=two?`<g class="rfa">${fA.arms}</g><g class="rfb">${fB.arms}</g>`:fA.arms;
 /* props sit in the right hand */
 const [hx,hy]=fA.hand.R.map(r1);
 const props={
  trophy:`<g transform="translate(${hx} ${hy-20})"><path d="M-14 -14h28v8a14 14 0 0 1-28 0z" fill="url(#rGold)" stroke="#9A5A05" stroke-width="1.5"/><path d="M-14 -10h-6a6 6 0 0 0 6 10M14 -10h6a6 6 0 0 1-6 10" fill="none" stroke="#C7760A" stroke-width="3"/><rect x="-4" y="6" width="8" height="10" fill="#C7760A"/><rect x="-10" y="14" width="20" height="6" rx="2" fill="url(#rGold)"/><text x="0" y="-1" text-anchor="middle" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="10" fill="#7A4300">{}</text></g>`,
  review:`<g><path d="M${hx} ${hy}L${hx-6} ${hy-16}" stroke="${DK}" stroke-width="5" stroke-linecap="round"/><circle cx="${hx-11}" cy="${hy-31}" r="16" fill="rgba(124,240,228,.18)" stroke="url(#rGold)" stroke-width="5"/><path d="M${hx-19} ${hy-39}q4-4 9-3" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".8"/></g>`,
  chai:`<g transform="translate(${hx-10} ${hy-16})"><path d="M0 4h20v12a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z" fill="#F3F4FA" stroke="#9AA0BC" stroke-width="1.5"/><path d="M20 8h3a4 4 0 0 1 0 8h-3" fill="none" stroke="#9AA0BC" stroke-width="2.2"/><rect x="2" y="6" width="16" height="4" fill="#C9874A"/><path d="M6 -4q-3-5 0-9M12 -4q-3-5 0-9" stroke="#C3C7D8" stroke-width="2" fill="none" stroke-linecap="round" class="rsteam"/></g>`}[m]||"";
 /* ---- props and effects around the robot ---- */
 const spark=(x,y,s)=>`<path d="M${x} ${y-s}l${s*.3} ${s*.7} ${s*.7} ${s*.3}-${s*.7} ${s*.3}-${s*.3} ${s*.7}-${s*.3}-${s*.7}-${s*.7}-${s*.3} ${s*.7}-${s*.3}z" fill="#FFE08A"/>`;
 const extra={dance:spark(24,46,8)+spark(180,140,6),
  trophy:spark(20,50,8)+spark(190,60,6)+spark(30,150,5),
  finish:["#FF7A95","#7CF0E4","#FFC83D","#A78BFA","#4ADE80","#FF7A95","#FFC83D"].map((c,i)=>`<rect class="rconf" x="${16+i*27}" y="${-8+(i%3)*14}" width="6" height="9" rx="1.5" fill="${c}" transform="rotate(${i*37} ${19+i*27} ${-4+(i%3)*14})"/>`).join(""),
  think:`<g><circle cx="160" cy="34" r="4" fill="#fff"/><circle cx="170" cy="22" r="5.5" fill="#fff"/><rect x="164" y="-6" width="30" height="22" rx="11" fill="#fff"/><text x="179" y="10" text-anchor="middle" font-family="Unbounded,Arial Black" font-weight="800" font-size="14" fill="#1E1233">?</text></g>`,
  bonk:`<g class="rstars">${spark(70,4,7)+spark(100,-6,6)+spark(130,4,7)}</g>`,
  tired:`<g font-family="Unbounded,Arial Black" font-weight="800" fill="#C4B5FD"><text x="150" y="20" font-size="20" class="rz">Z</text><text x="172" y="2" font-size="14" class="rz">z</text></g>`,
  stare:`<g fill="#fff"><circle cx="160" cy="30" r="2.6"/><circle cx="170" cy="30" r="2.6"/><circle cx="180" cy="30" r="2.6"/></g>`,
  run:`<g stroke="#C3C7D8" stroke-width="4" stroke-linecap="round" opacity=".75" class="rspeed"><path d="M8 120h20M2 140h24M10 160h18"/></g>`,
  zen:"",chai:"",review:""}[m]||"";
 const under=m==="zen"?`<ellipse cx="100" cy="250" rx="70" ry="9" fill="#FFC83D" opacity=".35"/><ellipse cx="100" cy="110" rx="92" ry="110" fill="url(#rGlow)"/>`:"";
 /* ---- headwear ---- */
 const hat=m==="finish"?`<g><path d="M80 26L100 -20L120 26Z" fill="#FF7A95"/><path d="M86 12L114 12M92 -2L108 -2" stroke="#FFE08A" stroke-width="4"/><circle cx="100" cy="-22" r="6" fill="#FFE08A"/></g>`
  :m==="bonk"?`<g transform="rotate(-20 126 30)"><rect x="112" y="24" width="28" height="11" rx="5" fill="#F7D9B5"/><path d="M122 26v7M130 26v7" stroke="#C9A27A" stroke-width="1.6"/></g>`
  :m==="tired"?`<g><path d="M52 40Q100 -4 150 40Q160 18 120 6Q84 -2 52 40Z" fill="#6D5BD0"/><circle cx="160" cy="24" r="7" fill="#fff"/><path d="M52 40Q100 26 150 40" stroke="#fff" stroke-width="5" fill="none"/></g>`:"";
 const tilt={bonk:"rotate(-8 100 110)",tired:"rotate(6 100 110) translate(0 6)",think:"rotate(7 100 110)",review:"rotate(-5 100 110)",dance:"rotate(5 100 110)",stare:""}[m]||"";
 /* gradient ids carry the costume id so different buddies on one page keep their own colours */
 return (`<span class="mascot rbot ${m} c-${K}" style="width:${size}px" aria-hidden="true"><svg viewBox="0 0 200 260"><defs>
<radialGradient id="rHead" cx="38%" cy="28%" r="80%"><stop offset="0" stop-color="${C.head[0]}"/><stop offset=".55" stop-color="${C.head[1]}"/><stop offset="1" stop-color="${C.head[2]}"/></radialGradient>
<radialGradient id="rGold" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${C.gold[0]}"/><stop offset=".5" stop-color="${C.gold[1]}"/><stop offset="1" stop-color="${C.gold[2]}"/></radialGradient>
<radialGradient id="rWhite" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${C.white[0]}"/><stop offset="1" stop-color="${C.white[1]}"/></radialGradient>
<radialGradient id="rLens" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#3A3F66"/><stop offset=".7" stop-color="#14162A"/><stop offset="1" stop-color="#090A16"/></radialGradient>
<radialGradient id="rRim" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DADDE8"/></radialGradient>
<radialGradient id="rGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="rgba(255,214,107,.28)"/><stop offset="1" stop-color="rgba(255,214,107,0)"/></radialGradient></defs>
${under}<ellipse cx="100" cy="252" rx="54" ry="6" fill="#000" opacity=".3"/>${C.cape||""}
${legs}
<rect x="84" y="172" width="32" height="18" rx="9" fill="url(#rGold)"/>
<path d="M70 132Q70 122 82 120H118Q130 122 130 132V160Q130 182 100 182Q70 182 70 160Z" fill="url(#rGold)"/>
<ellipse cx="100" cy="164" rx="22" ry="15" fill="url(#rWhite)"/>
${C.emblem}
<rect x="93" y="112" width="14" height="12" rx="4" fill="${DK}"/>
<g transform="${tilt}">
${C.fins===false?(C.behind||""):`<path d="M66 34L72 10L88 26Z" fill="url(#rGold)"/><path d="M134 34L128 10L112 26Z" fill="url(#rGold)"/>`}
${C.ears===false?"":`<circle cx="44" cy="76" r="15" fill="url(#rGold)"/><circle cx="44" cy="76" r="8" fill="none" stroke="#FFF1C9" stroke-width="2.4"/>
<circle cx="156" cy="76" r="15" fill="url(#rGold)"/><circle cx="156" cy="76" r="8" fill="none" stroke="#FFF1C9" stroke-width="2.4"/>`}
<ellipse cx="100" cy="70" rx="57" ry="52" fill="url(#rHead)"/>
${C.jaw===false?"":`<path d="M48 90Q100 136 152 90Q146 118 100 122Q54 118 48 90Z" fill="url(#rGold)"/>`}
${C.face||""}<ellipse cx="80" cy="36" rx="24" ry="10" fill="#fff" opacity=".45" transform="rotate(-14 80 36)"/>
${eye(78)}${eye(122)}${mouth}${C.top||""}${hat}
</g>${arms}${props}${extra}</svg></span>`).replace(/(id="|url[(]#)(r(?:Head|Gold|White|Lens|Rim|Glow))/g,"$1$2_"+K)}


/* Hero bodies: realistic superhero proportions (head about 1/8 of the height, broad shoulders, V-shaped torso,
   muscle shading) on the same joint-angle rig. Expressions live in the mask's eye lenses (and the mouth for cowled heroes).
   All heroes are original designs. */
/* Run cycle from a side-view running-form video: slight lean, elbows near 90° with hands at hip height swinging
   forward and back, foot lands under the body, heel tucks up behind at mid-stance, rear leg extends at toe-off while the
   front knee drives forward. Arms pump up and down at the sides (the front-view shots), elbows bent. Angles use the rig convention (left side mirrored); dy is the vertical bounce. */
const HERO_RUN=[
 {dy:0, la:[30,168], ra:[14,-24], ll:[15,60,-10,1], rl:[25,5,4,1]},
 {dy:3, la:[22,110], ra:[18,60],  ll:[-5,95,-20,1], rl:[5,-10,0,1]},
 {dy:-4,la:[14,-24], ra:[30,168], ll:[-45,5,0,1],   rl:[-25,-40,-14,1]},
 {dy:0, la:[14,-24], ra:[30,168], ll:[-25,-5,4,1],  rl:[-15,-60,-10,1]},
 {dy:3, la:[18,60],  ra:[22,110], ll:[-5,10,0,1],   rl:[5,-95,-20,1]},
 {dy:-4,la:[30,168], ra:[14,-24], ll:[25,40,-14,1], rl:[45,-5,0,1]}];
const HERO_POSES={
 idle:{la:[48,-58],ra:[48,-58],ll:[9,3,0],rl:[9,3,0]},
 stare:{la:[48,-58],ra:[48,-58],ll:[9,3,0],rl:[9,3,0]},
 review:{la:[48,-58],ra:[34,196],ll:[6,2,0],rl:[12,4,0]},
 think:{la:[40,-70],ra:[-8,200],ll:[4,1,0],rl:[-2,8,-6]},
 dance:[{la:[150,172],ra:[48,-58],ll:[6,2,0],rl:[52,-20,-8]},{la:[48,-58],ra:[150,172],ll:[52,-20,-8],rl:[6,2,0]}],
 trophy:{la:[30,-40],ra:[168,178],ll:[8,2,0],rl:[60,-30,-6]},
 finish:{la:[148,165],ra:[148,165],ll:[22,14,8],rl:[22,14,8]},
 bonk:{la:[8,0],ra:[56,190],ll:[-10,14,6],rl:[-10,14,6]},
 tired:{la:[6,-4],ra:[6,-4],ll:[10,-10,0],rl:[10,-10,0]},
 chai:{la:[48,-58],ra:[-6,206],ll:[6,2,0],rl:[14,-4,-10]},
 zen:{la:[70,40],ra:[70,40],ll:[74,-70,30],rl:[74,-70,30]},
 /* sprint to the right: 4th leg value forces the toe to point the running way */
 run0:[{la:[18,-168],ra:[12,-36],ll:[34,58,8,1],rl:[78,-8,-4,1]},{la:[46,22],ra:[52,140],ll:[-78,8,4,1],rl:[-34,-58,-8,1]}]};
function heroFigure(m,C,kind,pose){
 const H={sh:{L:[78,64],R:[122,64]},hp:{L:[91,139],R:[109,139]},UA:33,FA:29,TH:45,SN:43};
 const dir=(s,a)=>{const r=a*Math.PI/180;return [s*Math.sin(r),Math.cos(r)]},add=(p,d,l)=>[p[0]+d[0]*l,p[1]+d[1]*l],r1=v=>Math.round(v*10)/10,P=p=>r1(p[0])+" "+r1(p[1]);
 /* a limb segment: tapered capsule from A (radius ra) to B (radius rb), with a light edge */
 const seg=(A,B,ra,rb,fill,hi)=>{const dx=B[0]-A[0],dy=B[1]-A[1],l=Math.hypot(dx,dy)||1,n=[-dy/l,dx/l];
  const p=[add(A,n,ra),add(B,n,rb),add(B,n,-rb),add(A,n,-ra)];
  const q=[add(A,n,-ra*.15),add(B,n,-rb*.15),add(B,n,-rb*.75),add(A,n,-ra*.75)];
  return `<path d="M${P(p[0])}L${P(p[1])}L${P(p[2])}L${P(p[3])}Z" fill="${fill}"/><circle cx="${r1(B[0])}" cy="${r1(B[1])}" r="${rb}" fill="${fill}"/><circle cx="${r1(A[0])}" cy="${r1(A[1])}" r="${ra}" fill="${fill}"/>`+
   (hi?`<path d="M${P(q[0])}L${P(q[1])}L${P(q[2])}L${P(q[3])}Z" fill="${hi}" opacity=".32"/>`:"")};
 const arm=(side,[a1,a2])=>{const s=side==="L"?-1:1,S0=H.sh[side],d1=dir(s,a1),E=add(S0,d1,H.UA),d2=dir(s,a2),W=add(E,d2,H.FA),F=add(W,d2,4);
  const g=C.glove||C.limb,cuff=add(W,d2,-9);
  return {svg:seg(S0,E,8.5,6.6,C.limb,C.limbHi)+seg(E,cuff,6.6,5.6,C.limb,C.limbHi)+seg(cuff,W,6,5.2,g,null)+
   `<circle cx="${r1(F[0])}" cy="${r1(F[1])}" r="6.8" fill="${g}"/><circle cx="${r1(F[0]-s*-2)}" cy="${r1(F[1]-2)}" r="2.6" fill="#fff" opacity=".18"/>`+
   `<circle cx="${S0[0]}" cy="${S0[1]}" r="10.5" fill="${C.limb}"/><circle cx="${S0[0]-1.5}" cy="${S0[1]-2.5}" r="6" fill="${C.limbHi}" opacity=".3"/>`,
   hand:add(F,d2,3)}};
 const leg=(side,[t1,t2,foot,toe])=>{const s0=side==="L"?-1:1,s=s0,H0=H.hp[side],dk=dir(s0,t1),K=add(H0,dk,H.TH),d2=dir(s0,t2),A=add(K,d2,H.SN),bt=add(K,d2,H.SN*.55);
  const boot=C.boot||C.limb;const t=toe||s0,rot=r1(-Math.atan2(d2[0],d2[1])*180/Math.PI+(t<0?foot:-foot));
  return seg(H0,K,10.5,7.6,C.legC||C.limb,C.limbHi)+seg(K,bt,7.6,6.4,C.legC||C.limb,C.limbHi)+seg(bt,A,6.6,5.6,boot,null)+
   `<g transform="translate(${P(A)}) rotate(${rot})"><path d="M${-6*t} -2L${6*t} -2L${7*t} 9L${15*t} 12Q${17*t} 17 ${12*t} 18L${-7*t} 18Z" fill="${boot}"/><path d="M${-7*t} 18H${12*t}" stroke="#000" stroke-width="2" opacity=".35"/></g>`};
 const pz=pose||HERO_POSES[m]||HERO_POSES.idle,two=Array.isArray(pz);
 const build=p=>{const L=arm("L",p.la),R=arm("R",p.ra);return {legs:leg("L",p.ll)+leg("R",p.rl),arms:L.svg+R.svg,armL:L.svg,armR:R.svg,hand:{L:L.hand,R:R.hand}}};
 const fA=build(two?pz[0]:pz),fB=two?build(pz[1]):null;
 const legs=two?`<g class="rfa">${fA.legs}</g><g class="rfb">${fB.legs}</g>`:fA.legs;
 const arms=two?`<g class="rfa">${fA.arms}</g><g class="rfb">${fB.arms}</g>`:fA.arms;
 /* cape: hangs, streams back when running, billows when celebrating */
 const capeD=m==="run"?"M84 56Q100 62 118 58Q74 110 26 150Q36 158 30 170Q70 150 96 104Z":m==="finish"||m==="trophy"||m==="dance"?"M78 58Q100 64 122 58L168 226Q100 244 32 226Z":m==="zen"?"M80 58Q100 64 120 58L150 200Q100 214 50 200Z":"M80 58Q100 64 120 58L146 236Q100 248 54 236Z";
 const cape=C.cape?`<path d="${capeD}" fill="${C.cape}"/><path d="${capeD}" fill="url(#hCape)" opacity=".55"/>`:"";
 /* torso: V-shape with pecs, abs and belt */
 const torso=`<path d="M86 52Q100 48 114 52L126 58Q136 62 135 74L130 96Q126 110 119 122L121 136L79 136L81 122Q74 110 70 96L65 74Q64 62 74 58Z" fill="url(#hSuit)"/>
${C.torsoArt||""}
<path d="M75 82Q88 92 100 84Q112 92 125 82" stroke="#000" stroke-width="1.6" fill="none" opacity=".28"/><path d="M100 86V119M91 100H109M92 110H108" stroke="#000" stroke-width="1.3" fill="none" opacity=".18"/>
<path d="M78 58Q100 66 122 58" stroke="#fff" stroke-width="2" fill="none" opacity=".18"/>
<rect x="79" y="119" width="42" height="8" rx="3" fill="${C.belt||C.limbDk}"/><rect x="95" y="118" width="10" height="10" rx="2.5" fill="${C.buckle||"#FFD66B"}"/>
<path d="M79 127H121L123 140Q100 147 77 140Z" fill="${C.trunks||C.limbDk}"/>
<g transform="translate(100 84)">${C.emblem}</g>`;
 /* head: mask (full) or cowl (lower face shows) */
 const headShape="M86 30Q85 12 100 11Q115 12 114 30L113 38Q110 48 100 50Q90 48 87 38Z";
 const head=`<rect x="94" y="42" width="12" height="14" rx="4" fill="${C.mask}"/>
${C.behindHead||""}
<path d="${headShape}" fill="${C.mask}"/>${C.cowl?`<path d="M87 35Q90 49 100 50Q110 49 113 35Q106 39 100 39Q94 39 87 35Z" fill="${C.skin}"/>`:""}
<path d="M90 16Q96 12 104 13" stroke="#fff" stroke-width="2.5" opacity=".35" fill="none" stroke-linecap="round"/>
${C.headArt||""}${lenses(kind,C)}${C.cowl?heroMouth(m):""}${C.overHead||""}`;
 return {cape,legs,torso,head,arms,armL:fA.armL,armR:fA.armR,hand:fA.hand,lean:m==="run"?6:0}}
/* eye lenses per expression (left lens around x=93, right x=107, y=29) */
function lenses(kind,C){const f=C.lens||"#fff",o=C.lensLine||"#111",g=C.lensGlow?` filter="url(#hGlow)"`:"";
 const pair=(dl,dr)=>`<g${g}><path d="${dl}" fill="${f}" stroke="${o}" stroke-width="1.6" stroke-linejoin="round"/><path d="${dr}" fill="${f}" stroke="${o}" stroke-width="1.6" stroke-linejoin="round"/></g>`;
 if(kind==="happy")return pair("M87 30Q93 23 99 30Q93 27 87 30Z","M101 30Q107 23 113 30Q107 27 101 30Z");
 if(kind==="closed"||kind==="sleepy")return pair("M87 29Q93 32 99 29Q93 30.5 87 29Z","M101 29Q107 32 113 29Q107 30.5 101 29Z");
 if(kind==="x")return `<path d="M89 25L97 33M97 25L89 33M103 25L111 33M111 25L103 33" stroke="${f}" stroke-width="3" stroke-linecap="round"/><path d="M89 25L97 33M97 25L89 33M103 25L111 33M111 25L103 33" stroke="${o}" stroke-width="1" stroke-linecap="round" opacity=".6"/>`;
 if(kind==="focus")return pair("M86 26L99 30Q94 33 88 31Z","M114 26L101 30Q106 33 112 31Z");
 if(kind==="stare")return pair("M89 29a4 3 0 1 0 8 0a4 3 0 1 0 -8 0Z","M103 29a4 3 0 1 0 8 0a4 3 0 1 0 -8 0Z");
 if(kind==="up")return pair("M86 27Q91 20 99 25Q96 31 88 30Z","M114 27Q109 20 101 25Q104 31 112 30Z");
 if(kind==="down")return pair("M86 29Q93 27 99 30Q95 35 88 33Z","M114 29Q107 27 101 30Q105 35 112 33Z");
 return pair("M86 27Q92 22 99 27Q96 33 88 32Z","M114 27Q108 22 101 27Q104 33 112 32Z")}
function heroMouth(m){const k={dance:"grin",trophy:"grin",finish:"grin",chai:"smile",zen:"smile",run:"grin",bonk:"wavy",tired:"o",think:"side",stare:"flat",review:"flat"}[m]||"smile";
 return {grin:`<path d="M95 42Q100 47 105 42Z" fill="#3A1A10"/><path d="M96 42.5H104" stroke="#fff" stroke-width="1.2"/>`,smile:`<path d="M95.5 42.5Q100 45.5 104.5 42.5" stroke="#5A2A18" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  wavy:`<path d="M95 44q2.5-2 5 0t5 0" stroke="#5A2A18" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,o:`<ellipse cx="100" cy="44" rx="1.8" ry="2.3" fill="#3A1A10"/>`,
  side:`<path d="M98 44H104" stroke="#5A2A18" stroke-width="1.5" stroke-linecap="round"/>`,flat:`<path d="M96 43.5H104" stroke="#5A2A18" stroke-width="1.5" stroke-linecap="round"/>`}[k]}

/* Hero line-up (original characters). Keys of the earlier buddies are kept so saved choices still work. */
const HERO_WEB=(()=>{let d="";[[-1,1],[0,1],[1,1]].forEach(()=>{});
 for(let i=0;i<9;i++){const a=Math.PI*(.05+.9*i/8);d+=`M100 33L${(100-15*Math.cos(a)).toFixed(1)} ${(33-22*Math.sin(a)).toFixed(1)}`}
 return `<path d="${d}M89 24Q100 20 111 24M87 17Q100 11 113 17" stroke="#1A0640" stroke-width=".9" fill="none" opacity=".55"/>`})();
const HERO_WEB_TORSO=(()=>{let d="";for(let i=0;i<10;i++){const a=i/10*Math.PI*2;d+=`M100 84L${(100+40*Math.cos(a)).toFixed(1)} ${(84+42*Math.sin(a)).toFixed(1)}`}
 return `<path d="${d}" stroke="#1A0640" stroke-width="1" opacity=".35"/><ellipse cx="100" cy="84" rx="16" ry="16" fill="none" stroke="#1A0640" stroke-width="1" opacity=".3"/><ellipse cx="100" cy="88" rx="30" ry="30" fill="none" stroke="#1A0640" stroke-width="1" opacity=".25"/>`})();
Object.assign(COSTUMES,{
 prime:{id:"prime",hero:true,name:"Bolt Prime",tag:"Tech",line:"Bolt, suited up in gold armour. Its chest glows brighter with every right answer.",
  suit:["#FFE7A0","#F2B21B","#8A5300"],limb:"#E8A514",limbHi:"#FFE7A0",limbDk:"#6A3F00",mask:"#E9EBF4",glove:"#E9EBF4",boot:"#E9EBF4",belt:"#6A3F00",trunks:"#8A5300",
  lens:"#7CF0E4",lensLine:"#0E6D69",lensGlow:true,
  headArt:`<path d="M88 21Q100 17 112 21L111 35Q100 40 89 35Z" fill="#F2B21B"/><path d="M89 21Q100 17 111 21" stroke="#FFE7A0" stroke-width="1.4" fill="none"/>`,
  torsoArt:`<path d="M84 62L91 100M116 62L109 100M80 108H120" stroke="#6A3F00" stroke-width="1.4" opacity=".5" fill="none"/>`,
  emblem:`<circle r="9.5" fill="#0E2A3A"/><circle r="7.5" fill="#7CF0E4" filter="url(#hGlow)"/><text y="3.6" text-anchor="middle" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="10" fill="#0E2A3A">{}</text>`},
 webby:{id:"webby",hero:true,name:"Web Weaver",tag:"Superhero",line:"Swings from bug to bug. Spins loops, not webs.",
  suit:["#B98CFF","#6D2FD6","#2E0E6B"],limb:"#6D2FD6",limbHi:"#C9A2FF",limbDk:"#2E0E6B",mask:"#6D2FD6",glove:"#5A22BF",boot:"#2E0E6B",belt:"#2E0E6B",buckle:"#B6FF3B",trunks:"#2E0E6B",
  lens:"#F4FFE0",lensLine:"#1A0640",headArt:HERO_WEB,torsoArt:HERO_WEB_TORSO,
  emblem:`<g fill="#B6FF3B"><ellipse rx="4" ry="6"/><circle cy="-7" r="3"/><path d="M-3-2l-10-7M-3 1h-12M-3 3l-10 7M-2 5l-7 10M3-2l10-7M3 1h12M3 3l10 7M2 5l7 10" stroke="#B6FF3B" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>`},
 captain:{id:"captain",hero:true,name:"Captain Kode",tag:"Superhero",line:"Cape on, bugs gone. Saves the day one test at a time.",
  suit:["#8FC0FF","#2F6FE0","#163A85"],limb:"#2F6FE0",limbHi:"#9CC8FF",limbDk:"#163A85",mask:"#163A85",cowl:true,skin:"#F2BE94",glove:"#E0322F",boot:"#E0322F",belt:"#FFD84D",buckle:"#E0322F",trunks:"#E0322F",cape:"#E0322F",
  lens:"#fff",lensLine:"#0B1E4A",headArt:`<path d="M87 22L82 12L91 18ZM113 22L118 12L109 18Z" fill="#163A85"/>`,
  emblem:`<path d="M-12-11H12V2Q12 11 0 15Q-12 11-12 2Z" fill="#FFD84D"/><text y="4.5" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="800" font-size="12" fill="#E0322F">{}</text>`},
 astro:{id:"astro",hero:true,name:"Nova",tag:"Space",line:"Charged by starlight. Debugs at the speed of light.",
  suit:["#FFFFFF","#C9D2E6","#6F7C9E"],limb:"#D6DCEB",limbHi:"#FFFFFF",limbDk:"#3B4566",mask:"#1B2140",glove:"#FF8A1F",boot:"#FF8A1F",belt:"#3B4566",buckle:"#FF8A1F",trunks:"#3B4566",
  lens:"#FFB04D",lensLine:"#7A3A00",lensGlow:true,
  headArt:`<path d="M86 30Q85 12 100 11Q115 12 114 30" stroke="#D6DCEB" stroke-width="3" fill="none"/><path d="M100 11V3" stroke="#D6DCEB" stroke-width="2.5"/><circle cx="100" cy="2" r="3" fill="#FF8A1F"/>`,
  torsoArt:`<path d="M70 68L100 96L130 68" stroke="#FF8A1F" stroke-width="4" fill="none" stroke-linejoin="round"/>`,
  emblem:`<path d="M0-11l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L0 5.5l-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z" fill="#FFB04D" filter="url(#hGlow)"/>`},
 sixer:{id:"sixer",hero:true,name:"Sixer",tag:"Sports",line:"Hits every bug for six. Never leaves a loop unbowled.",
  suit:["#7FB2FF","#1E5BD8","#0E2F7A"],limb:"#1E5BD8",limbHi:"#7FB2FF",limbDk:"#0E2F7A",mask:"#0E2F7A",cowl:true,skin:"#D9A27A",glove:"#FFFFFF",boot:"#FFFFFF",belt:"#FF8A1F",buckle:"#0E2F7A",trunks:"#0E2F7A",
  lens:"#fff",lensLine:"#071A47",headArt:`<path d="M83 22Q100 13 117 22" stroke="#FF8A1F" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  torsoArt:`<path d="M120 60L104 92H115L96 128" stroke="#FF8A1F" stroke-width="4.5" fill="none" stroke-linejoin="round"/>`,
  emblem:`<circle r="9" fill="#FF8A1F"/><text y="4.5" text-anchor="middle" font-family="Unbounded,Arial Black" font-weight="800" font-size="12" fill="#0E2F7A">6</text>`},
 ninja:{id:"ninja",hero:true,name:"Shadow",tag:"Gaming",line:"Silent, fast, always first in Fastest Finger.",
  suit:["#5A6080","#2C3048","#12131D"],limb:"#2C3048",limbHi:"#6B7194",limbDk:"#12131D",mask:"#1C1F2E",glove:"#12131D",boot:"#12131D",belt:"#E0322F",buckle:"#12131D",trunks:"#12131D",
  lens:"#fff",lensLine:"#000",
  behindHead:`<path d="M112 22q22 0 32 16M111 25q18 10 20 28" stroke="#E0322F" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  headArt:`<path d="M86 20Q100 15 114 20L114 24.5Q100 19.5 86 24.5Z" fill="#E0322F"/>`,
  torsoArt:`<path d="M72 62L126 120" stroke="#12131D" stroke-width="7" opacity=".6"/><path d="M86 54Q100 60 114 54" stroke="#E0322F" stroke-width="4" fill="none"/>`,
  emblem:`<text y="4" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="800" font-size="11" fill="#E0322F">&lt;/&gt;</text>`},
 pixel:{id:"pixel",name:"Pixel",tag:"Robot",line:"A hover-bot with a screen for a face. Thinks in 8-bit, speaks in beeps.",
  head:["#5B8CFF","#3B5BDB","#1E2A78"],gold:["#D4CCFF","#7C6CFF","#3B2A9E"],white:["#F3F0FF","#D9D2FF"],sl:["#3B2A9E","#6D5DF5","#D4CCFF","#FF4FB0"],cuff:"#F3F0FF",glove:"#2B2F44",glove2:"#3A3F58",leg:["#2B2F44","#3A3F58"],emblem:RUPEE_EMBLEM},
 mochi:{id:"mochi",hero:true,name:"Lynx",tag:"Animals",line:"Cat reflexes, nine lives, zero unhandled errors.",
  suit:["#FFC98A","#F28C28","#A8520F"],limb:"#F28C28",limbHi:"#FFD3A1",limbDk:"#7A3A0A",mask:"#F28C28",glove:"#FFF1DE",boot:"#7A3A0A",belt:"#7A3A0A",buckle:"#B6FF3B",trunks:"#7A3A0A",
  lens:"#B6FF3B",lensLine:"#2A1400",
  back:`<path d="M112 132Q152 146 148 196Q146 216 162 222" stroke="#F28C28" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M152 210Q154 218 162 222" stroke="#7A3A0A" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  behindHead:`<path d="M87 21L83 3L97 13Z" fill="#F28C28"/><path d="M113 21L117 3L103 13Z" fill="#F28C28"/><path d="M88 16L87 8L93 13Z" fill="#FF9EB0"/><path d="M112 16L113 8L107 13Z" fill="#FF9EB0"/>`,
  headArt:`<path d="M96 13l1 5M104 13l-1 5M100 11v5" stroke="#7A3A0A" stroke-width="1.6" stroke-linecap="round"/><path d="M91 37Q100 33 109 37Q107 48 100 49Q93 48 91 37Z" fill="#FFF1DE"/><path d="M98.4 38.6h3.2l-1.6 2.2z" fill="#FF7A95"/><path d="M90 40l-8-1M90 43l-8 1M110 40l8-1M110 43l8 1" stroke="#7A3A0A" stroke-width=".9"/>`,
  torsoArt:`<path d="M68 76l10 4M66 90l10 3M132 76l-10 4M134 90l-10 3M79 110l7 2M121 110l-7 2" stroke="#7A3A0A" stroke-width="2.5" stroke-linecap="round"/>`,
  emblem:`<g fill="#7A3A0A"><circle cy="3" r="4.5"/><circle cx="-6" cy="-4" r="2.2"/><circle cy="-6.5" r="2.2"/><circle cx="6" cy="-4" r="2.2"/></g>`}});
COSTUMES.byte.name="Bolt";COSTUMES.byte.tag="Classic";COSTUMES.byte.line="The original toy robot. Small, round and very proud of it.";
/* picker order: the classic robot first, then the heroes */
const BUDDY_ORDER=["pixel"],_OLD_ORDER=["byte","prime","webby","captain","astro","sixer","ninja","mochi"];
function heroMascot(m,size,C,K){
 const kind={dance:"happy",trophy:"happy",finish:"happy",chai:"happy",think:"up",review:"down",bonk:"x",tired:"sleepy",stare:"stare",zen:"closed",run:"focus"}[m]||"open";
 const F=heroFigure(m,C,kind),r=v=>Math.round(v*10)/10,[hx,hy]=F.hand.R.map(r);
 const stack=G=>`<g transform="rotate(${G.lean} 100 138)">${G.cape}</g>${C.back||""}${G.legs}<g transform="rotate(${G.lean} 100 138)">${G.torso}${G.head}${G.arms}</g>`;
 /* running plays the 6-frame cycle; every other pose is one drawing */
 const side=G=>`<g transform="rotate(${G.lean} 100 138)">${G.cape}${G.armL}</g>${C.back||""}${G.legs}<g transform="rotate(${G.lean} 100 138)">${G.torso}${G.head}${G.armR}</g>`;
 const body=m==="run"?HERO_RUN.map((p,i)=>`<g class="rf6 f${i}" style="animation-delay:${(-((6-i)%6)*.12).toFixed(2)}s" transform="translate(0 ${p.dy})">${stack(heroFigure(m,C,kind,p))}</g>`).join(""):stack(F);
 const spark=(x,y,s)=>`<path d="M${x} ${y-s}l${s*.3} ${s*.7} ${s*.7} ${s*.3}-${s*.7} ${s*.3}-${s*.3} ${s*.7}-${s*.3}-${s*.7}-${s*.7}-${s*.3} ${s*.7}-${s*.3}z" fill="#FFE08A"/>`;
 const extra={dance:spark(40,40,8)+spark(170,110,6),trophy:spark(36,30,8)+spark(176,60,6)+spark(30,140,5),
  finish:["#FF7A95","#7CF0E4","#FFC83D","#A78BFA","#4ADE80","#FF7A95","#FFC83D"].map((c,i)=>`<rect class="rconf" x="${16+i*27}" y="${-6+(i%3)*12}" width="6" height="9" rx="1.5" fill="${c}" transform="rotate(${i*37} ${19+i*27} ${-2+(i%3)*12})"/>`).join(""),
  think:`<g><circle cx="122" cy="16" r="2.5" fill="#fff"/><circle cx="130" cy="8" r="3.5" fill="#fff"/><rect x="134" y="-12" width="28" height="20" rx="10" fill="#fff"/><text x="148" y="3" text-anchor="middle" font-family="Unbounded,Arial Black" font-weight="800" font-size="13" fill="#1E1233">?</text></g>`,
  bonk:`<g class="rstars">${spark(84,2,6)+spark(100,-4,5)+spark(116,2,6)}</g>`,
  tired:`<g font-family="Unbounded,Arial Black" font-weight="800" fill="#C4B5FD"><text x="120" y="12" font-size="16" class="rz">Z</text><text x="136" y="0" font-size="11" class="rz">z</text></g>`,
  stare:`<g fill="#fff"><circle cx="124" cy="18" r="2.2"/><circle cx="132" cy="18" r="2.2"/><circle cx="140" cy="18" r="2.2"/></g>`,
  run:`<g stroke="#C3C7D8" stroke-width="3.5" stroke-linecap="round" opacity=".7" class="rspeed"><path d="M2 70h26M-6 92h30M4 150h24M-4 172h22"/></g>`}[m]||"";
 const props={
  trophy:`<g transform="translate(${hx} ${hy-16})"><path d="M-12 -12h24v7a12 12 0 0 1-24 0z" fill="url(#rGold)" stroke="#9A5A05" stroke-width="1.3"/><path d="M-12 -9h-5a5 5 0 0 0 5 9M12 -9h5a5 5 0 0 1-5 9" fill="none" stroke="#C7760A" stroke-width="2.6"/><rect x="-3.5" y="5" width="7" height="8" fill="#C7760A"/><rect x="-9" y="12" width="18" height="5" rx="2" fill="url(#rGold)"/><text x="0" y="-1" text-anchor="middle" font-family="Plus Jakarta Sans,Arial" font-weight="800" font-size="9" fill="#7A4300">{}</text></g>`,
  review:`<g><path d="M${hx} ${hy}L${hx-4} ${hy-10}" stroke="#2A2E4A" stroke-width="4" stroke-linecap="round"/><circle cx="${hx-8}" cy="${hy-20}" r="10" fill="rgba(124,240,228,.18)" stroke="url(#rGold)" stroke-width="3.5"/></g>`,
  chai:`<g transform="translate(${hx-8} ${hy-12})"><path d="M0 3h16v10a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" fill="#F3F4FA" stroke="#9AA0BC" stroke-width="1.3"/><path d="M16 6h2.5a3.2 3.2 0 0 1 0 6.4H16" fill="none" stroke="#9AA0BC" stroke-width="1.8"/><rect x="1.6" y="4.6" width="12.8" height="3.2" fill="#C9874A"/><path d="M5 -3q-2.4-4 0-7M10 -3q-2.4-4 0-7" stroke="#C3C7D8" stroke-width="1.6" fill="none" stroke-linecap="round" class="rsteam"/></g>`}[m]||"";
 const under=m==="zen"?`<ellipse cx="100" cy="250" rx="60" ry="8" fill="#FFC83D" opacity=".3"/><ellipse cx="100" cy="120" rx="90" ry="120" fill="url(#rGlow)"/>`:"";
 const lift=m==="zen"?"translate(0 -14)":m==="trophy"||m==="finish"?"translate(0 -4)":"";
 const s=`<span class="mascot rbot hero ${m} c-${K}" style="width:${size}px" aria-hidden="true"><svg viewBox="22 -6 156 262"><defs>
<linearGradient id="hSuit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.suit[0]}"/><stop offset=".5" stop-color="${C.suit[1]}"/><stop offset="1" stop-color="${C.suit[2]}"/></linearGradient>
<linearGradient id="hCape" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
<radialGradient id="rGold" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#FFE6A3"/><stop offset=".5" stop-color="#FFB627"/><stop offset="1" stop-color="#C7760A"/></radialGradient>
<radialGradient id="rGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="rgba(255,214,107,.28)"/><stop offset="1" stop-color="rgba(255,214,107,0)"/></radialGradient>
<filter id="hGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
${under}<ellipse cx="100" cy="249" rx="40" ry="5" fill="#000" opacity=".35"/>
<g transform="${lift}">${body}${props}</g>${extra}</svg></span>`;
 /* ids carry the costume id so several heroes on one page keep their own colours */
 return s.replace(/(id="|url[(]#)(hSuit|hCape|hGlow|rGold|rGlow)/g,"$1$2_"+K)}
/* Satire desk: one quip per page, rotating every minute (and per question on the hot seat). */
const QUOTES=[
 ["💻","\"It works on my machine\": the official motto of every group project."],
 ["🐍","\"Python is easy,\" said someone who has never met an IndentationError."],
 ["🐞","99 little bugs in the code. Fix one, run again: 127 little bugs in the code."],
 ["🥁","Your code isn't slow. It's building suspense, like the host before a verdict."],
 ["💍","Semicolons in Python are like uninvited relatives at a wedding: technically allowed, nobody asked."],
 ["🎯","The 7 crore question is easy. Getting to it is the hard part. Just like placements."],
 ["😱","A missing colon has ended more dreams than any interview panel."],
 ["⏳","\"I'll comment my code later.\" Later has not been seen since 2009."],
 ["🕵️","Debugging: the crime movie where you are the detective and the culprit."],
 ["🤯","Every coder has two moods: \"I'm a genius\" and \"Why is this printing None?\""],
 ["👋","print(\"Hello World\"): the only program that never had a bug. Allegedly."],
 ["💪","The money here is fake. The confidence you build is real."],
 ["🤔","Naming a variable x feels smart today. Next week you will have no idea what x was."],
 ["😴","range(1, 10) stops at 9. Like your motivation on Monday, it never quite reaches the end."],
 ["🌙","Strings are immutable. Your sleep schedule, sadly, is not."],
 ["🔁","while True: study(). Sounds noble until you notice there's no break."],
 ["⚡","Fastest Finger First rewards speed, but reading the question first is still faster than guessing twice."],
 ["🏆","Hall of Fame: where your name lives forever, or until someone clears the database."],
 ["🎟️","A tuple is like a hall ticket: once it's printed, you can't change a single detail."],
 ["📐","Indentation in Python isn't a style choice. It's a lifestyle."],
 ["📉","One wrong index can turn a crorepati into an IndexError. Always check where your list ends."],
 ["🙏","dict.get(): the polite way to ask for something that may not exist. Like your refund."],
 ["🚀","If at first you don't succeed, call it version 1.0."],
 ["🧮","Sorting a list by hand is a great way to discover why sorted() exists."],
 ["🌀","Your first loop will run forever. Your first bug will feel like it does too."],
 ["🚨","A red error message is your friend. The scary bug is the one that prints the wrong answer quietly."]];
function quipHTML(seed){const [e,t]=QUOTES[(hashStr(String(seed||S.screen))+Math.floor(Date.now()/60000))%QUOTES.length];
 return `<figure class="quip"><span class="qe" aria-hidden="true">${e}</span><blockquote>${esc(t)}</blockquote></figure>`}
function quipText(seed){return QUOTES[(hashStr(String(seed))+Math.floor(Date.now()/60000))%QUOTES.length].join(" ")}

/* Explanations: the key idea and the classic trap for every skill, shown under the step-by-step working. */
const stripK=t=>String(t||"").replace(/^[A-Z][\w ,/&-]*: /,"");
const sentence=t=>{t=String(t||"").trim();if(!t)return t;t=t[0].toUpperCase()+t.slice(1);return /[.!?]$/.test(t)?t:t+"."};
const EXPLAIN={};GR.skills.forEach(s=>{const k=Object.values(s.kps||{}),m=Object.values(s.mistakes||{});EXPLAIN[s.id]={idea:k.length?k.slice(0,2).map(stripK).map(sentence).join(" "):(s.check?"You should be able to "+s.check+".":""),trap:m[0]||""}});
/* the "why" text is written as short sentences; each becomes one numbered step, and a step that names a line shows that line */
function whySteps(why){return String(why||"").split(/(?<=[.!?])\s+(?=[A-Z0-9"'(<\[])/).map(s=>s.trim()).filter(Boolean)}
function stepHTML(t,q){const m=/\b[Ll]ine (\d+)\b/.exec(t),lines=q&&q.code?q.code.split("\n"):[];const L=m&&lines[+m[1]-1];
 return `${L!=null?`<code class="ex-line">${esc(L.trim())}</code>`:""}<span>${esc(t)}</span>`}
function explainHTML(q,ok){const s=SK[q.sk],X=q.idea||q.trap?{idea:q.idea,trap:q.trap}:(EXPLAIN[q.sk]||{}),steps=whySteps(q.why);
 const picked=q.kind==="mcq"&&S.pick!=null&&q.opts?q.opts[S.pick]:null;
 return `<div class="panel card explain ${ok?"good":"bad"}"><h3>${ICON.why}${ok?"Why it works":S.timeout?"Time ran out. Here's the working":"Here's the working, step by step"}</h3>
<div class="ex-ans"><div class="ok"><span>Correct answer</span><code>${esc(q.show).replace(/\n/g,"<br>")}</code></div>${!ok&&picked!=null?`<div class="no"><span>You picked</span><code>${esc(picked)}</code></div>`:""}</div>
${codeWalk(q.code)}${steps.length?`<h4 class="ex-h">Work it out</h4><ol class="ex-steps">${steps.map(t=>`<li>${stepHTML(t,q)}</li>`).join("")}</ol>`:""}
${X.idea?`<div class="ex-note idea"><b>Key idea</b><p>${esc(X.idea)}</p></div>`:""}
${X.trap?`<div class="ex-note trap"><b>${ok?"Watch out next time":"Common trap"}</b><p>${esc(X.trap)}</p></div>`:""}</div>`}
/* "Read the code": what each line does, in plain words (descriptive only; the worked steps below give the values) */
function lineRole(raw){const t=raw.trim();let m;
 if(!t)return null;
 if(m=/^for (\w+(?:, \w+)?) in range\((.*)\):$/.exec(t))return `Loop: ${m[1]} takes each number from range(${m[2]}), stopping before the end value. The indented lines run once per number.`;
 if(m=/^for (\w+) in (.+):$/.exec(t))return `Loop: ${m[1]} takes each item of ${m[2]} in turn. The indented lines run once per item.`;
 if(m=/^while (.+):$/.exec(t))return `Repeat the indented lines while ${m[1]} is True. The test is checked before every round.`;
 if(m=/^if (.+?):(.*)$/.exec(t))return `Check ${m[1]}. ${m[2].trim()?`If it's True, run ${m[2].trim()}.`:"Run the indented lines only if it's True."}`;
 if(m=/^elif (.+):$/.exec(t))return `Only if every test above was False: check ${m[1]}.`;
 if(/^else:$/.test(t))return "If every test above was False, run the lines under else.";
 if(m=/^print\((.*)\)$/.exec(t)){const a=m[1];return `Show ${/sep=|end=/.test(a)?"the values, using the sep/end given,":a.includes(",")?"each value, separated by a space,":"this value"} on the screen.`}
 if(m=/^(\w+)\.append\((.*)\)$/.exec(t))return `Add ${m[2]} to the end of the list ${m[1]}.`;
 if(m=/^(\w+) ([+\-*\/%]{1,2})= (.+)$/.exec(t)){const w={"+":"Add","-":"Subtract","*":"Multiply","//":"Whole-divide","%":"Take the remainder of","/":"Divide"}[m[2]]||"Update";return `${w} ${m[2]==="+"||m[2]==="-"?m[3]+(m[2]==="+"?" to ":" from ")+m[1]:m[1]+" by "+m[3]}. Same as ${m[1]} = ${m[1]} ${m[2]} ${m[3]}.`}
 if(m=/^(\w+(?:, \w+)*) = (.+)$/.exec(t)){const r=m[2];
  if(/input\(/.test(r))return `Read what the user types${/int\(/.test(r)?" and turn it into a whole number":" (always text)"}, and store it in ${m[1]}.`;
  if(m[1].includes(","))return `Unpack: give each name on the left the matching value on the right (${m[1]}).`;
  return `Store ${r} in ${m[1]}${new RegExp("\b"+m[1]+"\b").test(r)?", using the old value of "+m[1]+" on the right first":""}.`}
 return "Run this line.";}
function codeWalk(code){const L=String(code||"").split("\n");if(!code||L.length>12)return "";
 const items=L.map((l,i)=>{const r=lineRole(l);return r?`<li><code class="ex-line">${i+1}  ${esc(l.replace(/^ {4}/,"    "))}</code><span>${esc(r)}</span></li>`:""}).join("");
 return items?`<h4 class="ex-h">Read the code</h4><ol class="ex-steps walk">${items}</ol>`:""}
/* Fastest Finger: explain the order line by line */
function fffSteps(prog){const out=[];prog.forEach((l,i)=>{const t=l.trim(),ind=/^\s/.test(l);let why;
 if(/^(for|while)\b/.test(t))why="Start the loop. Everything indented under it repeats.";
 else if(/^if\b/.test(t))why=ind?"Inside the loop: check the condition and act on it.":"Check the condition.";
 else if(/^print\(/.test(t))why=ind?"Inside the loop, so it prints every round.":"Print the result. It sits after the setup and any loop, so it runs once with the final value.";
 else if(/=/.test(t)&&!/==/.test(t.split("=")[0]))why=ind?"Inside the loop: update the value every round.":i===0?"Set up the starting value first, so later lines can use it.":"Create or update a value using what came before.";
 else if(/^\w+\.\w+\(/.test(t))why=ind?"Inside the loop: runs once per round.":"Call a method on the value set up above.";
 else why=ind?"Inside the loop: runs once per round.":"Runs in order after the line above.";
 out.push(`<li><code class="ex-line">${esc(l.replace(/^ {4}/,"→ "))}</code><span>${why}</span></li>`)});return `<ol class="ex-steps">${out.join("")}</ol>`}
const CHEER=["Correct! One more like that.","Nailed it. Keep the streak going.","Clean answer. Next one!"],CALM=["Take your time. Read every line.","Trace it step by step if it helps.","Watch the edges: < or <=?","Read the code before the options."];
/* ===== Energy (per game): wrong −20, timeout −25, every 3-in-a-row +10, 0% ends the game; path progress is always kept ===== */
function energyTick(ok){const R=S.run,b=R.en;if(ok){R.cs=(R.cs||0)+1;if(R.cs%3===0&&R.en<100){R.en=Math.min(100,R.en+10);S.enGain=10;setTimeout(()=>ROBO.charge(),900)}}else{R.cs=0;R.en=Math.max(0,R.en-(S.timeout?25:20));S.enLoss=b-R.en;setTimeout(()=>ROBO.powerdown(),400)}
 logEv({kind:"energy",en:R.en,ok})}
function energyHTML(){if(S.practice||!S.run)return "";const e=S.run.en,c=e>50?"hi":e>20?"mid":"lo",d=S.phase==="reveal"?(S.enLoss?`<em class="eloss">−${S.enLoss}%</em>`:S.enGain?`<em class="egain">+${S.enGain}%</em>`:""):"";
 return `<div class="energy ${c}" role="meter" aria-label="Energy ${e} percent" aria-valuenow="${e}" aria-valuemin="0" aria-valuemax="100"><span class="ebolt">⚡</span><span class="ebat"><i style="width:${e}%"></i></span><b>${e}%</b>${d}${S.run.cs%3===2&&e<100?"<small>1 more right = +10%</small>":""}</div>`}
function dockHTML(mood,cls){const I=S.info,q=S.q;let say;
 if(!q)say=S.phase==="loading"?"Picking your next question…":S.phase==="error"?"Hmm, the line dropped. Try again?":"Nice work! More levels are coming.";
 else if(S.phase==="locked")say="Locked in… fingers crossed!";
 else if(S.phase==="reveal")say=S.ok?(I&&I.rungUp?`You won ${fmtR(amountOf(I.after))}! Next question.`:CHEER[hashStr(q.id)%CHEER.length]):(S.practice?(S.timeout?"Time ran out. Read why, then try the next one.":"Not quite. Read why, then try the next one."):(S.timeout?"Too slow! Read why, then try a fresh variant.":"Not quite. Read why, then try a fresh variant."));
 else say=!S.practice&&S.run.en<=20?"Low battery! One more miss and we power down.":S.hint?"Hint's up there. You've got this.":S.run.answered===0?"First question! Read the code line by line.":CALM[hashStr(q.id)%CALM.length];
 const r=rungOf(),stake=r<OPEN?LADDER[r]:0;
 if(cls==="col")return `<aside class="mcol" aria-label="${esc(buddyName())}, your KBC buddy"><p class="say">${esc(say)}</p>${mascot(mood,176)}<span class="bname" aria-hidden="true">${esc(buddyName())}<small>your KBC buddy</small></span></aside>`;
 return `<div class="coach">${mascot(mood,64)}<p class="say">${esc(say)}</p></div>`}

/* ================= Sound ================= */
let actx=null,soundOn=store.get("kbc-r1-snd",true);
function ctx(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();if(actx.state==="suspended")actx.resume()}catch(e){}return actx}
function tone(f,d,type="triangle",delay=0,vol=.08){if(!soundOn)return;try{const a=ctx(),o=a.createOscillator(),g=a.createGain(),t=a.currentTime+delay;o.type=type;o.frequency.value=f;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d)}catch(e){}}
/* Filtered noise sweep (risers, whooshes, clicks) */
let nbuf=null;function noise(f0,f1,d,delay=0,vol=.08,type="bandpass"){if(!soundOn)return;try{const a=ctx(),t=a.currentTime+delay;if(!nbuf){nbuf=a.createBuffer(1,a.sampleRate*2,a.sampleRate);const c=nbuf.getChannelData(0);for(let i=0;i<c.length;i++)c[i]=Math.random()*2-1}
 const n=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain();n.buffer=nbuf;fl.type=type;fl.Q.value=5;fl.frequency.setValueAtTime(f0,t);fl.frequency.exponentialRampToValueAtTime(f1,t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+d*.85);g.gain.exponentialRampToValueAtTime(.0001,t+d+.08);n.connect(fl);fl.connect(g);g.connect(a.destination);n.start(t);n.stop(t+d+.1)}catch(e){}}
function boom(f=55,d=.5,delay=0,vol=.3){if(!soundOn)return;try{const a=ctx(),t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();o.type="sine";o.frequency.setValueAtTime(f*2.6,t);o.frequency.exponentialRampToValueAtTime(f,t+.09);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.05)}catch(e){}}
function slide(f0,f1,d,delay=0,vol=.06){if(!soundOn)return;try{const a=ctx(),t=a.currentTime+delay,o=a.createOscillator(),fl=a.createBiquadFilter(),g=a.createGain();o.type="sawtooth";o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+d);fl.type="lowpass";fl.frequency.value=1600;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(fl);fl.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.05)}catch(e){}}
/* ===== Robot voice: original chirps and bleeps (FM-wobbled sine/square glides), no samples ===== */
function chirp(f0,f1,d,delay=0,vol=.07,type="sine",wob=0){if(!soundOn)return;try{const a=ctx(),t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,f1),t+d);
 if(wob){const l=a.createOscillator(),lg=a.createGain();l.frequency.value=wob;lg.gain.value=f0*.08;l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+d+.02)}
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.03)}catch(e){}}
const ROBO={
 blip(){chirp(1400,2100,.06,0,.05,"sine")},
 hello(){chirp(700,1300,.12,0,.07,"sine",28);chirp(1100,1800,.16,.14,.07,"sine",32)},
 happy(){[0,1,2,3].forEach(i=>chirp(900+i*260,1300+i*320,.08,i*.07,.06,"square"));chirp(1600,2600,.22,.3,.06,"sine",40)},
 sad(){chirp(900,380,.55,0,.07,"sine",9);chirp(500,260,.4,.5,.05,"triangle",6)},
 think(){for(let i=0;i<6;i++){const f=900+((i*733)%900);chirp(f,f*1.05,.05,i*.09,.035,"square")}},
 boot(){chirp(120,1600,.6,0,.05,"sawtooth");chirp(1600,1200,.08,.62,.06,"square");chirp(1200,2000,.12,.72,.06,"sine",30)},
 powerdown(){chirp(900,140,.7,0,.07,"sawtooth");chirp(600,90,.5,.25,.04,"sine")},
 charge(){[0,1,2,3,4].forEach(i=>chirp(500+i*220,700+i*260,.07,i*.06,.05,"square"));chirp(1400,2200,.2,.32,.05,"sine")},
 wow(){chirp(600,1700,.25,0,.07,"sine",24);chirp(1700,1200,.18,.25,.05,"sine")},
 talk(text){const n=Math.min(7,Math.max(2,Math.round(String(text||"").split(/\s+/).length/3)));for(let i=0;i<n;i++){const f=700+((hashStr(text+i)%900));chirp(f,f*(i%2?1.25:.8),.07,i*.085,.04,i%3?"sine":"square",i%2?30:0)}}};
let lastTalk="",talkT=0;function botTalk(){const b=document.querySelector(".mcol .say, .fffbot .say, .h4-bot .say");if(!b)return;const t=b.textContent;if(t&&t!==lastTalk&&Date.now()-talkT>900){lastTalk=t;talkT=Date.now();ROBO.talk(t)}}
const SFX={
 pick(){tone(988,.07,"square",0,.03);tone(1480,.12,"sine",.04,.06);ROBO.blip()},
 lock(){ROBO.think();boom(52,.7,0,.36);boom(48,.8,.45,.32);tone(110,.8,"triangle",.45,.05)},
 right(){setTimeout(()=>ROBO.happy(),420);boom(55,.5,0,.3);[784,988,1175,1568].forEach((f,i)=>{tone(f,.26,"square",.05+i*.075,.03);tone(f*2,.16,"sine",.05+i*.075,.035)})},
 wrong(){setTimeout(()=>ROBO.sad(),700);tone(110,.7,"sawtooth",0,.11);tone(117,.7,"sawtooth",0,.11);tone(55,.7,"square",0,.06);slide(330,150,.8,.7,.07);boom(45,.6,.7,.3)},
 tick(){boom(95,.22,0,.6);boom(82,.24,.17,.45);tone(1800,.03,"square",0,.03)},
 /* Stage light switching on: a deep clunk, a click of noise and a short electrical hum */
 /* Heartbeat voiced at 90–250 Hz so laptop speakers can play it: a sharp thump, then a softer second beat */
 heart(){boom(95,.3,0,1);tone(150,.18,"triangle",0,.32);noise(1200,180,.07,0,.45,"lowpass");boom(82,.34,.2,.85);tone(128,.2,"triangle",.2,.26);noise(1000,160,.07,.2,.36,"lowpass")},
 /* Fastest Finger win: riser, two heavy hits, then a rising three-chord brass-style fanfare */
 fffWin(){setTimeout(()=>ROBO.wow(),900);noise(300,8000,.45,0,.1);boom(50,.8,.42,.6);boom(45,.9,.62,.55);[[523,659,784],[587,740,880],[659,831,988,1319]].forEach((ch,k)=>ch.forEach(fr=>{tone(fr,k===2?1.1:.24,"sawtooth",.5+k*.17,.045);tone(fr*2,k===2?.9:.2,"triangle",.5+k*.17,.035)}));tone(2637,.7,"sine",.86,.05)},
 spot(){boom(42,.9,0,.5);noise(4200,9000,.06,0,.12,"highpass");tone(110,.55,"sawtooth",.02,.035);tone(220,.4,"sine",.02,.03)},
 /* Game start: a riser, three heavy hits and a bright chord */
 start(){ROBO.boot();noise(160,6000,1.15,0,.1,"bandpass");boom(48,.7,1.15,.5);boom(48,.7,1.42,.5);boom(44,1,1.7,.55);[523,659,784,1047].forEach(f=>tone(f,.9,"triangle",1.7,.07));tone(2093,.6,"sine",1.75,.05)},
 coins(n=10){for(let i=0;i<n;i++){const f=2200+Math.random()*1600;tone(f,.15,"sine",.1+i*.07,.045);tone(f*1.5,.1,"sine",.12+i*.07,.025)}},
 fanfare(){[392,523,659,784,659,784,1047].forEach((f,i)=>tone(f,.3,"triangle",i*.13,.07))},
 /* Coins dropping on a table: metallic partials, each coin bouncing faster and quieter until it settles */
 coinDrop(n=3){if(!soundOn)return;try{const a=ctx(),t0=a.currentTime+.04;for(let c=0;c<n;c++){const base=2400+Math.random()*1500;let t=t0+c*.11+Math.random()*.05,gap=.17,vol=.085;
  for(let b=0;b<6;b++){[[1,.16],[2.76,.11],[5.4,.07],[8.93,.04]].forEach(([k,d])=>{const o=a.createOscillator(),g=a.createGain();o.type="sine";o.frequency.setValueAtTime(base*k*(1+(Math.random()-.5)*.01),t);g.gain.setValueAtTime(vol/k,t);g.gain.exponentialRampToValueAtTime(.0001,t+d*(1-b*.1));o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.02)});t+=gap;gap*=.6;vol*=.62}}}catch(e){}}
};

/* ================= Progress (persistent) vs run (one hot-seat game) =================
   A wrong answer ends the run and resets that skill's streak. Above C1, it also drops the student to the last cleared checkpoint. */
const PKEY="kbc-r1-progress";
const blankP=()=>({mast:{},streak:{},seen:{},best:0,answered:0,correct:0,runs:0,t:0});
let P=Object.assign(blankP(),BOOT.progress||{}); /* the server keeps progress; it comes with /api/boot */
const rowCleared=(i,p=P)=>ROWS[i].skills.every(s=>p.mast[s.id]);
/* One question per rung (classic KBC). Older saves are migrated from their cleared skill rows. */
/* A prize rung is won only when every level (skill) in its group on the path is cleared */
function rungOf(){let r=0;for(const g of (typeof GROUPS!=="undefined"?GROUPS:[])){if(!g.skills||gDone(g)<gTotal(g))break;r++}return r>=ROWS.length?LADDER.length:Math.min(r,LADDER.length)}
const amountOf=r=>r?LADDER[r-1]:0;
const ckName=r=>{let c="";Object.keys(CK).forEach(i=>{if(r>+i)c=CK[i]});return c};
function rowSteps(r){return r>=OPEN?{done:1,total:1}:{done:0,total:1}}
let saveT=null;

/* Gen Z extras: daily streak flame + combo pop */
function dayTick(){const d=new Date(),k=d.toDateString(),y=new Date(d-864e5).toDateString();if(P.lastDay!==k){P.day=(P.lastDay===y?(P.day||0):0)+1;P.lastDay=k}}
function liveDay(){const k=new Date().toDateString(),y=new Date(Date.now()-864e5).toDateString();return (P.lastDay===k||P.lastDay===y)?(P.day||0):0}
let COMBO=0;
function comboTick(ok){if(!ok){COMBO=0;return}COMBO++;if(COMBO<2)return;const w=["","","Double!","Triple!","On fire!","Unstoppable!","Legendary!"];const el=document.createElement("div");el.className="combo";el.setAttribute("aria-hidden","true");el.innerHTML=`${COMBO}x combo<small>${w[Math.min(COMBO,6)]}</small>`;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add("go"));setTimeout(()=>el.remove(),1400)}
const FLAME='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3-1-3 0-7 1-9.5z" fill="#FF7A1A" stroke="#2B1A0E" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12c.6 1.6 2.4 2.4 2.4 4.4a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2 1.4-2.6.2 1 .6 1.4 1 1.4-.4-1.2-.2-2.2 0-3.2z" fill="#FFD23F"/></svg>';
function syncFire(){const c=$("#wchip");if(!c)return;let f=$("#fire");if(!f){f=document.createElement("span");f.id="fire";c.parentNode.insertBefore(f,c)}const n=liveDay();f.className="fire "+(n?(n>=3?"hot":""):"cold");f.title=n?`${n}-day streak. Play tomorrow to keep it.`:"Play today to start a streak";f.setAttribute("aria-label",f.title);f.innerHTML=FLAME+n}
function saveP(){P.t=Date.now();syncChip();clearTimeout(saveT);saveT=setTimeout(pushP,1200)}
/* epoch: the last "fresh start" this page knows of; after a newer one the server refuses the old wallet and the page reloads */
function pushP(keep){clearTimeout(saveT);return KBCQ.api("PUT","/api/progress",{progress:P,epoch:BOOT.epoch||0},keep).then(()=>{if(!keep)loadFame(FQ.scope,FQ.uni,true)}).catch(e=>{if(e&&e.status===409&&!keep&&!pushP.reload){pushP.reload=1;location.reload()}})}


/* ================= Online: event log, Hall of Fame (overall and per university), live players, progress on the server ================= */
let DB=null,UID=ME.roll,FAME=null,FAMEC=null,FAMEALL=[],LIVE=0,FQ={scope:"all",uni:""},TEAM=false;
const LKEY="kbc-r1-events";let EVQ=[],evT=null;
function flushEv(keep){clearTimeout(evT);if(!EVQ.length)return Promise.resolve();const batch=EVQ.splice(0,100);return KBCQ.api("POST","/api/events",{events:batch},keep).catch(()=>{})}
function logEv(e){const ev=Object.assign({t:Date.now()},e);
 const L=store.get(LKEY,[]);L.push(Object.assign({uid:UID,n:S.name||"",day:dayKey(Date.now())},ev));store.set(LKEY,L.slice(-3000));
 if(e.kind==="answer")return; /* answers are stored by the server when graded */
 EVQ.push(ev);clearTimeout(evT);evT=setTimeout(flushEv,EVQ.length>=20?0:3000)}
function syncLive(){document.querySelectorAll(".livenum").forEach(e=>e.textContent=LIVE);const c=$("#livechip");if(c){c.hidden=!LIVE;c.querySelector("b").textContent=LIVE;c.title=`${LIVE} student${LIVE===1?" is":"s are"} playing right now`}}
async function pingLive(){if(document.hidden)return;try{const d=await KBCQ.api("POST","/api/live");LIVE=d.live||0;syncLive()}catch(e){}}
/* Hall of Fame: scope "all" ranks every university, scope "uni" one university (the student's own by default) */
async function loadFame(scope,uni,quiet){FQ={scope:scope||"all",uni:uni||""};const want=JSON.stringify(FQ);if(S.screen==="fame"&&!quiet){FAMEC=null;render()}
 try{const d=await KBCQ.api("GET",`/api/fame?scope=${encodeURIComponent(FQ.scope)}&uni=${encodeURIComponent(FQ.uni)}`);if(JSON.stringify(FQ)!==want)return;
  FAMEC=d;if(d.scope==="all")FAMEALL=d.rows;if(d.live!=null){LIVE=d.live;syncLive()}if(S.screen==="fame"||S.screen==="home")render()}
 catch(e){if(S.screen==="fame"&&e.status!==401){FAMEC={rows:[],err:e.message};render()}}}
function initOnline(){loadFame("all");pingLive();setInterval(pingLive,30000);addEventListener("pagehide",()=>{flushEv(true);pushP(true)},SIG);
 /* the product tour waits for the intro film (intro.js) to finish */
 (window.KBC_INTRO||Promise.resolve()).then(()=>{if(!store.get("kbc-tour-"+ME.roll,false))setTimeout(()=>{if(S.screen==="home"&&TI<0)tourStart()},900)})}
function syncTeam(){const l=$("#teamlink");if(l)l.hidden=true}
function saveFame(){pushP()}
async function logout(){if(S.screen==="play")endRun("stop");await Promise.all([pushP(true),flushEv(true)]);try{await KBCQ.api("POST","/api/auth/logout")}catch(e){}
 try{localStorage.removeItem(PKEY);localStorage.removeItem(LKEY)}catch(e){}location.replace("/login")}

/* ================= State ================= */
let S={screen:"home",name:ME.name};
/* theme: dark by default, light on request; remembered per browser */
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem("kbc-theme",t)}catch(e){}const b=$("#themebtn");if(b){b.setAttribute("aria-label",t==="dark"?"Switch to light theme":"Switch to dark theme")}window.KB3D&&KB3D.theme&&KB3D.theme(t)}
(()=>{let t="dark";try{t=localStorage.getItem("kbc-theme")||"dark"}catch(e){}document.documentElement.dataset.theme=t})();
let qInt=null;
/* seconds per question: 60 on rungs 1–6, then 3–4 s less each rung down to 30 s on 7 crore */
function secsFor(r){return r<6?CFG.secs:Math.max(30,Math.round(CFG.secs-(r-5)*(CFG.secs-30)/(LADDER.length-6)))}
function startPractice(){ctx();goFull();clearInterval(qInt);clearInterval(fInt);
 S={screen:"play",name:S.name,used:{},run:{t0:Date.now(),answered:0,correct:0,startRung:0,peak:0,fb:0,en:100,cs:0},practice:true};
 logEv({kind:"practice_start"});newQ();render();scrollTo({top:0})}
/* The next question comes from the progression engine on the server: it decides skill, level, type, difficulty and variant. */
const blankQ=()=>({enLoss:0,enGain:0,thinkLong:false,pick:null,gone:[],hint:false,hintText:"",fill:"",ord:[],msel:[],bq:{},deadline:0,away:0,timeout:false,info:null,ok:null,res:null,pendingRes:null,revealing:false,noQ:null});
/* The admin can upload a new skill graph at any time. Every engine view names the live graph; when it differs from the
   one this page was built from, the page reloads at the next safe screen (never mid-question) to show the new path. */
function graphCheck(e){if(e&&e.graphVersion&&GR.version&&e.graphVersion!==GR.version)S.graphChanged=1}
const SAFE_SCREENS=["home","path","result","fame","wallet","buddy","guide","team"];
function pathReload(){if(pathReload.on)return;pathReload.on=1;try{clearTimeout(saveT);pushP()}catch(e){}
 document.body.insertAdjacentHTML("beforeend",`<div role="status" style="position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:99999;background:#FFC83D;color:#241500;font:800 15px var(--f-body,system-ui);padding:12px 20px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.4)">Your path has been updated. Loading it…</div>`);
 setTimeout(()=>location.reload(),1200)}
let graphPolled=Date.now();
function pollGraph(){graphPolled=Date.now();KBCQ.api("GET","/api/version").then(r=>{if(r&&r.graph&&r.graph!==GR.version){S.graphChanged=1;if(SAFE_SCREENS.includes(S.screen))pathReload()}}).catch(()=>{})}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pollGraph()});
function setQ(r){const practice=!!S.practice;if(r.engine){ENGINE=r.engine;graphCheck(ENGINE)}
 if(!r.question){Object.assign(S,blankQ(),{q:null,phase:"none",noQ:r});return}
 const q=KBCQ.adapt(r.question,r.address,GR),secs=practice?CFG.secs:S.run&&S.run.first&&!S.run.answered?FIRST_SECS:secsFor(rungOf());
 Object.assign(S,blankQ(),{q,phase:"ask",time:secs,secsMax:secs,qT0:Date.now()})}
/* PREQ[mode]: a question already fetched for that mode. The server keeps one open question per student, so fetching for
   one mode makes any question kept for another mode stale: those are dropped. */
const PREQ={};
function dropPre(m){for(const k in PREQ)if(k!==m)delete PREQ[k]}
function prefetchQ(m){dropPre(m);if(!PREQ[m])PREQ[m]={at:Date.now(),p:KBCQ.api("GET","/api/play/next?mode="+m).catch(()=>null)}}
function keepNext(r){if(r&&r.next&&r.next.mode){dropPre(r.next.mode);PREQ[r.next.mode]={at:Date.now(),p:Promise.resolve(r.next)}}return r}
function nextFor(m){dropPre(m);const x=PREQ[m];delete PREQ[m];const fetchIt=()=>KBCQ.api("GET","/api/play/next?mode="+m);
 return x&&Date.now()-x.at<5*60e3?x.p.then(r=>r||fetchIt(),fetchIt):fetchIt()}
function newQ(){const tok=S.qtok=(S.qtok||0)+1;Object.assign(S,blankQ(),{q:null,phase:"loading"});
 nextFor(S.practice?"practice":"hotseat").then(r=>{if(S.qtok!==tok||S.screen!=="play")return;setQ(r);render()})
  .catch(e=>{if(S.qtok!==tok||S.screen!=="play")return;S.phase="error";S.err=e.message;render()})}
/* Full screen: requested from the Play click (a user gesture). Browsers or frames that refuse it are simply ignored. */
const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
function fsToast(t){let el=$("#fstoast");if(!el){el=document.createElement("div");el.id="fstoast";el.setAttribute("role","status");document.body.appendChild(el)}el.textContent=t;el.classList.add("on");clearTimeout(fsToast.t);fsToast.t=setTimeout(()=>el.classList.remove("on"),3200)}
function goFull(manual){try{const d=document.documentElement;if(fsEl())return;const req=d.requestFullscreen||d.webkitRequestFullscreen;
 if(!req){if(manual)fsToast("Full screen isn't supported here. On a laptop press F11; on a phone add the page to your home screen.");return}
 const p=req.call(d,{navigationUI:"hide"});if(p&&p.catch)p.catch(()=>{if(manual)fsToast("Your browser blocked full screen here. Press F11 (Fn+F11 on some laptops) instead.")})}catch(e){if(manual)fsToast("Your browser blocked full screen here. Press F11 instead.")}}
function toggleFull(){try{if(fsEl()){const ex=document.exitFullscreen||document.webkitExitFullscreen;const p=ex&&ex.call(document);p&&p.catch&&p.catch(()=>{})}else goFull(true)}catch(e){}}
document.addEventListener("fullscreenchange",()=>{const b=$("#fsbtn");if(b){b.setAttribute("aria-pressed",!!fsEl());b.title=fsEl()?"Exit full screen":"Full screen"}});
function startRun(fromFFF){ctx();goFull();if(!fromFFF)SFX.start();clearInterval(qInt);clearInterval(fInt);P.rung=0;const first=!P.runs;
 S={screen:"play",name:S.name,used:{},run:{t0:Date.now(),answered:0,correct:0,startRung:0,peak:0,fb:0,en:100,cs:0,first},practice:false};P.runs++;
 logEv({kind:"run_start",rung:rungOf()});newQ();render();scrollTo({top:0})}

/* ================= Grading and progress rules ================= */
const norm=s=>String(s).toLowerCase().replace(/\s+/g,"").replace(/\(\)$/,"");
/* The answer is graded on the server (run-type questions are run in the browser first, see bank-ui.js). */
async function submitAnswer(){const q=S.q,ms=Date.now()-S.qT0;
 const answer=S.timeout?null:await KBCQ.answer(q,S);
 return KBCQ.api("POST","/api/play/answer",{qid:q.id,answer,ms,timeout:!!S.timeout,prefetch:true}).then(keepNext)}
function apply(ok,res){const q=S.q,sk=q.sk,before=res&&res.rungBefore!=null?res.rungBefore:rungOf(),info={before,mastered:false,rungUp:false,ck:null,drop:null,msg:res&&res.msg};
 if(ok){P.correct++;P.streak[sk]=(P.streak[sk]||0)+1}else P.streak[sk]=0;
 if(res&&res.engine){ENGINE=res.engine;graphCheck(ENGINE)}
 P.answered++;dayTick();comboTick(ok);const after=rungOf();info.after=after;
 if(after>before){info.rungUp=true;if(CK[after-1])info.ck=CK[after-1];logEv({kind:"rung",rung:after});P.paid=P.paid||{};for(let r=before+1;r<=after;r++)if(!P.paid[r]){P.paid[r]=1;const amt=amountOf(r);P.coins=(P.coins||0)+amt;if(S.run)S.run.earned=(S.run.earned||0)+amt}}
 if(res&&res.transitions)info.mastered=res.transitions.some(t=>t.kind==="level_up"||t.kind==="skill_done");
 info.transitions=(res&&res.transitions)||[];
 P.best=Math.max(P.best,after);saveP();return info}

/* ================= Timer ================= */
function stopQ(){clearInterval(qInt);qInt=null}
function startQ(){stopQ();if(S.screen!=="play"||S.phase!=="ask")return;clearTimeout(startQ.tk);const q0=S.q;startQ.tk=setTimeout(()=>{if(S.screen==="play"&&S.phase==="ask"&&S.q===q0&&!S.thinkLong){S.thinkLong=true;const b=document.querySelector(".mcol .mascot");if(b){const t=document.createElement("div");t.innerHTML=mascot("think",176);b.replaceWith(t.firstChild)}}},90000);
 /* the deadline is set once per question; re-renders (50:50, hint) keep counting from it */
 if(!S.deadline)S.deadline=Date.now()+S.time*1000;
 qInt=setInterval(()=>{const left=Math.max(0,Math.ceil((S.deadline-Date.now())/1000));if(left===S.time)return;S.time=left;const c=$("#clock");if(c){c.querySelector("span").textContent=S.time;c.style.setProperty("--p",S.time/(S.secsMax||CFG.secs));c.classList.toggle("low",S.time<=10)}
  if(S.time<=10&&S.time>0)SFX.tick();if(S.time<=0){stopQ();S.timeout=true;reveal()}},250)}
/* Locked answer: a heartbeat plays while the verdict is held back for a random 1.5–4 seconds */
let hbInt=null;
function lockIn(){if(S.phase!=="ask")return;S.phase="locked";stopQ();SFX.lock();S.pendingRes=submitAnswer();S.pendingRes.catch(()=>{});render();
 const wait=reduceMotion?400:1500+Math.random()*2500;clearInterval(hbInt);const q0=S.q;
 setTimeout(()=>{clearInterval(hbInt);if(S.screen==="play"&&S.phase==="locked"&&S.q===q0)reveal()},wait)}
async function reveal(){if(S.phase==="reveal"||S.revealing)return;S.revealing=true;const q=S.q;
 if(S.phase==="ask"){S.phase="locked";render()}
 let res;try{res=await(S.pendingRes||submitAnswer())}catch(e){S.revealing=false;
  if(e.status===409){fsToast(e.message||"That question closed. Here's the next one.");newQ();render();return}
  S.phase="ask";S.pendingRes=null;fsToast("Could not reach the server. Check your internet and lock your answer again.");render();return}
 if(S.q!==q||S.screen!=="play")return;
 const ok=!!res.correct;S.ok=ok;S.res=res;S.phase="reveal";S.revealAt=Date.now();KBCQ.reveal(q,res,S);
 const info=apply(ok,res);S.info=info;if(!S.practice)energyTick(ok);S.run.peak=Math.max(S.run.peak||0,info.before,info.after);S.run.answered++;if(ok)S.run.correct++;
 logEv({kind:"answer",sk:q.sk,ty:q.ty,v:q.v,qid:q.id,ok,timeout:!!S.timeout,practice:!!S.practice,rung:info.after});S.run.fb=0;
 render();
 if(ok){SFX.right();setTimeout(()=>SFX.coinDrop(info.rungUp?7:3),260);spotFx("win");window.KB3D&&KB3D.boost();if(info.rungUp){if(info.ck)setTimeout(()=>SFX.fanfare(),900);confetti(info.ck?260:160)}else confetti(50)}
 else{SFX.wrong();flash();spotFx("lose");window.KB3D&&KB3D.alarm()}
 say(ok?(info.rungUp?"Group cleared! Prize "+fmtR(amountOf(info.after))+" won.":"Correct! "+(info.msg||"")):(S.timeout?"Time is up. ":"Wrong answer. ")+"The answer was "+(q.show||"")+".")}
function say(t){const e=$("#sr-live");if(e){e.textContent="";setTimeout(()=>e.textContent=t,30)}}
function leaveReveal(){if(S.revealAt)S.run.fb+=Math.min(Date.now()-S.revealAt,120000);S.revealAt=0}
/* A game ends: wrong/timeout pays the last checkpoint reached, "stop" pays the current rung, "win" pays the top open rung.
   The payout goes into the wallet and the next game starts fresh at rung 1. */
function endRun(reason){stopQ();leaveReveal();const R=S.run,dur=Date.now()-R.t0,peak=Math.max(R.peak||0,rungOf());
 const pay=R.earned||0; /* prizes are credited the moment a group is cleared; a game just reports what it earned */
 const before=(P.coins||0)-pay;saveP();
 logEv({kind:"run_end",reason,dur,fb:R.fb,answered:R.answered,correct:R.correct,rung:peak,payout:pay});saveFame();
 S={screen:"result",name:S.name,res:{reason,answered:R.answered,correct:R.correct,secs:Math.round(dur/1000),reached:peak,payout:pay,wallet:P.coins,last:S.q,ok:S.ok,info:S.info,practice:S.practice}};render();scrollTo({top:0});
 if(pay>0){setTimeout(()=>flyCoins(pay,before,P.coins),500);if(reason==="win")setTimeout(()=>confetti(200),300)}}
function flyCoins(pay,from,to){const chip=$("#wchip");if(!chip)return;const cr=chip.getBoundingClientRect(),tx=cr.left+14,ty=cr.top+cr.height/2-13,n=Math.min(14,4+Math.round(Math.log10(pay+1)*2));
 for(let i=0;i<n;i++){const c=document.createElement("span");c.className="flycoin";c.textContent="{}";const sx=innerWidth*.28+Math.random()*innerWidth*.22,sy=innerHeight*.4+Math.random()*120;c.style.transform=`translate(${sx}px,${sy}px) scale(.6)`;document.body.appendChild(c);
  setTimeout(()=>{c.style.transform=`translate(${tx}px,${ty}px) scale(1)`;c.style.opacity=".25"},40+i*70);setTimeout(()=>c.remove(),1150+i*70)}
 SFX.coinDrop(Math.min(8,n));countUpChip(from,to,1000+n*70)}
function countUpChip(a,b,d){const el=$("#wchip b"),ch=$("#wchip");if(!el)return;const t0=performance.now(),st=t=>{const k=Math.min(1,(t-t0)/d);el.textContent=fmtR(Math.round(a+(b-a)*k));if(k<1)requestAnimationFrame(st)};requestAnimationFrame(st);if(ch){ch.classList.add("bump");setTimeout(()=>ch.classList.remove("bump"),d+300)}}

/* ================= Views ================= */
function boardHTML(r,compact){const rows=[];for(let i=LADDER.length-1;i>=0;i--){
  const soon=i>=OPEN,cls=["rung",CK[i]?"ck":"",i<r?"done":"",i===r&&!soon?"next":"",soon?"soon":""].join(" ");
  rows.push(`<div class="${cls}"><span class="no">${i+1}</span><span class="amtc">${boardNote(LADDER[i])}${fmtR(LADDER[i])}</span>${CK[i]?`<span class="tg">${stg(CK[i])}${TAG[i]?" · "+TAG[i]:""}</span>`:TAG[i]?`<span class="tg">${TAG[i]}</span>`:soon?"":"<span></span>"}</div>`)}
 const min=boardMin();return `<aside class="board card ${min?"min":""}" aria-label="Money board"><h2>Money board<button class="bmin" data-act="board-min" aria-pressed="${min}" aria-label="${min?"Show the whole money board":"Minimise the money board"}" title="${min?"Show all rungs":"Minimise"}">${min?"＋":"−"}</button></h2>${rows.join("")}</aside>`}
/* the money board can be folded down to the rung being played; the choice is remembered on this device */
const boardMin=()=>!!store.get("kbc-board-min",false);
function stripHTML(r){return `<div class="strip" aria-hidden="true">${LADDER.map((v,i)=>`<i class="${i<r?"done":i===r?"next":""} ${i>=OPEN?"soon":""}"></i>`).join("")}</div>`}
function syncChip(){const c=$("#wchip");if(c){c.innerHTML=`<span class="coinlogo" style="width:20px;height:20px;font-size:7px" aria-hidden="true">{ }</span><b>${fmtR(P.coins||0)}</b>`;c.setAttribute("aria-label","Wallet "+fmtR(P.coins||0))}}
/* Contextual buddy pose on Home (mirrors the reference pose rules) */
const T0=Date.now();let VIBE_UNTIL=0;
const MISSED=(()=>{try{const p=JSON.parse(localStorage.getItem("kbc-r1-progress")||"{}");return p.lastDay&&(Date.now()-new Date(p.lastDay).getTime())>3*864e5}catch(e){return false}})();
function istHour(){const d=new Date(Date.now()+(330+new Date().getTimezoneOffset())*60000);return d.getHours()}
function ctxPose(){const h=istHour(),min=(Date.now()-T0)/60000;
 if(document.fullscreenElement)return "zen";
 if(MISSED&&min<10)return "missed";
 if(min>=90&&Math.floor(min)%90<3)return "stretch";
 if(min>=45&&Math.floor(min)%45<3)return "drink";
 if(Date.now()<VIBE_UNTIL)return "vibe";
 if(h>=23||h<4)return "tired";
 if(typeof liveDay==="function"&&liveDay()>=3)return "streak";
 if(h>=5&&h<11)return "chai";
 return "pointq"}
const buddyName=()=>(COSTUMES[CHAR]||COSTUMES.pixel).name;
function homeLine(r,st){if(!P.answered)return `Hi! I'm ${buddyName()}, your KBC buddy.`+"  Win Fastest Finger First, then climb the money board one question at a time.";
 return `Welcome back! Every game starts fresh at 10. Wallet: ${fmtR(P.coins||0)}.`}
function vHome(){const best=P.best||0,coins=P.coins||0;
 const greet=esc(quipText("homebubble"));
 return `<div class="wishc" role="note"><b>Happy Diwali!</b><span>Wishes first, KBC Next!</span></div><section class="home4 enter">
<div class="h4-bot"><p class="say">${P.answered?greet:esc(`Hi! I'm ${buddyName()}, your KBC buddy. Win Fastest Finger First to take the hot seat!`)}</p>${mascot(ctxPose(),300)}<span class="bname" aria-hidden="true">${esc(buddyName())}<small>your KBC buddy</small></span><button class="btn quiet sm" data-act="buddy">Change buddy</button></div>
<div class="h-hero">
<span class="emb hlogo" aria-hidden="true"><i class="er"></i><i class="er er2"></i><span class="ec">{ }</span></span>
<h1 class="ttl"><span>Kaun Banega</span><b class="typed" aria-label="Coder"><em class="tw" aria-hidden="true">Coder</em><i class="caret" aria-hidden="true"></i></b></h1>
<div class="ctready" aria-label="Your GRIT Computational Thinking readiness: ${gritReady()} percent"><div class="ct-ring" style="--v:${Math.min(100,parseFloat(gritReady()))}"><b>${gritReady()}<small>%</small></b></div><div class="ct-txt"><span class="ct-k">Your GRIT</span><strong>Computational Thinking readiness</strong><span class="ct-s">Rises with every level you clear</span></div></div>
<p class="hhey">hey ${esc(String(S.name||"").split(" ")[0]||"coder")} 👋 your seat is waiting</p>
<button class="hplay" type="button" data-act="play"><span>Play Fastest Finger</span><i aria-hidden="true">→</i></button>
<div class="hmeta3"><span class="hlive"><i class="ldot"></i><b class="livenum">${LIVE}</b> playing now</span><span class="hdot" aria-hidden="true"></span><button class="hlink" type="button" data-act="tour">Quick tour</button></div>

<div class="h4-stats"><span>Wallet <b>${fmtR(coins)}</b></span><span>Best <b>${best?fmtR(amountOf(best)):"—"}</b></span><span>Every game starts at <b>10</b></span></div>
</div>
${(()=>{const g=curGroup(),sk=curSkill(g),pct=Math.round(gDone(g)/gTotal(g)*100);const top=(fameRows().rows||[]).sort((a,b)=>(b.coins||0)-(a.coins||0)).slice(0,3);
 return `<aside class="h4-side"><div class="hs-card"><small>Up next on your path</small><h3>${sk?esc(sk.name):"All clear"}</h3><span class="hs-c">${stg(g.c)} · ${esc(g.name)}</span>
 <div class="hs-prize">${boardNote(g.prize)}<span><small>Next prize</small><b>${fmtR(g.prize)}</b></span></div><div class="pbar"><i style="width:${pct}%"></i></div><span class="hs-pc">${pct}% of the way</span>
 <button class="btn quiet sm" data-act="path">Open my path →</button></div>
 <div class="hs-card"><small>Hall of Fame</small>${top.length?`<ol class="hs-fame">${top.map((r,i)=>`<li><b>${i+1}</b><span>${esc(r.n)}</span><em>${fmtR(r.coins||0)}</em></li>`).join("")}</ol>`:`<p class="hs-empty">No names yet. Be the first.</p>`}<button class="btn quiet sm" data-act="fame">See all →</button></div></aside>`})()}
</section>`}
function llHTML(){const q=S.q;return LIFE.map(l=>{const u=S.used[l.k],na=l.k==="fifty"&&(q.kind!=="mcq"||q.two),dis=u||na||S.phase!=="ask";
 return `<button class="ll ${u?"used":""}" data-act="ll" data-k="${l.k}" ${dis?"disabled":""} title="${esc(l.tip)}" aria-label="${l.name}${u?" (used)":""}"><span class="lt">${ICON[l.k]}</span><span class="cap">${l.cap}</span></button>`}).join("")}
function optCls(i){const q=S.q;let c="opt";if(S.gone.includes(i))c+=" gone";
 if(S.phase==="reveal"){if(i===q.ans)c+=" right";else if(i===S.pick)c+=" wrong"}else if(S.phase==="locked"&&i===S.pick)c+=" locked";else if(i===S.pick)c+=" pending";return c}
function answerHTML(){const q=S.q,rev=S.phase==="reveal",dis=S.phase!=="ask";
 if(q.kind==="bank")return KBCQ.render(q,S);
 if(q.kind==="mcq")return `<div class="opts">${q.opts.map((t,i)=>`<button class="${optCls(i)}" data-act="pick" data-i="${i}" ${dis||S.gone.includes(i)?"disabled":""}><span class="l">${"ABCD"[i]}</span><span class="t ${q.plain?"plain":""}">${esc(t)}</span></button>`).join("")}</div>`;
 if(q.kind==="fill"){const st=rev?(S.ok?"right":"wrong"):"";return `<div class="fillrow"><label class="muted" for="fillin">Your answer for ____</label><input id="fillin" class="${st}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.fill)}" ${dis?"disabled":""} placeholder="type it here"></div>`}
 if(q.kind==="order"){const st=rev?(S.ok?"right":"wrong"):"";
  return `<div class="tiles">${q.disp.map((li,d)=>{const pos=S.ord.indexOf(d);return `<button class="tile ${pos>-1?"picked":""}" data-act="ord" data-d="${d}" ${dis||pos>-1?"disabled":""}><span class="ord">${pos>-1?pos+1:""}</span>${esc(q.lines[li])}</button>`}).join("")}</div>
<div class="built ${st}" aria-label="Your program">${S.ord.length?S.ord.map(d=>`<span class="ln2">${hlLine(q.lines[q.disp[d]])}</span>`).join(""):`<span class="muted">Tap the lines above in the order they should run.</span>`}</div>${!dis&&S.ord.length?`<div><button class="btn quiet sm" data-act="ord-clear">Clear</button></div>`:""}`}
 if(q.kind==="match")return `<div class="tiles">${q.items.map((it,i)=>{const st=rev?(S.msel[i]===it.ans?"right":"wrong"):"";return `<div class="mrow ${st}"><code>${esc(it.label)}</code><div class="mchips" role="group" aria-label="Output for ${esc(it.label)}">${q.choices.map(c=>{const on=S.msel[i]===c,k=rev?(c===it.ans?"ok":on?"no":""):on?"on":"";return `<button class="mchip ${k}" data-act="msel" data-i="${i}" data-c="${esc(c)}" aria-pressed="${on}" ${dis?"disabled":""}>${esc(c)}</button>`}).join("")}</div>${rev&&st==="wrong"?`<span class="fix">Prints ${esc(it.ans)}</span>`:""}</div>`}).join("")}</div>`;
 return ""}
function ready(){const q=S.q;if(!q)return false;if(q.kind==="bank")return KBCQ.ready(q,S);if(q.kind==="mcq")return S.pick!=null;if(q.kind==="fill")return S.fill.trim()!=="";if(q.kind==="order")return S.ord.length===q.lines.length;if(q.kind==="match")return S.msel.every(Boolean);return false}
function actHTML(){const h=actHTML0();return S.phase==="reveal"&&S.q?h+`<button class="btn quiet solbtn" data-act="sol">💡 Reveal solution</button>`:h}
function actHTML0(){const q=S.q;
 if(S.phase==="ask"){if(S.quitAsk)return `<span class="ask">Stop here and keep ${fmtR(amountOf(rungOf()))}?</span><button class="btn gold" data-act="quit">Yes, stop</button><button class="btn quiet" data-act="quit-no">Keep playing</button>`;
  if(!ready())return `<span class="muted">${q.kind==="bank"?KBCQ.need(q,S):q.kind==="mcq"?"Pick an answer (or press A–D)":q.kind==="fill"?"Type the missing word":q.kind==="order"?"Tap every line in order":"Choose an output for each line"}</span>${S.practice?'<button class="btn quiet sm" data-act="practice-end">End practice</button>':'<button class="btn quiet sm" data-act="quit-ask">Stop playing</button>'}`;
  return `<span class="ask">Final answer?</span><button class="btn gold" id="lockbtn" data-act="lock">Lock answer</button>${q.kind==="mcq"?`<button class="btn quiet" data-act="unpick">Change</button>`:""}`}
 if(S.phase==="locked")return `<span class="ask pulse">Answer locked… let's see</span>`;
 if(S.practice)return `<span class="banner ${S.ok?"win":"lose"}">${S.ok?"Correct!":S.timeout?"Time's up":"Not quite"}</span><button class="btn gold" data-act="next">Next question →</button><button class="btn quiet" data-act="practice-end">End practice</button>`;
 if(!S.ok&&S.run.en<=0)return `<span class="banner lose">Out of energy</span><button class="btn gold" data-act="end">See my game →</button>`;
 if(!S.ok)return `<span class="banner lose">${S.timeout?"Time's up":"Not this time"}</span><button class="btn gold" data-act="second">Try a new variant →</button><button class="btn quiet" data-act="stop">Save progress & leave</button>`;
 if(S.ok)return rungOf()>=OPEN&&!S.practice?`<span class="banner win">Correct answer!</span><button class="btn gold" data-act="collect">Collect ${fmtR(LADDER[OPEN-1])} →</button>`:`<span class="banner win">Correct answer!</span><button class="btn gold" data-act="next">Next question →</button><button class="btn quiet" data-act="stop">Save progress & leave</button>`;
 return `<span class="banner lose">${S.timeout?"Time's up":"Wrong answer"}</span><button class="btn gold" data-act="end">See my game →</button>`}
function feedbackHTML(){const I=S.info;if(S.phase!=="reveal"||!I)return "";let h="";
 if(S.ok&&I.rungUp)h+=`<div class="rungup">${noteBig(amountOf(I.after),"won")||mascot("happy",72)}<b>You won ${fmtR(amountOf(I.after))}!</b><span>${I.ck?`${stg(I.ck)} locked in. A wrong answer can't take you below this.`:`Rung ${I.after} won. ${I.after<OPEN?`Next: ${fmtR(LADDER[I.after])}.`:""}`}</span></div>`;
 if(!S.ok&&I.drop)h+=`<div class="drop">${mascot("sad",44)}<span>${I.drop.lostRung?`Dropped from ${fmtR(I.drop.from)} to <b>${fmtR(I.drop.to)}</b> (${stg(I.drop.ck)}).`:`Back to your ${stg(I.drop.ck)} checkpoint: progress on this rung resets.`}</span></div>`;
 return h}
/* "Reveal solution": the full working opens in a sheet over the hot seat, so the question screen never needs scrolling */
function solOpen(){if(!S.q||S.phase!=="reveal")return;let m=$("#solm");if(!m){m=document.createElement("div");m.id="solm";m.className="modalx";document.body.appendChild(m)}
 m.innerHTML=`<div class="mbox solbox" role="dialog" aria-modal="true" aria-label="Solution"><button class="mx" data-act="sol-close" aria-label="Close">✕</button>${explainHTML(S.q,S.ok)}<div class="mbtns"><button class="btn gold" data-act="sol-close">Got it</button></div></div>`;
 m.hidden=false;setTimeout(()=>{const b=m.querySelector(".mbtns .btn");b&&b.focus({preventScroll:true})},30)}
function modalClose(id){const m=$(id);if(m)m.hidden=true}
function vNoQ(){const r=S.noQ||{},soon=(r.comingSoon||[]).map(id=>SK[id]).filter(Boolean);
 let body;
 if(S.phase==="loading")body=`<div class="qcard card bq-wait"><span class="bq-spin" aria-hidden="true"></span><h2 class="qtext">Getting your next question…</h2></div>`;
 else if(S.phase==="error")body=`<div class="qcard card"><h2 class="qtext">We couldn't load a question</h2><p class="muted">${esc(S.err||"Check your internet connection.")}</p><div class="ractions"><button class="btn gold" data-act="next">Try again</button><button class="btn quiet" data-act="stop">Leave</button></div></div>`;
 else body=`<div class="qcard card"><h2 class="qtext">${r.allDone?"You've cleared every skill on the path!":"You've cleared everything that's ready for you."}</h2>
  <p class="muted">${r.allDone?"There is nothing left to unlock. Legend.":`New questions are on their way for ${soon.length?soon.slice(0,4).map(s=>esc(s.name)).join(", ")+(soon.length>4?" and more":""):"your next skills"}. Your progress is saved, so come back soon.`}</p>
  <div class="ractions">${S.practice?'<button class="btn gold" data-act="practice-end">End practice</button>':'<button class="btn gold" data-act="stop">Save progress & leave</button>'}<button class="btn quiet" data-act="path">See my path</button></div></div>`;
 return `<div class="play">${dockHTML(S.phase==="loading"?"think":"chai","col")}<div class="left"><section class="mainc">${body}</section></div><div class="side">${boardHTML(rungOf())}</div></div>`}
function vPlay(){if(!S.q)return vNoQ();const q=S.q,r=rungOf(),st=rowSteps(Math.min(r,ROWS.length-1)),stake=r<OPEN?LADDER[r]:LADDER[OPEN-1];
 const pips="";
 const mood=S.phase==="reveal"?(S.ok?(S.info&&S.info.ck?"trophy":"dance"):S.timeout?"tired":"bonk"):S.phase==="locked"?"think":(!S.practice&&S.run.en<=20?"tired":S.practice&&S.run.answered===0?"type":S.thinkLong?"think":(S.pick!=null||S.fill||(S.ord&&S.ord.length)?"pointa":"pointq"));
 return `<div class="play">${dockHTML(mood,"col")}<div class="left"><div class="hud"><div class="lls">${energyHTML()}</div>
<div class="clock ${S.time<=10?"low":""}" id="clock" style="--p:${S.time/(S.secsMax||CFG.secs)}" role="timer" aria-label="Seconds left"><span>${S.time}</span></div>
<div class="stake"><small>${S.practice?"Practice round":"Playing for"}</small><b>${S.practice?"No stakes":fmtR(stake)}</b>${S.practice?"":noteThumb(stake)}<small>Banked ${fmtR(amountOf(r))}</small></div></div>
${stripHTML(r)}<button class="mbtoggle" data-act="board" aria-label="Show the money board">Money board</button>
<section class="mainc" id="mainc">
<div class="qcard card"><div class="qtop"><span class="chip gold">${S.practice?"Practice":`Question ${S.run.answered+(S.phase==="reveal"?0:1)} · for ${fmtR(S.phase==="reveal"&&S.info?LADDER[Math.min(S.info.before,LADDER.length-1)]:stake)}`}</span>${pips?`<span class="rowprog">To next rung <span class="pips" aria-label="${st.done} of ${st.total}">${pips}</span></span>`:""}</div>
<h2 class="qtext">${esc(q.prompt)}</h2>${KBCQ.above(q,S)}
${q.code?codeHTML(q.code):""}
${q.ai!=null?`<div class="ai"><i>AI</i><span>The AI says this prints <b>${esc(q.ai)}</b></span></div>`:""}
${S.hint?`<div class="panel card"><h3>${ICON.hint}${esc(COSTUMES[CHAR].name)}'s hint</h3><p>${esc(S.hintText||"Thinking…")}</p></div>`:""}
</div>
${answerHTML()}
<div class="dockrow">${dockHTML(mood)}<div class="actions">${actHTML()}</div></div>
${feedbackHTML()}
</section></div><div class="side">${boardHTML(r)}</div></div>`}
function vResult(){const R=S.res,rc=R.reached||0,pay=R.payout||0;
 const msg=R.reason==="win"?`${fmtR(pay)} collected! You're a Crorepati Coder.`:R.reason==="stop"?`Smart move. You walked away with ${fmtR(pay)}.`:R.reason==="energy"?`Out of energy! Your path progress is saved${pay?` and ${fmtR(pay)} went to your wallet`:""}. Recharge with a new game.`:pay?`Game over, but you keep it all. ${fmtR(pay)} goes to your wallet.`:"Tough one. Nothing banked this time. Read why, then go again.";
 const mood=R.reason==="win"?"trophy":R.reason==="stop"?"chai":pay?"dance":R.reason==="timeout"?"tired":"bonk";
 const learn=R.last&&R.ok===false&&R.last.why?`<div class="res-learn"><h3>${ICON.book}Before you go again</h3><ol class="ex-steps">${whySteps(R.last.why).map(t=>`<li>${stepHTML(t,R.last)}</li>`).join("")}</ol>${EXPLAIN[R.last.sk]?`<div class="ex-note idea"><b>Key idea</b><p>${esc(EXPLAIN[R.last.sk].idea)}</p></div>`:""}</div>`:"";
 return `<section class="res enter"><div class="res-card card">
<div class="res-top"><div class="res-head">
<div class="coach">${mascot(mood,84)}<p class="say">${esc(msg)}</p></div>
<div class="muted">${esc(S.name||"Player")} takes home</div><div class="ramt">${fmtR(pay)}</div><div class="muted">Highest rung this game: ${rc?fmtR(amountOf(rc)):"none yet"}</div>
</div>${NOTE[pay]?`<div class="res-bill">${noteBig(pay)}</div>`:""}</div>
<dl class="res-line"><div><dt>Correct this game</dt><dd>${R.correct}/${R.answered}</dd></div><div><dt>Time played</dt><dd>${Math.floor(R.secs/60)}:${String(R.secs%60).padStart(2,"0")}</dd></div><div><dt>Highest rung</dt><dd>${rc}/15</dd></div><div><dt>Wallet</dt><dd>${fmtR(R.wallet)}</dd></div></dl>
<div class="res-goal"><div class="res-goal-h"><b>Next game starts fresh at 10</b><span class="muted">Best ever: ${fmtR(amountOf(P.best))}</span></div><span class="muted">Win Fastest Finger First to take the hot seat again.</span></div>
${learn}
${quipHTML("result"+R.reason)}
<div class="ractions"><button class="btn gold" data-act="play">Play again →</button><button class="btn quiet" data-act="fame">Hall of Fame</button><button class="btn quiet" data-act="home">Home</button></div>
</div>
<div class="side">${boardHTML(rc)}</div></section>`}
/* A row is plausible only if its numbers could come from real games: right ≤ answered, best ≤ 15 rungs,
   and wallet ≤ answered-right × (7 crore / 15), the most any single correct answer can be worth. */
function famePlausible(f){const c=+f.correct||0,a=+f.answered||0,w=+f.coins||0,b=+f.best||0;
 return typeof f.n==="string"&&f.n.trim().length>0&&f.n.length<=24&&c>=0&&c<=a&&b>=0&&b<=LADDER.length&&w>=0&&w<=Math.ceil(c*LADDER[LADDER.length-1]/LADDER.length)}
function podiumHTML(rows){const ini=n=>esc(String(n||"?").trim().charAt(0).toUpperCase()||"?");const at=i=>rows[i];const one=(i,cls)=>{const r=at(i);return `<div class="pod ${cls}${r?"":" empty"}"><div class="who"><span class="av">${r?ini(r.n):"?"}</span><span class="nm">${r?esc(r.n):"Your spot"}</span><span class="amt">${r?fmtR(r.coins||0):"—"}</span></div><div class="blk">${cls.slice(1)}</div></div>`};if(!rows.length)return "";return `<div class="podium" aria-label="Top three">${one(1,"p2")}${one(0,"p1")}${one(2,"p3")}</div>`}
/* ================= Skill path: driven by the progression engine on the server =================
   Checkpoint › skill group (one prize rung) › skill › 4 levels (L1 Recognise … L4 Create) › R1–R3 difficulty › 25 variants.
   Two right answers in a row clear a level (L1 first climbs R up to the skill's rmax). ID = C·G·S·L·T·R·V. */
const LEVELS=[1,2,3,4].map(l=>({id:"L"+l,name:(GR.levels||{})[l]||"",types:GR.types.filter(t=>t.level===l).map(t=>t.name),keys:GR.types.filter(t=>t.level===l).map(t=>t.key)}));
const DIFFS=[["R1","Low","this skill only"],["R2","Medium","+ 1–2 earlier skills"],["R3","Hard","+ 3 or more earlier skills"]],VARIANTS=25;
const TSTART=(()=>{let t=0;return LEVELS.map(L=>{const a=t;t+=L.types.length;return a})})();
const gOf=sk=>GROUPS.find(g=>g.skills&&g.skills.some(x=>x.id===sk));
const NTYPES=LEVELS.reduce((a,l)=>a+l.types.length,0),BPS=8; /* progress steps per skill: 2 right answers × 4 levels */
const LATER=[["FIN","Grand finale"]];
const GROUPS=LADDER.map((v,i)=>{const r=ROWS[i];return r?{id:r.id,c:r.c,name:r.name,skills:r.skills,prize:v,idx:i}:{id:"G"+(i+1),c:LATER[0][0],name:LATER[0][1],skills:null,prize:v,idx:i,locked:true}});
const gSkills=g=>g.skills?g.skills.length:3;
const gTotal=g=>gSkills(g)*BPS;
const engSk=sk=>(ENGINE&&ENGINE.skills&&ENGINE.skills[sk])||{status:"locked",level:1,r:1,progress:0,content:"none"};
function barOf(sk){const e=engSk(sk);return e.status==="done"?BPS:Math.min(BPS-1,Math.floor((e.progress||0)*BPS))}
function gDone(g){return g.skills?g.skills.reduce((a,s)=>a+barOf(s.id),0):0}
function curGroup(){const a=ENGINE&&ENGINE.active&&gOf(ENGINE.active);return a||GROUPS.find(g=>g.locked||gDone(g)<gTotal(g))||GROUPS[GROUPS.length-1]}
const skReady=s=>engSk(s.id).status!=="locked";
function curSkill(g){if(!g||!g.skills)return null;if(ENGINE&&ENGINE.active&&SK[ENGINE.active]&&g.skills.includes(SK[ENGINE.active]))return SK[ENGINE.active];return g.skills.find(s=>barOf(s.id)<BPS)||null}
function toGo(g){return gTotal(g)-gDone(g)}
function ringSVG(p,sz){const r=sz/2-4,c=2*Math.PI*r;return `<svg class="pring" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" aria-hidden="true"><circle cx="${sz/2}" cy="${sz/2}" r="${r}" class="pr-bg"/><circle cx="${sz/2}" cy="${sz/2}" r="${r}" class="pr-fg" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-p)}" transform="rotate(-90 ${sz/2} ${sz/2})"/></svg>`}
function skillDetail(s){const e=engSk(s.id),cells=e.cells||{};
 const cols=LEVELS.map((L,li)=>{const l=li+1,st=e.status==="done"||l<e.level?"done":l===e.level&&e.status==="open"?"now":"";
  return `<div class="lvl ${st}"><h4><b>${L.id}</b> ${esc(L.name)}<small>T${1}–T${L.types.length}</small></h4><ol>${L.types.map((t,ti)=>`<li><span><em>T${ti+1}</em> ${esc(t)}</span></li>`).join("")}</ol>
  <div class="pips3">${DIFFS.map((d,ri)=>{const c=cells[l+"-"+(ri+1)];return `<i class="pip ${c&&c.cleared?"done":st==="now"&&e.r===ri+1?"now":""}" title="${d[0]} ${d[1]}${c?` · ${c.attempts} tries, ${c.wrong} wrong`:""}">${d[0]}</i>`}).join("")}</div></div>`}).join("");
 const here=e.status==="done"?`<div class="here ok"><b>Skill cleared</b></div>`:e.status==="locked"?`<div class="here"><b>Locked</b><span>Opens when you clear ${esc(s.pre.join(", ")||"the skills before it")}.</span></div>`:
  e.content==="none"?`<div class="here"><b>Coming soon</b><span>Questions for this skill are on their way.</span></div>`:`<div class="here"><small>You are here</small><b>L${e.level} ${esc(LEVELS[e.level-1].name)} · R${e.r} ${DIFFS[e.r-1][1]}</b><span>${e.rightStreak?"One more right answer clears this level.":"Two right answers in a row clear this level."}</span></div>`;
 return `<div class="skd card"><div class="skd-h"><div><b>${esc(s.name)}</b><p class="muted">${e.right||0}/${e.q||0} answered right${s.pre.length?` · builds on ${s.pre.join(", ")}`:""}</p></div>${here}</div><div class="lvls">${cols}</div></div>`}
/* Candy-style map: winding road from the bottom (G1) to the top (G15). Skills are round level nodes; a prize chest ends each group. */
const CKCOL={C1:"#14C3A2",C2:"#FF4F8B",C3:"#7B5CFF",C4:"#2F8CFF",C5:"#FF8A1F",C6:"#FFC52E",FIN:"#FFC52E"};
const CKNAME={C1:"Python basics",C2:"Loops & lists",C3:"Functions",C4:"Data & errors",C5:"GRIT practice",C6:"Grand finale",FIN:"Grand finale"};
const stg=c=>c==="FIN"?"Finale":c?"Stage "+String(c).replace(/^C/,""):"";
const LVEND=[2,4,6,8];
const LOCKI='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>';
const TICK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* GRIT CT readiness: share of all path barriers in C1–C5 the student has cleared (C6 is the bonus finale) */
function gritReady(){if(typeof GROUPS==="undefined")return "0";const G=GROUPS.filter(g=>g.c!=="C6"),tot=G.reduce((a,g)=>a+gTotal(g),0),done=G.reduce((a,g)=>a+gDone(g),0),v=tot?done/tot*100:0;return v===0?"0":v>=10?String(Math.round(v)):v.toFixed(1)}
function gritRing(sz){const v=Math.min(100,parseFloat(gritReady())),r=sz/2-5,c=2*Math.PI*r;return `<span class="gring" aria-hidden="true"><svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="#fff" stroke="#000" stroke-width="2.5"/><circle cx="${sz/2}" cy="${sz/2}" r="${r-4}" fill="none" stroke="rgba(43,26,14,.12)" stroke-width="6"/><circle cx="${sz/2}" cy="${sz/2}" r="${r-4}" fill="none" stroke="#14C3A2" stroke-width="6" stroke-linecap="round" stroke-dasharray="${2*Math.PI*(r-4)}" stroke-dashoffset="${2*Math.PI*(r-4)*(1-v/100)}" transform="rotate(-90 ${sz/2} ${sz/2})"/><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Unbounded,Arial Black,sans-serif" font-weight="900" font-size="${sz*.3}" fill="#2B1A0E">{}</text></svg></span>`}
/* Diwali layer (minimal): diyas beside prize chests, rangoli under checkpoint banners, a few swaying lanterns, soft fireworks */
const DIYA='<svg viewBox="0 0 40 40"><path class="dflame" d="M20 4c4 6 5 9 3 13-1.5 2-4.5 2-6 0-2-4-1-7 3-13z" fill="#FFB020"/><path class="dflame" d="M20 10c2 3 2.6 5 1.4 7-.8 1-2 1-2.8 0-1.2-2-.6-4 1.4-7z" fill="#FFF3B0"/><path d="M4 22h32q-2 12-16 12T4 22z" fill="#C2410C" stroke="#14081F" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 25h24" stroke="#FFC52E" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 4"/></svg>';
const LANTERN=c=>`<svg viewBox="0 0 40 90"><path d="M20 0v18" stroke="#FFE45C" stroke-width="1.6"/><path d="M8 22h24l6 14-6 14H8L2 36z" fill="${c}" stroke="#14081F" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 22l12 14 12-14M8 50l12-14 12 14" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/><path d="M12 50v22M20 50v28M28 50v22" stroke="#FFC52E" stroke-width="1.8" stroke-linecap="round"/></svg>`;
function diwaliHTML(items,H,TP,fogTop){let h="";
 let near="";
 /* diyas lining both edges of the road, every other bend, up to the fog */
 for(let j=0;j<0;j+=2){const a=TP[j],b=TP[j+1];const mt=(a.top+b.top)/2;if(fogTop!=null&&mt<fogTop+60)continue;
  const dx=(b.x-a.x)/100*820,dy=b.top-a.top,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,mx=(a.x+b.x)/2;
  [-1,1].forEach(sd=>near+=`<span class="diya sm" style="left:calc(${mx.toFixed(2)}% + ${(sd*nx*50).toFixed(1)}px);top:${(mt+sd*ny*50).toFixed(1)}px;animation-delay:${(j%5)*.25}s">${DIYA}</span>`)}
 items.forEach(it=>{if(it.fog)return;
  if(it.k==="pz")[-1,1].forEach(sd=>near+=`<span class="diya" style="left:calc(${it.x}% + ${sd*78}px);top:${it.top+30}px;animation-delay:${(it.top%7)*.2}s">${DIYA}</span>`);
  if(it.k==="ck")h+=`<span class="rangoli" style="top:${it.top}px"></span>`});
 const LC=["#FF4F8B","#FFC52E","#7B5CFF"];
 for(let k=0,y=140;y<H-200;y+=760,k++){const left=k%2===0;h+=`<span class="lantern" style="top:${y}px;${left?"left":"right"}:${6+(k*13)%9}%;animation-delay:${k*.7}s">${LANTERN(LC[k%3])}</span>`}
 for(let k=0,y=380;y<H-200;y+=980,k++)h+=`<span class="fwork" style="top:${y}px;left:${k%2?78:16}%;--fc:${["#FFC52E","#FF4F8B","#5DE3C8"][k%3]};animation-delay:${k*1.3}s"></span>`;
 return {far:`<div class="diwali" aria-hidden="true">${h}</div>`,near:`<div class="diwali dnear" aria-hidden="true">${near}</div>`}}
/* Universe layer: starfield, one planet per checkpoint, a couple of shooting stars */
const PLC={C1:["#2DD4BF","#0F766E"],C2:["#60A5FA","#1E3A8A"],C3:["#A78BFA","#4C1D95"],C4:["#F59E0B","#78350F"],C5:["#F472B6","#831843"],C6:["#FDE68A","#B45309"]};
/* checkpoints of the uploaded graph: the name is the text before ":"; a new checkpoint id borrows a colour */
Object.keys(GR.checkpoints||{}).forEach((c,i)=>{const t=String(GR.checkpoints[c]||"").split(":")[0].trim(),k="C"+(i%5+1);
 if(t)CKNAME[c]=t.length>26?t.slice(0,25)+"…":t;if(!CKCOL[c])CKCOL[c]=CKCOL[k];if(!PLC[c])PLC[c]=PLC[k]});
function spaceHTML(zones,H){const R=rng(7331);let h="";const n=Math.round(H/9);
 for(let i=0;i<n;i++){const sz=R()<.85?1+R()*1.4:2.2+R()*1.6;h+=`<i class="st" style="left:${(R()*100).toFixed(2)}%;top:${(R()*H).toFixed(0)}px;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;opacity:${(.35+R()*.6).toFixed(2)};animation-delay:${(R()*4).toFixed(1)}s"></i>`}
 zones.forEach((z,i)=>{const c=PLC[z.c]||PLC.C1,y=(z.hi+z.lo)/2,sz=120+((i*53)%90),left=i%2===0;
  h+=`<span class="planet ${i%3===1?"ring":""}" style="top:${y.toFixed(0)}px;${left?"left":"right"}:${4+(i*7)%8}%;width:${sz}px;height:${sz}px;--p1:${c[0]};--p2:${c[1]}"></span>`});
 const R2=rng(99);for(let y=120,k=0;y<H-80;y+=170+R2()*120,k++){const left=k%2===0,x=left?2+R2()*12:86+R2()*12,coin=k%3!==2,sz=coin?26+R2()*18:16+R2()*14;
  h+=coin?`<span class="fcoin" style="left:${x.toFixed(1)}%;top:${y.toFixed(0)}px;width:${sz.toFixed(0)}px;height:${sz.toFixed(0)}px;animation-delay:${(R2()*-6).toFixed(1)}s,${(R2()*-3).toFixed(1)}s">{ }</span>`:`<span class="fgem" style="left:${x.toFixed(1)}%;top:${y.toFixed(0)}px;width:${sz.toFixed(0)}px;height:${sz.toFixed(0)}px;animation-delay:${(R2()*-6).toFixed(1)}s"></span>`}
 for(let y=500,k=0;y<H;y+=1400,k++)h+=`<span class="shoot" style="top:${y}px;left:${k%2?60:20}%;animation-delay:${k*2.7}s"></span>`;
 return `<div class="space" aria-hidden="true">${h}</div>`}
function conceptHTML(s){const X=EXPLAIN[s.id]||{},n=barOf(s.id);
 return `<div class="cpt"><span class="cpt-k">Concept</span><h3>${esc(s.name)}</h3>${X.idea?`<p>${esc(X.idea)}</p>`:""}${X.trap?`<p class="cpt-t"><b>Watch out:</b> ${esc(X.trap)}</p>`:""}<div class="pbar"><i style="width:${Math.round(n/BPS*100)}%"></i></div><small>${Math.round(n/BPS*100)}% of this level done</small></div>`}
/* The road up to a fractional point t along the points P (same curve as spline), cutting the last cubic with de Casteljau */
function splineTo(P,t){const n=Math.min(P.length-1,Math.floor(t)),fr=Math.min(1,t-n);let d=`M ${P[0].x} ${P[0].top}`;
 const seg=j=>{const p0=P[Math.max(0,j-1)],p1=P[j],p2=P[j+1],p3=P[Math.min(P.length-1,j+2)];return [[p1.x,p1.top],[p1.x+(p2.x-p0.x)/6,p1.top+(p2.top-p0.top)/6],[p2.x-(p3.x-p1.x)/6,p2.top-(p3.top-p1.top)/6],[p2.x,p2.top]]};
 for(let j=0;j<n;j++){const c=seg(j);d+=` C ${c[1][0]} ${c[1][1]}, ${c[2][0]} ${c[2][1]}, ${c[3][0]} ${c[3][1]}`}
 if(fr>0&&n<P.length-1){const [a,b,c,e]=seg(n),L=(u,v)=>[u[0]+(v[0]-u[0])*fr,u[1]+(v[1]-u[1])*fr],ab=L(a,b),bc=L(b,c),ce=L(c,e),abc=L(ab,bc),bce=L(bc,ce),m=L(abc,bce);
  d+=` C ${ab[0]} ${ab[1]}, ${abc[0]} ${abc[1]}, ${m[0]} ${m[1]}`}
 return d}
function vPath(){const g0=curGroup(),gi=g0.idx,s0=curSkill(g0),open=S.open&&SK[S.open]?SK[S.open]:null;
 const SHOW=Math.max(gi+1,GROUPS.reduce((m,g)=>g.c==="C1"||g.c==="C2"?Math.max(m,g.idx):m,0)),FOGN=3;
 const items=[];let lastC="",lvn=0,fogc=0;
 for(const g of GROUPS){const fog=g.idx>SHOW;if(fog&&fogc>=FOGN)break;
  if(g.c!==lastC){items.push({k:"ck",c:g.c,g,fog});lastC=g.c}
  const sk=g.skills||[0,1,2].map(j=>({id:g.id+"abc"[j],ph:true}));
  for(const s of sk){if(fog&&fogc>=FOGN)break;items.push({k:"sk",g,s,no:++lvn,fog});if(fog)fogc++}
  if(!(fog&&fogc>=FOGN))items.push({k:"pz",g,fog})}
 /* free-form Candy-style track: the road swings across the screen in runs of different lengths, with hairpins and extra bends between levels */
 const R=rng(20261029),TP=[];let x=50,tx=76,y=100;const PADT=150,NAR=innerWidth<700,cl=v=>Math.max(NAR?24:8,Math.min(NAR?76:92,v));
 const step=()=>{const room=tx-x,mv=Math.sign(room)*Math.min(Math.abs(room),14+R()*24);x=cl(x+mv);
  if(Math.abs(tx-x)<3){tx=tx>50?8+R()*18:74+R()*18;if(R()<.3)tx=cl(x+(tx>x?1:-1)*(8+R()*10))}
  y+=Math.abs(mv)>15?40+R()*28:68+R()*46;const p={x,y};TP.push(p);return p};
 items.forEach(it=>{if(it.k==="sk"&&R()<.35)step();if(it.k==="pz"){step();y+=20}const p=step();it.x=p.x;it.y=p.y;it.tp=TP.length;if(it.k==="pz"){y+=26;step()}});
 const H=y+PADT;TP.forEach(p=>p.top=H-p.y);items.forEach(it=>it.top=H-it.y);
 const spline=(P,n)=>{let d=`M ${P[0].x} ${P[0].top}`;for(let j=0;j<n;j++){const p0=P[Math.max(0,j-1)],p1=P[j],p2=P[j+1],p3=P[Math.min(P.length-1,j+2)];
  d+=` C ${p1.x+(p2.x-p0.x)/6} ${p1.top+(p2.top-p0.top)/6}, ${p2.x-(p3.x-p1.x)/6} ${p2.top-(p3.top-p1.top)/6}, ${p2.x} ${p2.top}`}return d};
 const P=[{x:TP[0].x,top:H},...TP,{x:TP[TP.length-1].x,top:0}],cur=items.find(it=>it.k==="sk"&&it.s===s0);
 const d=spline(P,P.length-1);
 const nx=cur?items.find(it=>(it.k==="sk"||it.k==="pz")&&!it.fog&&it.tp>cur.tp):null,f=s0?Math.max(0,Math.min(1,engSk(s0.id).progress||0)):0;
 const dDone=cur?splineTo(P,nx?cur.tp+(nx.tp-cur.tp)*f:cur.tp):spline(P,1);
 const PROPS={mon:'<svg viewBox="0 0 40 34"><rect x="2" y="2" width="36" height="22" rx="4" fill="#2B1846" stroke="#000" stroke-width="2.5"/><path d="M8 10l4 3-4 3M15 17h8" stroke="#3DD16F" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M15 24h10l2 7H13z" fill="#3A332B" stroke="#000" stroke-width="2"/></svg>',
  cube:'<svg viewBox="0 0 36 36"><path d="M18 3l14 8v14l-14 8-14-8V11z" fill="var(--pc)" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><path d="M4 11l14 8 14-8M18 19v14" stroke="#000" stroke-width="2.2" fill="none"/><path d="M6 12l12 7v4L6 16z" fill="rgba(255,255,255,.3)"/></svg>',
  brk:'<svg viewBox="0 0 44 30"><rect x="2" y="2" width="40" height="26" rx="13" fill="#FFF7E6" stroke="#000" stroke-width="2.5"/><text x="22" y="20" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="800" font-size="13" fill="#2B1A0E">{ }</text></svg>',
  bug:'<svg viewBox="0 0 34 34"><ellipse cx="17" cy="19" rx="9" ry="11" fill="#FF5468" stroke="#000" stroke-width="2.5"/><path d="M17 8v22M8 15l-5-3M26 15l5-3M8 22H3M26 22h5M10 28l-4 3M24 28l4 3" stroke="#000" stroke-width="2.2"/><circle cx="17" cy="8" r="5" fill="#2B1A0E"/></svg>',
  cloud:'<svg viewBox="0 0 60 30"><path d="M14 26a10 10 0 0 1 2-19 12 12 0 0 1 23 2 8 8 0 0 1 9 15z" fill="rgba(255,255,255,.12)"/></svg>'};
 const PK=["mon","cube","cloud","brk","cube","bug","cloud"];let props="";
 TP.forEach((p,k)=>{if(k%2)return;const side=p.x>50?-1:1,px=Math.max(6,Math.min(94,p.x+side*(30+((k*17)%14)))),t=PK[(k/2)%PK.length],sz=t==="cloud"?70:t==="mon"?40:32;
  props+=`<span class="prop ${t}" style="left:${px}%;top:${p.top-10}px;width:${sz}px;--pc:${["#7B5CFF","#14C3A2","#FF4F8B","#2F8CFF","#FFC52E"][k%5]};animation-delay:${k%4*.5}s">${PROPS[t]}</span>`});
 const fogTop=(items.find(it=>it.fog)||{top:null}).top;
 const zones=[];items.forEach(it=>{const z=zones[zones.length-1];if(!z||z.c!==it.g.c)zones.push({c:it.g.c,lo:it.top,hi:it.top});else{z.lo=Math.max(z.lo,it.top);z.hi=Math.min(z.hi,it.top)}});
 const zoneHTML=zones.map((z,zi)=>{const top=z.hi-80,bot=zi===0?H:z.lo+80;return `<div class="zone" style="top:${top}px;height:${bot-top}px;--zc:${CKCOL[z.c]}"></div>`}).join("");
 const SPR=["{ }","print()","404","</>","git push","True","λ","++","Ctrl+Z","if/else","def","no bugs","for i in","10x dev","[ ]","pip install","==","main()"],STC=["#FF4F8B","#5DE3C8","#FFE45C","#A58FFF","#5BC0FF","#FF9E3D","#B6FF3B"];
 let deco="";for(let k=0,yy=70;yy<H-40;yy+=86,k++){const left=k%2===0,x=left?3+(k*37%11):84+(k*53%11),rot=(k*47%28)-14,c=STC[k%STC.length];deco+=`<span class="stk" style="top:${yy}px;left:${x}%;--r:${rot}deg;--c:${c};animation-delay:${(k%7)*.5}s">${esc(SPR[k%SPR.length])}</span>`;if(k%2===1)deco+=`<span class="star" style="top:${yy+40}px;left:${left?20:74}%;animation-delay:${k%5*.4}s"></span>`}
 for(let k=0,yy=120;yy<H;yy+=420,k++)deco+=`<span class="blob" style="top:${yy}px;left:${k%2?62:-8}%;--c:${STC[(k*3)%STC.length]}"></span>`;
 const node=(it,ix)=>{const st=`left:${it.x}%;top:${it.top}px;--d:${(ix%6)*.35}s`;
  if(it.fog){if(it.k==="ck")return "";
   if(it.k==="pz")return `<div class="mprize fogged" style="${st}"><div class="chest"><b class="q">?</b></div></div>`;
   return `<div class="mnode fogged" style="${st};--nc:#6B6052"><span class="mb"><b>?</b></span></div>`}
  if(it.k==="ck"){const pc=PLC[it.c]||PLC.C1;return `<button class="ckplanet ${["C2","C4","C6"].includes(it.c)?"ring":""} ${S.openCk===it.c?"sel":""}" data-act="pathck" data-c="${it.c}" aria-label="${stg(it.c)}: ${CKNAME[it.c]}. Show its topics" style="left:${it.x}%;top:${it.top}px;--p1:${pc[0]};--p2:${pc[1]};--cc:${CKCOL[it.c]}"><span class="pl"></span><span class="pt"><b>${stg(it.c)}</b>${CKNAME[it.c]}</span></button>`}
  if(it.k==="pz"){const g=it.g,s=g.idx<gi?"won":g.idx===gi?"cur":"lock";return `<div class="mprize ${s}" style="${st}">${s==="won"?`<span class="crown">★</span>`:""}<div class="chest">${boardNote(g.prize)}<b>${fmtR(g.prize)}</b></div>${s==="won"?`<span class="mp-tag">Won</span>`:`<span class="mp-l">Clear ${esc(g.name)} to win</span>`}</div>`}
  const s=it.s,g=it.g,col=CKCOL[g.c];
  if(s.ph)return `<div class="mnode soon" style="${st};--nc:${col}"><span class="mb"><b>${it.no}</b><i class="lk">${LOCKI}</i></span><small>Level ${it.no}</small></div>`;
  const n=barOf(s.id),es=engSk(s.id),now=s===s0,done=n>=BPS||passed(s),stt=done?"done":now?"now":"soon";
  const dots=LVEND.map(e=>`<i class="${n>=e?"on":""}"></i>`).join("");
  return `<button class="mnode ${stt} ${open===s?"sel":""}" style="${st};--nc:${col}" data-act="pathsk" data-sk="${s.id}" aria-label="Level ${it.no}: ${esc(s.name)}${done?", cleared":es.status==="locked"?", locked":""}">${now?`<span class="mav ${it.x>50?"l":"r"}">${mascot("pointup",160)}<em>You</em></span>`:""}<span class="mb">${done?TICK:`<b>${it.no}</b>`}${!done&&es.status==="locked"?`<i class="lk">${LOCKI}</i>`:""}</span><small title="${esc(s.name)}">${esc(s.short||s.name)}</small></button>`};
 const pct=Math.round(gDone(g0)/gTotal(g0)*100);
 const sheet=open&&open===s0?`<div class="msheet" role="dialog" aria-label="${esc(open.name)}"><div class="msheet-in concept"><div class="cpt"><span class="cpt-k">Up next</span><h3>${esc(open.name)}</h3></div><div class="mfoot"><button class="btn gold" data-act="fffgo">Play this topic →</button><button class="btn sm mclose" data-act="pathsk" data-sk="${open.id}">Close</button></div></div></div>`
  :S.openCk?ckSheet(S.openCk,s0):"";
 const DW=diwaliHTML(items,H,TP,fogTop);
 return `<section class="pathv pfull">
<div class="ptop"><div class="pnext"><span class="pn-k">Your next topic</span><b>${s0?esc(s0.name):"More topics coming soon"}</b><span class="pn-s">${s0?`Clear it in the hot seat. Every topic in <i>${esc(g0.name)}</i> cleared wins <b>${fmtR(g0.prize)}</b>.`:""}</span>${s0?`<button class="btn gold sm" data-act="fffgo">Play →</button>`:""}</div>
<div class="plegend" aria-label="What the map shows"><span><i class="lg now"></i>You are here</span><span><i class="lg done">✓</i>Cleared</span><span><i class="lg lock">🔒</i>Locked: clear the topics before it</span><span><i class="lg prize">${noteThumb(10)}</i>Prize for clearing a group of topics</span><span><i class="lg planet"></i>Stage: tap it to list its topics</span></div>
<div class="phud"><span class="ph-diw" aria-hidden="true">${DIYA}</span><div class="ph-prize"><small>Next prize</small><b>${fmtR(g0.prize)}</b></div><div class="ph-prog"><div class="ph-t"><b>${pct}%</b> to the next prize <span>· ${stg(g0.c)}: ${esc(g0.name)}</span></div><div class="pbar"><i style="width:${pct}%"></i></div></div><div class="ph-ct" title="GRIT Computational Thinking readiness">${gritRing(40)}<span><small>CT ready</small><b>${gritReady()}%</b></span></div><button class="ph-me" data-act="pathjump" aria-label="Jump to my level">◎ Me</button></div></div>
<div class="pworld diw univ" style="height:${H}px;--fade:${fogTop!=null?fogTop+140:160}px">${spaceHTML(zones,H)}${DW.far}<div class="deco" aria-hidden="true">${deco}</div>
<div class="map" style="height:${H}px">${DW.near}<div class="deco" aria-hidden="true">${props}</div><svg class="mroad mshadow" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" class="r-shadow"/></svg><div class="mlayer"><svg class="mroad" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" class="r-base"/><path d="${d}" class="r-edge"/><path d="${d}" class="r-top"/><path d="${dDone}" class="r-done"/><path d="${dDone}" class="r-flow"/><path d="${d}" class="r-dash"/><path d="${dDone}" class="r-dash done"/></svg>${items.map(node).join("")}</div></div>
</div>${sheet}</section>`}
/* Tapping a stage planet lists that stage's topics (names only) */
/* Everything on the path before the topic you are on counts as behind you: it shows as cleared, never locked */
function passed(s){const cur=curSkill(curGroup());if(!cur||!s||s===cur)return false;const order=ROWS.flatMap(r=>r.skills);return order.indexOf(s)<order.indexOf(cur)}
function ckSheet(c,s0){const G=GROUPS.filter(g=>g.c===c);let k=0;GROUPS.forEach(g=>{if(GROUPS.indexOf(g)<GROUPS.indexOf(G[0]))k+=gSkills(g)});
 const items=G.flatMap(g=>g.skills?g.skills.map(s=>{const done=barOf(s.id)>=BPS||passed(s),now=s===s0;return `<li class="${done?"done":now?"now":"lock"}"><span class="ck-n">${done?"✓":++k}</span><span>${esc(s.name)}</span>${now?"<em>You are here</em>":""}</li>`}):[`<li class="lock"><span class="ck-n">🔒</span><span>${esc(g.name)}</span><em>Coming soon</em></li>`]).join("");
 return `<div class="msheet" role="dialog" aria-label="${stg(c)} topics"><div class="msheet-in concept"><div class="cpt ckl" style="--cc:${CKCOL[c]}"><span class="cpt-k">${stg(c)}</span><h3>${esc(CKNAME[c])}</h3><ol class="cklist">${items}</ol></div><div class="mfoot"><button class="btn sm mclose" data-act="pathck" data-c="${c}">Close</button></div></div></div>`}
function pathJump(smooth){const n=$(".mnode.now")||$(".mprize.cur");if(!n)return;const r=n.getBoundingClientRect();scrollTo({top:Math.max(0,scrollY+r.top-innerHeight*.55),behavior:smooth?"smooth":"auto"})}
function fameRows(){return {live:true,rows:(FAMEALL||[]).map(r=>({n:r.name,coins:r.coins,correct:r.correct,answered:r.answered,rung:r.best,me:r.me}))}}
function vFame(){const F=FAMEC,uni=FQ.scope==="uni",myU=(ME&&ME.university)||"",unis=((F&&F.universities)||[]).length?F.universities:(myU?[myU]:[]);
 const cur=(F&&F.university)||FQ.uni||myU,rows=(F&&F.rows)||[],pct=r=>r.answered?Math.round(r.correct/r.answered*100):0,ini=n=>esc(String(n||"?").trim().charAt(0).toUpperCase()||"?");
 const tabs=`<div class="ftabs" role="tablist" aria-label="Leaderboard"><button role="tab" aria-selected="${!uni}" class="ftab ${!uni?"on":""}" data-act="fame-tab" data-s="all">🌍 Overall</button><button role="tab" aria-selected="${uni}" class="ftab ${uni?"on":""}" data-act="fame-tab" data-s="uni">🏛️ University</button></div>`;
 const pick=uni&&unis.length?`<label class="fsel"><span>University</span><select id="fameuni">${unis.map(u=>`<option value="${esc(u)}" ${u===cur?"selected":""}>${esc(u)}</option>`).join("")}</select></label>`:"";
 const pod=(i,cls)=>{const r=rows[i];return `<div class="fpod ${cls} ${r?"":"empty"} ${r&&r.me?"me":""}"><span class="fav">${r?ini(r.name):"?"}</span><b class="fnm">${r?esc(r.name):"Your spot"}</b>${r&&!uni&&r.university?`<small class="fu">${esc(r.university)}</small>`:""}<span class="famt">${r?fmtR(r.coins):"—"}</span><span class="fblk">${cls==="p1"?"🥇":cls==="p2"?"🥈":"🥉"}</span></div>`};
 const row=r=>`<li class="${r.me?"me":""} ${r.rank<=3?"top":""}"><span class="frk">${r.rank}</span><span class="fav sm">${ini(r.name)}</span><span class="fwho"><b>${esc(r.name)}${r.me?' <em>you</em>':""}</b>${!uni&&r.university?`<small>${esc(r.university)}</small>`:""}</span><span class="facc" title="${r.correct} of ${r.answered} right"><i style="--v:${pct(r)}%"></i><b>${pct(r)}%</b><small>right</small></span><span class="famtr">${fmtR(r.coins)}</span></li>`;
 const body=!F?`<p class="fempty">Loading the leaderboard…</p>`:F.err?`<p class="fempty">${esc(F.err)}</p>`:uni&&!cur?`<p class="fempty">Your university isn't on the student list yet, so there is no university board for you. Ask your mentor to add it.</p>`
  :rows.length?`${podiumOK(rows)?`<div class="fpodium">${pod(1,"p2")}${pod(0,"p1")}${pod(2,"p3")}</div>`:""}<ol class="flist">${rows.map(row).join("")}</ol>${F.me&&!rows.some(r=>r.me)?`<ol class="flist mine">${row(F.me)}</ol>`:""}`
  :`<p class="fempty">No names on this board yet. Play a game to be the first! 🚀</p>`;
 return `<section class="center"><div class="fame fame2"><div class="fhead">${mascot(rows.slice(0,3).some(r=>r.me)?"trophy":"review",84)}<div><h2>Hall of Fame</h2><p><span class="hlive"><i class="ldot"></i><b class="livenum">${LIVE}</b> playing now</span><span class="muted">${uni?esc(cur||"Your university"):"All universities"} · ranked by prize money</span></p></div></div>
${tabs}${pick}<div class="fboard card">${body}</div>
${quipHTML("fame")}<div class="ractions"><button class="btn gold" data-act="play">Play →</button></div></div></section>`}
const podiumOK=rows=>rows.length>=1;

/* ================= Team dashboard ================= */
let DASH={events:null,live:false,loading:false};
async function loadDash(){DASH.loading=true;render();let ev=null,live=false;
 if(DB){try{const top=await DB.collection("events").limit(1000).get();ev=[];
  /* legacy rows (written before per-player logs) sit directly in events/; newer ones under events/<uid>/log */
  top.docs.forEach(d=>{const x=d.data();if(x&&x.kind)ev.push(x)});
  const logs=await Promise.all(top.docs.filter(d=>!(d.data()||{}).kind).map(d=>DB.collection("events/"+d.id+"/log").orderBy("t","desc").limit(500).get().then(s=>s.docs.map(x=>Object.assign(x.data(),{uid:d.id}))).catch(()=>[])));
  logs.forEach(a=>ev.push(...a));ev.sort((a,b)=>b.t-a.t);live=true}catch(e){ev=null}}
 if(!ev)ev=store.get(LKEY,[]);DASH={events:ev,live,loading:false};if(S.screen==="team")render()}
function pathDash(E){const B={};E.filter(e=>e.kind==="barrier").forEach(e=>{const k=e.uid;(B[k]=B[k]||{n:e.n,sk:{},last:null});B[k].n=e.n||B[k].n;B[k].sk[e.sk]=Math.max(B[k].sk[e.sk]||0,e.i||0);if(!B[k].last||e.t>B[k].last.t)B[k].last=e});
 const rows=Object.values(B).map(b=>{const g=GROUPS.find(g=>g.locked||g.skills.reduce((a,s)=>a+Math.min(BPS,b.sk[s.id]||0),0)<gTotal(g)),done=g.skills?g.skills.reduce((a,s)=>a+Math.min(BPS,b.sk[s.id]||0),0):0,L=b.last;return {b,g,done,L}}).sort((x,y)=>y.g.idx-x.g.idx||y.done-x.done);
 const hier=`<p class="note">Each skill = 4 levels (${LEVELS.map(l=>l.id+" "+l.name+" "+l.types.length).join(" · ")} = ${NTYPES} types T1–T${NTYPES}) × 3 R levels (R1 skill only, R2 +1–2 prerequisites, R3 +3 or more) = ${BPS} barriers, each with ${VARIANTS} variants (${(BPS*VARIANTS).toLocaleString("en-IN")} questions). A prize sits after every skill group.</p>`;
 const strip=`<div class="tw"><table><thead><tr><th>Group</th><th>Checkpoint</th><th>Skills</th><th>Barriers</th><th>Prize</th></tr></thead><tbody>${GROUPS.map(g=>`<tr><td class="code">${g.id}</td><td>${g.c}</td><td>${g.skills?g.skills.map(s=>s.id).join(" → "):`<span class="muted">${gSkills(g)} skills, locked</span>`}</td><td>${gTotal(g)}</td><td>${fmtR(g.prize)}</td></tr>`).join("")}</tbody></table></div>`;
 const who=rows.length?`<div class="tw"><table><thead><tr><th>Student</th><th>Group</th><th>Last barrier cleared</th><th>Cleared</th><th>To next prize</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.b.n||"–")}</td><td class="code">${r.g.id}</td><td>${r.L?`<code>${esc(r.L.code||r.L.sk+" · "+r.L.lv+" · "+r.L.df)}</code> ${esc(r.L.ty||"")}`:"–"}</td><td>${r.done}/${gTotal(r.g)}</td><td>${gTotal(r.g)-r.done} → ${fmtR(r.g.prize)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="note">No barriers cleared yet. Students appear here after their first correct hot-seat answer.</p>`;
 return `${(()=>{const F=E.filter(e=>e.kind==="feedback").sort((a,b)=>b.t-a.t);if(!F.length)return `<div class="card dsec"><h3>Student feedback</h3><p class="note">No feedback yet.</p></div>`;const avg=(F.reduce((a,f)=>a+f.stars,0)/F.length).toFixed(1);return `<div class="card dsec"><h3>Student feedback · ${avg} ★ from ${F.length}</h3><div class="tw"><table><thead><tr><th>Student</th><th>Rating</th><th>Feedback</th><th>When</th></tr></thead><tbody>${F.slice(0,50).map(f=>`<tr><td>${esc(f.n||"–")}</td><td>${"★".repeat(f.stars)}${"☆".repeat(5-f.stars)}</td><td>${esc(f.text)}</td><td>${new Date(f.t).toLocaleDateString("en-IN")}</td></tr>`).join("")}</tbody></table></div></div>`})()}<div class="card dsec"><h3>Skill path · where every student is</h3>${hier}${who}<details><summary>Full path: groups, skills, barriers, prizes</summary>${strip}</details></div>`}
function vTeam(){if(!DASH.events)return `<section class="dash"><h2>Team dashboard</h2><p class="muted">${DASH.loading?"Loading events…":""}</p></section>`;
 const E=DASH.events,A=E.filter(e=>e.kind==="answer"),today=dayKey(Date.now());
 const days=[];for(let i=13;i>=0;i--)days.push(dayKey(Date.now()-i*864e5));
 const dau={},mins={};A.forEach(e=>{(dau[e.day]=dau[e.day]||new Set()).add(e.uid);const k=e.day+"|"+e.uid;mins[k]=(mins[k]||0)+Math.min(e.ms||0,60000)+Math.min(e.fb||0,120000)});
 E.filter(e=>e.kind==="run_end").forEach(e=>{const k=e.day+"|"+e.uid;if(mins[k]!=null)mins[k]+=Math.min(e.fb||0,120000)});
 const players=new Set(A.map(e=>e.uid)),todayMins=Object.entries(mins).filter(([k])=>k.startsWith(today)).map(([,v])=>v/60000),allMins=Object.values(mins).map(v=>v/60000);
 const acc=A.length?Math.round(A.filter(e=>e.ok).length/A.length*100):0;
 const latest={};E.forEach(e=>{if(e.rung!=null&&(!latest[e.uid]||e.t>latest[e.uid].t))latest[e.uid]=e});const rungs=Object.values(latest).map(e=>e.rung);
 const maxD=Math.max(1,...days.map(d=>dau[d]?dau[d].size:0)),W=640,H=180,bw=(W-40)/14;
 const chart=`<svg viewBox="0 0 ${W} ${H+28}" role="img" aria-label="Daily active students, last 14 days"><line class="c-axis" x1="30" y1="${H}" x2="${W}" y2="${H}"/>${days.map((d,i)=>{const v=dau[d]?dau[d].size:0,h=v/maxD*(H-24),x=34+i*bw;return `<rect class="c-bar" x="${x}" y="${H-h}" width="${bw-8}" height="${Math.max(h,0)}" rx="4"/>${v?`<text class="c-v" x="${x+(bw-8)/2}" y="${H-h-5}" text-anchor="middle">${v}</text>`:""}<text class="c-t" x="${x+(bw-8)/2}" y="${H+16}" text-anchor="middle">${d.slice(8)}/${d.slice(5,7)}</text>`}).join("")}<text class="c-t" x="26" y="14" text-anchor="end">${maxD}</text><text class="c-t" x="26" y="${H}" text-anchor="end">0</text></svg>`;
 const bySk=Object.keys(SK).map(id=>{const a=A.filter(e=>e.sk===id),m=new Set(E.filter(e=>e.kind==="mastered"&&e.sk===id).map(e=>e.uid)).size;return {id,s:SK[id],n:a.length,acc:a.length?Math.round(a.filter(e=>e.ok).length/a.length*100):null,med:median(a.map(e=>e.ms||0))/1000,m}});
 const byTy=Object.keys(TYPES).map(t=>{const a=A.filter(e=>e.ty===t);return {t,n:a.length,acc:a.length?Math.round(a.filter(e=>e.ok).length/a.length*100):null,med:median(a.map(e=>e.ms||0))/1000}}).filter(x=>x.n);
 const accCell=v=>v==null?`<span class="muted">–</span>`:`<span class="acc"><i style="width:${Math.max(4,v*.6)}px"></i>${v}%</span>`;
 const dist=Array.from({length:OPEN+1},(_,r)=>rungs.filter(x=>x===r).length);
 return `<section class="dash enter"><div class="dhead"><div><h2>Team dashboard</h2><p class="note">${DASH.live?`Live · last ${E.length} events from every player`:"This device only. Open the published link signed in to see every player."} · medians, never averages</p></div><button class="btn sm" data-act="dash-refresh">Refresh</button></div>
<div class="kpis"><div class="kpi"><span>Active today</span><b>${dau[today]?dau[today].size:0}</b><small>of ${players.size} players · target 50% of rolled-out</small></div>
<div class="kpi"><span>Median minutes / active student today</span><b>${median(todayMins).toFixed(1)}</b><small>All days: <b>${median(allMins).toFixed(1)}</b> · target 40</small></div>
<div class="kpi"><span>Answers logged</span><b>${A.length}</b><small>Accuracy <b>${acc}%</b></small></div>
<div class="kpi"><span>Reached C1 (50+)</span><b>${rungs.filter(r=>r>=3).length}</b><small>C2 (500): <b>${rungs.filter(r=>r>=6).length}</b></small></div></div>
<div class="two"><div class="card dsec chart"><h3>Daily active students · last 14 days</h3>${chart}</div>
<div class="card dsec"><h3>Where players are on the board</h3><div class="tw"><table><thead><tr><th>Rung</th><th>Amount</th><th>Players</th></tr></thead><tbody>${dist.map((n,r)=>`<tr><td>${r}</td><td>${fmtR(amountOf(r))}</td><td>${n}</td></tr>`).join("")}</tbody></table></div></div></div>
${pathDash(E)}<div class="card dsec"><h3>Skills · C1–C2 graph</h3><div class="tw"><table><thead><tr><th>Skill</th><th>Name</th><th>Needs</th><th>Answers</th><th>Accuracy</th><th>Median time</th><th>Mastered by</th></tr></thead><tbody>${bySk.map(x=>`<tr><td class="code">${x.id}</td><td>${esc(x.s.name)}</td><td class="muted">${x.s.pre.join(", ")||"–"}</td><td>${x.n}</td><td>${accCell(x.acc)}</td><td>${x.n?x.med.toFixed(1)+" s":"–"}</td><td>${x.m}</td></tr>`).join("")}</tbody></table></div></div>
<div class="two"><div class="card dsec"><h3>Question types</h3>${byTy.length?`<div class="tw"><table><thead><tr><th>Type</th><th>Format</th><th>Answers</th><th>Accuracy</th><th>Median</th></tr></thead><tbody>${byTy.map(x=>`<tr><td class="code">${x.t}</td><td>${esc(TYPES[x.t])}</td><td>${x.n}</td><td>${accCell(x.acc)}</td><td>${x.med.toFixed(1)} s</td></tr>`).join("")}</tbody></table></div>`:`<p class="note">No answers yet.</p>`}</div>
<div class="card dsec"><h3>Skill graph (rows = rungs)</h3><div class="gmap">${ROWS.slice().reverse().map(r=>`<div class="grow"><b>${r.id} · ${r.c}</b><div class="gskills">${r.skills.map(s=>`<div class="gs"><b>${s.id} · ${s.types.join(" ")}</b>${esc(s.name)}<small>${s.pre.length?"after "+s.pre.join(", "):"start here"}</small></div>`).join("")}</div></div>`).join("")}</div></div></div>
${(()=>{const by={};A.forEach(e=>{const u=by[e.uid]=by[e.uid]||{n:e.n||"–",rows:{},t:0};if(e.n)u.n=e.n;u.t=Math.max(u.t,e.t);const row=SK[e.sk]?SK[e.sk].row:null;if(row==null)return;const c=u.rows[row]=u.rows[row]||{a:0,c:0};c.a++;if(e.ok)c.c++});
 const list=Object.values(by).sort((a,b)=>b.t-a.t).slice(0,60);
 const cell=c=>!c?'<td class="muted">–</td>':`<td><b>${c.c}/${c.a}</b> <span class="muted">${Math.round(c.c/c.a*100)}%</span></td>`;
 return `<div class="card dsec"><h3>Student skill progress <span class="muted" style="font-weight:500">· right / answered per row · admins only</span></h3>${list.length?`<div class="tw"><table><thead><tr><th>Student</th>${ROWS.map(r=>`<th>${r.id} · ${esc(r.name)}</th>`).join("")}</tr></thead><tbody>${list.map(u=>`<tr><td>${esc(u.n)}</td>${ROWS.map((r,i)=>cell(u.rows[i])).join("")}</tr>`).join("")}</tbody></table></div>`:'<p class="muted">No answers yet.</p>'}</div>`})()}
<div class="card dsec"><h3>Latest answers</h3>${A.length?`<div class="tw"><table><thead><tr><th>When</th><th>Player</th><th>Question</th><th>Result</th><th>Time</th><th>Rung</th></tr></thead><tbody>${A.slice().sort((a,b)=>b.t-a.t).slice(0,15).map(e=>`<tr><td>${new Date(e.t).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</td><td>${esc(e.n||"–")}</td><td class="code">${esc(e.qid||"")}</td><td>${e.ok?`<span class="chip ok">Right</span>`:e.timeout?"Timed out":"Wrong"}</td><td>${((e.ms||0)/1000).toFixed(1)} s</td><td>${e.rung}</td></tr>`).join("")}</tbody></table></div>`:`<p class="note">Answers appear here as soon as someone plays.</p>`}</div>
<p class="note">Every answer is logged with its five tags (C, P, G, S, T) plus the variant, answer time and time spent reading feedback. Students never see skill or type names.</p>
</section>`}

/* ================= Render ================= */
/* Diwali decor (minimal): marigold toran on Home, one hanging kandil, one large diya in the corner */
const KANDIL='<svg viewBox="0 0 60 150"><path d="M30 0v40" stroke="#C9A227" stroke-width="1.6"/><path d="M30 40l22 18-22 30-22-30z" fill="#E8590C" stroke="#7A1F0A" stroke-width="2"/><path d="M30 40l9 18-9 30-9-30z" fill="#FFB020" opacity=".9"/><path d="M8 58h44" stroke="#7A1F0A" stroke-width="1.6"/><circle cx="30" cy="62" r="5" fill="#FFF3B0" opacity=".9"/><path d="M16 74v46M23 82v54M30 88v58M37 82v54M44 74v46" stroke="#FFB020" stroke-width="2.2" stroke-linecap="round"/><path d="M16 120l-2 6M44 120l2 6" stroke="#E8590C" stroke-width="2" stroke-linecap="round"/></svg>';
const BIGDIYA='<svg viewBox="0 0 120 90"><path d="M60 4c9 12 11 20 6 28-3 5-9 5-12 0-5-8-3-16 6-28z" fill="#FFB020"/><path d="M60 16c4 6 5 10 2.6 14-1.4 2.4-3.8 2.4-5.2 0C55 26 56 22 60 16z" fill="#FFF8D6"/><path d="M8 44h104q-8 40-52 40T8 44z" fill="#9A2A0E"/><path d="M8 44h104q-2 6-6 10H14q-4-4-6-10z" fill="#C2410C"/><path d="M22 60q38 14 76 0" stroke="#FFC52E" stroke-width="2.4" fill="none" stroke-dasharray="2 6" stroke-linecap="round"/><circle cx="60" cy="68" r="5" fill="#FFC52E"/></svg>';
function cosmos(){const c=$(".cosmos");if(!c||c.childElementCount)return;const R=rng(4242);let h="";for(let i=0;i<170;i++){const z=R()<.85?1+R()*1.3:2+R()*1.6;h+=`<i class="st" style="left:${(R()*100).toFixed(2)}%;top:${(R()*100).toFixed(2)}%;width:${z.toFixed(1)}px;height:${z.toFixed(1)}px;opacity:${(.3+R()*.6).toFixed(2)};animation-delay:${(R()*4).toFixed(1)}s"></i>`}
 h+=`<span class="planet ring" style="left:4%;top:62%;width:150px;height:150px;--p1:#60A5FA;--p2:#1E3A8A"></span><span class="planet" style="right:6%;top:30%;width:96px;height:96px;--p1:#2DD4BF;--p2:#0F766E"></span><span class="shoot" style="top:18%;left:70%"></span>`;c.innerHTML=h}
function buildToran(){const t=$(".toran");if(!t)return;const n=Math.max(13,Math.round(innerWidth/42)|1);let h='<svg class="trope" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 2Q25 9 50 2T100 2" stroke="#2F7A2F" stroke-width="2.4" fill="none"/></svg>';
  for(let i=0;i<n;i++){const d=Math.abs(i-(n-1)/2)/((n-1)/2),len=Math.round(3+4*(1-d))+(i%2?0:1);let b="";for(let k=0;k<len;k++)b+=`<i style="background:${k%2?"#FFC300":"#FF8A00"}"></i>`;h+=`<span class="tstr" style="left:calc(${(i/(n-1)*100).toFixed(3)}% - 8px);animation-delay:${(i%5)*.3}s">${b}<em></em></span>`}
  t.innerHTML=h;t.dataset.w=innerWidth}
/* ===== Feedback: 5-star rating + written comment, both required ===== */
let FB={stars:0,bonus:0,text:""};
/* Optional "11-star" question: the rating stays out of 5; a student who loved it can add up to 6 extra stars */
const FB_BONUS=["Optional","Better than I expected","I told a friend","I came back on my own","Best part of my week","I'd pick it over a reel","Felt like the real hot seat!"];
function fbHTML(sent){if(sent)return `<div class="fbbox" role="dialog" aria-modal="true" aria-label="Feedback"><div class="fbdone">${mascot("dance",120)}<h3>Thank you!</h3><p>Your feedback reached the KBC team.</p><button class="btn gold" data-act="fb-close">Close</button></div></div>`;
 const ok=FB.stars>0&&FB.text.trim().length>=5;
 return `<div class="fbbox" role="dialog" aria-modal="true" aria-labelledby="fbh"><h3 id="fbh">How is KBC so far?</h3><p class="fbreq">Please share your feedback to continue.</p>
<p class="fbl">Your rating <i>*</i></p><div class="fbstars" role="radiogroup" aria-label="Rating out of 5">${[1,2,3,4,5].map(n=>`<button class="fbs ${n<=FB.stars?"on":""}" data-act="fb-star" data-n="${n}" role="radio" aria-checked="${n===FB.stars}" aria-label="${n} star${n>1?"s":""}">★</button>`).join("")}<span class="fbsl">${["Tap a star","Poor","Okay","Good","Great","Loved it!"][FB.stars]}</span></div>
<label class="fbl" for="fbtext">Tell us more <i>*</i></label><textarea id="fbtext" maxlength="600" rows="4" placeholder="What did you like? What should we change?">${esc(FB.text)}</textarea>
<p class="fbhint" id="fbhint">${ok?"Ready to send.":FB.stars?"Write at least 5 characters.":"Pick a rating and write a few words. Both are required."}</p>
<button class="btn gold fbsend" data-act="fb-send" ${ok?"":"disabled"}>Send feedback</button></div>`}
/* Time on the platform counts only while the page is visible, and is saved with the student's progress, so it carries
   across sessions and devices. Each reminder shows once; it waits until no question or puzzle is running. */
const FB_AT=[5,15,30,60];
function fbSafe(){const m=$("#fbm");if(m&&!m.hidden)return false;if(TI>=0)return false;if(document.querySelector(".modalx:not([hidden])"))return false;
 if(S.screen==="play"&&S.phase!=="reveal"&&S.phase!=="none")return false;if(S.screen==="fff"&&S.fff&&!S.fff.done&&!S.fff.intro)return false;return true}
function fbTick(){if(document.hidden)return;P.tOn=(P.tOn||0)+10000;P.fbAt=P.fbAt||[];if(P.tOn%60000<10000)saveP();
 if(P.fbSent||ME.feedbackGiven)return;   /* a student who has already sent feedback is never asked again */
 const due=FB_AT.filter(t=>P.tOn>=t*60000&&!P.fbAt.includes(t));if(!due.length||!fbSafe())return;
 P.fbAt.push(...due);saveP();FB.trigger=`after ${due[due.length-1]>=60?due[due.length-1]/60+" hour":due[due.length-1]+" min"} on the platform`;fbOpen();logEv({kind:"feedback_prompt",at:due[due.length-1]})}
setInterval(fbTick,10000);
/* Pixel can be hidden from the header; the hot seat then gives its space to the question */
function syncBuddy(){const off=!!store.get("kbc-hide-buddy",false),b=$("#buddybtn");document.body.classList.toggle("nobuddy",off);
 if(b){const n=buddyName();b.setAttribute("aria-pressed",off);b.title=off?`Show ${n}`:`Hide ${n}`;b.setAttribute("aria-label",off?`Show ${n}, your KBC buddy`:`Hide ${n}, your KBC buddy`);const l=b.querySelector(".lbl");if(l)l.textContent=off?`Show ${n}`:`Hide ${n}`}}
syncBuddy();
/* The hot seat and Fastest Finger shrink their question column to fit the window instead of scrolling */
function fitScreen(){const m=$("#mainc")||$(".fffw");if(!m||!(S.screen==="play"||S.screen==="fff"||S.screen==="seat"))return;
 m.style.zoom="";const top=m.getBoundingClientRect().top,avail=innerHeight-top-10,need=m.scrollHeight;
 if(need>avail&&avail>200)m.style.zoom=String(Math.max(.6,Math.floor(avail/need*100)/100))}
let fitT=null;const fitSoon=()=>{cancelAnimationFrame(fitT);fitT=requestAnimationFrame(()=>requestAnimationFrame(fitScreen))};
new MutationObserver(fitSoon).observe(document.getElementById("app"),{childList:true,subtree:true});
addEventListener("resize",fitSoon,SIG);
function fbOpen(){const m=$("#fbm");m.hidden=false;m.innerHTML=fbHTML();setTimeout(()=>{const t=$("#fbtext");t&&t.focus()},50)}
function fbSync(){const ok=FB.stars>0&&FB.text.trim().length>=5,b=$(".fbsend"),h=$("#fbhint");if(b)b.disabled=!ok;if(h)h.textContent=ok?"Ready to send.":FB.stars?"Write at least 5 characters.":"Pick a rating and write a few words. Both are required."}

document.addEventListener("input",e=>{if(e.target.id==="fbtext"){FB.text=e.target.value;fbSync()}},SIG);
document.addEventListener("keydown",e=>{const m=$("#fbm");if(m&&!m.hidden&&e.key==="Escape"){e.preventDefault();e.stopPropagation()}},true);
function diwaliDecor(){cosmos();const t=$(".toran");if(t&&(!t.childElementCount||Math.abs((+t.dataset.w||0)-innerWidth)>40))buildToran();
 const k=$(".kandil");if(k&&!k.childElementCount)k.innerHTML=KANDIL;const d=$(".bigdiya");if(d&&!d.childElementCount)d.innerHTML=BIGDIYA;
 document.body.classList.toggle("onhome",S.screen==="home")}
function render(){const prev=render.scr;render.scr=S.screen;const r=render0();
 if(prev!==S.screen){const app=$("#app");if(app&&prev){app.classList.remove("scr-in");void app.offsetWidth;app.classList.add("scr-in")}
  if(S.screen==="path")requestAnimationFrame(pauseOffscreen)}
 return r}
/* My path draws hundreds of animated stars, coins and props down a very tall map. Only those near the screen keep moving. */
let offIO=null;
function pauseOffscreen(){if(offIO)offIO.disconnect();const w=$(".pathv");if(!w||!window.IntersectionObserver)return;
 offIO=new IntersectionObserver(es=>es.forEach(e=>{e.target.style.animationPlayState=e.isIntersecting?"":"paused"}),{rootMargin:"300px 0px"});
 w.querySelectorAll("*").forEach(el=>{if(el.getAnimations&&el.getAnimations().length)offIO.observe(el)})}
function render0(){if(SAFE_SCREENS.includes(S.screen)){if(S.graphChanged)return pathReload();if(Date.now()-graphPolled>30e3)pollGraph()}
 const app=$("#app");stopQ();diwaliDecor();if(!render.th&&window.KB3D&&KB3D.theme){render.th=1;KB3D.theme(document.documentElement.dataset.theme)}
 const ow=S.screen==="fff"&&$(".fffw");
 if(ow&&ow.dataset.r===S.fff.idx+"-"+S.fff.t0){const t=document.createElement("div");t.innerHTML=vFFF();const nw=t.querySelector(".fffw");nw.classList.remove("enter");ow.replaceWith(nw);
  const ob=$(".fffbot"),nb=t.querySelector(".fffbot");if(ob&&nb&&ob.dataset.m!==nb.dataset.m)ob.replaceWith(nb);
  const nf=nw.querySelector('[data-act="fff-add"]:not([disabled])')||nw.querySelector('[data-act="fff-submit"]:not([disabled])')||nw.querySelector("[data-act=hotseat],[data-act=fff-next]");nf&&nf.focus({preventScroll:true})}
 else app.innerHTML=S.screen==="home"?vHome():S.screen==="play"?vPlay():S.screen==="result"?vResult():S.screen==="fame"?vFame():S.screen==="team"?vTeam():S.screen==="path"?vPath():S.screen==="fff"?vFFF():S.screen==="seat"?vSeat():S.screen==="guide"?vGuide():S.screen==="wallet"?vWallet():S.screen==="buddy"?vBuddy():vHome();
 if(S.screen==="play"&&S.phase==="ask")startQ();syncChip();syncTeam();setTimeout(botTalk,250);
 document.body.classList.toggle("qscreen",S.screen==="play"||S.screen==="fff");if(S.screen!=="home")document.body.classList.remove("homespot");if(S.screen!=="fff")clearInterval(fInt);requestAnimationFrame(placeSpot);
 document.body.classList.toggle("inplay",S.screen==="play"||S.screen==="result");document.body.classList.toggle("inteam",S.screen==="team");
 window.KB3D&&KB3D.mode(S.screen==="result"||S.screen==="fff"||S.screen==="play"||S.screen==="guide"||S.screen==="buddy"||S.screen==="wallet"?"hide":S.screen==="path"?"home":S.screen);
 if(S.screen==="home"){requestAnimationFrame(placeHomeCoin);[150,600,1500].forEach(t=>setTimeout(placeHomeCoin,t));typeHome()}else clearTimeout(typeT);syncLive();
 if(S.screen==="path"){if(!S.mapped){S.mapped=1;requestAnimationFrame(()=>pathJump(false))}else if(S.mapTop!=null)scrollTo({top:S.mapTop})}}
/* the coin logo sits in the free band between the header and the "Kaun Banega" title */
function placeHomeCoin(){const l=$(".home4 .hlogo");if(!l||!window.KB3D||!KB3D.place)return;const r=l.getBoundingClientRect();if(!r.height)return;KB3D.place(r.top+r.height/2,r.height*1.25)}
addEventListener("resize",()=>{if(S.screen==="home")placeHomeCoin();clearTimeout(buildToran.t);buildToran.t=setTimeout(buildToran,150)},SIG);
/* Spotlight: a cone from the top of the screen onto the question card, with a halo behind it. Sweeps in for each new question. */
let lastSpotQ=null;
function aimLights(cx,top,w,h){const sp=$("#spot"),bc=$("#beamC"),bl=$("#beamL"),br=$("#beamR");if(!sp||!bc)return;const cy=top+h*.55,W=innerWidth,set=(e,k,v)=>e.style.setProperty(k,v+"px");
 set(sp,"--sw",w*1.25);set(sp,"--sh",h*1.7);set(sp,"--sx",cx-w*.625);set(sp,"--sy",top+h/2-h*.85);
 set(bc,"--c1",cx-34);set(bc,"--c2",cx+34);set(bc,"--c3",cx+w/2-30);set(bc,"--c4",cx-w/2+30);set(bc,"--cb",cy);
 const lx=Math.max(0,cx-W*.42),rx=Math.min(W,cx+W*.42);
 set(bl,"--l1",lx);set(bl,"--l2",lx+46);set(bl,"--l3",cx+40);set(bl,"--l4",cx-120);set(bl,"--lb",cy);
 set(br,"--r1",rx-46);set(br,"--r2",rx);set(br,"--r3",cx+120);set(br,"--r4",cx-40);set(br,"--rb",cy)}
function placeSpot(){const el=(S.screen==="play"||S.screen==="fff")&&$(".qcard");if(!el){window.KB3D&&KB3D.release&&KB3D.release();return}const r=el.getBoundingClientRect();
 aimLights(r.left+r.width/2,r.top,r.width,r.height);window.KB3D&&KB3D.aim&&KB3D.aim(r.left+r.width/2,r.top+r.height*.45);
 const sp=$("#spot");if(S.q&&S.q!==lastSpotQ){lastSpotQ=S.q;sp&&sp.classList.remove("win","lose")}}
/* Home: the default studio lights stay; moving the cursor pulls all three stage lights onto it */
let homeIdle=null;
addEventListener("pointermove",e=>{if(S.screen!=="home"||!window.KB3D||!KB3D.aim)return;KB3D.aim(e.clientX,e.clientY);clearTimeout(homeIdle);homeIdle=setTimeout(()=>KB3D.release(),1600)},SIG);
function spotFx(k){const sp=$("#spot");if(sp){sp.classList.remove("win","lose");sp.classList.add(k)}}
addEventListener("resize",()=>placeSpot(),SIG);addEventListener("scroll",()=>placeSpot(),SIG);
function syncAct(){const a=$(".actions");if(a)a.innerHTML=actHTML();if(S.screen==="play"&&S.phase==="ask"&&!S.thinkLong&&!(S.practice&&S.run.answered===0)){const want=(S.pick!=null||S.fill||(S.ord&&S.ord.length))?"pointa":"pointq",b=document.querySelector(".mcol .mascot");if(b&&!b.classList.contains(want)){const t=document.createElement("div");t.innerHTML=mascot(want,176);b.replaceWith(t.firstChild)}}}

/* ================= Effects ================= */
function flash(){const f=$("#flash");f.classList.remove("on");void f.offsetWidth;f.classList.add("on");const m=$("#mainc");if(m){m.classList.remove("shake");void m.offsetWidth;m.classList.add("shake")}}
function confetti(n){if(reduceMotion)return;const c=$("#confetti"),x=c.getContext("2d");c.width=innerWidth;c.height=innerHeight;const cols=["#FFC83D","#FF9F1C","#FFFFFF","#E879F9","#3DDC84"];
 const P2=Array.from({length:n},()=>({x:innerWidth/2+(Math.random()-.5)*260,y:innerHeight*.45,vx:(Math.random()-.5)*15,vy:-Math.random()*15-4,r:Math.random()*7+4,c:cols[Math.random()*cols.length|0],a:Math.random()*6,va:(Math.random()-.5)*.3}));
 const t0=performance.now();const f=t=>{const e=t-t0;x.clearRect(0,0,c.width,c.height);P2.forEach(p=>{p.vy+=.35;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.a+=p.va;x.save();x.globalAlpha=Math.max(0,1-e/2600);x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);x.restore()});if(e<2600)requestAnimationFrame(f);else x.clearRect(0,0,c.width,c.height)};requestAnimationFrame(f)}

/* ================= 3D studio (three.js): gold { } coin with rings, spotlights, gems and code glyphs ================= */
window.KB3D=(function(){if(!window.THREE)return null;try{document.body.classList.add("has3d");
 const T=THREE,cv=$("#bg3d"),R=new T.WebGLRenderer({canvas:cv,antialias:true,alpha:true});R.debug.checkShaderErrors=false;R.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
 const scene=new T.Scene();scene.fog=new T.FogExp2(0x04060e,.035);
 const cam=new T.PerspectiveCamera(50,1,.1,120);cam.position.set(0,0,14);
 scene.add(new T.AmbientLight(0xffe2b8,.7));
 const key=new T.PointLight(0xffc83d,2.4,60);key.position.set(5,6,9);scene.add(key);
 const rim=new T.PointLight(0xff4fb0,1.3,60);rim.position.set(-8,-4,6);scene.add(rim);
 const dl=new T.DirectionalLight(0xffffff,.55);dl.position.set(0,4,10);scene.add(dl);
 const gold=new T.MeshStandardMaterial({color:0xffc83d,metalness:.55,roughness:.28,emissive:0x5a3500,emissiveIntensity:.35});
 const tc=document.createElement("canvas");tc.width=tc.height=512;const g=tc.getContext("2d");
 function drawFace(){const rg=g.createRadialGradient(200,180,40,256,256,260);rg.addColorStop(0,"#FFF1B8");rg.addColorStop(.45,"#FFC83D");rg.addColorStop(1,"#C9770C");g.fillStyle=rg;g.fillRect(0,0,512,512);
  g.strokeStyle="rgba(120,60,0,.55)";g.lineWidth=10;g.beginPath();g.arc(256,256,226,0,7);g.stroke();g.lineWidth=4;g.beginPath();g.arc(256,256,196,0,7);g.stroke();
  g.fillStyle="#3A2100";g.textAlign="center";g.textBaseline="middle";g.font="800 200px 'JetBrains Mono',ui-monospace,monospace";g.fillText("{",196,258);g.fillText("}",316,258);g.font="800 170px 'Plus Jakarta Sans','Segoe UI',Arial,sans-serif";}
 drawFace();const faceTex=new T.CanvasTexture(tc);try{document.fonts&&document.fonts.ready.then(()=>{drawFace();faceTex.needsUpdate=true})}catch(e){}faceTex.center.set(.5,.5);faceTex.rotation=Math.PI/2;
 const face=new T.MeshStandardMaterial({map:faceTex,metalness:.4,roughness:.35,emissive:0x3a2200,emissiveIntensity:.25});
 const hero=new T.Group();
 const coin=new T.Mesh(new T.CylinderGeometry(2.1,2.1,.34,72),[gold,face,face]);coin.rotation.x=Math.PI/2;hero.add(coin);
 const ring1=new T.Mesh(new T.TorusGeometry(3,.12,24,140),gold);hero.add(ring1);
 const ring2=new T.Mesh(new T.TorusGeometry(3.7,.05,16,160),new T.MeshStandardMaterial({color:0xffd66b,metalness:.6,roughness:.3,emissive:0x704000,emissiveIntensity:.4,transparent:true,opacity:.8}));ring2.rotation.x=1.15;hero.add(ring2);
 const ring3=new T.Mesh(new T.TorusGeometry(4.3,.035,12,160),new T.MeshStandardMaterial({color:0x7ab8ff,metalness:.6,roughness:.25,emissive:0x1a3a8a,emissiveIntensity:.6,transparent:true,opacity:.7}));ring3.rotation.y=1.1;hero.add(ring3);
 scene.add(hero);
 const bc=document.createElement("canvas");bc.width=32;bc.height=256;const bx=bc.getContext("2d");const lg=bx.createLinearGradient(0,0,0,256);lg.addColorStop(0,"rgba(255,255,255,1)");lg.addColorStop(.3,"rgba(255,255,255,.4)");lg.addColorStop(1,"rgba(255,255,255,0)");bx.fillStyle=lg;bx.fillRect(0,0,32,256);
 const beamTex=new T.CanvasTexture(bc),beams=[];
 [[-11,0xffffff,-.42],[-4.5,0xff7ad1,-.14],[4.5,0x7ab8ff,.14],[11,0xffffff,.42]].forEach(([x,c,r],i)=>{const bg=new T.ConeGeometry(2.6,32,40,1,true);bg.translate(0,-16,0);
  const m=new T.Mesh(bg,new T.MeshBasicMaterial({map:beamTex,color:c,transparent:true,opacity:.16,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,fog:false}));m.position.set(x,13,-12);m.rotation.z=r;m.userData={r,ph:i*1.7,cur:r};scene.add(m);beams.push(m)});
 const ac=document.createElement("canvas");ac.width=ac.height=256;const ax=ac.getContext("2d");const ag=ax.createRadialGradient(128,128,8,128,128,128);ag.addColorStop(0,"rgba(255,244,214,.9)");ag.addColorStop(.28,"rgba(255,170,90,.5)");ag.addColorStop(.6,"rgba(236,72,153,.18)");ag.addColorStop(1,"rgba(236,72,153,0)");ax.fillStyle=ag;ax.fillRect(0,0,256,256);
 const aura=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(ac),transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false}));aura.scale.set(12,12,1);aura.position.z=-1.2;hero.add(aura);
 const gemMat=new T.MeshStandardMaterial({color:0xf4f8ff,metalness:.25,roughness:.12,flatShading:true,emissive:0x6a7fe0,emissiveIntensity:.55,transparent:true,opacity:.9});
 /* place a drifting prop anywhere across the visible screen at its depth (camera: fov 50, z 14) */
 const spread=(m,anyY)=>{const d=14-m.position.z,hh=Math.tan(25*Math.PI/180)*d,hw=hh*Math.max(1,innerWidth/Math.max(1,innerHeight));m.position.x=(Math.random()-.5)*2*hw*.94;m.position.y=anyY?(Math.random()-.5)*2*hh:-hh-1;m.userData.top=hh+1};
 const floaters=[],geos=[new T.IcosahedronGeometry(.55,0),new T.OctahedronGeometry(.55,0)];
 for(let i=0;i<7;i++){const m=new T.Mesh(geos[i%2],gemMat);m.position.z=-6-Math.random()*12;m.scale.setScalar(.5+Math.random()*.7);
  m.userData={vy:.002+Math.random()*.003,rx:(Math.random()-.5)*.01,ry:(Math.random()-.5)*.012};spread(m,true);scene.add(m);floaters.push(m)}
 const N=520,pos=new Float32Array(N*3);for(let i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*44;pos[i*3+1]=(Math.random()-.5)*26;pos[i*3+2]=-Math.random()*26+4}
 const pg=new T.BufferGeometry();pg.setAttribute("position",new T.BufferAttribute(pos,3));
 const pts=new T.Points(pg,new T.PointsMaterial({color:0xffe1a0,size:.045,transparent:true,opacity:.7}));scene.add(pts);
 /* Galaxy: a slow three-arm spiral far behind the coin; gold core, then magenta, violet and electric blue */
 const gdot=document.createElement("canvas");gdot.width=gdot.height=64;{const x=gdot.getContext("2d"),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(.35,"rgba(255,255,255,.4)");g.addColorStop(1,"rgba(255,255,255,0)");x.fillStyle=g;x.fillRect(0,0,64,64)}
 const GN=innerWidth<760?3200:5200,GR=16,gp=new Float32Array(GN*3),gc=new Float32Array(GN*3),cA=new T.Color(0xffd27a),cB=new T.Color(0xff3fa4),cC=new T.Color(0x8b5cf6),cD=new T.Color(0x3b82f6),gtc=new T.Color();
 for(let i=0;i<GN;i++){const r=Math.pow(Math.random(),1.5)*GR,a=(i%3)*2*Math.PI/3+r*.42,j=()=>Math.pow(Math.random(),3)*(Math.random()<.5?1:-1)*(1+r*.16);
  gp[i*3]=Math.cos(a)*r+j();gp[i*3+1]=j()*.35;gp[i*3+2]=Math.sin(a)*r+j();const t=r/GR;
  if(t<.16)gtc.copy(cA).lerp(cB,t/.16);else if(t<.5)gtc.copy(cB).lerp(cC,(t-.16)/.34);else gtc.copy(cC).lerp(cD,Math.min(1,(t-.5)/.4));gc[i*3]=gtc.r;gc[i*3+1]=gtc.g;gc[i*3+2]=gtc.b}
 const gg=new T.BufferGeometry();gg.setAttribute("position",new T.BufferAttribute(gp,3));gg.setAttribute("color",new T.BufferAttribute(gc,3));
 const galaxy=new T.Points(gg,new T.PointsMaterial({size:1.05,map:new T.CanvasTexture(gdot),vertexColors:true,transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
 galaxy.position.set(0,1.5,-32);galaxy.rotation.x=1.05;scene.add(galaxy);
 {const cc=document.createElement("canvas");cc.width=cc.height=256;const x=cc.getContext("2d"),g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,"rgba(255,248,225,.95)");g.addColorStop(.18,"rgba(255,200,110,.6)");g.addColorStop(.45,"rgba(255,63,164,.18)");g.addColorStop(1,"rgba(59,130,246,0)");x.fillStyle=g;x.fillRect(0,0,256,256);
  const core=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(cc),transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false,opacity:.75}));core.scale.set(16,16,1);core.position.set(0,1.5,-31);scene.add(core);galaxy.userData.core=core}
 const GLYPHS=["{ }","</>","( )","[ ]","def","for","if","print()","==","#","x = 1","True","{ }","in","+="];
 const gtex={};function glyphTex(txt){if(gtex[txt])return gtex[txt];const c=document.createElement("canvas");c.width=256;c.height=128;const x=c.getContext("2d");const rupee=txt.includes("{");
  x.textAlign="center";x.textBaseline="middle";x.font=(rupee?"800 92px 'Plus Jakarta Sans',Arial,sans-serif":"700 64px 'JetBrains Mono',ui-monospace,monospace");
  x.shadowColor=rupee?"rgba(255,200,61,.95)":"rgba(196,181,253,.95)";x.shadowBlur=18;x.fillStyle=rupee?"#FFD66B":"#D8CCFF";x.fillText(txt,128,66);x.fillText(txt,128,66);return gtex[txt]=new T.CanvasTexture(c)}
 const glyphs=[];for(let i=0;i<0;i++){const txt=GLYPHS[i%GLYPHS.length];const sp=new T.Sprite(new T.SpriteMaterial({map:glyphTex(txt),transparent:true,depthWrite:false,opacity:0}));
  const z=-5-Math.random()*22,s=(txt.length>3?1.9:1.4)*(.7+Math.random()*.6);sp.scale.set(s*2,s,1);sp.position.set((Math.random()-.5)*(30-z*.9),(Math.random()-.5)*24,z);
  sp.userData={v:.006+Math.random()*.01,ph:Math.random()*6,o:.16+Math.random()*.24};scene.add(sp);glyphs.push(sp)}
 try{document.fonts&&document.fonts.ready.then(()=>{Object.keys(gtex).forEach(k=>{const old=gtex[k];delete gtex[k];const nt=glyphTex(k);glyphs.forEach(gl=>{if(gl.material.map===old)gl.material.map=nt})})})}catch(e){}
 const miniGeo=new T.CylinderGeometry(.55,.55,.1,40),minis=[];
 for(let i=0;i<10;i++){const m=new T.Mesh(miniGeo,[gold,face,face]);m.rotation.x=Math.PI/2;m.position.z=-4-Math.random()*14;m.scale.setScalar(.7+Math.random()*.5);m.userData={vy:.006+Math.random()*.008,s:.01+Math.random()*.02,ph:Math.random()*6};spread(m,true);scene.add(m);minis.push(m)}
 const aimPt=new T.Vector3(0,0,-12);let aimOn=false;
 let W=0,H=0,target={x:0,y:4.5,z:-2,s:.5},mode="home",boost=0,alarm=0,mx=0,my=0;
 let homePy=0,homeGap=0;
 /* home coin: centre it at page-y homePy (between header and title) and size it to fit the gap */
 const homeTarget=()=>{if(!homePy)return {x:0,y:7.6,z:-6,s:W<760?.28:.3};const half=Math.tan(25*Math.PI/180)*(14+6),ppw=H/2/half,s=Math.max(.14,Math.min(.3,(homeGap/2-10)/(5.4*ppw)));return {x:0,y:(1-2*homePy/H)*half,z:-6,s}};
 function layout(){const narrow=W<760;target=mode==="hide"?{x:0,y:60,z:-10,s:.3}:mode==="home"?(S.screen==="home"?homeTarget():{x:0,y:60,z:-10,s:.3}):mode==="result"||mode==="fame"?{x:0,y:7.1,z:-6,s:narrow?.36:.44}:{x:narrow?0:6.5,y:narrow?6:4.5,z:-9,s:.8}}
 function size(){W=innerWidth;H=innerHeight;R.setSize(W,H,false);cam.aspect=W/H;cam.updateProjectionMatrix();layout()}
 addEventListener("resize",size,SIG);addEventListener("pointermove",e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5},SIG);
 const red=new T.Color(0xf43f5e),fogBase=new T.Color(0x0b0618),keyBase=new T.Color(0xffc83d);
 let last=performance.now(),run=true;document.addEventListener("visibilitychange",()=>{run=!document.hidden;if(run){last=performance.now();loop()}},SIG);
 function loop(){if(!run||AC.signal.aborted)return;const now=performance.now(),dt=Math.min(50,now-last)/16.7;last=now;const t=now/1000;
  const top=mode==="home"||mode==="result"||mode==="fame";const ty=target.y+(top?scrollY*(Math.tan(25*Math.PI/180)*(14-target.z))/(H/2):0);
  hero.position.x+=(target.x-hero.position.x)*.05*dt;hero.position.y+=(ty-hero.position.y)*(top&&Math.abs(ty-hero.position.y)<1.5?.25:.05)*dt;hero.position.z+=(target.z-hero.position.z)*.05*dt;
  hero.scale.setScalar(hero.scale.x+(target.s-hero.scale.x)*.05*dt);
  const still=mode==="play"||mode==="team"||mode==="hide",k=still?Math.min(1,boost):1;const sp=(1+boost*6)*k;coin.rotation.z=Math.sin(t*.7)*(.32+boost*.25)*k;ring1.rotation.y+=.006*sp*dt;ring1.rotation.x=Math.sin(t*.5)*.25;ring2.rotation.z+=.008*sp*dt;ring3.rotation.x+=.005*sp*dt;
  hero.rotation.y=(Math.sin(t*.4)*.35+mx*.4)*k;hero.rotation.x=(Math.sin(t*.3)*.12+my*.2)*k;
  floaters.forEach(m=>{const u=m.userData;m.rotation.x+=u.rx*dt*(1+boost*4)*k;m.rotation.y+=u.ry*dt*(1+boost*4)*k;m.position.y+=u.vy*dt*(1+boost*5)*k;if(m.position.y>u.top)spread(m)});
  glyphs.forEach(gl=>{const u=gl.userData;gl.position.y+=u.v*dt*(1+boost*5)*k;gl.position.x+=Math.sin(t*.5+u.ph)*.004*dt*k;if(gl.position.y>13)gl.position.y=-13;u.cur=Math.min(u.o,(u.cur||0)+.01*dt);gl.material.opacity=u.cur*(still?0:1)});
  minis.forEach(m=>{const u=m.userData;m.position.y+=u.vy*dt*(1+boost*5)*k;m.rotation.z+=u.s*dt*(1+boost*4)*k;m.rotation.x=Math.PI/2+Math.sin(t+u.ph)*.5*k;if(m.position.y>u.top)spread(m)});
  minis.forEach(m=>m.visible=!still);floaters.forEach(m=>m.visible=!still);pts.visible=S.screen!=="home";
  pts.rotation.y+=.0006*dt*(1+boost*8)*k;galaxy.rotation.y-=.0007*dt*(1+boost*3);galaxy.visible=S.screen!=="path";galaxy.material.opacity=still?.25:.6;galaxy.userData.core.visible=galaxy.visible;galaxy.userData.core.material.opacity=still?.3:.75;
  cam.position.x+=(mx*1.6*k-cam.position.x)*.03*dt;cam.position.y+=(-my*k-cam.position.y)*.03*dt;cam.lookAt(0,0,-4);
  beams.forEach(b=>{b.visible=S.screen!=="path";const u=b.userData;if(aimOn){const tg=Math.atan2(aimPt.x-b.position.x,-(aimPt.y-b.position.y));u.cur+=(tg-u.cur)*.12*dt;b.rotation.z=u.cur;b.material.opacity=.24*(1+boost*.6)}else{u.cur+=(u.r-u.cur)*.05*dt;b.rotation.z=u.cur+Math.sin(t*.5+u.ph)*.06*k;b.material.opacity=(still?.05:.17)*(1+boost)}});
  aura.material.opacity=(still?.35:.7)+Math.sin(t*1.6)*.18*k+boost*.3;aura.scale.setScalar(12+Math.sin(t*1.1)*.6*k);
  boost=Math.max(0,boost-.012*dt);alarm=Math.max(0,alarm-.02*dt);
  scene.fog.color.copy(fogBase).lerp(red,alarm*.6);key.color.copy(keyBase).lerp(red,alarm);
  R.render(scene,cam);if(!reduceMotion)requestAnimationFrame(loop)}
 size();loop();
 return {theme(t){try{scene.fog.color.set(t==="light"?0xF4ECDD:0x12100e)}catch(e){}},mode(m){mode=m;layout();const onHome=S.screen==="home";if(onHome&&!this._wasHome&&!matchMedia("(prefers-reduced-motion: reduce)").matches){hero.position.set(0,target.y||6,10.5);hero.scale.setScalar(2.2)}this._wasHome=onHome},boost(){boost=1},alarm(){alarm=1},place(py,gap){homePy=py;homeGap=gap;layout()},
  /* Point every studio beam at a screen position (unprojected onto the beams' plane) */
  aim(px,py){const v=new T.Vector3(px/W*2-1,-(py/H)*2+1,.5).unproject(cam).sub(cam.position).normalize(),d=(-12-cam.position.z)/v.z;aimPt.copy(cam.position).add(v.multiplyScalar(d));aimOn=true},
  release(){aimOn=false}}
}catch(e){return null}})();
if(!window.KB3D){document.body.classList.remove("has3d");document.body.classList.add("no3d");const G=["{ }","</>","( )","def","[ ]","if","print()","==","#"];
 $("#symfall").innerHTML=Array.from({length:28},(_,i)=>{const r=G[i%G.length].includes("{");return `<span style="left:${(i*37)%100}%;--fs:${18+(i*7)%26}px;--d:${14+(i*5)%16}s;--dl:-${(i*3.1)%20}s;--o:${.18+((i*13)%30)/100};--c:${r?"#FFD66B":"#C4B5FD"}">${G[i%G.length]}</span>`}).join("")}

/* ================= Events ================= */
/* ================= Fastest Finger First: quick maths puzzles (Matiks-style), one format per round =================
   Math Sprint: type the answers to 5 quick sums. Code Maze: connect 3 touching numbers that add up to the target.
   Cross Math: fill the blanks so every row and column sum works. Each round opens on a rules card; the clock starts on Play. */
let fInt=null,F0dl=0;
const FMODES=["sprint","maze","cross"];
const FMODE={
 sprint:{name:"Math Sprint",secs:45,icon:"⚡",how:["Solve 5 quick sums","Type the answer. A right answer moves on by itself","Stuck? Skip to a new sum"],demo:"&gt;&gt;&gt; 7 × 8 = <b>56</b>"},
 maze:{name:"Code Maze",secs:40,icon:"🧩",how:["Look at the target number","Tap 3 numbers that touch each other (side by side or up and down)","They must add up to the target. Solve 2 mazes"],demo:"target <b>15</b> → 4 + 5 + 6"},
 cross:{name:"Cross Math",secs:50,icon:"✚",how:["Every row and every column is a small sum","Tap a number tile to fill the next blank","Fill both blanks so all four sums work"],demo:"3 + <b>?</b> = 8 → <b>?</b> = 5"}};
const rint=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
function sprintQ(){const k=rint(0,7);let q,a;
 if(k===0){const x=rint(3,12),y=rint(3,12);q=`${x} × ${y}`;a=x*y}
 else if(k===1){const x=rint(12,79),y=rint(11,49);q=`${x} + ${y}`;a=x+y}
 else if(k===2){const x=rint(40,99),y=rint(11,39);q=`${x} − ${y}`;a=x-y}
 else if(k===3){const y=rint(2,9),z=rint(3,12);q=`${y*z} ÷ ${y}`;a=z}
 else if(k===4){const x=rint(2,9),y=rint(2,9),z=rint(2,9);q=`${x} + ${y} × ${z}`;a=x+y*z}
 else if(k===5){const p=[10,20,25,50][rint(0,3)],n=[20,40,60,80,120,200][rint(0,5)];q=`${p}% of ${n}`;a=p*n/100}
 else if(k===6){const x=rint(4,15);q=`${x}²`;a=x*x}
 else{const x=rint(3,9),y=rint(3,9),z=rint(1,x*y-1);q=`${x} × ${y} − ${z}`;a=x*y-z}
 return {q,a:String(a)}}
function mzNb(c,N){const r=c/N|0,k=c%N,o=[];if(r>0)o.push(c-N);if(r<N-1)o.push(c+N);if(k>0)o.push(c-1);if(k<N-1)o.push(c+1);return o}
function mazeGrid(){const N=4,g=Array.from({length:N*N},()=>rint(1,9));let path=[];
 while(path.length<3){path=[rint(0,N*N-1)];while(path.length<3){const nb=mzNb(path[path.length-1],N).filter(x=>!path.includes(x));if(!nb.length)break;path.push(nb[rint(0,nb.length-1)])}}
 return {N,g,path,target:path.reduce((a,i)=>a+g[i],0)}}
const XOP=(a,o,b)=>o==="+"?a+b:o==="−"?a-b:a*b;
/* 2×2 cross: A o0 B = R0 / C o1 D = R1 / columns A o2 C = R2, B o3 D = R3. Two cells are blank; the tiles hold their values and two decoys.
   Only puzzles where exactly one placement of the tiles works are kept. */
function crossGen(){const OPS=["+","−","×"];
 for(let t=0;t<500;t++){const v=[0,1,2,3].map(()=>rint(1,9)),o=[0,1,2,3].map(()=>OPS[rint(0,2)]);
  const R=[XOP(v[0],o[0],v[1]),XOP(v[2],o[1],v[3]),XOP(v[0],o[2],v[2]),XOP(v[1],o[3],v[3])];if(R.some(x=>x<0||x>99))continue;
  const bl=shuf([0,1,2,3]).slice(0,2).sort();if(v[bl[0]]===v[bl[1]])continue;
  const dec=[];for(let n=0;dec.length<2&&n<50;n++){const d=rint(1,9);if(!bl.some(k=>v[k]===d)&&!dec.includes(d))dec.push(d)}if(dec.length<2)continue;
  const tiles=shuf([v[bl[0]],v[bl[1]],...dec]),ok=w=>XOP(w[0],o[0],w[1])===R[0]&&XOP(w[2],o[1],w[3])===R[1]&&XOP(w[0],o[2],w[2])===R[2]&&XOP(w[1],o[3],w[3])===R[3];
  let n=0;for(const x of tiles)for(const y of tiles){if(x===y)continue;const w=v.slice();w[bl[0]]=x;w[bl[1]]=y;if(ok(w))n++}
  if(n===1)return {v,o,R,blanks:bl,tiles}}
 return {v:[3,5,2,4],o:["+","+","×","+"],R:[8,6,6,9],blanks:[1,2],tiles:[5,2,7,1]}}
function fffClock(secs){const F=S.fff;clearInterval(fInt);F.max=secs;F.time=secs;F0dl=Date.now()+secs*1000;F.tStart=Date.now();
 fInt=setInterval(()=>{const F=S.fff;if(S.screen!=="fff"||!F||F.done||F.intro){clearInterval(fInt);return}const left=Math.max(0,Math.ceil((F0dl-Date.now())/1000));if(left===F.time)return;F.time=left;const c=$("#fclock");if(c){c.querySelector("span").textContent=F.time;c.style.setProperty("--p",F.time/F.max);c.classList.toggle("low",F.time<=Math.min(10,F.max/3))}if(!F.panic&&F.time<=Math.min(10,Math.ceil(F.max/3))&&F.time>0){F.panic=true;const ob=$(".fffbot");if(ob){const t=document.createElement("div");t.innerHTML=fffBot();ob.replaceWith(t.firstChild)}ROBO.think()}
  if(F.time<=5&&F.time>0)SFX.tick();if(F.time<=0){clearInterval(fInt);F.done="bad";F.timeout=true;SFX.wrong();spotFx("lose");render();say("Time's up.");logEv({kind:"fff",mode:F.mode,ok:false,ms:secs*1000})}},250)}
function fffFinish(ok){const F=S.fff;if(F.done)return;clearInterval(fInt);F.secs=(Date.now()-(F.tStart||F.t0))/1000;F.done=ok?"ok":"bad";
 if(ok){SFX.fffWin();spotFx("win");confetti(90)}else{SFX.wrong();spotFx("lose")}render();say(ok?"You've earned the hot seat.":"Not quite.");logEv({kind:"fff",mode:F.mode,ok,ms:Math.round(F.secs*1000),away:F.away||0})}
function fffFocus(){requestAnimationFrame(()=>{const i=$("#sprin")||$('[data-act="fff-begin"]');i&&i.focus({preventScroll:true})})}
function startFFF(idx){prefetchQ("hotseat");ctx();goFull();clearInterval(fInt);stopQ();if(idx==null)idx=Math.random()*999|0;const mode=FMODES[idx%FMODES.length];
 const F={idx,mode,intro:true,time:FMODE[mode].secs,max:FMODE[mode].secs,done:null,t0:Date.now(),timeout:false};
 S={screen:"fff",name:S.name,q:{fff:idx},phase:"ask",run:{answered:0},fff:F};render();scrollTo({top:0});fffFocus()}
function fffBegin(){const F=S.fff;if(!F||!F.intro)return;F.intro=false;F.t0=Date.now()+1;
 if(F.mode==="sprint"){F.cur=sprintQ();F.solved=0;F.log=[]}
 if(F.mode==="maze"){F.mz=0;F.grid=mazeGrid();F.sel=[];F.msg=""}
 if(F.mode==="cross"){F.cx=crossGen();F.fill={};F.msg=""}
 SFX.start();render();fffClock(F.max);fffFocus()}
function fffBot(){const F=S.fff,m=F.intro?"warm":F.done==="ok"?"finish":F.done?(F.timeout?"tired":"bonk"):F.panic?"panic":"run";
 const go=F.intro?"Read the rules, then hit Play. The clock waits for you!":F.panic?["Hurry! Clock is melting!","Faster faster faster!","Seconds left. GO!"][F.idx%3]:{sprint:"Type fast. Right answers jump ahead!",maze:"Find the path that hits the target!",cross:"Fill the blanks so every sum works!"}[F.mode];
 const say=F.done==="ok"?"Lightning fingers! The hot seat is yours.":F.done?(F.timeout?"Too slow! Try another round.":"Shake it off. Next round!"):go;
 return `<aside class="fffbot" data-m="${m}"><p class="say">${say}</p>${mascot(m,200)}<span class="bname" aria-hidden="true">${esc(buddyName())}<small>your KBC buddy</small></span></aside>`}
function fffHead(F){const M=FMODE[F.mode];return `<div class="qcard card fffhead"><div class="qtop"><span class="chip gold">Fastest Finger First</span><div class="clock ${F.time<=Math.min(10,F.max/3)?"low":""}" id="fclock" style="--p:${F.time/F.max}" role="timer" aria-label="Seconds left"><span>${F.time}</span></div></div>
<h2 class="qtext">${M.icon} ${M.name}</h2><p class="fhow">${esc(M.how.join(" · "))}</p></div>`}
function fffVerdict(F,expl){return F.done==="ok"?`<div class="verdict card good"><div><b>Done in ${F.secs.toFixed(1)} seconds! 🎉</b><span class="muted">You've earned the hot seat.</span></div><button class="btn gold" data-act="hotseat">Take the hot seat →</button></div>${expl}`
 :F.done?`<div class="verdict card bad"><div><b>${F.timeout?"Time's up.":"Not quite."}</b><span class="muted">Win a round to reach the hot seat. The next round is a different puzzle.</span></div><button class="btn gold" data-act="fff-next">Try another →</button></div>${expl}`:""}
/* Looping demos (pure HTML/CSS, like a short GIF): a pointer solves a tiny version of each puzzle */
const PTR='<span class="dptr" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 2l14 10-6 1.5 3.5 7-2.6 1.3-3.5-7L5 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></span>';
function fffDemo(mode){
 if(mode==="sprint")return `<div class="dm dm-sprint"><div class="dm-q"><span class="dm-p">&gt;&gt;&gt;</span> 7 × 8 =</div><div class="dm-in"><span class="dm-type">56</span><i class="dm-car"></i></div><div class="dm-ok">✓ next sum</div><div class="dm-pips"><i></i><i></i><i></i><i></i><i></i></div></div>`;
 if(mode==="maze")return `<div class="dm dm-maze"><div class="dm-t">target <b>15</b></div><div class="dm-grid">${[3,4,9,2,5,1,8,6,7].map((v,i)=>`<span class="c${i}">${v}</span>`).join("")}</div><div class="dm-sum">4 + 5 + 6 = <b>15</b> ✓</div>${PTR}</div>`;
 return `<div class="dm dm-cross"><div class="dm-x"><span>3</span><span>+</span><span class="blank"><em>5</em></span><span>=</span><span class="r">8</span></div><div class="dm-tiles"><span>2</span><span class="mv">5</span><span>7</span></div><div class="dm-sum">3 + 5 = 8 ✓</div>${PTR}</div>`}
function seatDemo(){return `<div class="dm dm-seat"><div class="dm-qc">What does this print?<code>print(7 // 2)</code></div><div class="dm-opts"><span>A · 3.5</span><span class="pk">B · 3</span><span>C · 4</span><span>D · 2</span></div><div class="dm-lock">Lock answer</div><div class="dm-sol">💡 Reveal solution</div>${PTR}</div>`}
/* Between winning Fastest Finger and the first question: what happens in the hot seat, with a demo */
function vSeat(){const first=!P.runs;
 return `<div class="fffgrid"><aside class="fffbot"><p class="say">You made it! I'm ${esc(buddyName())}, and I'll be right here with you. Read this, then take your seat.</p>${mascot("finish",200)}<span class="bname" aria-hidden="true">${esc(buddyName())}<small>your KBC buddy</small></span></aside><section class="fffw enter"><div class="qcard card fffhead fintro seatin"><span class="chip gold">The hot seat</span><div class="fi-ic" aria-hidden="true">🪑</div><h2 class="qtext">How the hot seat works</h2>
<div class="fi-cols"><div><ol class="fi-steps"><li style="--i:0"><b>1</b><span>Read the question and the code</span></li><li style="--i:1"><b>2</b><span>Answer it the way the question asks: pick, tap, type or put in order</span></li><li style="--i:2"><b>3</b><span>Press <strong>Lock answer</strong>. Then tap <strong>Reveal solution</strong> to see the working</span></li></ol>
<div class="fi-meta"><span>⏱ ${seatSecsNote()}</span><span>⚡ A miss costs energy; 3 right in a row gives some back</span><span>🛟 Stuck? Use a lifeline: 50:50, Ask the mentor or Flip</span></div></div>
<figure class="demo" aria-label="How it looks: a short looping demo"><figcaption>Watch how it works</figcaption>${seatDemo()}</figure></div>
<div class="fi-go"><button class="btn gold glow" data-act="seat-go">${first?"I'm ready, start →":"Start the hot seat →"}</button></div><small class="muted">or press Enter</small></div></section><div class="fffsp"></div></div>`}
function vFFFIntro(F){const M=FMODE[F.mode];
 return `<div class="qcard card fffhead fintro"><span class="chip gold">Fastest Finger First</span><div class="fi-ic" aria-hidden="true">${M.icon}</div><h2 class="qtext">${M.name}</h2><p class="muted">Quick rules. The clock starts when you press Play.</p>
<div class="fi-cols"><div><ol class="fi-steps">${M.how.map((h,i)=>`<li style="--i:${i}"><b>${i+1}</b><span>${esc(h)}</span></li>`).join("")}</ol>
<div class="fi-meta"><span>⏱ <b>${M.secs} seconds</b> for this puzzle</span><span>🏆 Win it → <b>take the hot seat</b></span><span>🪑 ${seatSecsNote()}</span></div></div>
<figure class="demo" aria-label="How it looks: a short looping demo"><figcaption>Watch how it works</figcaption>${fffDemo(F.mode)}</figure></div>
<div class="fi-go"><button class="btn gold glow" data-act="fff-begin">Play →</button><button class="btn quiet sm" data-act="fff-next">Try a different puzzle</button></div><small class="muted">or press Enter</small></div>`}
function vSprint(F){const pips=[0,1,2,3,4].map(k=>`<i class="${k<F.solved?"on":""}"></i>`).join("");
 const body=F.done?"":`<div class="sprc card mathc"><div class="spr-top"><span class="fl">Quick maths</span><span class="spips" aria-label="${F.solved} of 5 solved">${pips}<b>${F.solved}/5</b></span></div>
 <div class="mq"><span class="mq-p">&gt;&gt;&gt;</span><span class="mq-t">${esc(F.cur.q)}</span><span class="mq-eq">=</span></div>
 <div class="spr-in"><input class="fpin" id="sprin" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="?" aria-label="Answer to ${esc(F.cur.q)}"><button class="btn quiet sm" data-act="fff-skip">Skip</button></div><p class="fb" id="sprfb">Right answers move on by themselves.</p></div>`;
 const list=F.log.concat(F.done&&!F.timeoutSeen?[{q:F.cur.q,a:F.cur.a,st:"open"}]:[]);
 const expl=`<div class="panel card explain"><h3>${ICON.why}This round's sums</h3><div class="mlist">${list.map(x=>`<div class="${x.st==="ok"?"ok":"no"}"><code>${esc(x.q)} = ${esc(x.a)}</code><span>${x.st==="ok"?"✓ solved":x.st==="skip"?"skipped":"not answered"}</span></div>`).join("")}</div></div>`;
 return fffHead(F)+body+fffVerdict(F,expl)}
function vMaze(F){const M=F.grid,sum=F.sel.reduce((a,i)=>a+M.g[i],0),last=F.sel[F.sel.length-1];
 const cell=(v,i)=>{const at=F.sel.indexOf(i),can=!F.done&&(!F.sel.length||at===F.sel.length-1||(at<0&&F.sel.length<3&&mzNb(last,M.N).includes(i)));
  return `<button class="mzc ${at>-1?"on":""} ${!can&&at<0?"dim":""}" data-act="fff-cell" data-i="${i}" ${can?"":"disabled"} aria-label="${v}${at>-1?", step "+(at+1):""}"><b>${v}</b>${at>-1?`<em>${at+1}</em>`:""}</button>`};
 const body=F.done?"":`<div class="sprc card mathc"><div class="spr-top"><span class="fl">Maze ${F.mz+1} of 2</span><span class="spips">${[0,1].map(k=>`<i class="${k<F.mz?"on":""}"></i>`).join("")}<b>${F.mz}/2</b></span></div>
 <div class="mz-goal"><span class="mz-t">target <b>${M.target}</b></span><span class="mz-sum">${F.sel.length?F.sel.map(i=>M.g[i]).join(" + ")+" = <b>"+sum+"</b>":"tap a number to start"}</span></div>
 <div class="mzgrid" style="--n:${M.N}">${M.g.map(cell).join("")}</div>
 <p class="fb ${F.msgBad?"bad":""}">${esc(F.msg||"Tap the last number again to undo it.")}</p></div>`;
 const expl=`<div class="panel card explain"><h3>${ICON.why}A path that works</h3><div class="mzgrid sm" style="--n:${M.N}">${M.g.map((v,i)=>`<span class="mzc ${M.path.includes(i)?"on":""}"><b>${v}</b></span>`).join("")}</div><p class="mz-ans">${M.path.map(i=>M.g[i]).join(" + ")} = <b>${M.target}</b></p></div>`;
 return fffHead(F)+body+fffVerdict(F,expl)}
function vCross(F){const X=F.cx,val=k=>X.blanks.includes(k)?F.fill[k]:X.v[k],used=X.blanks.map(k=>F.fill[k]).filter(v=>v!=null);
 const nextBlank=X.blanks.find(k=>F.fill[k]==null);
 const cv=k=>X.blanks.includes(k)?`<button class="cx-c blank ${F.fill[k]!=null?"set":""} ${k===nextBlank&&!F.done?"next":""} ${F.wrong&&!F.done?"bad":""}" data-act="fff-blank" data-k="${k}" ${F.done?"disabled":""} aria-label="${F.fill[k]!=null?F.fill[k]+", tap to clear":"blank"}">${F.done?X.v[k]:F.fill[k]!=null?F.fill[k]:"?"}</button>`:`<span class="cx-c">${X.v[k]}</span>`;
 const op=o=>`<span class="cx-o">${o}</span>`,eq=`<span class="cx-o">=</span>`,res=r=>`<span class="cx-r">${r}</span>`,gap=`<span></span>`;
 const grid=`<div class="cxgrid">${cv(0)}${op(X.o[0])}${cv(1)}${eq}${res(X.R[0])}${op(X.o[2])}${gap}${op(X.o[3])}${gap}${gap}${cv(2)}${op(X.o[1])}${cv(3)}${eq}${res(X.R[1])}${eq}${gap}${eq}${gap}${gap}${res(X.R[2])}${gap}${res(X.R[3])}${gap}${gap}</div>`;
 const counts={};used.forEach(v=>counts[v]=(counts[v]||0)+1);
 const tiles=F.done?"":`<div class="cx-tiles">${X.tiles.map(v=>{const u=counts[v]>0;if(u)counts[v]--;return `<button class="cx-t ${u?"used":""}" data-act="fff-tile" data-v="${v}" ${u?"disabled":""}>${v}</button>`}).join("")}</div><p class="fb ${F.wrong?"bad":""}">${esc(F.msg||"Tap a tile to fill the glowing blank. Tap a filled blank to clear it.")}</p>`;
 const body=`<div class="sprc card mathc"><div class="spr-top"><span class="fl">${F.done?"The answer":"Fill the blanks"}</span></div>${grid}${tiles}</div>`;
 return fffHead(F)+body+fffVerdict(F,"")}
function vFFF(){const F=S.fff;const inner=F.intro?vFFFIntro(F):({sprint:vSprint,maze:vMaze,cross:vCross})[F.mode](F);
 return `<div class="fffgrid">${fffBot()}<section class="fffw enter" data-r="${F.idx}-${F.t0}">${inner}${F.intro?"":quipHTML("fff"+F.idx)}</section><div class="fffsp"></div></div>`}
function crossCheck(){const F=S.fff,X=F.cx;if(X.blanks.some(k=>F.fill[k]==null)){F.wrong=false;F.msg="";return}
 const w=X.v.map((v,k)=>X.blanks.includes(k)?F.fill[k]:v),ok=XOP(w[0],X.o[0],w[1])===X.R[0]&&XOP(w[2],X.o[1],w[3])===X.R[1]&&XOP(w[0],X.o[2],w[2])===X.R[2]&&XOP(w[1],X.o[3],w[3])===X.R[3];
 if(ok){fffFinish(true);return true}F.wrong=true;F.msg="One of the sums doesn't work yet. Tap a blank to change it.";SFX.wrong()}
document.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(!b||b.disabled||S.screen!=="fff"||!S.fff)return;const a=b.dataset.act,F=S.fff;
 if(a==="fff-begin"){fffBegin();return}
 if(F.done||F.intro)return;
 if(a==="fff-skip"&&F.mode==="sprint"){F.log.push({q:F.cur.q,a:F.cur.a,st:"skip"});F.cur=sprintQ();render();fffFocus();return}
 if(a==="fff-cell"&&F.mode==="maze"){const i=+b.dataset.i,at=F.sel.indexOf(i);if(at>-1&&at===F.sel.length-1)F.sel.pop();else if(at<0)F.sel.push(i);SFX.pick();F.msg="";F.msgBad=false;
  if(F.sel.length===3){const M=F.grid,s=F.sel.reduce((x,j)=>x+M.g[j],0);
   if(s===M.target){F.mz++;if(F.mz>=2){fffFinish(true);return}F.grid=mazeGrid();F.sel=[];F.msg="Nice! One more maze.";ROBO.happy()}
   else{F.msg=`That adds up to ${s}, not ${M.target}. Try another path.`;F.msgBad=true;F.sel=[];SFX.wrong()}}
  render();return}
 if(a==="fff-blank"&&F.mode==="cross"){const k=+b.dataset.k;if(F.fill[k]!=null){delete F.fill[k];F.wrong=false;F.msg="";SFX.pick();render()}return}
 if(a==="fff-tile"&&F.mode==="cross"){const X=F.cx,k=X.blanks.find(j=>F.fill[j]==null);if(k==null)return;F.fill[k]=+b.dataset.v;SFX.pick();if(crossCheck())return;render();return}
},SIG);
document.addEventListener("input",e=>{if(e.target.id!=="sprin"||S.screen!=="fff")return;const F=S.fff;if(!F||F.done||F.intro)return;
 if(e.target.value.trim()===F.cur.a){F.log.push({q:F.cur.q,a:F.cur.a,st:"ok"});F.solved++;SFX.pick();if(F.solved>=5){F.timeoutSeen=true;fffFinish(true);return}F.cur=sprintQ();render();fffFocus()}},SIG);
document.addEventListener("keydown",e=>{if(S.screen==="seat"&&e.key==="Enter"&&!e.target.matches("button,input,textarea,select")){e.preventDefault();startRun(true);return}if(S.screen!=="fff"||!S.fff)return;const F=S.fff;
 if(F.intro&&e.key==="Enter"&&!e.target.matches("button,input,textarea,select")){e.preventDefault();fffBegin();return}
 if(F.done||e.key!=="Enter"||e.target.id!=="sprin")return;e.preventDefault();const a=e.target,fb=$("#sprfb");a.classList.remove("shake");void a.offsetWidth;a.classList.add("shake");if(fb){fb.className="fb bad";fb.textContent="Not quite. Check your sum again."}},SIG);
/* How to play: a visual flow, not paragraphs */
const GICON={"name":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"24\" cy=\"17\" r=\"8\"/><path d=\"M9 41c2-9 8-13 15-13s13 4 15 13\"/></svg>","bolt":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linejoin=\"round\"><path d=\"M27 4L9 28h13l-2 16 19-25H26z\"/></svg>","seat":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 26V10a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v16M9 26h30v6H9zM14 32v10M34 32v10\"/></svg>","climb":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 40h8v-8h8v-8h8v-8h8V8\"/><path d=\"M33 8h7v7\"/></svg>","bank":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"6\" y=\"14\" width=\"36\" height=\"24\" rx=\"4\"/><path d=\"M6 21h36\"/><circle cx=\"33\" cy=\"30\" r=\"3\"/></svg>","clock":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\"><circle cx=\"24\" cy=\"26\" r=\"16\"/><path d=\"M24 17v9l6 4M19 5h10\"/></svg>","heart":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linejoin=\"round\"><path d=\"M24 41S7 30 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 12-17 23-17 23z\"/></svg>","door":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M28 6H12v36h16M22 24h20M35 17l7 7-7 7\"/></svg>","steps":"<svg viewBox=\"0 0 48 48\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\"><path d=\"M16 12h24M16 24h24M16 36h24\"/><circle cx=\"8\" cy=\"12\" r=\"2.5\"/><circle cx=\"8\" cy=\"24\" r=\"2.5\"/><circle cx=\"8\" cy=\"36\" r=\"2.5\"/></svg>"};
function vGuide(inOverlay){
 const lifes=LIFE.map(l=>`<div class="glife"><span class="lt">${ICON[l.k]||""}</span><b>${esc(l.name)}</b><small>${esc(l.tip)}</small></div>`).join("");
 return `<section class="guide vis g2">
<div class="ghead">${mascot("read",110)}<div><h2>How to play</h2><p class="muted">Three steps. Takes a minute to learn.</p></div></div>
<ol class="gsteps">
 <li class="gstep" style="--i:0"><span class="gnum">1</span><div class="gdemo d-fff" aria-hidden="true"><span class="dclock"><i></i><b>30</b></span><span class="dsum">7 × 8 = <u>56</u></span></div><b>Win Fastest Finger First</b><small>Solve a quick maths puzzle before the timer runs out. You'll see the rules first, then press <b>Play</b>. Win it to reach the hot seat.</small></li>
 <li class="gstep" style="--i:1"><span class="gnum">2</span><div class="gdemo d-seat" aria-hidden="true"><i>A</i><i class="pk">B</i><i>C</i><i>D</i></div><b>Answer in the hot seat</b><small>Read the code, <b>pick</b> an option, then <b>lock</b> it. Right answers move you up. Tap <b>Reveal solution</b> to see the working.</small></li>
 <li class="gstep" style="--i:2"><span class="gnum">3</span><div class="gdemo d-path" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="me"></i><i></i><span class="dchest">₹</span></div><b>Climb your path, win prizes</b><small>Each topic you clear brings you closer to the next prize. Prize money goes straight into your wallet.</small></li>
</ol>
<div class="vrules">
 <div class="vrule"><span class="vic sm">${GICON.clock}</span><b>60 seconds</b><small>for each hot-seat question (${FIRST_SECS} for your very first)</small></div>
 <div class="vrule"><span class="vic sm">${GICON.heart}</span><b>Energy</b><small>a miss costs 20%. 3 right in a row gives 10% back</small></div>
 <div class="vrule"><span class="vic sm">${GICON.door}</span><b>Stay in the game</b><small>leaving mid-game ends it. Your path progress is always saved</small></div>
 <div class="vrule"><span class="vic sm">${GICON.steps}</span><b>Learn from every answer</b><small>step-by-step working behind “Reveal solution”</small></div>
</div>
${inOverlay?"":quipHTML("guide")}
<div class="ractions">${inOverlay?`<button class="btn gold" data-act="guide-close">Back to my game</button>`:`<button class="btn gold" data-act="play">Play Fastest Finger →</button><button class="btn quiet" data-act="tour">✨ Take the tour</button>`}</div></section>`}
/* ================= Product tour: spotlights each part of the home screen once, on a student's first visit ================= */
const TOUR=[
 {sel:'.h-hero [data-act="play"]',t:"Start here",d:"Play Fastest Finger First: a quick maths puzzle. Win it to take the hot seat."},
 {sel:'header [data-act="path"]',t:"My path",d:"Your journey, topic by topic. Clear topics to win prize money."},
 {sel:"#wchip",t:"Your wallet",d:"Every prize you win is saved here."},
 {sel:'header [data-act="fame"]',t:"Hall of Fame",d:"Top players overall and in your university."},
 {sel:"#livechip",t:"Live now",d:"How many students are playing right now."},
 {sel:'header [data-act="guide"]',t:"How to play",d:"The rules in pictures. Open it any time, even mid-game."},
 {sel:'header [data-act="fb-open"]',t:"Feedback",d:"Tell us what to improve. We read every message."},
 {sel:"#themebtn",t:"Light or dark",d:"Switch the look whenever you like."},
 {sel:'header [data-act="logout"]',t:"Log out",d:"Done for the day? Log out here. Your progress is saved."}];
let TI=-1;
/* Top bar: one menu button (three lines) holds every option */
/* a tour step can point inside the menu; the tour opens the menu for it */
const inMenu=st=>!!document.querySelector("#menu "+st.sel.replace(/^header /,"")),tourOK=st=>inMenu(st)||vis(document.querySelector(st.sel));
function setMenu(on){document.body.classList.toggle("menu-open",on);const b=$("#menubtn");if(b){b.setAttribute("aria-expanded",on);b.setAttribute("aria-label",on?"Close menu":"Menu")}}
document.addEventListener("click",e=>{if(document.body.classList.contains("menu-open")&&!e.target.closest("#menu,#menubtn,#tour"))setMenu(false)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.body.classList.contains("menu-open")){setMenu(false);$("#menubtn")?.focus()}});
function tourStart(){if(S.screen!=="home"){S={screen:"home",name:S.name};render();scrollTo({top:0})}TI=0;tourShow();logEv({kind:"tour",step:"start"})}
const vis=el=>{if(!el||el.hidden)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0};
function tourShow(dir){let o=$("#tour");if(!o){o=document.createElement("div");o.id="tour";o.innerHTML='<div class="t-hole"></div><div class="t-card" role="dialog" aria-modal="true" aria-labelledby="t-h"></div>';document.body.appendChild(o)}
 while(TI>=0&&TI<TOUR.length&&!tourOK(TOUR[TI]))TI+=dir||1;
 setMenu(TI>=0&&TI<TOUR.length&&inMenu(TOUR[TI]));
 if(TI<0)TI=0;if(TI>=TOUR.length){tourEnd();return}
 const st=TOUR[TI],el=document.querySelector(st.sel);const r0=el.getBoundingClientRect();if(r0.top<70||r0.bottom>innerHeight-200)scrollBy({top:r0.top-innerHeight*.35,behavior:"instant"});const r=el.getBoundingClientRect(),pad=8,h=o.querySelector(".t-hole"),c=o.querySelector(".t-card");
 h.style.cssText=`left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px`;
 const n=TOUR.filter(tourOK).length,k=TOUR.slice(0,TI+1).filter(tourOK).length;
 c.innerHTML=`<span class="t-k">${k} of ${n}</span><h3 id="t-h">${esc(st.t)}</h3><p>${esc(st.d)}</p><div class="t-btns"><button class="btn quiet sm" data-act="tour-skip">Skip tour</button>${TI>0?'<button class="btn quiet sm" data-act="tour-back">Back</button>':""}<button class="btn gold sm" data-act="tour-next">${k>=n?"Let's play!":"Next →"}</button></div>`;
 const cw=Math.min(320,innerWidth-24),below=r.bottom+14+170<innerHeight;c.style.width=cw+"px";
 c.style.left=Math.max(12,Math.min(innerWidth-cw-12,r.left+r.width/2-cw/2))+"px";c.style.top=(below?r.bottom+14:Math.max(12,r.top-14-c.offsetHeight))+"px";
 o.hidden=false;setTimeout(()=>{const nb=c.querySelector('[data-act="tour-next"]');nb&&nb.focus({preventScroll:true})},30)}
function tourEnd(){setMenu(false);const o=$("#tour");if(o)o.remove();TI=-1;store.set("kbc-tour-"+ME.roll,true);logEv({kind:"tour",step:"end"})}
addEventListener("resize",()=>{if(TI>=0)tourShow()},SIG);
/* "Coder" types itself out on Home, and a little Python prompt keeps typing lines underneath */
const TERM=['while not crorepati: level_up()','if answer == correct: prize += 1','print("Namaste, coder!")','for q in range(15): stay_calm()','import confidence'];
let typeT=null;
function typeHome(){clearTimeout(typeT);const w=$(".ttl .tw"),l=$(".term .t-l");if(!w)return;if(reduceMotion){w.textContent="Coder";if(l)l.textContent=TERM[0];return}
 let i=0,j=0,k=0,del=false;w.textContent="";if(l)l.textContent="";
 const step=()=>{if(!document.body.contains(w))return;
  if(i<5){w.textContent="Coder".slice(0,++i);typeT=setTimeout(step,i<5?150:500);return}if(!l)return;
  const t=TERM[k%TERM.length];if(!del){l.textContent=t.slice(0,++j);if(j>=t.length){del=true;typeT=setTimeout(step,1800);return}typeT=setTimeout(step,55)}
  else{l.textContent=t.slice(0,--j);if(j<=0){del=false;k++;typeT=setTimeout(step,300);return}typeT=setTimeout(step,22)}};
 typeT=setTimeout(step,350)}
/* Wallet: what the coin chip opens */
function vWallet(){const coins=P.coins||0,best=P.best||0,acc=P.answered?Math.round(P.correct/P.answered*100):0;
 const runs=store.get(LKEY,[]).filter(e=>e.kind==="run_end").slice(-8).reverse();
 const why={energy:"Ran out of energy",win:"Collected 7 crore",stop:"Walked away",wrong:"Wrong answer",timeout:"Time ran out"};
 const top=[...LADDER].reverse().find(v=>NOTE[v]&&v<=coins);
 return `<section class="wallet">
<div class="wtop card"><div><span class="muted">Your wallet</span><div class="wamt">${fmtR(coins)}</div><span class="muted">Virtual coins from every game you've played.</span></div>${top?`<div class="wbill">${noteBig(top)}</div>`:mascot("chai",120)}</div>
<div class="wstats"><div class="card"><span>Best rung</span><b>${best?fmtR(amountOf(best)):"—"}</b></div><div class="card"><span>Games</span><b>${P.runs||0}</b></div><div class="card"><span>Answers right</span><b>${P.correct||0}/${P.answered||0}</b></div><div class="card"><span>Accuracy</span><b>${acc}%</b></div></div>
<div class="card wnotes"><h3>Notes collected <small class="muted">unlock each rung once</small></h3><div class="wgrid">${LADDER.map((v,i)=>`<div class="${i<best?"got":"lock"}">${boardNote(v)}<small>${fmtR(v)}</small></div>`).join("")}</div></div>
<div class="card wlog"><h3>Recent games</h3>${runs.length?`<ul>${runs.map(e=>`<li><span>${new Date(e.t).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span><span class="muted">${why[e.reason]||"Game over"} · ${e.correct||0}/${e.answered||0} right</span><b>+${fmtR(e.payout||0)}</b></li>`).join("")}</ul>`:'<p class="muted">No games yet. Win Fastest Finger to start earning.</p>'}</div>
${quipHTML("wallet")}
<div class="ractions"><button class="btn gold" data-act="play">Earn more →</button><button class="btn quiet" data-act="fame">Hall of Fame</button></div></section>`}
/* Choose your buddy */
function vBuddy(){return `<section class="buddies"><div class="ghead"><div><h2>Choose your buddy</h2><p class="muted">Pick the hero that matches what you're into. Your buddy cheers, panics and celebrates with you all game.</p></div></div>
<div class="bgrid">${BUDDY_ORDER.map(id=>COSTUMES[id]).map(c=>`<button class="bcard card ${c.id===CHAR?"on":""}" data-act="pick-char" data-c="${c.id}" aria-pressed="${c.id===CHAR}">${mascot(c.id===CHAR?"dance":"idle",104,c.id)}<span class="chip">${esc(c.tag)}</span><b>${esc(c.name)}</b><small>${esc(c.line)}</small>${c.id===CHAR?'<em>Your buddy</em>':""}</button>`).join("")}</div>
${quipHTML("buddy")}
<div class="ractions"><button class="btn gold" data-act="home">Done</button><button class="btn quiet" data-act="guide">How to play</button></div></section>`}
function goPlay(mode){S.name=ME.name||S.name;
 if(S.screen==="play")endRun("stop");if(mode==="seat")startRun();else startFFF()}
document.addEventListener("click",e=>{const bl=e.target.closest(".bill3d");if(bl)bl.classList.toggle("flip")},SIG);
/* Leaving mid-game ends the game (the hot seat needs a fresh Fastest Finger win), so header links ask first */
let PEND=null,LEAVE_OK=false;
const LEAVES={home:1,fame:1,wallet:1,path:1,logout:1,buddy:1,tour:1};
function inGame(){return S.screen==="play"||S.screen==="seat"||(S.screen==="fff"&&S.fff&&S.fff.done!=="bad")}
function askLeave(b){PEND=b;let m=$("#leavem");if(!m){m=document.createElement("div");m.id="leavem";m.className="modalx";document.body.appendChild(m)}
 const fff=S.screen==="fff";
 m.innerHTML=`<div class="mbox" role="alertdialog" aria-modal="true" aria-labelledby="lvh">${mascot("think",96)}<h3 id="lvh">Leave this game?</h3><p>${fff?"You'll lose this Fastest Finger round. To reach the hot seat you'll need to win one again.":S.practice?"Your practice round will end here.":"This game ends here and you keep what you've won so far. Next time you'll start again from Fastest Finger First."}</p><p class="muted">Your path progress is always saved.</p><div class="mbtns"><button class="btn gold" data-act="leave-stay">Keep playing</button><button class="btn quiet" data-act="leave-go">Leave game</button></div></div>`;
 m.hidden=false;setTimeout(()=>{const s=m.querySelector('[data-act="leave-stay"]');s&&s.focus()},30)}
function guideOverlay(){let m=$("#guidem");if(!m){m=document.createElement("div");m.id="guidem";m.className="modalx wide";document.body.appendChild(m)}
 m.innerHTML=`<div class="mbox guidebox" role="dialog" aria-modal="true" aria-label="How to play"><button class="mx" data-act="guide-close" aria-label="Close">✕</button>${vGuide(true)}</div>`;m.hidden=false;
 setTimeout(()=>{const c=m.querySelector(".mx");c&&c.focus()},30)}
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;for(const id of ["#solm","#guidem","#leavem"]){const m=$(id);if(m&&!m.hidden){e.preventDefault();m.hidden=true;return}}if(TI>=0){e.preventDefault();tourEnd()}},SIG);
document.addEventListener("click",e=>{if(e.target.classList&&e.target.classList.contains("modalx"))e.target.hidden=true},SIG);
document.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(!b||b.disabled)return;const a=b.dataset.act;
 if(a==="leave-stay"){modalClose("#leavem");return}
 if(a==="leave-go"){modalClose("#leavem");const el=PEND;PEND=null;if(el){LEAVE_OK=true;try{el.click()}finally{LEAVE_OK=false}}return}
 if(a==="guide"&&inGame()){guideOverlay();return}
 if(a==="guide-close"){modalClose("#guidem");return}
 if(LEAVES[a]&&inGame()&&!LEAVE_OK&&!b.closest(".modalx")){askLeave(b);return}
 if(a==="logout"){logout();return}
 if(a==="sol"){solOpen();return}
 if(a==="sol-close"){modalClose("#solm");return}
 if(a==="tour"){if(S.screen==="play")endRun("stop");tourStart();return}
 if(a==="tour-next"){TI++;tourShow();return}
 if(a==="tour-back"){TI=Math.max(0,TI-1);tourShow(-1);return}
 if(a==="tour-skip"){tourEnd();return}
 if(a==="fame-tab"){loadFame(b.dataset.s,b.dataset.s==="uni"?(FQ.uni||(ME&&ME.university)||""):"");return}
 if(a==="pathck"){S.mapTop=scrollY;S.open=null;S.openCk=S.openCk===b.dataset.c?null:b.dataset.c;render();return}
 if(a==="home"){if(S.screen==="play"&&S.phase!=="ask"&&S.phase!=="reveal")return;if(S.screen==="play"){endRun("stop");return}S={screen:"home",name:S.name};render();scrollTo({top:0});return}
 if(a==="fame"){if(S.screen==="play"){endRun("stop")}S={screen:"fame",name:S.name};render();scrollTo({top:0});loadFame(FQ.scope,FQ.uni);return}
 if(a==="team"){if(!TEAM)return;if(S.screen==="play")endRun("stop");S={screen:"team",name:S.name};render();loadDash();scrollTo({top:0});return}
 if(a==="dash-refresh"){loadDash();return}
 if(a==="menu"){setMenu(!document.body.classList.contains("menu-open"));return}
 if(b.closest("#menu"))setMenu(false);
 if(a==="buddy-toggle"){store.set("kbc-hide-buddy",!store.get("kbc-hide-buddy",false));syncBuddy();const y=scrollY;render();scrollTo({top:y});return}
 if(a==="fb-open"){FB.trigger="";fbOpen();return}
 if(a==="fb-close"){$("#fbm").hidden=true;return}
 if(a==="fb-bonus"){const n=+b.dataset.n;FB.bonus=FB.bonus===n?0:n;FB.text=($("#fbtext")||{}).value||FB.text;$("#fbm").innerHTML=fbHTML();SFX.pick();return}
 if(a==="fb-star"){FB.stars=+b.dataset.n;FB.text=($("#fbtext")||{}).value||FB.text;$("#fbm").innerHTML=fbHTML();SFX.pick();return}
 if(a==="fb-send"){if(!(FB.stars>0&&FB.text.trim().length>=5))return;logEv({kind:"feedback",stars:FB.stars,text:FB.text.trim().slice(0,600),screen:S.screen});P.fbSent=true;saveP();KBCQ.api("POST","/api/feedback",{text:FB.text.trim().slice(0,600),ctx:{stars:FB.stars,screen:S.screen,trigger:FB.trigger||"feedback button"}}).catch(()=>{});FB={stars:0,bonus:0,text:""};$("#fbm").innerHTML=fbHTML(true);ROBO.happy();return}
 if(a==="theme"){setTheme(document.documentElement.dataset.theme==="light"?"dark":"light");return}
 if(a==="pathjump"){pathJump(true);return}
 if(a==="pathsk"){if(b.classList.contains("lock"))return;const sk=b.dataset.sk,g=curGroup(),cur=curSkill(g);
  if(!S.open&&(!cur||sk!==cur.id)){fsToast(barOf(sk)>=BPS?"✓ Topic cleared. Well done!":"🔒 Clear the topics before this one to unlock it.");return}
  S.mapTop=scrollY;S.openCk=null;S.open=S.open===sk?null:sk;render();return}
 if(a==="buddy")return;
 if(a==="guide"||a==="wallet"||a==="path"){if(S.screen==="play")endRun("stop");S={screen:a,name:S.name};render();scrollTo({top:0});return}
 if(a==="pick-char"&&COSTUMES[b.dataset.c]){CHAR=b.dataset.c;store.set("kbc-r2-char",CHAR);SFX.pick();ROBO.hello();logEv({kind:"buddy",c:CHAR});render();return}
 if(a==="fs"){toggleFull();return}
 if(a==="sound"){soundOn=!soundOn;store.set("kbc-r1-snd",soundOn);syncSound();if(soundOn){ctx();SFX.pick();VIBE_UNTIL=Date.now()+60000;if(S.screen==="home")render()}return}
 if(a==="hp"){const el=$("#pname");if(el)S.name=el.value.trim();S.hp=S.hp===b.dataset.p?"":b.dataset.p;render();return}
 if(a==="play"||a==="fffgo"){goPlay("fff");return}
 if(a==="seat"){goPlay("seat");return}
 if(a==="hotseat"){S={screen:"seat",name:S.name,fff:S.fff};render();scrollTo({top:0});setTimeout(()=>{const b=$('[data-act="seat-go"]');b&&b.focus({preventScroll:true})},60);return}
 if(a==="seat-go"){startRun(true);return}
 if(a==="board-min"){store.set("kbc-board-min",!boardMin());const y=scrollY;render();scrollTo({top:y});return}
 if(a==="fff-next"){startFFF(S.fff?S.fff.idx+1:null);return}
 if(a==="collect"){endRun("win");return}
 if(S.screen!=="play")return;
 if(a==="pick"&&S.phase==="ask"){S.pick=+b.dataset.i;S.quitAsk=false;SFX.pick();document.querySelectorAll(".opt").forEach(o=>o.className=optCls(+o.dataset.i));syncAct();return}
 if(a==="unpick"){S.pick=null;document.querySelectorAll(".opt").forEach(o=>o.className=optCls(+o.dataset.i));syncAct();return}
 if(a==="ord"&&S.phase==="ask"){const d=+b.dataset.d;if(!S.ord.includes(d)){S.ord.push(d);SFX.pick();const y=scrollY;render();scrollTo({top:y})}return}
 if(a==="ord-clear"){S.ord=[];const y=scrollY;render();scrollTo({top:y});return}
 if(a==="msel"&&S.phase==="ask"){S.msel[+b.dataset.i]=b.dataset.c;SFX.pick();const y=scrollY;render();scrollTo({top:y});return}
 if(a==="lock"){if(ready())lockIn();return}
 if(a==="quit-ask"){S.quitAsk=true;syncAct();return}
 if(a==="quit-no"){S.quitAsk=false;syncAct();return}
 if(a==="quit"){endRun("stop");return}
 if(a==="next"){leaveReveal();newQ();render();scrollTo({top:0});return}
 if(a==="second"&&S.screen==="play"){logEv({kind:"retry",rung:rungOf()});leaveReveal();newQ();render();scrollTo({top:0});say("New variant of the same question.");return}
 if(a==="practice-end"&&S.practice){leaveReveal();logEv({kind:"practice_end",answered:S.run.answered,correct:S.run.correct});S={screen:"home",name:S.name};render();scrollTo({top:0});return}
 if(a==="board"){document.body.classList.toggle("boardopen");return}
 if(a==="stop"){endRun("stop");return}
 if(a==="end"){endRun(S.run&&S.run.en<=0?"energy":S.timeout?"timeout":"wrong");return}
 if(a==="ll"){const k=b.dataset.k;if(S.used[k]||S.phase!=="ask"||!S.q)return;S.used[k]=true;const q0=S.q;
  logEv({kind:"lifeline",life:k,sk:q0.sk,ty:q0.ty});SFX.pick();
  if(k==="hint"){S.hint=true;S.hintText=""}
  const y=scrollY;render();scrollTo({top:y});
  KBCQ.api("POST","/api/play/lifeline",{qid:q0.id,kind:k}).then(r=>{if(S.q!==q0||S.phase!=="ask")return;
   if(k==="fifty"){S.gone=r.hide||[];if(S.gone.includes(S.pick))S.pick=null}
   if(k==="hint")S.hintText=r.hint;
   if(k==="flip"&&r.question){const used=S.used,secsMax=S.secsMax;setQ(r);S.used=used;S.time=secsMax;S.secsMax=secsMax}
   const y2=scrollY;render();scrollTo({top:y2})}).catch(e=>{S.used[k]=false;fsToast(e.message||"That lifeline is not available now.");render()});return}
 if(a==="bq"){if(KBCQ.act(b,S)){const y=scrollY;render();scrollTo({top:y})}else syncAct();return}
},SIG);
document.addEventListener("input",e=>{if(e.target.dataset&&e.target.dataset.bqIn!=null&&S.screen==="play"){KBCQ.input(e.target,S);syncAct();return}
 if(e.target.id==="fillin"&&S.screen==="play"){S.fill=e.target.value;syncAct()}},SIG);
document.addEventListener("change",e=>{if(e.target.id==="fameuni"){loadFame("uni",e.target.value);return}if(e.target.matches(".mrow select")&&S.screen==="play"){S.msel[+e.target.dataset.i]=e.target.value;syncAct()}},SIG);
document.addEventListener("keydown",e=>{
 if(S.screen!=="play")return;
 if(e.key==="Enter"){if(e.target.id==="fillin"||(!e.target.matches("input,select,button,textarea")&&!(e.target.closest&&e.target.closest(".bq")))){const btn=$("#lockbtn")||$('[data-act="next"]')||$('[data-act="second"]')||$('[data-act="end"]');if(btn){e.preventDefault();btn.click()}}return}
 if(e.target.matches("input,select,textarea"))return;const i="abcd".indexOf(e.key.toLowerCase());
 if(i>-1&&S.q&&S.q.kind==="mcq"&&S.phase==="ask"&&i<S.q.opts.length&&!S.gone.includes(i)){S.pick=i;SFX.pick();document.querySelectorAll(".opt").forEach(o=>o.className=optCls(+o.dataset.i));syncAct()}},SIG);
/* Leaving the tab mid-question is recorded (the clock keeps running on wall time either way) */
document.addEventListener("visibilitychange",()=>{if(!document.hidden)return;if(S.screen==="play"&&S.phase==="ask")S.away=(S.away||0)+1;if(S.screen==="fff"&&S.fff&&!S.fff.done)S.fff.away=(S.fff.away||0)+1},SIG);

function syncSound(){const b=$("#soundbtn");if(b){b.setAttribute("aria-pressed",soundOn);const l=b.querySelector(".lbl");if(l)l.textContent=soundOn?"Sound on":"Sound off"}}
syncSound();addEventListener("pointerdown",()=>{if(soundOn)ctx()},SIG);
KBCQ.onRerender(()=>{if(S.screen==="play"){const y=scrollY;render();scrollTo({top:y})}});
render();initOnline();
setTimeout(()=>M3D.warm(COSTUMES[CHAR]||COSTUMES.byte,BYTE_POSES),1500);
})();
