/* Kaun Banega Coder: the intro film, shown once per student on this device, before the game.
   A title card first ("Press start", like a game launcher): the click is the user gesture that lets the film play with
   sound. Then the film runs full screen with a small Skip button (Esc also skips), a progress line and a sound toggle.
   window.KBC_INTRO resolves when the intro is over (or at once when it is not shown), so the game can hold its tour.
   Add ?intro to the address to see it again. */
(function () {
  "use strict";
  var SRC = "/media/intro.mp4";
  var roll = "";
  try { roll = String(localStorage.getItem("kbc-roll") || "").trim().toUpperCase(); } catch (e) {}
  var KEY = "kbc-intro-seen-" + (roll || "device");
  var force = /[?&]intro\b/.test(location.search);
  var seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch (e) {}
  if (seen && !force) { window.KBC_INTRO = Promise.resolve(); return; }

  var finish;
  window.KBC_INTRO = new Promise(function (res) { finish = res; });
  var root = document.documentElement;
  root.classList.add("intro-on");

  var el = document.createElement("div");
  el.id = "kintro";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Kaun Banega Coder intro");
  el.innerHTML =
    '<div class="ki-sky" aria-hidden="true"></div>' +
    '<section class="ki-card">' +
      '<div class="ki-emb" aria-hidden="true"><i class="ki-ring"></i><i class="ki-ring b"></i><span class="ki-coin">{ }</span></div>' +
      '<p class="ki-kicker">Kaun Banega</p>' +
      '<h1 class="ki-title">Coder</h1>' +
      '<p class="ki-tag">The Python quiz show · Your seat is waiting</p>' +
      '<button class="ki-start" type="button" data-ki="play"><span class="ki-tri" aria-hidden="true"></span><span>Play the intro</span></button>' +
      '<p class="ki-meta"><span class="ki-snd"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span> 1 min 27 s · sound on <span class="ki-k"><span class="ki-dot">·</span> <kbd>Enter</kbd> to play</span></p>' +
      '<button class="ki-skiplink" type="button" data-ki="skip">Skip intro</button>' +
    '</section>' +
    '<div class="ki-stage" hidden>' +
      '<video class="ki-video" playsinline preload="none"></video>' +
      '<div class="ki-shade" aria-hidden="true"></div><p class="ki-rot" aria-hidden="true">Turn your phone sideways for a bigger picture</p>' +
      '<button class="ki-mute" type="button" data-ki="mute" aria-label="Mute" title="Sound (M)"><span class="on"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span class="off"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></button>' +
      '<button class="ki-skip" type="button" data-ki="skip" aria-label="Skip the intro"><span>Skip</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l8 7-8 7zM14 5l8 7-8 7z" fill="currentColor"/></svg><kbd>Esc</kbd></button>' +
      '<div class="ki-bar" aria-hidden="true"><i></i></div>' +
    '</div>';

  var video, bar, stage, card, closing = false, raf = 0;
  function mount() {
    document.body.appendChild(el);
    video = el.querySelector(".ki-video");
    bar = el.querySelector(".ki-bar i");
    stage = el.querySelector(".ki-stage");
    card = el.querySelector(".ki-card");
    // start downloading at once, so the film is ready when the button is pressed
    video.preload = "auto";
    video.src = SRC;
    video.addEventListener("ended", function () { close(true); });
    video.addEventListener("error", function () { close(false); });
    el.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey, true);
    stars();
    setTimeout(function () { var b = el.querySelector(".ki-start"); if (b) b.focus({ preventScroll: true }); }, 50);
  }
  function stars() {
    var h = "", sky = el.querySelector(".ki-sky");
    for (var i = 0; i < 110; i++) {
      var z = (Math.random() < 0.85 ? 1 + Math.random() * 1.3 : 2 + Math.random() * 1.4).toFixed(1);
      h += '<i style="left:' + (Math.random() * 100).toFixed(2) + "%;top:" + (Math.random() * 100).toFixed(2) + "%;width:" + z + "px;height:" + z +
        "px;opacity:" + (0.25 + Math.random() * 0.6).toFixed(2) + ";animation-delay:" + (Math.random() * 4).toFixed(1) + 's"></i>';
    }
    sky.innerHTML = h;
  }
  function play() {
    if (closing || !stage.hidden) return;
    el.classList.add("playing");
    stage.hidden = false;
    var p = video.play();
    if (p && p.catch) p.catch(function () { video.muted = true; el.classList.add("muted"); video.play().catch(function () { close(false); }); });
    tick();
    // the controls fade out while the film plays and come back when the pointer moves
    wake();
  }
  var idleT = 0;
  function wake() { el.classList.add("awake"); clearTimeout(idleT); idleT = setTimeout(function () { el.classList.remove("awake"); }, 2600); }
  function tick() {
    if (video.duration) bar.style.transform = "scaleX(" + (video.currentTime / video.duration).toFixed(4) + ")";
    raf = requestAnimationFrame(tick);
  }
  function onClick(e) {
    var b = e.target.closest("[data-ki]");
    if (!b) { if (!stage.hidden) wake(); return; }
    var k = b.getAttribute("data-ki");
    if (k === "play") play();
    else if (k === "skip") close(false);
    else if (k === "mute") { video.muted = !video.muted; el.classList.toggle("muted", video.muted); wake(); }
  }
  function onKey(e) {
    if (closing) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
    else if ((e.key === "Enter" || e.key === " ") && stage.hidden) { e.preventDefault(); e.stopPropagation(); play(); }
    else if ((e.key === "m" || e.key === "M") && !stage.hidden) { video.muted = !video.muted; el.classList.toggle("muted", video.muted); wake(); }
    else if (!stage.hidden) wake();
  }
  el.addEventListener("pointermove", function () { if (stage && !stage.hidden) wake(); });
  function close(ended) {
    if (closing) return;
    closing = true;
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    document.removeEventListener("keydown", onKey, true);
    el.classList.add(ended ? "out-end" : "out");
    root.classList.remove("intro-on");
    var v = video;
    setTimeout(function () {
      cancelAnimationFrame(raf);
      try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {}
      el.remove();
      if (force && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
      finish();
    }, ended ? 900 : 520);
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
