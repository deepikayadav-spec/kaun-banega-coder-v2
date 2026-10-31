/* Kaun Banega Coder: the bank question layer.
   - boots the game: checks the session, loads /api/boot, then loads game.js
   - turns a served bank question into the game's question object and renders every one of the 29 types
   - builds the answer for the server; run-type answers are run first in Python (Pyodide, in a Web Worker)
   Answer keys never reach the browser: grading happens on the server. */
(function(){"use strict";
const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const CHOICE={mcq:1,explain:1,happens:1,problem:1,input:1,name:1};
const RUN={fill:1,cover:1,mystery:1,parsons:1,golf:1,fix:1,faded:1,grow:1,write:1,diverge:1};

/* ---------- API ---------- */
async function api(method,url,body,keep){
 const r=await fetch(url,{method,credentials:"same-origin",keepalive:!!keep,headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
 if(r.status===401&&!url.startsWith("/api/auth")){location.href="/login";throw Object.assign(new Error("Please log in."),{status:401})}
 let j=null;try{j=await r.json()}catch(e){}
 if(!r.ok)throw Object.assign(new Error((j&&j.error)||"Request failed ("+r.status+")"),{status:r.status});
 return j}

/* ---------- Python in the browser (Pyodide in a worker; a stuck program is stopped after a few seconds) ---------- */
const PY={w:null,loaded:null,seq:0,jobs:{}};
function worker(){if(PY.w)return PY.loaded;
 PY.w=new Worker("/pyrun.worker.js");
 PY.loaded=new Promise((ok,bad)=>{PY.w.onmessage=e=>{const d=e.data;if(d.ready){ok();return}if(d.fail){bad(new Error(d.fail));return}const j=PY.jobs[d.id];if(j){delete PY.jobs[d.id];clearTimeout(j.t);j.ok(d)}};
  PY.w.onerror=e=>bad(new Error("Python could not start: "+(e.message||"network")))});
 PY.loaded.catch(()=>{PY.w&&PY.w.terminate();PY.w=null});
 return PY.loaded}
async function runPy(code,stdin){await worker();
 return new Promise(ok=>{const id=++PY.seq;const t=setTimeout(()=>{delete PY.jobs[id];PY.w.terminate();PY.w=null;ok({stdout:"",error:"Your code took too long. Is there a loop that never stops?"})},6000);
  PY.jobs[id]={ok,t};PY.w.postMessage({id,code:String(code),stdin:(stdin||[]).map(String)})})}
const warm=()=>{worker().catch(()=>{})};

/* ---------- adapt: a served question → the game's question object ---------- */
function adapt(sq,addr,GR){const t=GR.types.find(x=>x.key===sq.type)||{},sk=GR.skills.find(s=>s.id===sq.skill)||{},p=sq.payload||{};
 const strip=x=>String(x||"").replace(/^[A-Z][\w ,/&-]*: /,"");
 const q={id:sq.id,sk:sq.skill,ty:sq.type,v:sq.variant,type:sq.type,tdef:t,prompt:sq.task,src:sq.code,code:{path2:1,fix:1,golf:1}[sq.type]?null:sq.code,p,why:"",show:"",
  addr:addr?addr.code:"",tname:t.name||sq.type,
  idea:(sq.kps||[]).map(k=>sk.kps&&sk.kps[k]).filter(Boolean).slice(0,2).map(strip).map(x=>{x=x.trim();x=x[0].toUpperCase()+x.slice(1);return /[.!?]$/.test(x)?x:x+"."}).join(" "),
  trap:(sq.mistakes||[]).map(m=>sk.mistakes&&sk.mistakes[m]).filter(Boolean)[0]||""};
 if(CHOICE[sq.type]){q.kind="mcq";q.opts=p.options;q.plain=p.options.some(o=>/\s\S+\s/.test(o)&&o.length>14)}
 else if(sq.type==="same"){q.kind="mcq";q.opts=["Same","Different"];q.two=true;q.plain=true}
 else q.kind="bank";
 if(RUN[sq.type]||sq.type==="guess")warm();
 return q}

/* ---------- helpers ---------- */
const hl=c=>{const KW=/\b(for|in|if|elif|else|while|break|continue|and|or|not|True|False|None|def|return|print|len|range|input|int|str|float|type|import)\b/g;
 return esc(c).replace(/(&quot;[^&\n]*?&quot;|'[^'\n]*')/g,'<span class="s">$1</span>').replace(KW,'<span class="k">$1</span>')};
const codeBlock=(c,cls)=>`<pre class="code ${cls||""}">${String(c||"").split("\n").map(l=>`<span class="ln">${hl(l)||" "}</span>`).join("")}</pre>`;
const outBlock=(label,t)=>`<div class="bq-out"><small>${esc(label)}</small><pre>${esc(t)}</pre></div>`;
const golfCode=(q,picks)=>{const L=String(q.src||"").split("\n");q.p.tokens.forEach((tk,i)=>{const v=picks[i];if(v!=null&&v!==tk.now)L[tk.line]=L[tk.line].replace(tk.now,v)});return L.join("\n")};
const fadedCode=(q,S)=>q.p.steps.map((st,i)=>st.solved?st.code:(S.bq.steps&&S.bq.steps[i]!=null?S.bq.steps[i]:st.code)).join("\n");
const fillCode=(q,t)=>String(q.src||"").split("____").join(t);
function init(q,S){const b=S.bq;if(b._init===q.id)return b;for(const k in b)delete b[k];b._init=q.id;
 const t=q.type;
 if(t==="fix")b.code=q.src||"";
 if(t==="golf")b.picks=q.p.tokens.map(tk=>tk.now);
 if(t==="faded")b.steps=q.p.steps.map(st=>st.solved?st.code:st.code);
 if(t==="diverge")b.progs=["","",""];
 b.order=[];b.picks=b.picks||[];b.pairs={};b.cells={};b.assign={};b.path=[];b.probes=[];
 if(t==="group")b.cur=q.p.groups[0];
 return b}

/* ---------- what is shown above the answer area ---------- */
function above(q,S){const p=q.p||{},t=q.type;let h="";
 if(p.spec)h+=`<div class="bq-spec">${esc(p.spec)}</div>`;
 if(t==="explain"&&p.printed!=null)h+=outBlock("It prints",p.printed);
 if(t==="same")h+=`<div class="bq-two"><div><small>Program A</small>${codeBlock(p.codeA)}</div><div><small>Program B</small>${codeBlock(p.codeB)}</div></div>`;
 if(t==="mystery"||t==="diverge")h+=outBlock("Target output",p.target);
 if(t==="fill"||t==="parsons"||t==="golf")h+=outBlock("Target output",p.target);
 if(t==="golf")h+=`<p class="muted bq-note">Par: ${p.par} change${p.par===1?"":"s"}.</p>`;
 if(t==="diverge")h+=`<p class="muted bq-note">Write up to three programs. ${p.need} different ones must print exactly this.</p>`;
 if(t==="cover")h+=`<div class="bq-legend">${p.branches.map(b=>`<span><b>${esc(b.id)}</b> line ${b.line} prints <code>${esc(b.output)}</code></span>`).join("")}</div><p class="muted bq-note">Pick ${p.need} inputs so every branch runs exactly once.</p>`;
 if(t==="grow")h+=`<ol class="bq-tiers">${p.tiers.map(x=>`<li><span>${esc(x.task)}</span>${outBlock("prints",x.expected)}</li>`).join("")}</ol>`;
 if(t==="path")h+=`<div class="bq-legend">${p.branches.map(b=>`<span><b>${esc(b.id)}</b> line ${b.line}: <code>${esc(b.label)}</code></span>`).join("")}</div>`;
 return h}

/* ---------- render the answer area for kind "bank" ---------- */
function render(q,S){const b=init(q,S),p=q.p,t=q.type,dis=S.phase!=="ask",rev=S.phase==="reveal",D=dis?"disabled":"",det=(S.res&&S.res.detail)||{};
 const btn=(op,attrs,cls,inner)=>`<button class="${cls}" data-act="bq" data-op="${op}" ${attrs} ${D}>${inner}</button>`;
 const verdict=rev?(S.ok?" right":" wrong"):"";
 let h="";
 switch(t){
  case "match":{const ans=det.answer;
   h=`<div class="tiles">${p.left.map((l,i)=>{const st=rev&&ans?(b.pairs[l]===ans[l]?"right":"wrong"):"";return `<div class="mrow ${st}"><code>${esc(l)}</code><div class="mchips">${p.right.map(r=>{const on=b.pairs[l]===r,k=rev&&ans?(r===ans[l]?"ok":on?"no":""):on?"on":"";
    return btn("match",`data-i="${i}" data-v="${esc(r)}" aria-pressed="${on}"`,"mchip "+k,esc(r))}).join("")}</div></div>`}).join("")}</div>`;break}
  case "predict":h=`<div class="fillrow bq"><label class="muted" for="bqtext">Type exactly what it prints</label><textarea id="bqtext" class="bq-ta${verdict}" rows="3" data-bq-in="text" spellcheck="false" autocomplete="off" ${D}>${esc(b.text||"")}</textarea></div>`;break;
  case "hunt":{const ans=det.answer?det.answer.map(String):null;
   h=`<div class="bq-grid">${p.values.map(v=>{const on=b.picks.includes(v),k=rev&&ans?(ans.includes(v)?(on?"ok":"miss"):on?"no":""):on?"on":"";return btn("hunt",`data-v="${esc(v)}" aria-pressed="${on}"`,"mchip "+k,esc(v))}).join("")}</div>`;break}
  case "path2":case "bug":{const sel=t==="bug"?[b.line]:b.path,ans=det.answer;
   h=`<div class="bq-lines">${p.lines.map((l,i)=>{const n=i+1,pos=sel.indexOf(n),inAns=rev&&ans!=null&&(t==="bug"?ans===n:ans.includes(n));
    return btn(t,`data-n="${n}"`,"bq-line"+(pos>-1?" on":"")+(rev?(inAns?" ok":pos>-1?" no":""):""),`<span class="ord">${t==="path2"&&pos>-1?pos+1:n}</span><code>${hl(l)||" "}</code>`)}).join("")}</div>
   ${t==="path2"&&!dis&&b.path.length?btn("clear","","btn quiet sm","Clear"):""}`;break}
  case "timeline":case "pseudo":case "sort":case "parsons":{const items=p.items,code=t==="sort"||t==="parsons";
   h=`<div class="ordgrid"><div class="ordcol"><span class="ordh">Pieces</span><div class="tiles">${items.map((it,i)=>{const pos=b.order.indexOf(i);return btn("ord",`data-i="${i}" ${pos>-1?"disabled":""}`,"tile"+(pos>-1?" picked":""),`<span class="ord">${pos>-1?pos+1:""}</span>${code?`<code>${hl(it)}</code>`:esc(it)}`)}).join("")}</div></div>
   <div class="ordcol"><span class="ordh">Your order</span><div class="built${verdict}">${b.order.length?b.order.map((i,k)=>`<span class="ln2"><i>${k+1}</i>${code?hl(items[i]):esc(items[i])}</span>`).join(""):`<span class="muted">Tap the pieces in order.</span>`}</div>
   <div class="ordbtns">${!dis&&b.order.length?btn("clear","","btn quiet sm","Clear"):""}${t==="parsons"&&!dis&&b.order.length===items.length?btn("run","","btn quiet sm","▶ Run it"):""}</div></div></div>${b.out?outBlock(b.out.error?"Python says":"Your program prints",b.out.error||b.out.stdout):""}`;break}
  case "group":{const G=p.groups,size=p.pieces.length/G.length,LT="ABCD",cnt=g=>Object.values(b.assign).filter(x=>x===g).length,ci=G.indexOf(b.cur);
   h=`${dis?"":`<ol class="bq-how"><li><b>1</b><span>Tap a <u>group name</u> below. It lights up.</span></li><li><b>2</b><span>Tap the <u>${size} pieces</u> that belong to that group. They take its colour and letter.</span></li><li><b>3</b><span>Do the same for every group. Tap a piece again to take it out.</span></li></ol>`}
   <div class="bq-tabs" role="group" aria-label="Groups">${G.map((g,gi)=>btn("gcur",`data-v="${esc(g)}" aria-pressed="${b.cur===g}"`,"hchip gtab g"+gi+(b.cur===g?" on":"")+(cnt(g)>=size?" full":""),`<i>${LT[gi]}</i>${esc(g)} <small>${cnt(g)}/${size}${cnt(g)>=size?" ✓":""}</small>`)).join("")}</div>
   ${dis?"":`<p class="bq-now">Now filling: <b class="g${ci}"><i>${LT[ci]}</i>${esc(b.cur)}</b>${b.msg?`<span class="bq-warn">${esc(b.msg)}</span>`:""}</p>`}
   <div class="bq-grid">${p.pieces.map(pc=>{const g=b.assign[pc],gi=G.indexOf(g);return btn("grp",`data-v="${esc(pc)}"`,"mchip gpc"+(g?" g"+gi+" on":""),`${g?`<i>${LT[gi]}</i>`:""}${esc(pc)}`)}).join("")}</div>`;break}
  case "gap":{const ans=det.answer;
   h=`<table class="bq-gap"><thead><tr><th>Line</th><th>Variable</th><th>Kind</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td><code>${hl(r.line)}</code></td><td><code>${esc(r.var)}</code></td><td>${r.given?`<b>${esc(r.kind)}</b>`:
    `<select data-bq-in="gap" data-k="${esc(r.var)}" class="${rev&&ans?(String(b.cells[r.var]||"")===ans[r.var]?"right":"wrong"):""}" ${D}><option value="">choose…</option>${p.kinds.map(k=>`<option ${b.cells[r.var]===k?"selected":""}>${esc(k)}</option>`).join("")}</select>${rev&&ans&&b.cells[r.var]!==ans[r.var]?` <small>→ ${esc(ans[r.var])}</small>`:""}`}</td></tr>`).join("")}</tbody></table>`;break}
  case "path":{const ans=det.answer;
   h=`<div class="tiles">${p.cases.map((c,i)=>`<div class="mrow ${rev&&ans?(b.picks[i]===ans[i]?"right":"wrong"):""}"><code>input: ${esc(c.input)}</code><div class="mchips">${p.branches.map(br=>{const on=b.picks[i]===br.id,k=rev&&ans?(br.id===ans[i]?"ok":on?"no":""):on?"on":"";return btn("pathc",`data-i="${i}" data-v="${esc(br.id)}"`,"mchip "+k,esc(br.id))}).join("")}</div></div>`).join("")}</div>`;break}
  case "fill":h=`<div class="fillrow bq"><label class="muted" for="bqtext">Your code for ____</label><input id="bqtext" data-bq-in="text" class="${verdict.trim()}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(b.text||"")}" ${D} placeholder="type it here">${!dis&&(b.text||"").trim()?btn("run","","btn quiet sm","▶ Run it"):""}</div>${b.out?outBlock(b.out.error?"Python says":"It prints",b.out.error||b.out.stdout):""}`;break;
  case "mystery":case "fix":case "write":case "grow":
   h=`<div class="bq">${editor("code",b.code||"",dis,t==="fix"?"Fix the code here":"Write your code here",verdict)}<div class="bq-row">${!dis&&(b.code||"").trim()?btn("run","","btn quiet sm","▶ Run it"):""}</div>${b.out?outBlock(b.out.error?"Python says":"Your code prints",b.out.error||b.out.stdout):""}</div>`;break;
  case "faded":
   h=`<div class="bq">${p.steps.map((st,i)=>`<div class="bq-step"><small>${esc(st.label)}</small>${st.solved?codeBlock(st.code):editor("step",b.steps[i],dis,st.hint||"",verdict,i)}${!st.solved&&st.hint?`<p class="muted bq-note">${esc(st.hint)}</p>`:""}</div>`).join("")}
   <div class="bq-row">${!dis?btn("run","","btn quiet sm","▶ Run all steps"):""}</div>${b.out?outBlock(b.out.error?"Python says":"All steps print",b.out.error||b.out.stdout):""}</div>`;break;
  case "diverge":
   h=`<div class="bq">${[0,1,2].map(i=>`<div class="bq-step"><small>Program ${i+1}${i===2?" (optional)":""}</small>${editor("div",b.progs[i],dis,"print(…)",verdict,i)}${b.outs&&b.outs[i]?outBlock(b.outs[i].error?"Python says":"prints",b.outs[i].error||b.outs[i].stdout):""}</div>`).join("")}
   <div class="bq-row">${!dis?btn("run","","btn quiet sm","▶ Run all"):""}</div></div>`;break;
  case "golf":
   h=`<div class="bq">${p.tokens.map((tk,i)=>`<label class="bq-tok">Line ${tk.line+1}: <select data-bq-in="golf" data-i="${i}" ${D}>${tk.choices.map(c=>`<option ${b.picks[i]===c?"selected":""}>${esc(c)}</option>`).join("")}</select></label>`).join("")}
   <small class="muted">Your code (${p.tokens.filter((tk,i)=>b.picks[i]!==tk.now).length} change${p.tokens.filter((tk,i)=>b.picks[i]!==tk.now).length===1?"":"s"})</small>${codeBlock(golfCode(q,b.picks))}<div class="bq-row">${!dis?btn("run","","btn quiet sm","▶ Run it"):""}</div>${b.out?outBlock(b.out.error?"Python says":"It prints",b.out.error||b.out.stdout):""}</div>`;break;
  case "cover":
   h=`<div class="bq-grid">${p.values.map(v=>{const on=b.picks.includes(v);return btn("cover",`data-v="${esc(v)}" aria-pressed="${on}"`,"mchip"+(on?" on":""),esc(v))}).join("")}</div>
   ${b.outs?`<div class="bq-legend">${b.picks.map((v,i)=>`<span>input <b>${esc(v)}</b> → <code>${esc((b.outs[i]||{}).error||(b.outs[i]||{}).stdout||"")}</code></span>`).join("")}</div>`:""}
   ${!dis&&b.picks.length===p.need?btn("run","","btn quiet sm","▶ Try these inputs"):""}`;break;
  case "guess":{const pr=p.probe,left=p.max_probes-b.probes.length;
   h=`<div class="bq"><div class="bq-probe"><label>${esc(pr.var)} = <input type="number" min="${pr.min}" max="${pr.max}" data-bq-in="probe" value="${esc(b.probe!=null?b.probe:"")}" ${dis||left<=0?"disabled":""}></label>${btn("probe",left<=0?"disabled":"","btn quiet sm",`Probe (${left} left)`)}<small class="muted">${pr.min} to ${pr.max}</small></div>
   ${b.probes.length?`<div class="bq-legend">${b.probes.map(x=>`<span>${esc(pr.var)} = <b>${esc(x.v)}</b> → <code>${esc(x.out)}</code></span>`).join("")}</div>`:""}
   <div class="opts">${p.options.map((o,i)=>{const k=rev&&det.right!=null?(i===det.right?" right":i===b.pick?" wrong":""):b.pick===i?" pending":"";return btn("gpick",`data-i="${i}"`,"opt"+k,`<span class="l">${"ABCD"[i]}</span><span class="t"><code>${esc(o)}</code></span>`)}).join("")}</div></div>`;break}
  default:h=`<p class="muted">This question type (${esc(t)}) can't be shown yet.</p>`}
 return `<div class="bqw" data-type="${esc(t)}">${h}</div>`}
function editor(kind,val,dis,ph,verdict,i){return `<textarea class="bq-code${verdict||""}" data-bq-in="${kind}" ${i!=null?`data-i="${i}"`:""} rows="${Math.max(4,Math.min(14,String(val||"").split("\n").length+2))}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${esc(ph)}" ${dis?"disabled":""}>${esc(val||"")}</textarea>`}

/* ---------- input & clicks (return true to re-render) ---------- */
function input(el,S){const b=S.bq,k=el.dataset.bqIn,i=el.dataset.i!=null?+el.dataset.i:null;
 if(k==="text")b.text=el.value;else if(k==="code")b.code=el.value;else if(k==="gap")b.cells[el.dataset.k]=el.value;
 else if(k==="step")b.steps[i]=el.value;else if(k==="div")b.progs[i]=el.value;else if(k==="probe")b.probe=el.value;
 else if(k==="golf"){b.picks[i]=el.value;b.out=null;const box=el.closest(".bqw");if(box){const t=document.createElement("div");t.innerHTML=render(S.q,S);box.replaceWith(t.firstChild)}}
 if(k==="code"||k==="step"||k==="div"){el.rows=Math.max(4,Math.min(14,el.value.split("\n").length+2))}}
function act(btn,S){const q=S.q,b=S.bq,p=q.p,op=btn.dataset.op,v=btn.dataset.v,i=btn.dataset.i!=null?+btn.dataset.i:null;if(S.phase!=="ask")return false;
 switch(op){
  case "match":b.pairs[p.left[i]]=v;return true;
  case "hunt":{const j=b.picks.indexOf(v);if(j>-1)b.picks.splice(j,1);else b.picks.push(v);return true}
  case "path2":b.path.push(+btn.dataset.n);return true;
  case "bug":b.line=+btn.dataset.n;return true;
  case "ord":if(!b.order.includes(i))b.order.push(i);b.out=null;return true;
  case "clear":b.order=[];b.path=[];b.out=null;return true;
  case "gcur":b.cur=v;b.msg="";return true;
  case "grp":{const size=p.pieces.length/p.groups.length,full=g=>Object.values(b.assign).filter(x=>x===g).length>=size;b.msg="";
   if(b.assign[v]===b.cur){delete b.assign[v];return true}
   if(full(b.cur)){b.msg=`This group already has ${size}. Tap one of its pieces to take it out, or pick another group.`;return true}
   b.assign[v]=b.cur;if(full(b.cur)){const nx=p.groups.find(g=>!full(g));if(nx)b.cur=nx}return true}
  case "pathc":b.picks[i]=v;return true;
  case "cover":{const j=b.picks.indexOf(v);if(j>-1)b.picks.splice(j,1);else if(b.picks.length<p.need)b.picks.push(v);b.outs=null;return true}
  case "gpick":b.pick=i;return true;
  case "probe":{const n=Number(b.probe),pr=p.probe;if(!Number.isFinite(n)||n<pr.min||n>pr.max||b.probes.length>=p.max_probes)return false;
   b.busy=true;runPy(`${pr.var} = ${Math.trunc(n)}\n`+atob(pr.hidden),[]).then(r=>{b.busy=false;b.probes.push({v:Math.trunc(n),out:(r.error||r.stdout).trim()});KBCQ.rerender()});return false}
  case "run":tryRun(q,S).then(()=>KBCQ.rerender());btn.textContent="Running…";btn.disabled=true;return false}
 return false}
/* "Run it" before locking: shows what the code prints. Locking runs it again for the answer. */
async function tryRun(q,S){const b=S.bq,a=await build(q,S);if(q.type==="diverge")b.outs=a.programs;else if(q.type==="cover")b.outs=a.outputs.map((o,i)=>({stdout:o,error:a.errors[i]}));else b.out={stdout:a.stdout||"",error:a.error||""}}

/* ---------- ready / prompt ---------- */
function ready(q,S){const b=init(q,S),p=q.p;
 switch(q.type){
  case "match":return p.left.every(l=>b.pairs[l]);
  case "predict":return !!(b.text||"").trim();
  case "hunt":return b.picks.length>0;
  case "path2":return b.path.length>0;
  case "bug":return b.line!=null;
  case "timeline":case "pseudo":case "sort":case "parsons":return b.order.length===p.items.length;
  case "group":return p.pieces.every(pc=>b.assign[pc]);
  case "gap":return p.rows.filter(r=>!r.given).every(r=>b.cells[r.var]);
  case "path":return p.cases.every((c,i)=>b.picks[i]);
  case "fill":return !!(b.text||"").trim();
  case "mystery":case "fix":case "write":case "grow":return !!(b.code||"").trim();
  case "faded":return b.steps.some((s,i)=>!p.steps[i].solved&&s.trim());
  case "diverge":return b.progs.filter(x=>x.trim()).length>=Math.min(2,p.need||2);
  case "golf":return true;
  case "cover":return b.picks.length===p.need;
  case "guess":return b.pick!=null}
 return false}
function need(q){return ({match:"Match every line",predict:"Type the output",hunt:"Tap the matching values",path2:"Tap the lines in the order they run",bug:"Tap the wrong line",
 timeline:"Put every item in order",pseudo:"Put every step in order",sort:"Sort every item",parsons:"Use every line",group:"Put every piece in a group",gap:"Fill every empty cell",
 path:"Pick a branch for each input",fill:"Fill the blank",mystery:"Write your code",fix:"Fix the code",write:"Write your code",grow:"Write the program",faded:"Finish the steps",
 diverge:"Write at least two programs",golf:"Change the values",cover:"Pick the inputs",guess:"Probe, then pick the code"})[q.type]||"Answer the question"}

/* ---------- the answer sent to the server ---------- */
async function build(q,S){const b=init(q,S),p=q.p,t=q.type;
 switch(t){
  case "match":return {pairs:b.pairs};
  case "predict":return {text:b.text||""};
  case "hunt":return {picks:b.picks};
  case "path2":return {path:b.path};
  case "bug":return {line:b.line};
  case "timeline":case "pseudo":case "sort":return {order:b.order};
  case "parsons":{const code=b.order.map(i=>p.items[i]).join("\n"),r=await runPy(code,[]);return {order:b.order,stdout:r.stdout,error:r.error}}
  case "group":{const g={};p.groups.forEach(n=>g[n]=[]);for(const pc in b.assign)g[b.assign[pc]].push(pc);return {groups:g}}
  case "gap":return {cells:b.cells};
  case "path":return {picks:b.picks};
  case "guess":return {pick:b.pick};
  case "fill":{const r=await runPy(fillCode(q,b.text||""),[]);return {text:b.text||"",stdout:r.stdout,error:r.error}}
  case "mystery":case "fix":case "write":case "grow":{const r=await runPy(b.code||"",[]);return {code:b.code||"",stdout:r.stdout,error:r.error}}
  case "faded":{const code=fadedCode(q,S),r=await runPy(code,[]);return {code,stdout:r.stdout,error:r.error}}
  case "golf":{const r=await runPy(golfCode(q,b.picks),[]);return {picks:b.picks,stdout:r.stdout,error:r.error}}
  case "diverge":{const programs=[];for(const c of b.progs){if(!c.trim())continue;const r=await runPy(c,[]);programs.push({code:c,stdout:r.stdout,error:r.error})}return {programs}}
  case "cover":{const outputs=[],errors=[];for(const v of b.picks){const r=await runPy(q.src,[v]);outputs.push(r.stdout);errors.push(r.error)}return {picks:b.picks,outputs,errors}}}
 return {}}
async function answer(q,S){if(q.kind==="mcq")return {pick:S.pick};try{return await build(q,S)}catch(e){return {error:"Python could not run: "+e.message}}}

/* ---------- after grading: the right answer and the explanation ---------- */
function reveal(q,res,S){S=S||{};q.show=res.show||"";
 q.why=res.correct?(res.ok||res.why||""):[res.why,res.ok].filter((x,i,a)=>x&&a.indexOf(x)===i).join(" ");
 if(q.kind==="mcq"){if(res.detail&&res.detail.right!=null)q.ans=res.detail.right;else if(q.type==="same")q.ans=res.correct?S.pick:(S.pick===0?1:0)}}

/* ---------- boot: session check, then the game ---------- */
/* index.html starts /api/boot and the saved-mascot read before any script loads; use those when they are there */
async function bootData(){const p=window.__kbcBoot;window.__kbcBoot=null;let r=null;try{r=p&&await p}catch(e){}
 if(!r)return api("GET","/api/boot");
 if(r.status===401){location.href="/login";throw Object.assign(new Error("Please log in."),{status:401})}
 let j=null;try{j=await r.json()}catch(e){}
 if(!r.ok)throw Object.assign(new Error((j&&j.error)||"Request failed ("+r.status+")"),{status:r.status});return j}
async function boot(){try{const both=await Promise.all([bootData(),window.__kbcM3D||{}]);window.KBC_BOOT=both[0];window.KBC_M3D=both[1]}catch(e){if(e.status!==401)document.body.insertAdjacentHTML("beforeend",`<p style="padding:24px;color:#fff">Could not load the game: ${esc(e.message)}. <a href="/" style="color:#ffc83d">Try again</a></p>`);return}
 const s=document.createElement("script");s.src="/game.js?v="+encodeURIComponent(window.KBC_VERSION||"1");document.body.appendChild(s)}
let rerenderFn=null;
window.KBCQ={api,adapt,above,render,ready,need,act,input,answer,reveal,runPy,warm,rerender:()=>rerenderFn&&rerenderFn(),onRerender:f=>{rerenderFn=f}};
boot();
})();
