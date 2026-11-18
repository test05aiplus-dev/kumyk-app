(function () {
  "use strict";

  /* ================= хранилище ================= */
  var KEY = "kumyk-app-v1";
  var store = load();

  function blank() {
    return { name: "", xp: 0, lessons: {}, srs: {}, sprintBest: 0, days: [], lastLesson: 1,
             settings: { tts: true, autoCards: true } };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === "object") {
        var b = blank();
        var merged = Object.assign(b, s);
        merged.settings = Object.assign(blank().settings, s.settings || {});
        return merged;
      }
    } catch (e) {}
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function markActive() {
    var t = today();
    if (store.days.indexOf(t) < 0) { store.days.push(t); if (store.days.length > 400) store.days.shift(); }
    save();
  }
  function streak() {
    var n = 0, d = new Date();
    for (;;) {
      var k = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
      if (store.days.indexOf(k) >= 0) { n++; d.setDate(d.getDate() - 1); }
      else if (n === 0 && k === today()) { d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }
  function addXp(n) { store.xp += n; markActive(); }
  function lessonState(id) {
    if (!store.lessons[id]) store.lessons[id] = { steps: {}, best: 0, done: false };
    return store.lessons[id];
  }
  function completeStep(id, step) {
    var s = lessonState(id);
    if (!s.steps[step]) { s.steps[step] = true; addXp(10); }
    store.lastLesson = id;
    save();
  }

  /* ================= данные ================= */
  var LESSONS = window.LESSONS, STAGES = window.STAGES;
  var COURSE_WORDS = [];
  LESSONS.forEach(function (l) {
    l.words.forEach(function (w) { COURSE_WORDS.push({ k: w[0], r: w[1], lesson: l.id }); });
  });
  var DICT = COURSE_WORDS.slice();
  var seen = {};
  DICT.forEach(function (w) { seen[w.k] = 1; });
  window.EXTRA_DICT.forEach(function (w) { if (!seen[w[0]]) { DICT.push({ k: w[0], r: w[1], lesson: 0 }); seen[w[0]] = 1; } });
  DICT.sort(function (a, b) { return a.k.localeCompare(b.k, "ru"); });

  var STEPS = [
    { key: "theory", title: "Теория", sub: "Правила с примерами" },
    { key: "vocab", title: "Экспресс-словарь", sub: "Новые слова урока" },
    { key: "cards", title: "Флешкарточки", sub: "Запоминание с интервальным повтором" },
    { key: "sprint", title: "Спринт", sub: "60 секунд на скорость" },
    { key: "ex", title: "Упражнения", sub: "Окончания и перевод с разбором" },
    { key: "match", title: "Найди пару", sub: "Соедините слово и перевод" },
    { key: "test", title: "Итоговый тест", sub: "80% правильных — урок пройден" }
  ];

  function getLesson(id) { for (var i = 0; i < LESSONS.length; i++) if (LESSONS[i].id === id) return LESSONS[i]; return null; }

  /* ================= утилиты ================= */
  var view = document.getElementById("view");
  var titleEl = document.getElementById("screenTitle");
  var backBtn = document.getElementById("backBtn");
  var timers = [];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(a, n) { return shuffle(a).slice(0, n); }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function clearTimers() { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  /* ================= озвучка ================= */
  // 1) запись носителя из папки audio/ (имя файла = слово, например «алма.mp3»);
  // 2) иначе синтез речи: турецкий голос по транскрипции или русский по кириллице.
  function audioKey(s) {
    return String(s).toLowerCase()
      .replace(/[?!.,«»"“”—–:;()…]/g, " ")
      .replace(/\s+/g, " ").trim().normalize("NFC");
  }
  var AUDIO = {};
  (window.AUDIO_FILES || []).forEach(function (f) {
    AUDIO[audioKey(f.replace(/\.[^.]+$/, ""))] = f;
  });
  var AUDIO_COUNT = Object.keys(AUDIO).length;

  var TR = { "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ж": "c", "з": "z", "и": "i", "й": "y",
    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ç", "ш": "ş", "щ": "şç", "ъ": "", "ы": "ı", "ь": "", "э": "e" };
  var VOWELS = "аэыоуеиёюя";
  function translit(s) {
    s = String(s).toLowerCase();
    var out = "", prev = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i], two = c + (s[i + 1] || "");
      var dg = { "къ": "k", "гъ": "g", "гь": "h", "нг": "ng", "оь": "ö", "уь": "ü" }[two];
      if (dg !== undefined) { out += dg; i++; prev = two === "оь" || two === "уь" ? "о" : "к"; continue; }
      var open = !prev || !/[а-яё]/.test(prev) || VOWELS.indexOf(prev) >= 0 || prev === "ъ" || prev === "ь";
      if (c === "ё") out += open ? "yo" : "ö";
      else if (c === "ю") out += open ? "yu" : "ü";
      else if (c === "е") out += open ? "ye" : "e";
      else if (c === "я") out += "ya";
      else out += TR[c] !== undefined ? TR[c] : c;
      prev = c;
    }
    return out;
  }

  var player = null;
  function nativeTts() { return window.KumykNative && typeof window.KumykNative.speak === "function"; }
  function ttsEngine() {
    if (nativeTts()) { try { return window.KumykNative.engine(); } catch (e) { return "none"; } }
    if ("speechSynthesis" in window) return "web";
    return "none";
  }
  function stopSpeech() {
    if (player) { try { player.pause(); } catch (e) {} player = null; }
    if (nativeTts()) { try { window.KumykNative.stop(); } catch (e) {} }
    else if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
  }
  var pendingTts = {}, uttSeq = 0;
  // Android сообщает об окончании фразы через этот вызов
  window.__ttsDone = function (id) {
    var cb = pendingTts[id];
    delete pendingTts[id];
    if (cb) cb();
  };
  function speakTts(text, opts) {
    opts = opts || {};
    if (!store.settings.tts) return false;
    var clean = audioKey(text);
    if (nativeTts()) {
      try {
        var e = window.KumykNative.engine();
        if (e !== "tr" && e !== "ru") return false;
        if (typeof window.KumykNative.speakEx === "function") {
          var id = "u" + (++uttSeq);
          if (opts.onend) pendingTts[id] = opts.onend;
          window.KumykNative.speakEx(clean, translit(clean), opts.pitch || 1, id);
        } else {
          window.KumykNative.speak(clean, translit(clean));
        }
        return true;
      } catch (err) { return false; }
    }
    if ("speechSynthesis" in window) {
      var voices = speechSynthesis.getVoices();
      var tr = voices.filter(function (v) { return /^tr/i.test(v.lang); })[0];
      var ru = voices.filter(function (v) { return /^ru/i.test(v.lang); })[0];
      var u = new SpeechSynthesisUtterance(tr ? translit(clean) : clean);
      if (tr) { u.voice = tr; u.lang = tr.lang; } else if (ru) { u.voice = ru; u.lang = ru.lang; } else { u.lang = "ru-RU"; }
      u.rate = 0.85;
      u.pitch = opts.pitch || 1;
      if (opts.onend) { u.onend = opts.onend; u.onerror = opts.onend; }
      speechSynthesis.speak(u);
      return true;
    }
    return false;
  }
  // Произносит текст. Возвращает true, если звук запущен.
  function say(text, opts) {
    opts = opts || {};
    stopSpeech();
    var f = AUDIO[audioKey(text)];
    if (f) {
      var pl = player = new Audio("audio/" + encodeURIComponent(f));
      pl.onended = function () { if (opts.onend) opts.onend(); };
      var pr = pl.play();
      if (pr && pr.catch) pr.catch(function () {
        if (!speakTts(text, opts) && opts.onend) opts.onend();
      });
      return true;
    }
    if (speakTts(text, opts)) return true;
    if (!store.settings.tts && !opts.quiet) toast("Синтез речи выключен в профиле");
    return false;
  }

  /* Проигрывание подряд: диалог целиком или все пословицы */
  var seq = null;
  function stopSeq() {
    if (!seq) return;
    var s0 = seq; seq = null;
    clearTimeout(s0.watch); clearTimeout(s0.gap);
    if (s0.hooks.end) s0.hooks.end(false);
  }
  function playSeq(items, hooks) {
    stopSeq();
    stopSpeech();
    var me = seq = { hooks: hooks || {}, watch: 0, gap: 0 };
    var i = 0;
    function next() {
      if (seq !== me) return;
      if (i >= items.length) { seq = null; if (me.hooks.end) me.hooks.end(true); return; }
      var it = items[i++];
      if (me.hooks.step) me.hooks.step(it);
      var done = false;
      function fin() {
        if (done || seq !== me) return;
        done = true;
        clearTimeout(me.watch);
        me.gap = setTimeout(next, 450);
      }
      // страховка, если движок речи не сообщит об окончании
      me.watch = setTimeout(fin, Math.max(3000, it.text.length * 170) + 1500);
      if (!say(it.text, { pitch: it.pitch, onend: fin, quiet: true })) {
        clearTimeout(me.watch);
        me.watch = setTimeout(fin, 1200);
      }
    }
    next();
  }
  function canSay(text) { return !!AUDIO[audioKey(text)] || store.settings.tts; }
  var SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>';
  function sayBtn(text, extra) {
    return '<button class="say' + (extra ? " " + extra : "") + '" data-say="' + esc(text) + '" aria-label="Произнести «' + esc(text) + '»">' + SPEAKER + '</button>';
  }
  // Перехватываем нажатия на всё с data-say раньше остальных обработчиков
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-say]") : null;
    if (!el) return;
    stopSeq();
    if (el.classList.contains("say")) { e.stopPropagation(); e.preventDefault(); }
    say(el.getAttribute("data-say"), { pitch: parseFloat(el.getAttribute("data-pitch")) || 1 });
  }, true);

  function setScreen(title, back, tab) {
    titleEl.textContent = title;
    backBtn.hidden = !back;
    backBtn.onclick = back ? function () {
      if (history.length > 1) history.back(); else location.hash = back;
    } : null;
    var s = streak();
    document.getElementById("streak").textContent = s > 0 ? "🔥 " + s : "";
    document.querySelectorAll(".tabbar a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-tab") === tab);
    });
  }

  /* ================= маршрутизация ================= */
  function route() {
    clearTimers();
    stopSeq();
    stopSpeech();
    var h = location.hash.replace(/^#\/?/, "").split("/");
    var r = h[0] || "home";
    window.scrollTo(0, 0);
    if (r === "home") return home();
    if (r === "lessons") return lessons();
    if (r === "lesson") {
      var l = getLesson(parseInt(h[1], 10));
      if (!l) return lessons();
      var step = h[2];
      if (!step) return lessonMenu(l);
      var fn = { theory: theory, vocab: vocab, cards: cards, sprint: function (x) { sprint(x); }, ex: exercises, match: match, test: test }[step];
      return fn ? fn(l) : lessonMenu(l);
    }
    if (r === "dict") return dict();
    if (r === "sprint") return sprint(null);
    if (r === "dialogs") return dialogs();
    if (r === "profile") return profile();
    home();
  }
  window.addEventListener("hashchange", route);

  /* ================= главная ================= */
  function home() {
    setScreen("Къумукъ тил", null, "home");
    var dayIndex = Math.floor(Date.now() / 86400000) % COURSE_WORDS.length;
    var w = COURSE_WORDS[dayIndex];
    var next = nextLesson();
    var doneCount = LESSONS.filter(function (l) { return lessonState(l.id).done; }).length;
    var ls = lessonState(next.id);
    var stepsDone = Object.keys(ls.steps).length;

    view.innerHTML =
      '<section class="wod">' +
        '<div class="label">Слово дня</div>' +
        '<div class="word-row"><p class="word kum">' + esc(w.k) + '</p>' + sayBtn(w.k, "light") + '</div>' +
        '<div class="tr hidden" id="wodTr">' + esc(w.r) + '</div>' +
        '<button id="wodBtn">Показать перевод</button>' +
      '</section>' +
      '<section class="continue">' +
        '<div class="meta">' + (stepsDone ? "Продолжить" : "Следующий") + ' урок ' + next.id + ' из ' + LESSONS.length + '</div>' +
        '<h3>' + esc(next.title) + '</h3>' +
        '<div class="progress"><i style="width:' + Math.round(stepsDone / STEPS.length * 100) + '%"></i></div>' +
        '<a class="btn block" href="#/lesson/' + next.id + '">' + (stepsDone ? "Продолжить урок" : "Начать урок") + '</a>' +
      '</section>' +
      '<section class="facts">' +
        '<div><b>' + LESSONS.length + '</b><span>' + plural(LESSONS.length, "урок", "урока", "уроков") + '</span></div>' +
        '<div><b>' + COURSE_WORDS.length + '</b><span>слов курса</span></div>' +
        '<div><b>' + doneCount + '</b><span>' + plural(doneCount, "пройден", "пройдено", "пройдено") + '</span></div>' +
        '<div><b>' + store.xp + '</b><span>очков</span></div>' +
      '</section>' +
      '<h2>Практика</h2>' +
      '<nav class="links">' +
        link("#/sprint", "⚡", "Спринт", "Слова из всех уроков на время") +
        link("#/dict", "📖", "Словарь", DICT.length + " слов, два направления") +
        link("#/dialogs", "💬", "Диалоги и пословицы", "Живая речь с переводом") +
        link("#/lessons", "🗺️", "Программа курса", STAGES.length + " " + plural(STAGES.length, "этап", "этапа", "этапов") + " от алфавита до речи") +
      '</nav>';

    document.getElementById("wodBtn").onclick = function () {
      var tr = document.getElementById("wodTr");
      var hidden = tr.classList.toggle("hidden");
      this.textContent = hidden ? "Показать перевод" : "Скрыть перевод";
    };
  }
  function link(href, ic, t, s) {
    return '<a href="' + href + '"><span class="ic" aria-hidden="true">' + ic + '</span><span><b>' + t + '</b><small>' + s + '</small></span></a>';
  }
  function nextLesson() {
    var last = getLesson(store.lastLesson) || LESSONS[0];
    if (!lessonState(last.id).done) return last;
    for (var i = 0; i < LESSONS.length; i++) if (!lessonState(LESSONS[i].id).done) return LESSONS[i];
    return last;
  }

  /* ================= список уроков ================= */
  function lessons() {
    setScreen("Уроки", null, "lessons");
    var html = "";
    STAGES.forEach(function (st) {
      var ls = LESSONS.filter(function (l) { return l.stage === st.id; });
      if (!ls.length) return;
      html += '<section class="stage"><div class="stage-head"><h2>' + esc(st.title) + '</h2></div>' +
        '<div class="stage-note">' + esc(st.note) + '</div>';
      ls.forEach(function (l) {
        var s = lessonState(l.id);
        var pips = STEPS.map(function (x) { return '<i class="' + (s.steps[x.key] ? "on" : "") + '"></i>'; }).join("");
        html += '<a class="lesson-item' + (s.done ? " done" : "") + '" href="#/lesson/' + l.id + '">' +
          '<span class="lesson-num">' + (s.done ? "✓" : l.id) + '</span>' +
          '<span class="t"><b>' + esc(l.title) + '</b><small>' + esc(l.goal) + '</small><span class="pips">' + pips + '</span></span></a>';
      });
      html += "</section>";
    });
    view.innerHTML = html;
  }

  /* ================= меню урока ================= */
  function lessonMenu(l) {
    setScreen("Урок " + l.id, "#/lessons", "lessons");
    store.lastLesson = l.id; save();
    var s = lessonState(l.id);
    var html = '<div class="lesson-hero"><h2>' + esc(l.title) + '</h2><p class="muted">' + esc(l.goal) + '</p>' +
      (s.done ? '<p class="small" style="color:var(--moss);font-weight:600">Урок пройден, лучший результат теста ' + s.best + '%</p>' : '') +
      '</div><ol class="steps">';
    STEPS.forEach(function (x, i) {
      html += '<li><a class="' + (s.steps[x.key] ? "done" : "") + '" href="#/lesson/' + l.id + '/' + x.key + '">' +
        '<span class="n">' + (s.steps[x.key] ? "✓" : i + 1) + '</span>' +
        '<span class="t"><b>' + x.title + '</b><small>' + x.sub + '</small></span></a></li>';
    });
    view.innerHTML = html + "</ol>";
  }
  function nextStepHref(l, key) {
    var i = STEPS.findIndex(function (x) { return x.key === key; });
    return i < STEPS.length - 1 ? "#/lesson/" + l.id + "/" + STEPS[i + 1].key : "#/lesson/" + l.id;
  }
  function finishBar(l, key, label) {
    return '<a class="btn block" id="finish" href="' + nextStepHref(l, key) + '">' + (label || "Дальше: " + STEPS[STEPS.findIndex(function (x) { return x.key === key; }) + 1].title) + '</a>';
  }

  /* ================= теория ================= */
  function theory(l) {
    setScreen("Теория", "#/lesson/" + l.id, "lessons");
    var html = l.theory.map(function (t) {
      return '<section class="theory-block"><h3>' + esc(t.h) + '</h3><p>' + esc(t.p) + '</p>' +
        (t.ex ? '<div class="ex-table">' + t.ex.map(function (e) {
          return '<div><span class="kum ex-say" data-say="' + esc(e[0].split("→").pop().trim()) + '" role="button" tabindex="0">' + esc(e[0]) + '</span><span>' + esc(e[1]) + '</span></div>';
        }).join("") + '</div>' : '') + '</section>';
    }).join("");
    view.innerHTML = html + finishBar(l, "theory");
    document.getElementById("finish").addEventListener("click", function () { completeStep(l.id, "theory"); });
  }

  /* ================= экспресс-словарь ================= */
  function vocab(l) {
    setScreen("Экспресс-словарь", "#/lesson/" + l.id, "lessons");
    var hide = false;
    function draw() {
      view.innerHTML =
        '<div class="vocab-tools"><span class="muted small">' + l.words.length + ' ' + plural(l.words.length, "слово", "слова", "слов") + '</span>' +
        '<button class="switch" id="hideSw" aria-pressed="' + hide + '"><i></i>Проверить себя</button></div>' +
        '<div class="wordlist">' + l.words.map(function (w, i) {
          return '<div class="vrow">' + sayBtn(w[0]) + '<button class="vword" data-i="' + i + '"><span class="kum">' + esc(w[0]) + '</span><span class="ru' + (hide ? " hide" : "") + '">' + esc(w[1]) + '</span></button></div>';
        }).join("") + '</div><div style="height:16px"></div>' + finishBar(l, "vocab");
      document.getElementById("hideSw").onclick = function () { hide = !hide; draw(); };
      view.querySelectorAll(".wordlist .vword").forEach(function (b) {
        b.onclick = function () { b.querySelector(".ru").classList.toggle("hide"); };
      });
      document.getElementById("finish").addEventListener("click", function () { completeStep(l.id, "vocab"); });
    }
    draw();
  }

  /* ================= флешкарточки (интервальное повторение) ================= */
  var BOX_DAYS = [0, 1, 2, 4, 8, 16, 32];
  function srsGet(k) { return store.srs[k] || { box: 0, due: 0 }; }
  function srsAnswer(k, ok) {
    var s = srsGet(k);
    s.box = ok ? Math.min(s.box + 1, BOX_DAYS.length - 1) : 0;
    s.due = Date.now() + BOX_DAYS[s.box] * 86400000;
    store.srs[k] = s; save();
  }
  function cards(l) {
    setScreen("Флешкарточки", "#/lesson/" + l.id, "lessons");
    var now = Date.now();
    var due = l.words.filter(function (w) { return srsGet(w[0]).due <= now; });
    var deck = shuffle(due.length ? due : l.words);
    var reviewAll = !due.length;
    var i = 0, known = 0, total = deck.length;

    function draw() {
      if (i >= deck.length) return done();
      var w = deck[i];
      view.innerHTML =
        (reviewAll && i === 0 ? '<p class="small muted">Все слова урока уже повторены вовремя. Можно пройтись ещё раз.</p>' : '') +
        '<div class="counter"><span>Карточка ' + (i + 1) + ' из ' + total + '</span><span>Помню: ' + known + '</span></div>' +
        '<div class="progress"><i style="width:' + (i / total * 100) + '%"></i></div>' +
        '<div class="card-stage"><div class="flash" id="flash" role="button" tabindex="0" aria-label="Перевернуть карточку">' +
          '<div class="face front">' + sayBtn(w[0], "corner") + '<div class="big kum">' + esc(w[0]) + '</div><div class="hint">Нажмите, чтобы перевернуть</div></div>' +
          '<div class="face back"><div class="big">' + esc(w[1]) + '</div><div class="hint">Помните это слово?</div></div>' +
        '</div></div>' +
        '<div class="row"><button class="btn ghost" id="no">Не помню</button><button class="btn" id="yes">Помню</button></div>';
      var f = document.getElementById("flash");
      if (store.settings.autoCards && canSay(w[0])) timers.push(setTimeout(function () { say(w[0]); }, 250));
      function flip() { f.classList.toggle("flipped"); }
      f.onclick = flip;
      f.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
      document.getElementById("yes").onclick = function () { srsAnswer(w[0], true); known++; addXp(2); i++; draw(); };
      document.getElementById("no").onclick = function () { srsAnswer(w[0], false); deck.push(w); i++; draw(); };
    }
    function done() {
      completeStep(l.id, "cards");
      view.innerHTML = '<div class="result"><div class="big">' + known + '/' + total + '</div>' +
        '<p>Слова, которые вы помните, вернутся через 1, 2, 4, 8 дней — так они переходят в долгую память.</p>' +
        '<div class="stack"><a class="btn block" href="' + nextStepHref(l, "cards") + '">Дальше: Спринт</a>' +
        '<a class="btn block soft" href="#/lesson/' + l.id + '">К уроку</a></div></div>';
    }
    draw();
  }

  /* ================= спринт ================= */
  function sprint(l) {
    var pool = l ? l.words.map(function (w) { return { k: w[0], r: w[1] }; }) : COURSE_WORDS;
    var back = l ? "#/lesson/" + l.id : null;
    setScreen(l ? "Спринт: урок " + l.id : "Спринт", back, l ? "lessons" : "sprint");
    var DURATION = 60;

    function intro() {
      view.innerHTML = '<div class="result"><div class="big">60</div>' +
        '<p>секунд, чтобы ответить «верно» или «неверно» на как можно больше пар. Каждые три правильных ответа подряд увеличивают множитель очков.</p>' +
        (store.sprintBest ? '<p class="muted small">Ваш рекорд: ' + store.sprintBest + '</p>' : '') +
        '<button class="btn block accent" id="go">Начать спринт</button></div>';
      document.getElementById("go").onclick = play;
    }
    function play() {
      var left = DURATION, score = 0, streakN = 0, mult = 1, right = 0, wrong = 0, cur;
      view.innerHTML =
        '<div class="sprint-top"><div class="score" id="sc">0</div><div class="combo" id="cb">x1</div></div>' +
        '<div class="timer" id="tm"><i style="width:100%"></i></div>' +
        '<div class="sprint-card" id="card">' + sayBtn("", "corner") + '<div class="w kum" id="sw"></div><div class="eq">это</div><div class="t" id="st"></div></div>' +
        '<div class="row sprint-btns"><button class="btn no" id="bn">Неверно</button><button class="btn yes" id="by">Верно</button></div>' +
        '<p class="muted small" style="text-align:center;margin-top:10px">Правильных: <span id="rc">0</span>, ошибок: <span id="wc">0</span></p>';
      var card = document.getElementById("card");
      function nextQ() {
        var w = pool[Math.floor(Math.random() * pool.length)];
        var truth = Math.random() < 0.5;
        var shown = w.r;
        if (!truth) {
          var other;
          do { other = COURSE_WORDS[Math.floor(Math.random() * COURSE_WORDS.length)]; } while (other.r === w.r);
          shown = other.r;
        }
        cur = { truth: truth };
        document.getElementById("sw").textContent = w.k;
        var sb = card.querySelector(".say");
        sb.setAttribute("data-say", w.k);
        sb.setAttribute("aria-label", "Произнести «" + w.k + "»");
        document.getElementById("st").textContent = shown;
      }
      function answer(said) {
        if (left <= 0) return;
        var ok = said === cur.truth;
        card.classList.remove("flash-ok", "flash-bad");
        void card.offsetWidth;
        card.classList.add(ok ? "flash-ok" : "flash-bad");
        if (ok) {
          right++; score += 10 * mult; streakN++;
          if (streakN % 3 === 0 && mult < 4) mult++;
        } else {
          wrong++; streakN = 0; mult = 1; vibrate(60);
        }
        document.getElementById("sc").textContent = score;
        document.getElementById("cb").textContent = "x" + mult;
        document.getElementById("rc").textContent = right;
        document.getElementById("wc").textContent = wrong;
        nextQ();
      }
      document.getElementById("by").onclick = function () { answer(true); };
      document.getElementById("bn").onclick = function () { answer(false); };
      nextQ();
      var tm = document.getElementById("tm");
      timers.push(setInterval(function () {
        left--;
        tm.firstChild.style.width = (left / DURATION * 100) + "%";
        tm.classList.toggle("low", left <= 10);
        if (left <= 0) { clearTimers(); finish(score, right, wrong); }
      }, 1000));
    }
    function finish(score, right, wrong) {
      var record = score > store.sprintBest;
      if (record) store.sprintBest = score;
      addXp(Math.round(score / 10));
      if (l) completeStep(l.id, "sprint");
      save();
      view.innerHTML = '<div class="result"><div class="big">' + score + '</div>' +
        '<p>' + (record ? "Новый рекорд! " : "") + 'Правильных ответов: ' + right + ', ошибок: ' + wrong + '.</p>' +
        '<div class="stack"><button class="btn block accent" id="again">Сыграть ещё раз</button>' +
        (l ? '<a class="btn block" href="' + nextStepHref(l, "sprint") + '">Дальше: Упражнения</a>' : '') +
        '</div></div>';
      document.getElementById("again").onclick = play;
    }
    intro();
  }

  /* ================= вопросы (общий движок) ================= */
  /* Как понять, что строка на кумыкском: слова из уроков, словаря, примеров и диалогов */
  var KUM_TOKENS = {};
  function addKum(t) {
    audioKey(t).split(/[\s\-]+/).forEach(function (w) { if (w && !/^\d+$/.test(w)) KUM_TOKENS[w] = 1; });
  }
  LESSONS.forEach(function (l) {
    l.words.forEach(function (w) { addKum(w[0]); });
    l.theory.forEach(function (t) { (t.ex || []).forEach(function (e) { e[0].split("→").forEach(addKum); }); });
  });
  window.EXTRA_DICT.forEach(function (w) { addKum(w[0]); });
  window.DIALOGS.forEach(function (d) { d.lines.forEach(function (ln) { addKum(ln[1]); }); });
  window.PROVERBS.forEach(function (p) { addKum(p[0]); });
  var RU_TOKENS = {};
  function addRu(t) { audioKey(t).split(/[\s\-,\/]+/).forEach(function (w) { if (w) RU_TOKENS[w] = 1; }); }
  LESSONS.forEach(function (l) {
    l.words.forEach(function (w) { addRu(w[1]); });
    l.theory.forEach(function (t) { (t.ex || []).forEach(function (e) { addRu(e[1]); }); });
  });
  window.EXTRA_DICT.forEach(function (w) { addRu(w[1]); });
  window.DIALOGS.forEach(function (d) { d.lines.forEach(function (ln) { addRu(ln[2]); }); });
  window.PROVERBS.forEach(function (p) { addRu(p[1]); });
  var KUM_STEMS = Object.keys(KUM_TOKENS).filter(function (w) { return w.length >= 3; });
  function kumToken(w) {
    if (KUM_TOKENS[w]) return true;
    if (RU_TOKENS[w]) return false;
    for (var j = 0; j < KUM_STEMS.length; j++) if (w.indexOf(KUM_STEMS[j]) === 0) return true;
    return false;
  }
  function isKum(text) {
    var k = audioKey(text);
    if (!k || /^[\d\s+\-=?%]+$/.test(k) || k.charAt(0) === "-") return false;
    if (/къ|гъ|гь|оь|уь/.test(k)) return true;
    var toks = k.split(/[\s\-]+/).filter(Boolean);
    // слова, одинаковые в обоих языках («он», «чай»), сами по себе ничего не решают
    var known = toks.filter(function (w) { return kumToken(w) && !RU_TOKENS[w]; }).length;
    var shared = toks.filter(function (w) { return KUM_TOKENS[w] && RU_TOKENS[w]; }).length;
    return known > 0 && (known + shared) * 2 >= toks.length;
  }
  // Варианты ответа: если хоть один вариант кумыкский, кумыкскими считаем и
  // остальные незнакомые формы (неверные окончания вроде «итлар»), но не русские слова
  function kumOptions(options, explicit) {
    if (explicit === true || explicit === false) return options.map(function () { return explicit; });
    var flags = options.map(isKum);
    if (flags.indexOf(true) < 0) return flags;
    return options.map(function (o, j) {
      if (flags[j]) return true;
      var k = audioKey(o);
      if (!/[а-яё]/.test(k) || k.charAt(0) === "-") return false;
      return k.split(/[\s\-]+/).every(function (w) { return !RU_TOKENS[w]; });
    });
  }
  // Кумыкский фрагмент вопроса: слово в «кавычках» или предложение с пропуском ___
  function questionKum(q) {
    var m = q.match(/«([^»]+)»/g) || [];
    for (var j = 0; j < m.length; j++) {
      var inner = m[j].slice(1, -1);
      if (isKum(inner)) return inner;
    }
    return null;
  }
  function filledSentence(q, answer) {
    if (q.indexOf("___") < 0) return null;
    var base = q.split(" (")[0];
    return base.replace("___", answer);
  }
  function optSay(text) {
    return '<span class="say opt-say" data-say="' + esc(text) + '" role="button" aria-label="Произнести «' + esc(text) + '»">' + SPEAKER + '</span>';
  }

  function quiz(opts) {
    // opts: items [{q, options, a, why}], onDone(right,total), header
    var items = opts.items, i = 0, right = 0;
    function draw() {
      if (i >= items.length) return opts.onDone(right, items.length);
      var it = items[i];
      var order = shuffle(it.options.map(function (o, idx) { return idx; }));
      var qk = questionKum(it.q);
      var kf = kumOptions(it.options, it.kum);
      view.innerHTML =
        '<div class="counter"><span>' + (opts.label || "Вопрос") + ' ' + (i + 1) + ' из ' + items.length + '</span><span>Верно: ' + right + '</span></div>' +
        '<div class="progress"><i style="width:' + (i / items.length * 100) + '%"></i></div>' +
        '<div class="q-card' + (qk ? " has-say" : "") + '"><p class="q">' + esc(it.q) + '</p>' + (qk ? sayBtn(qk, "corner") : "") + '</div>' +
        '<div class="options">' + order.map(function (idx) {
          var o = it.options[idx];
          return '<button class="opt" data-i="' + idx + '"><span class="opt-t">' + esc(o) + '</span>' + (kf[idx] ? optSay(o) : "") + '</button>';
        }).join("") + '</div><div id="fb"></div>';
      view.querySelectorAll(".opt").forEach(function (b) {
        b.onclick = function () {
          var chosen = parseInt(b.getAttribute("data-i"), 10);
          var ok = chosen === it.a;
          if (ok) { right++; addXp(3); } else vibrate(60);
          view.querySelectorAll(".opt").forEach(function (x) {
            x.disabled = true;
            var xi = parseInt(x.getAttribute("data-i"), 10);
            if (xi === it.a) x.classList.add("right");
            else if (xi === chosen) x.classList.add("wrong");
          });
          var correct = it.options[it.a];
          var heard = filledSentence(it.q, correct) || (kf[it.a] ? correct : qk);
          document.getElementById("fb").innerHTML =
            '<div class="explain ' + (ok ? "ok" : "bad") + '"><b>' + (ok ? "Верно" : "Правильно: " + esc(correct)) + '</b>' + esc(it.why || "") +
            (heard ? '<button class="listen" data-say="' + esc(heard) + '">' + SPEAKER + '<span class="kum">' + esc(heard) + '</span></button>' : '') + '</div>' +
            '<div style="height:12px"></div><button class="btn block" id="nx">' + (i + 1 < items.length ? "Следующий вопрос" : "Посмотреть результат") + '</button>';
          document.getElementById("nx").onclick = function () { i++; draw(); };
          document.getElementById("nx").focus();
          if (heard && store.settings.autoCards) say(heard, { quiet: true });
        };
      });
    }
    draw();
  }

  /* ================= упражнения ================= */
  function exercises(l) {
    setScreen("Упражнения", "#/lesson/" + l.id, "lessons");
    quiz({
      items: l.exercises, label: "Задание",
      onDone: function (r, t) {
        completeStep(l.id, "ex");
        view.innerHTML = '<div class="result"><div class="big">' + r + '/' + t + '</div>' +
          '<p>' + (r === t ? "Без единой ошибки." : "Разборы ошибок помогут на итоговом тесте.") + '</p>' +
          '<div class="stack"><a class="btn block" href="' + nextStepHref(l, "ex") + '">Дальше: Найди пару</a>' +
          '<button class="btn block soft" id="re">Пройти ещё раз</button></div></div>';
        document.getElementById("re").onclick = function () { exercises(l); };
      }
    });
  }

  /* ================= найди пару ================= */
  function match(l) {
    setScreen("Найди пару", "#/lesson/" + l.id, "lessons");
    var pairs = pick(l.words, Math.min(6, l.words.length));
    var left = shuffle(pairs.map(function (p, i) { return { i: i, t: p[0] }; }));
    var right = shuffle(pairs.map(function (p, i) { return { i: i, t: p[1] }; }));
    var selL = null, selR = null, found = 0, mistakes = 0, start = Date.now();

    var html = '<p class="muted small">Нажмите слово слева, затем его перевод справа.</p><div class="match">';
    for (var r = 0; r < pairs.length; r++) {
      html += '<button class="tile kum" data-side="L" data-i="' + left[r].i + '" data-say="' + esc(left[r].t) + '">' + esc(left[r].t) + '</button>' +
              '<button class="tile" data-side="R" data-i="' + right[r].i + '">' + esc(right[r].t) + '</button>';
    }
    view.innerHTML = html + '</div><p class="muted small" style="margin-top:12px">Ошибок: <span id="mc">0</span></p>';

    view.querySelectorAll(".tile").forEach(function (b) {
      b.onclick = function () {
        var side = b.getAttribute("data-side");
        view.querySelectorAll('.tile[data-side="' + side + '"]').forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        if (side === "L") selL = b; else selR = b;
        if (selL && selR) {
          var a = selL, c = selR; selL = selR = null;
          if (a.getAttribute("data-i") === c.getAttribute("data-i")) {
            a.classList.add("gone"); c.classList.add("gone"); found++; addXp(2);
            if (found === pairs.length) timers.push(setTimeout(done, 350));
          } else {
            mistakes++; vibrate(60);
            document.getElementById("mc").textContent = mistakes;
            a.classList.add("bad"); c.classList.add("bad");
            timers.push(setTimeout(function () { a.classList.remove("bad", "sel"); c.classList.remove("bad", "sel"); }, 450));
          }
        }
      };
    });
    function done() {
      completeStep(l.id, "match");
      var sec = Math.round((Date.now() - start) / 1000);
      view.innerHTML = '<div class="result"><div class="big">' + sec + ' с</div>' +
        '<p>Все пары найдены, ошибок: ' + mistakes + '.</p>' +
        '<div class="stack"><a class="btn block" href="' + nextStepHref(l, "match") + '">Дальше: Итоговый тест</a>' +
        '<button class="btn block soft" id="re">Ещё раунд</button></div></div>';
      document.getElementById("re").onclick = function () { match(l); };
    }
  }

  /* ================= итоговый тест ================= */
  function wordQuestion(w, all, reverse) {
    var wrongs = pick(all.filter(function (x) { return x[0] !== w[0] && x[1] !== w[1]; }), 2);
    var opts = [w].concat(wrongs);
    return {
      q: reverse ? "Как по-кумыкски «" + w[1] + "»?" : "Что значит «" + w[0] + "»?",
      options: opts.map(function (x) { return reverse ? x[0] : x[1]; }),
      a: 0,
      kum: !!reverse,
      why: w[0] + " — " + w[1] + "."
    };
  }
  function test(l) {
    setScreen("Итоговый тест", "#/lesson/" + l.id, "lessons");
    var allWords = COURSE_WORDS.map(function (w) { return [w.k, w.r]; });
    var items = pick(l.exercises, 4);
    pick(l.words, 6).forEach(function (w, idx) { items.push(wordQuestion(w, allWords, idx % 2 === 1)); });
    items = shuffle(items);
    quiz({
      items: items,
      onDone: function (r, t) {
        var pct = Math.round(r / t * 100);
        var s = lessonState(l.id);
        s.best = Math.max(s.best, pct);
        var passed = pct >= 80;
        if (passed) {
          var firstTime = !s.done;
          s.done = true;
          completeStep(l.id, "test");
          if (firstTime) addXp(50);
        }
        save();
        var nextL = getLesson(l.id + 1);
        view.innerHTML = '<div class="result"><div class="big">' + pct + '%</div>' +
          '<p>' + (passed ? "Урок пройден. Правильных ответов: " + r + " из " + t + "." : "Нужно 80%, а у вас " + r + " из " + t + ". Повторите карточки и попробуйте снова.") + '</p>' +
          '<div class="stack">' +
          (passed && nextL ? '<a class="btn block accent" href="#/lesson/' + nextL.id + '">Следующий урок</a>' : '') +
          (!passed ? '<button class="btn block accent" id="re">Пройти тест снова</button>' : '') +
          '<a class="btn block soft" href="#/lesson/' + l.id + '">К уроку</a></div></div>';
        var re = document.getElementById("re");
        if (re) re.onclick = function () { test(l); };
      }
    });
  }

  /* ================= словарь ================= */
  var dictState = { q: "", dir: "kr", course: false };
  function dict() {
    setScreen("Словарь", null, "dict");
    view.innerHTML =
      '<div class="search"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>' +
      '<input id="dq" type="search" placeholder="Найти слово" autocomplete="off" value="' + esc(dictState.q) + '"></div>' +
      '<div class="seg" role="group" aria-label="Направление">' +
        '<button data-dir="kr" class="' + (dictState.dir === "kr" ? "on" : "") + '">Къумукъ → Русский</button>' +
        '<button data-dir="rk" class="' + (dictState.dir === "rk" ? "on" : "") + '">Русский → Къумукъ</button></div>' +
      '<div class="dict-meta"><span id="dcount"></span><button class="chip' + (dictState.course ? " on" : "") + '" id="dcourse">Слова курса</button></div>' +
      '<div class="wordlist dict-list" id="dlist"></div>';
    var input = document.getElementById("dq");
    input.oninput = function () { dictState.q = input.value; drawList(); };
    view.querySelectorAll(".seg button").forEach(function (b) {
      b.onclick = function () {
        dictState.dir = b.getAttribute("data-dir");
        view.querySelectorAll(".seg button").forEach(function (x) { x.classList.toggle("on", x === b); });
        drawList();
      };
    });
    document.getElementById("dcourse").onclick = function () {
      dictState.course = !dictState.course; this.classList.toggle("on", dictState.course); drawList();
    };
    drawList();
  }
  function norm(s) { return s.toLowerCase().replace(/ё/g, "е").trim(); }
  function hl(text, q) {
    if (!q) return esc(text);
    var i = norm(text).indexOf(q);
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  function drawList() {
    var q = norm(dictState.q);
    var kr = dictState.dir === "kr";
    var list = DICT.filter(function (w) {
      if (dictState.course && !w.lesson) return false;
      if (!q) return true;
      return norm(kr ? w.k : w.r).indexOf(q) >= 0;
    });
    if (!kr) list = list.slice().sort(function (a, b) { return a.r.localeCompare(b.r, "ru"); });
    if (q) {
      list.sort(function (a, b) {
        var pa = norm(kr ? a.k : a.r).indexOf(q), pb = norm(kr ? b.k : b.r).indexOf(q);
        return pa - pb;
      });
    }
    document.getElementById("dcount").textContent = "Найдено: " + list.length;
    var el = document.getElementById("dlist");
    if (!list.length) {
      el.innerHTML = '<div class="empty">Такого слова пока нет в словаре. Проверьте написание или переключите направление перевода.</div>';
      return;
    }
    el.innerHTML = list.slice(0, 300).map(function (w) {
      var a = kr ? '<span class="kum">' + hl(w.k, q) + '</span>' : '<span>' + hl(w.r, q) + '</span>';
      var b = kr ? '<span class="ru">' + esc(w.r) : '<span class="ru kum" style="font-size:17px;color:var(--indigo);font-weight:600">' + esc(w.k);
      b += (w.lesson ? '<span class="tag">урок ' + w.lesson + '</span>' : '') + '</span>';
      return '<div class="item">' + sayBtn(w.k) + '<span class="dmain">' + a + b + '</span></div>';
    }).join("");
  }

  /* ================= диалоги и пословицы ================= */
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>';
  function dialogs() {
    setScreen("Диалоги и пословицы", "#/home", "home");
    var hideRu = false;
    function draw() {
      stopSeq();
      view.innerHTML =
        '<p class="muted small">Нажмите «Слушать», чтобы прослушать диалог целиком, или на реплику, чтобы услышать только её.</p>' +
        '<div class="vocab-tools"><span class="muted small">' + window.DIALOGS.length + ' ' + plural(window.DIALOGS.length, "диалог", "диалога", "диалогов") + '</span>' +
        '<button class="switch" id="sw" aria-pressed="' + hideRu + '"><i></i>Без перевода</button></div>' +
        '<div class="' + (hideRu ? "hide-ru" : "") + '">' +
        window.DIALOGS.map(function (d, di) {
          return '<section class="dialog"><div class="dialog-head"><h3>' + esc(d.title) + '</h3>' +
            '<button class="play-btn" data-dialog="' + di + '">' + PLAY + '<span>Слушать</span></button></div>' +
            d.lines.map(function (ln, li) {
              return '<div class="bubble ' + (ln[0] === "А" ? "a" : "b") + '" id="b' + di + '_' + li + '" data-say="' + esc(ln[1]) + '" data-pitch="' + (ln[0] === "А" ? 1.1 : 0.82) + '" role="button" tabindex="0">' +
                '<span class="kum">' + esc(ln[1]) + '</span><span class="ru">' + esc(ln[2]) + '</span></div>';
            }).join("") + '</section>';
        }).join("") +
        '<div class="dialog-head proverbs-head"><h2>Пословицы</h2>' +
        '<button class="play-btn" id="playProv">' + PLAY + '<span>Слушать все</span></button></div>' +
        window.PROVERBS.map(function (p, pi) {
          return '<div class="proverb" id="p' + pi + '">' + sayBtn(p[0]) +
            '<span class="ptext" data-say="' + esc(p[0]) + '" role="button" tabindex="0"><span class="kum">' + esc(p[0]) + '</span><span class="ru">' + esc(p[1]) + '</span></span></div>';
        }).join("") + '</div>';

      document.getElementById("sw").onclick = function () { hideRu = !hideRu; draw(); };

      function bindPlay(btn, items, label) {
        btn.onclick = function () {
          if (btn.classList.contains("on")) { stopSeq(); stopSpeech(); return; }
          view.querySelectorAll(".playing").forEach(function (x) { x.classList.remove("playing"); });
          btn.classList.add("on");
          btn.innerHTML = STOP + "<span>Стоп</span>";
          playSeq(items, {
            step: function (it) {
              view.querySelectorAll(".playing").forEach(function (x) { x.classList.remove("playing"); });
              var el = document.getElementById(it.el);
              if (el) {
                el.classList.add("playing");
                if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }
            },
            end: function () {
              view.querySelectorAll(".playing").forEach(function (x) { x.classList.remove("playing"); });
              btn.classList.remove("on");
              btn.innerHTML = PLAY + "<span>" + label + "</span>";
            }
          });
        };
      }
      view.querySelectorAll("[data-dialog]").forEach(function (btn) {
        var di = +btn.getAttribute("data-dialog");
        // у собеседников разная высота голоса, чтобы их было легко различить
        bindPlay(btn, window.DIALOGS[di].lines.map(function (ln, li) {
          return { text: ln[1], pitch: ln[0] === "А" ? 1.1 : 0.82, el: "b" + di + "_" + li };
        }), "Слушать");
      });
      bindPlay(document.getElementById("playProv"), window.PROVERBS.map(function (p, pi) {
        return { text: p[0], pitch: 1, el: "p" + pi };
      }), "Слушать все");
    }
    draw();
  }

  /* ================= профиль ================= */
  function voiceInfo() {
    var rec = AUDIO_COUNT ? "Записей носителя языка: " + AUDIO_COUNT + ". " : "Записей носителя языка пока нет. ";
    if (!store.settings.tts) return rec + "Синтез выключен, звучат только записи.";
    var e = ttsEngine();
    var other = AUDIO_COUNT ? "Остальные слова" : "Слова";
    if (e === "tr") return rec + other + " читает турецкий голос телефона: произношение близкое, но приблизительное.";
    if (e === "ru") return rec + other + " читает русский голос: произношение приблизительное. Турецкий голос звучит ближе к кумыкскому — его можно скачать в настройках Android: Синтез речи → Google → Установить голосовые данные → Турецкий.";
    if (e === "web") return rec + other + " читает голос браузера, произношение приблизительное.";
    if (e === "loading") return rec + "Синтезатор речи загружается, загляните сюда через пару секунд.";
    return rec + "Синтезатор речи на телефоне не найден, поэтому звучат только записи.";
  }
  function profile() {
    setScreen("Профиль", null, "profile");
    var done = LESSONS.filter(function (l) { return lessonState(l.id).done; }).length;
    var learned = Object.keys(store.srs).filter(function (k) { return store.srs[k].box >= 2; }).length;
    var initial = (store.name || "К").trim().charAt(0).toUpperCase() || "К";
    view.innerHTML =
      '<div class="profile-head"><div class="avatar" id="av">' + esc(initial) + '</div>' +
      '<div style="flex:1"><label class="small muted" for="nm">Ваше имя</label>' +
      '<input class="name-input" id="nm" maxlength="30" placeholder="Как к вам обращаться" value="' + esc(store.name) + '"></div></div>' +
      '<div class="stats">' +
        '<div><b>' + done + '/' + LESSONS.length + '</b><span>уроков пройдено</span></div>' +
        '<div><b>' + learned + '</b><span>слов в долгой памяти</span></div>' +
        '<div><b>' + store.xp + '</b><span>очков опыта</span></div>' +
        '<div><b>' + streak() + '</b><span>' + plural(streak(), "день", "дня", "дней") + ' подряд</span></div>' +
        '<div><b>' + store.sprintBest + '</b><span>рекорд спринта</span></div>' +
        '<div><b>' + store.days.length + '</b><span>' + plural(store.days.length, "день", "дня", "дней") + ' занятий</span></div>' +
      '</div>' +
      '<h2>Озвучка</h2>' +
      '<div class="settings">' +
        '<button class="switch wide" id="setTts" aria-pressed="' + store.settings.tts + '"><span>Синтез речи для слов без записи</span><i></i></button>' +
        '<button class="switch wide" id="setAuto" aria-pressed="' + store.settings.autoCards + '"><span>Произносить сразу: слово на карточке и правильный ответ в упражнениях</span><i></i></button>' +
        '<button class="btn soft block" id="testVoice">' + SPEAKER + ' Проверить: «Ассаламу алайкум»</button>' +
        '<p class="small muted" id="voiceInfo">' + voiceInfo() + '</p>' +
      '</div>' +
      '<button class="btn block ghost" id="reset">Сбросить прогресс</button>' +
      '<p class="note">Прогресс хранится на этом телефоне. Вход по почте и синхронизация между устройствами появятся, когда к приложению подключат сервер.</p>';
    var nm = document.getElementById("nm");
    nm.oninput = function () {
      store.name = nm.value; save();
      document.getElementById("av").textContent = (nm.value.trim().charAt(0) || "К").toUpperCase();
    };
    document.getElementById("setTts").onclick = function () {
      store.settings.tts = !store.settings.tts; save(); this.setAttribute("aria-pressed", store.settings.tts);
      document.getElementById("voiceInfo").textContent = voiceInfo();
    };
    document.getElementById("setAuto").onclick = function () {
      store.settings.autoCards = !store.settings.autoCards; save(); this.setAttribute("aria-pressed", store.settings.autoCards);
    };
    document.getElementById("testVoice").onclick = function () { say("Ассаламу алайкум"); };
    var armed = false;
    document.getElementById("reset").onclick = function () {
      if (!armed) { armed = true; this.textContent = "Нажмите ещё раз, чтобы стереть всё"; this.classList.add("accent"); this.classList.remove("ghost"); return; }
      store = blank(); save(); toast("Прогресс сброшен"); profile();
    };
  }

  /* ================= старт ================= */
  if (!location.hash) location.replace("#/home");
  route();
})();
