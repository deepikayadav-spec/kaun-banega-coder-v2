/* Kaun Banega Coder: the intro, shown once per student on this device, before the game.
   The intro is built in HTML (not a video): a 1280×720 stage scaled to the screen, with the same storyboard, timings
   and soundtrack as KBC_Intro_Video.mp4. Text stays sharp at any size and the whole thing weighs about 2 MB.
   - It starts playing at once, like the film. Browsers only allow sound after a click, so if sound is blocked the
     picture runs on a wall clock with a "Tap for sound" button; a tap (anywhere) brings the soundtrack in at the
     same moment. From then on the soundtrack is the clock, so picture and sound never drift.
   - Like the film it never stands still: the camera drifts and pushes in, the background moves, a cursor works the
     game screens with clicks, Pixel talks while typing, and chapters change with a light sweep.
   - Small Skip (Esc), sound toggle (M), progress line. Ends on "Let's play" (clickable) and fades into the game.
   window.KBC_INTRO resolves when the intro is over (or at once when it is not shown), so the game can hold its tour.
   Add ?intro to the address to see it again. */
(function () {
  "use strict";
  var AUDIO = "/media/intro-audio.m4a", PIX = "/media/pixel/", END = 87.4;
  var roll = "";
  try { roll = String(localStorage.getItem("kbc-roll") || "").trim().toUpperCase(); } catch (e) {}
  var KEY = "kbc-intro-seen-" + (roll || "device");
  var force = /[?&]intro\b/.test(location.search);
  var seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch (e) {}
  if (seen && !force) { window.KBC_INTRO = Promise.resolve(); return; }
  // a moving film with music must not start by itself for someone who has asked for less motion; "Watch intro" still plays it
  var calm = false;
  try { calm = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  if (calm && !force) { window.KBC_INTRO = Promise.resolve(); return; }

  var finish;
  window.KBC_INTRO = new Promise(function (res) { finish = res; });
  var root = document.documentElement;
  root.classList.add("intro-on");

  /* ---------------- storyboard (seconds, matched to the film and its soundtrack) ---------------- */
  var LINES = [
    { text: "Somewhere in the Python galaxy…", a: 0.6, b: 2.2 },
    { text: "a little robot named Pixel was waiting…", a: 2.4, b: 4.3, cls: "cy" },
    { text: "for a new coder to take the hot seat.", a: 4.4, b: 6.0 }
  ];
  // what Pixel says in the box at the bottom: [starts typing, done typing, text]
  var SAY = [
    [9.2, 14.2, "Hey! I'm Pixel. Welcome to Kaun Banega Coder, the Python quiz show where every right answer moves you up the board."],
    [19.0, 23.6, "This is your home base. Your GRIT Computational Thinking readiness grows with every level you clear."],
    [26.8, 30.0, "Three steps. Win Fastest Finger, take the hot seat, and clear your path."],
    [33.0, 35.1, "Type your name, and press Play Fastest Finger."],
    [38.6, 42.2, "Fastest Finger is a quick round against the clock. Solve it to win the hot seat."],
    [45.0, 48.3, "In the hot seat, read the code, pick your answer, and lock it in."],
    [51.0, 59.0, "Watch your energy. A wrong answer drains it. Three right in a row charges it back. And every answer comes with the working, step by step."],
    [61.8, 66.8, "My path is your journey from planet to planet. Clear a level to unlock the next one, and win the next prize."],
    [70.0, 72.0, "Tap a planet to see the concept behind it."],
    [75.0, 79.0, "Climb into the Hall of Fame, and tell us what you think with the feedback button."],
    [82.0, 84.8, "Your seat is waiting. Let's play Kaun Banega Coder!"]
  ];
  var CH = [
    { a: 18.3, b: 25.9, kick: "Home base", bar: "Home", title: "Your <em>home</em><br>base", pose: "pointq", scr: "home" },
    { a: 26.0, b: 32.2, kick: "How it works", bar: "Steps", title: "Three <em>simple</em><br>steps", pose: "pointq", scr: "home" },
    { a: 32.4, b: 37.9, kick: "Get started", bar: "Start", title: "Type your<br>name. <em>Play.</em>", pose: "pointq", scr: "home" },
    { a: 38.0, b: 44.3, kick: "Fastest Finger", bar: "Fastest Finger", title: "Beat the<br><em>clock</em>", pose: "dance", scr: "fff" },
    { a: 44.5, b: 50.3, kick: "Hot seat", bar: "Hot seat", title: "Read. Pick.<br><em>Lock it in.</em>", pose: "pointq", scr: "seat" },
    { a: 50.5, b: 60.8, kick: "Energy", bar: "Energy", title: "Watch your<br><em>energy</em>", pose: "pointa", scr: "energy" },
    { a: 61.0, b: 69.3, kick: "My path", bar: "My path", title: "Planet to<br><em>planet</em>", pose: "dance", scr: "path" },
    { a: 69.5, b: 74.3, kick: "Concepts", bar: "Concepts", title: "Tap a<br><em>planet</em>", pose: "pointq", scr: "path" },
    { a: 74.5, b: 80.4, kick: "Hall of Fame", bar: "Hall of Fame", title: "Climb.<br><em>Tell us.</em>", pose: "trophy", scr: "hof" }
  ];
  // where the cursor goes in each chapter: [seconds into the chapter, x, y, 1 = click]; it eases between points
  var PTR = [
    [[0, 820, 470], [1.9, 640, 380], [3.0, 400, 214], [5.6, 430, 230], [7.0, 820, 470]],
    [[0, 820, 470], [1.4, 650, 300], [2.6, 220, 160], [3.3, 390, 160], [4.0, 560, 160], [5.2, 600, 330]],
    [[0, 760, 420], [0.9, 260, 252, 1], [2.4, 300, 300], [3.45, 588, 252, 1], [5.0, 600, 262]],
    [[0, 780, 420], [0.75, 230, 255, 1], [1.47, 230, 255, 1], [2.19, 560, 255, 1], [2.91, 230, 255, 1], [3.63, 230, 255, 1], [4.6, 640, 195], [5.3, 650, 196, 1], [6.3, 820, 470]],
    [[0, 760, 420], [1.6, 600, 303, 1], [2.85, 450, 409, 1], [4.4, 560, 410], [5.8, 820, 470]],
    [[0, 520, 470], [0.4, 600, 303, 1], [1.5, 560, 120], [5.6, 420, 300], [8.5, 600, 280], [10.3, 820, 470]],
    [[0, 820, 470], [2.0, 330, 236], [4.0, 360, 250], [6.0, 520, 330], [8.3, 820, 470]],
    [[0, 520, 330], [0.55, 302, 226, 1], [2.4, 520, 470], [3.6, 598, 470, 1], [4.8, 820, 470]],
    [[0, 820, 470], [2.6, 600, 200], [3.15, 240, 108, 1], [3.32, 284, 108, 1], [3.49, 328, 108, 1], [3.66, 372, 108, 1], [3.83, 416, 108, 1], [4.6, 393, 376], [5.2, 393, 376, 1], [5.9, 820, 470]]
  ];
  var TF = [["'a' in 'cat'", 1], ["len('code') == 4", 1], ["3 * '2' == 6", 0], ["10 // 3 == 3", 1], ["'Py' + 'thon' == 'Python'", 1]];

  /* ---------------- markup ---------------- */
  var spk = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/>';
  var ON = spk + '<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var OFF = spk + '<path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var coin = function (cls) { return '<div class="kx-emb ' + (cls || "") + '" aria-hidden="true"><i class="kx-ring"></i><i class="kx-ring b"></i><span class="kx-coin">{ }</span></div>'; };
  var pixel = function (pose, cls) { return '<div class="kx-pix ' + (cls || "") + '" data-pose="' + pose + '"><span class="kx-pixs"><span class="kx-strip" style="background-image:url(' + PIX + pose + '.webp?v=3)"></span></span><i class="kx-shadow"></i></div>'; };
  var win = function (inner) { return '<div class="kw"><div class="kw-bar"><i></i><i></i><i></i><span>kaun-banega-coder</span></div><div class="kw-body">' + inner + '<i class="kx-click"></i><i class="kx-ptr"></i></div></div>'; };
  var code = function (lines) { return '<div class="kc">' + lines.map(function (l, i) { return "<div><b>" + (i + 1) + "</b>" + l + "</div>"; }).join("") + "</div>"; };
  var py = function (s) { return s.replace(/('[^']*')/g, "\u0001$1\u0002").replace(/(\d+)/g, '<span class="n">$1</span>').replace(/\u0001/g, '<span class="s">').replace(/\u0002/g, "</span>").replace(/\b(len|print)\b/g, '<span class="f">$1</span>'); };

  var homeScr =
    '<div class="sc sc-home"><div class="hm-in">' +
      '<p class="hm-kick">Kaun Banega</p><p class="hm-title">Coder</p>' +
      '<div class="hm-grit"><span class="hm-ring">0<small>%</small></span><span><small>Your GRIT</small><b>Computational Thinking readiness</b></span></div>' +
      '<div class="hm-steps"><span><i>1</i>Win Fastest Finger</span><span><i>2</i>Take the hot seat</span><span><i>3</i>Clear your path</span></div>' +
      '<div class="hm-join"><span class="hm-name"><span class="hm-typed"></span><span class="hm-ph">Your name</span><i class="hm-caret"></i></span><span class="hm-play">Play Fastest Finger →</span></div>' +
      '<i class="kx-cursor"></i>' +
    "</div></div>";
  var fffScr =
    '<div class="sc sc-fff"><div class="ff-head"><div><span class="chip">Fastest Finger First</span><h4>True / False Blitz</h4><p>5 Python statements. Tap True or False for each. Get all 5 right. <b>Win it → take the hot seat.</b></p></div>' +
      '<span class="ff-clock"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="arc" cx="22" cy="22" r="19"/></svg><b>16</b></span></div>' +
      '<div class="ff-q"><div class="ff-top"><small>Is this true?</small><span class="ff-dots"><i></i><i></i><i></i><i></i><i></i></span><b class="ff-n">1/5</b></div>' +
        '<div class="kc ff-code"><div><b>1</b><span class="ff-stmt"></span></div></div>' +
        '<div class="ff-btns"><span class="t">True</span><span class="f">False</span></div><small class="ff-keys">Keys: T / F</small></div>' +
      '<div class="ff-done"><b>Done in 12.3 seconds!</b><span>You beat the clock.</span><span class="btn-g">Take the hot seat →</span></div>' +
      '<p class="quote">range(1, 10) stops at 9. Like your motivation on Monday, it never quite reaches the end.</p>' +
    "</div>";
  var seatScr = function (wrong) {
    return '<div class="sc sc-seat' + (wrong ? " sc-energy" : "") + '">' +
      '<div class="st-hud"><span class="st-en"><i class="bolt">⚡</i><span class="st-bar"><i></i></span><b class="st-pct">100%</b><em class="st-drop">−20%</em><small>Energy</small></span>' +
        '<span class="st-clock"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="arc" cx="22" cy="22" r="19"/></svg><b>' + (wrong ? "57" : "60") + "</b></span>" +
        '<span class="st-stake"><small>Playing for</small><b>10</b></span></div>' +
      '<div class="st-card"><span class="chip">Question ' + (wrong ? 2 : 1) + " · for 10</span><h4>What does this print?</h4>" +
        code(wrong ? ["x = <span class=n>8</span>", "y = <span class=n>3</span>", "x = y", "y = x", "<span class=f>print</span>(x, y)"] : ["n = <span class=n>2</span>", "n = n + <span class=n>5</span>", "n = n * <span class=n>2</span>", "<span class=f>print</span>(n)"]) + "</div>" +
      '<div class="st-opts">' + (wrong
        ? '<span data-o="a"><i>A</i>8 3</span><span data-o="b"><i>B</i>3 8</span><span data-o="c"><i>C</i>8 8</span><span data-o="d"><i>D</i>3 3</span>'
        : '<span data-o="a"><i>A</i>12</span><span data-o="b"><i>B</i>14</span><span data-o="c"><i>C</i>4</span><span data-o="d"><i>D</i>7</span>') + "</div>" +
      '<div class="st-act"><span class="st-final">Final answer?</span><span class="btn-g st-lock">Lock answer</span><span class="btn-o st-change">Change</span>' +
        '<span class="st-ok">Correct answer!</span><span class="st-no">Not this time</span><span class="btn-g st-next">' + (wrong ? "Try a new variant →" : "Next question →") + "</span></div>" +
      (wrong ? '<div class="st-work"><h5>Here\'s the working, step by step</h5><div class="st-ans"><span class="ok"><small>Correct answer</small>3 3</span><span class="no"><small>You picked</small>3 8</span></div>' +
        '<small class="st-rc">Read the code</small><ol><li><code>x = 8</code>Store 8 in x.</li><li><code>y = 3</code>Store 3 in y.</li><li><code>x = y</code>Store y in x.</li><li><code>y = x</code>Store x in y.</li></ol></div>' : "") +
      '<i class="kx-cursor"></i>' +
    "</div>";
  };
  var pathScr =
    '<div class="sc sc-path"><svg class="pa-road" viewBox="0 0 780 440" preserveAspectRatio="none"><path class="dim" d="M300 230 C 250 200, 180 175, 130 150 M 130 150 C 260 110, 330 70, 420 62 S 640 30, 780 6"/><path class="lit" d="M300 232 C 430 252, 560 250, 690 318 S 760 420, 770 450"/></svg>' +
      '<span class="pa-node n1"><b>1</b></span><small class="pa-lbl l1">Variables &amp; assignment</small>' +
      '<span class="pa-node n2 lock"><b>2</b></span><small class="pa-lbl l2">Data types &amp; conversion</small>' +
      '<span class="pa-node n3 lock"><b>3</b></span><small class="pa-lbl l3">Arithmetic operators</small>' +
      '<span class="pa-planet"></span><span class="pa-ck">C1 <b>Basics</b></span><span class="pa-prize">10</span>' +
      '<span class="pa-coin c1">{}</span><span class="pa-coin c2">{}</span><i class="pa-gem g1"></i><i class="pa-gem g2"></i>' +
      pixel("pointup", "pa-you") + '<span class="pa-youtag">You</span>' +
      '<div class="pa-sheet"><small>Concept</small><h4>Variables &amp; assignment</h4><p>A variable is a label on a value. x = y copies the value y has right now; later changes to y don\'t reach x.</p>' +
        '<p class="w"><b>Watch out:</b> Reading x = y as "x and y are now linked". They aren\'t: each line uses the values as they are at that moment.</p><span class="pa-pbar"><i></i></span><small class="m">1% of this level done</small>' +
        '<div class="pa-sheet-act"><span class="btn-g">Play this level →</span><span class="btn-o">Close</span></div></div>' +
    "</div>";
  var hofScr =
    '<div class="sc sc-hof"><div class="hf-main"><div class="hf-head">' + pixel("trophy", "hf-pix") + '<div><h4>Hall of Fame</h4><p>Across India and by campus · ranked by prize money</p></div></div>' +
      '<div class="hf-pod"><div class="p2"><span class="av">?</span><small>Your spot</small><b>2</b></div><div class="p1"><span class="av">A</span><small>Aarav</small><b>1</b></div><div class="p3"><span class="av">?</span><small>Your spot</small><b>3</b></div></div>' +
      '<div class="hf-row"><i>1</i><b>Aarav</b><em>you</em><small>50% right</small></div></div>' +
      '<div class="hf-fb"><h4>How is KBC so far?</h4><p>Please share your feedback to continue.</p><small>Your rating <i>*</i></small>' +
        '<div class="hf-stars"><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span><em>Loved it!</em></div>' +
        '<small>Tell us more <i>*</i></small><div class="hf-txt"><span class="hf-typed"></span><i class="hm-caret"></i></div><small class="m">Ready to send.</small><span class="btn-g wide">Send feedback</span></div>' +
    "</div>";

  var el = document.createElement("div");
  el.id = "kintro";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Kaun Banega Coder intro");
  el.innerHTML =
    '<div class="ki-sky" aria-hidden="true"></div>' +
    '<div class="ki-show" hidden>' +
      '<div class="kx-fx" aria-hidden="true"><i class="kx-glow g1"></i><i class="kx-glow g2"></i><i class="kx-beam b1"></i><i class="kx-beam b2"></i><i class="kx-beam b3"></i>' +
        ["{ }", "print()", "for i in", "def", "==", "[ ]", "True", "</>", "if/else", "range()", "len()", "+="].map(function (w, i) {
          return '<span class="kx-tok" style="left:' + ((i * 37 + 7) % 96) + "%;--d:" + (16 + (i * 7) % 12) + "s;--dl:-" + ((i * 3.3) % 16).toFixed(1) + "s;--fs:" + (13 + (i * 5) % 9) + 'px">' + w.replace(/</g, "&lt;") + "</span>"; }).join("") + "</div>" +
      '<div class="kx-stage" aria-hidden="true">' +
        '<i class="kx-burst"></i><i class="kx-sweep"></i>' +
        '<div class="kx-story">' + LINES.map(function (l, i) { return '<p class="kx-line ' + (l.cls || "") + '" data-l="' + i + '"></p>'; }).join("") + pixel("pointq", "kx-storypix") + "</div>" +
        coin("kx-flycoin") +
        '<div class="kx-brand">' + pixel("dance", "kx-brandpix") +
          '<div class="kx-logo">' + coin("kx-logocoin") + '<p class="kx-kick">Kaun Banega</p><p class="kx-title">Coder</p><p class="kx-tagl">The Python quiz show for first-years</p>' +
          '<div class="kx-chips"><span>Learn Python</span><span>Climb the board</span><span>Get GRIT-ready</span></div></div></div>' +
        '<div class="kx-ch"><div class="kx-head"><p class="kx-kicker"><i class="kx-num">01</i><span class="kx-kt"></span></p><h2 class="kx-h"></h2><i class="kx-ul"></i></div>' +
          '<div class="kx-prog"><span class="kx-pl"></span><span class="kx-segs">' + new Array(11).join("<i></i>") + '</span><b class="kx-pn">01/10</b></div>' +
          '<div class="kx-chpix">' + ["pointq", "dance", "pointa", "trophy"].map(function (p) { return pixel(p, "kx-big"); }).join("") + "</div>" +
          '<div class="kx-win">' + win(homeScr + fffScr + seatScr(false) + seatScr(true) + pathScr + hofScr) + "</div></div>" +
        '<div class="kx-dlg"><span class="kx-av"><span style="background-image:url(' + PIX + 'pointq.webp?v=3)"></span></span><div><small>Pixel</small><p><span class="kx-say"></span><i class="kx-more">⌄</i></p></div></div>' +
      "</div>" +
      '<button type="button" class="kx-letsplay" data-ki="done">Let\'s play →</button>' +
      '<p class="ki-rot">Turn your phone sideways for a bigger picture</p>' +
      '<button class="ki-sound" type="button" data-ki="sound">' + ON + '<span>Tap for sound</span></button>' +
      '<button class="ki-mute" type="button" data-ki="mute" aria-label="Mute" title="Sound (M)"><span class="on">' + ON + '</span><span class="off">' + OFF + "</span></button>" +
      '<button class="ki-skip" type="button" data-ki="skip" aria-label="Skip the intro"><span>Skip</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l8 7-8 7zM14 5l8 7-8 7z" fill="currentColor"/></svg><kbd>Esc</kbd></button>' +
      '<div class="ki-bar" aria-hidden="true"><i></i></div>' +
    "</div>";

  /* ---------------- engine ---------------- */
  var $ = function (s) { return el.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(el.querySelectorAll(s)); };
  var audio, show, bar, closing = false, raf = 0, started = false, wall0 = 0, aud = false;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var typed = function (s, a, b, t) { return t <= a ? "" : t >= b ? s : s.slice(0, Math.round(s.length * (t - a) / (b - a))); };
  // change the page only when a value changes (the frame loop runs 60 times a second)
  var memo = new Map();
  function put(node, key, val) {
    if (!node) return;
    var k = memo.get(node); if (!k) { k = {}; memo.set(node, k); }
    if (k[key] === val) return; k[key] = val;
    if (key === "text") node.textContent = val; else if (key === "html") node.innerHTML = val;
    else if (key.charAt(0) === "-") node.style.setProperty(key, val);
    else if (typeof val === "number" && val) { node.classList.remove(key); void node.offsetWidth; node.classList.add(key); }
    else node.classList.toggle(key, !!val);
  }

  function mount() {
    document.body.appendChild(el);
    show = $(".ki-show"); bar = $(".ki-bar i");
    audio = new Audio(); audio.preload = "auto"; audio.src = AUDIO;
    audio.addEventListener("ended", function () { close(true); });
    el.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey, true);
    el.addEventListener("pointermove", function () { if (started) wake(); });
    addEventListener("resize", fit);
    stars(); fit();
    play();
  }
  function fit() { el.style.setProperty("--s", Math.min(innerWidth / 1280, innerHeight / 720).toFixed(4)); }
  function stars() {
    var h = "";
    for (var i = 0; i < 120; i++) {
      var z = (Math.random() < 0.85 ? 1 + Math.random() * 1.3 : 2 + Math.random() * 1.4).toFixed(1);
      h += '<i style="left:' + (Math.random() * 100).toFixed(2) + "%;top:" + (Math.random() * 100).toFixed(2) + "%;width:" + z + "px;height:" + z +
        "px;opacity:" + (0.25 + Math.random() * 0.6).toFixed(2) + ";animation-delay:" + (Math.random() * 4).toFixed(1) + 's"></i>';
    }
    $(".ki-sky").innerHTML = h;
  }
  // the clock: the wall clock until the soundtrack plays, then the soundtrack
  function now() { return aud ? audio.currentTime : (performance.now() - wall0) / 1000; }
  function play() {
    if (closing || started) return;
    started = true;
    wall0 = performance.now();
    el.classList.add("playing");
    show.hidden = false;
    sound(true);
    wake(); frame();
  }
  // start the soundtrack where the picture is; if the browser blocks it, offer "Tap for sound"
  function sound(first) {
    if (aud || closing) return;
    var at = now(), p;
    try { audio.muted = false; audio.currentTime = at; p = audio.play(); } catch (e) { p = null; }
    var ok = function () { if (closing) return; try { if (Math.abs(audio.currentTime - now()) > 0.25) audio.currentTime = now(); } catch (e) {} aud = true; el.classList.remove("nosnd", "muted"); };
    var no = function () { el.classList.add("nosnd"); };
    if (p && p.then) p.then(ok, no); else no();
    if (first) setTimeout(function () { if (!aud && !closing) no(); }, 1500);
  }
  var idleT = 0;
  function wake() { el.classList.add("awake"); clearTimeout(idleT); idleT = setTimeout(function () { el.classList.remove("awake"); }, 2600); }
  function frame() {
    var t = now();
    draw(t);
    bar.style.transform = "scaleX(" + clamp(t / END, 0, 1).toFixed(4) + ")";
    if (!aud && t >= END) return close(true);
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- drawing: everything on screen is a function of the time t ---------------- */
  var N = {};
  function draw(t) {
    if (!N.story) ["story", "flycoin", "brand", "ch", "dlg", "say", "more", "storypix", "letsplay"].forEach(function (k) {
      N[k] = $({ story: ".kx-story", flycoin: ".kx-flycoin", brand: ".kx-brand", ch: ".kx-ch", dlg: ".kx-dlg", say: ".kx-say", more: ".kx-more", storypix: ".kx-storypix", letsplay: ".kx-letsplay" }[k]); });
    // time for the CSS: the camera, the background and the light drift with it
    el.style.setProperty("--t", t.toFixed(3));
    // story (0 – 7.4 s)
    put(N.story, "on", t < 7.4);
    $$(".kx-line").forEach(function (n, i) { var l = LINES[i]; put(n, "text", typed(l.text, l.a, l.b, t)); });
    put(N.storypix, "on", t > 3.8);
    // the coin flies in, then settles above the logo (7.6 – 9.4 s, and again 80.6 – 82 s)
    put(N.flycoin, "on", (t > 7.6 && t < 9.4) || (t > 80.6 && t < 82.0));
    put(N.flycoin, "settle", (t > 8.6 && t < 9.4) || (t > 81.3 && t < 82.0));
    put($(".kx-burst"), "on", (t > 7.95 && t < 9.0) || (t > 80.95 && t < 82.0));
    // brand: welcome (9.3 – 17.8 s) and finale (81.7 s – end)
    var welcome = t > 9.3 && t < 17.8, finale = t > 81.7;
    put(N.brand, "on", welcome || finale);
    put(N.brand, "out", t > 17.3 && t < 17.8);
    put(N.brand, "pix", (welcome && t > 10.6) || (finale && t > 81.9));
    put(N.brand, "tag", welcome && t > 11.2);
    put(N.brand, "chips", (welcome && t > 11.8) || (finale && t > 82.8));
    put(N.letsplay, "on", finale && t > 83.6);
    // the dialogue box (from 8.9 s)
    put(N.dlg, "on", t > 8.9 && !(t > 17.6 && t < 18.6) && !(t > 80.4 && t < 81.5));
    var line = null;
    for (var i = SAY.length - 1; i >= 0; i--) if (t >= SAY[i][0] - 0.3) { line = SAY[i]; break; }
    put(N.say, "text", line ? typed(line[2], line[0], line[1], t) : "");
    put(N.dlg, "talk", !!line && t > line[0] && t < line[1]);
    put(N.more, "on", !!line && t > line[1] + 0.2);
    // chapters
    var c = -1;
    for (var k = 0; k < CH.length; k++) if (t >= CH[k].a && t < CH[k].b) c = k;
    put(N.ch, "on", c >= 0);
    if (c >= 0) chapter(c, t - CH[c].a, CH[c].b - t);
    // a light sweep at every scene change
    var cut = [7.7, 17.7].concat(CH.map(function (x) { return x.a; }), [80.5]).some(function (x) { return t > x - 0.1 && t < x + 0.7; });
    put($(".kx-sweep"), "on", cut);
  }
  var lastCh = -1;
  function chapter(c, lt, left) {
    var C = CH[c];
    if (c !== lastCh) {
      var prevScr = lastCh >= 0 ? CH[lastCh].scr : null;
      lastCh = c;
      $(".kx-num").textContent = ("0" + (c + 1)).slice(-2);
      $(".kx-kt").textContent = C.kick;
      $(".kx-h").innerHTML = C.title;
      $(".kx-pl").textContent = C.bar;
      $(".kx-pn").textContent = ("0" + (c + 1)).slice(-2) + "/10";
      $$(".kx-segs i").forEach(function (s, i) { s.className = i < c ? "done" : i === c ? "now" : ""; });
      $$(".kx-big").forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-pose") === C.pose); });
      $$(".sc").forEach(function (s) { s.classList.remove("on"); });
      $(C.scr === "energy" ? ".sc-energy" : C.scr === "seat" ? ".sc-seat:not(.sc-energy)" : ".sc-" + C.scr).classList.add("on");
      // replay the entrance; the browser window only slides in when its screen changes
      N.ch.classList.remove("enter", "same"); void N.ch.offsetWidth; N.ch.classList.add("enter"); if (prevScr === C.scr) N.ch.classList.add("same");
    }
    put(N.ch, "leave", left < 0.45);
    // slow camera push on the window through the chapter, and the cursor working the screen
    N.ch.style.setProperty("--kb", clamp(lt / (C.b - C.a), 0, 1).toFixed(4));
    pointer(c, lt);
    put(N.ch, "keepwin", left < 0.45 && c + 1 < CH.length && CH[c + 1].scr === C.scr);
    ({ home: home, fff: fff, seat: seat, energy: energy, path: path, hof: hof })[C.scr](c, lt);
  }
  var ease = function (k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
  function pointer(c, lt) {
    var P = PTR[c], i = 0;
    while (i < P.length - 1 && lt >= P[i + 1][0]) i++;
    var a = P[i], b = P[Math.min(i + 1, P.length - 1)], k = b[0] > a[0] ? ease(clamp((lt - a[0]) / (b[0] - a[0]), 0, 1)) : 1;
    var x = a[1] + (b[1] - a[1]) * k, y = a[2] + (b[2] - a[2]) * k;
    var ptr = N.ptr || (N.ptr = $$(".kx-ptr")), clk = N.clk || (N.clk = $$(".kx-click"));
    var on = $(".sc.on"), body = on && on.parentNode;
    ptr.forEach(function (p) { p.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)"; p.style.opacity = p.parentNode === body ? "1" : "0"; });
    // a click: the cursor dips and a ring opens where it pressed
    var hit = null;
    for (var j = 0; j < P.length; j++) if (P[j][3] && lt >= P[j][0] && lt < P[j][0] + 0.45) hit = P[j];
    ptr.forEach(function (p) { put(p, "down", !!hit && lt - hit[0] < 0.16); });
    clk.forEach(function (r) {
      if (hit && r.parentNode === body) { r.style.left = hit[1] + "px"; r.style.top = hit[2] + "px"; put(r, "on", hit[0] + c * 100); } else put(r, "on", 0);
    });
  }
  function home(c, lt) {
    var s = $(".sc-home");
    // 01: the whole page, then into the GRIT card · 02: the three steps light up · 03: a name is typed, Play is pressed
    put(s, "zoom", c === 0 && lt > 1.6);
    put(s, "grit", c === 0 && lt > 2.4);
    put(s, "down", c >= 1);
    put(s, "steps", c === 1 && lt > 2.8);
    var name = c === 2 ? typed("Aarav", 1.4, 2.2, lt) : "";
    put($(".hm-typed"), "text", name);
    put(s, "named", !!name);
    put(s, "press", c === 2 && lt > 3.5);
    put(s, "pressed", c === 2 && lt > 3.85 && lt < 4.1);
  }
  function fff(c, lt) {
    var s = $(".sc-fff"), done = lt > 4.0, q = clamp(Math.floor((lt - 0.4) / 0.72), 0, 4);
    put($(".ff-stmt"), "html", py(TF[q][0]));
    put($(".ff-n"), "text", (done ? 5 : q + 1) + "/5");
    $$(".ff-dots i").forEach(function (d, i) { put(d, "on", i < q || done); });
    var tap = (lt - 0.4) % 0.72 > 0.48 && !done && lt > 0.4;
    put(s, "tapT", tap && TF[q][1] === 1);
    put(s, "tapF", tap && TF[q][1] === 0);
    var sec = done ? 8 : clamp(Math.ceil(16 - lt * 2), 8, 16);
    put($(".sc-fff .ff-clock b"), "text", String(sec));
    put($(".sc-fff .ff-clock"), "-p", (sec / 20).toFixed(3));
    put(s, "done", done);
  }
  function seat(c, lt) {
    var s = $(".sc-seat:not(.sc-energy)");
    put(s, "pickB", lt > 1.7);
    put(s, "final", lt > 2.2);
    put(s, "press", lt > 2.7);
    put(s, "pressed", lt > 2.95 && lt < 3.2);
    put(s, "right", lt > 3.5);
  }
  function energy(c, lt) {
    var s = $(".sc-energy");
    put(s, "wrong", lt > 0.5);
    put(s, "drain", lt > 1.4);
    put(s.querySelector(".st-pct"), "text", lt > 1.4 ? "80%" : "100%");
    put(s, "zoomE", lt > 1.4 && lt < 5.2);
    put(s, "work", lt > 5.4);
  }
  function path(c, lt) {
    var s = $(".sc-path");
    put(s, "concept", c === 7 && lt > 0.7);
    put(s, "pulse", c === 6 && lt > 1.0);
  }
  function hof(c, lt) {
    var s = $(".sc-hof"), n = clamp(Math.floor((lt - 3.1) / 0.17), 0, 5);
    put(s, "fb", lt > 2.7);
    $$(".hf-stars span").forEach(function (x, i) { put(x, "on", i < n); });
    put(s, "loved", n >= 5);
    put($(".hf-typed"), "text", typed("Loved it!", 4.0, 4.5, lt));
  }

  /* ---------------- controls ---------------- */
  function toggleMute() { if (!aud) return sound(); audio.muted = !audio.muted; el.classList.toggle("muted", audio.muted); wake(); }
  function onClick(e) {
    var b = e.target.closest("[data-ki]");
    if (!b) { if (started) { wake(); sound(); } return; }
    var k = b.getAttribute("data-ki");
    if (k === "sound") sound();
    else if (k === "skip") close(false);
    else if (k === "done") close(true);
    else if (k === "mute") toggleMute();
  }
  function onKey(e) {
    if (closing) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === "m" || e.key === "M") toggleMute();
    else { wake(); sound(); }
  }
  function close(ended) {
    if (closing) return;
    closing = true;
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    document.removeEventListener("keydown", onKey, true);
    removeEventListener("resize", fit);
    el.classList.add(ended ? "out-end" : "out");
    root.classList.remove("intro-on");
    // the music fades instead of cutting off
    var a = audio, v0 = a.volume, t0 = performance.now();
    (function fade() { var k = (performance.now() - t0) / 600; try { a.volume = Math.max(0, v0 * (1 - k)); } catch (e) {} if (k < 1) requestAnimationFrame(fade); })();
    setTimeout(function () {
      cancelAnimationFrame(raf);
      try { a.pause(); a.removeAttribute("src"); a.load(); } catch (e) {}
      el.remove();
      if (force && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
      finish();
    }, ended ? 900 : 560);
  }
  // for screenshot checks: draw the intro as it is at second t, without the soundtrack
  window.__kbcIntroAt = function (t) { closing = closing || false; cancelAnimationFrame(raf); try { audio.pause(); } catch (e) {} aud = false; draw(t); bar.style.transform = "scaleX(" + clamp(t / END, 0, 1) + ")"; };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
