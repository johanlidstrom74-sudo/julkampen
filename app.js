let socket = null;
let backend = localStorage.getItem("JK_BACKEND") || "";
let myCode = "";
let isAdmin = false;

const $ = (id) => document.getElementById(id);
const connPill = $("connPill");

function setConn(ok) {
  connPill.textContent = ok ? "Online" : "Offline";
  connPill.style.color = ok ? "var(--text)" : "var(--muted)";
  connPill.style.borderColor = ok ? "rgba(22,163,74,.45)" : "var(--stroke)";
  connPill.style.background = ok ? "rgba(22,163,74,.18)" : "rgba(255,255,255,.06)";
}

function show(view) {
  ["join","admin"].forEach(v=>{
    $("view-"+v).classList.toggle("hidden", v !== view);
    document.querySelector(`[data-view="${v}"]`).classList.toggle("active", v === view);
  });
}

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=> show(btn.dataset.view));
});

$("backendUrl").value = backend;
$("adminPin").value = localStorage.getItem("JK_ADMIN_PIN") || "";

function getAdminPin() {
  const pin = ($("adminPin").value || "").trim();
  if (pin) localStorage.setItem("JK_ADMIN_PIN", pin);
  return pin;
}

function connect() {
  backend = $("backendUrl").value.trim();
  if (!backend) {
    $("adminStatus").textContent = "Skriv in Backend-URL först.";
    return;
  }
  localStorage.setItem("JK_BACKEND", backend);

  socket?.disconnect();
  socket = io(backend, { transports: ["websocket"] });

  socket.on("connect", () => setConn(true));
  socket.on("disconnect", () => setConn(false));

  socket.on("lobby_update", (state) => {
    if ($("playerArea") && !isAdmin) {
      $("lobbyCode").textContent = state.code;
      $("lobbyCount").textContent = state.playerCount;
      renderBoard($("leaderboard"), state.players);
    }
    if (isAdmin) {
      $("adminCode").textContent = state.code;
      renderBoard($("adminBoard"), state.players);
    }
  });

  socket.on("game_started", () => {
    if (!isAdmin) {
      $("waitingBox").textContent = "Spelet har startat!";
      $("waitingBox").classList.remove("hidden");
    }
  });

  socket.on("question", (q) => {
    if (isAdmin) {
      // Clear previous question results message (admin can reveal when ready)
      $("adminResults").textContent = "Tryck “Visa resultat (fråga)” för att se hur alla svarade.";
      return;
    }
    $("waitingBox").classList.add("hidden");
    $("questionBox").classList.remove("hidden");
    $("qNumber").textContent = `${q.number}/${q.total}`;
    $("qText").textContent = q.q;

    const opts = $("options");
    opts.innerHTML = "";
    $("answerStatus").textContent = "";

    q.options.forEach((txt, idx) => {
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = txt;
      b.addEventListener("click", () => submitAnswer(idx, b));
      opts.appendChild(b);
    });
  });

  socket.on("question_results", (res) => {
    // Admin-only event
    if (!isAdmin) return;

    const totalPlayers = (res.details || []).length || 0;
    const totalAnswers = res.totalAnswers ?? 0;
    const correctTxt = res.options?.[res.correctIndex] ?? "";

    let html = `<div style="font-weight:900;margin-bottom:8px;">${escapeHtml(res.question)}</div>`;
    html += `<div style="margin-bottom:10px;"><strong>Rätt svar:</strong> ${escapeHtml(correctTxt)}</div>`;
    html += `<div style="margin-bottom:10px;"><strong>Svar:</strong> ${totalAnswers}/${totalPlayers}</div>`;

    // Counts per option
    html += `<div style="display:grid;gap:8px;margin-bottom:10px;">`;
    (res.options || []).forEach((opt, i) => {
      const c = (res.counts && res.counts[i]) ? res.counts[i] : 0;
      const pct = totalPlayers ? Math.round((c / totalPlayers) * 100) : 0;
      const isCorrect = i === res.correctIndex;
      html += `
        <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);border-radius:14px;padding:10px 12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div>${isCorrect ? "✅ " : ""}${escapeHtml(opt)}</div>
            <div><strong>${c}</strong> (${pct}%)</div>
          </div>
        </div>`;
    });
    html += `</div>`;

    // Player details
    html += `<div style="font-weight:800;margin:8px 0;">Spelare</div>`;
    html += `<div style="display:grid;gap:6px;">`;
    (res.details || []).forEach(p => {
      const ans = (p.answerIndex === null || p.answerIndex === undefined) ? "—" : (res.options?.[p.answerIndex] ?? "—");
      html += `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:14px;padding:8px 10px;">
          <div>${p.correct ? "✅" : "❌"} ${escapeHtml(p.name)}</div>
          <div style="color:rgba(255,255,255,.78)">${escapeHtml(ans)}</div>
        </div>`;
    });
    html += `</div>`;

    $("adminResults").innerHTML = html;
  });

  socket.on("game_over", (state) => {
    if (!isAdmin) {
      $("questionBox").classList.add("hidden");
      $("waitingBox").classList.remove("hidden");
      $("waitingBox").textContent = "Spelet är slut 🎁";
      renderBoard($("leaderboard"), state.players);
    } else {
      // Keep admin area visible so you can see final results.
      $("adminArea").classList.remove("hidden");
      renderBoard($("adminBoard"), state.players);
      $("adminStatus").textContent = "Spelet är avslutat. (Leaderboard visas nedan)";
    }
  });

  $("adminStatus").textContent = "Ansluten.";
}

function renderBoard(el, players) {
  el.innerHTML = "";
  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "boardItem";
    row.innerHTML = `<div>${i+1}. ${escapeHtml(p.name)}</div><div><strong>${p.score}</strong>p</div>`;
    el.appendChild(row);
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

// --- Admin actions ---
$("connectBtn").addEventListener("click", () => {
  isAdmin = true;
  connect();
});

$("createGameBtn").addEventListener("click", () => {
  isAdmin = true;
  if (!socket) connect();

  const difficulty = $("difficulty").value;
  const questionCount = parseInt($("questionCount").value || "10", 10);
  const adminPin = getAdminPin(); // may be empty -> server generates

  socket.emit("create_game", { questionCount, difficulty, adminPin }, (res) => {
    if (!res?.ok) {
      $("adminStatus").textContent = "Kunde inte skapa lobby.";
      return;
    }
    myCode = res.code;

    // If server generated PIN, show & store it
    if (res.adminPin) {
      $("adminPin").value = res.adminPin;
      localStorage.setItem("JK_ADMIN_PIN", res.adminPin);
    }

    $("adminStatus").textContent = `Lobby skapad! Kod: ${myCode} • Admin-PIN: ${$("adminPin").value}`;
    $("adminArea").classList.remove("hidden");
    $("adminCode").textContent = myCode;
  });
});

$("copyJoinLinkBtn").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#join=${myCode}`;
  try {
    await navigator.clipboard.writeText(url);
    $("adminStatus").textContent = "Join-länk kopierad.";
  } catch {
    $("adminStatus").textContent = "Kunde inte kopiera – kopiera manuellt: " + url;
  }
});

$("startBtn").addEventListener("click", () => {
  if (!myCode) return;
  const adminPin = getAdminPin();
  socket.emit("start_game", { code: myCode, adminPin }, (res) => {
    $("adminStatus").textContent = res?.ok ? "Spelet startat." : (res?.error || "Fel vid start.");
  });
});

$("revealBtn").addEventListener("click", () => {
  if (!myCode) return;
  const adminPin = getAdminPin();
  socket.emit("reveal_results", { code: myCode, adminPin }, (res) => {
    if (!res?.ok) $("adminStatus").textContent = res?.error || "Kunde inte visa resultat.";
  });
});

$("nextBtn").addEventListener("click", () => {
  if (!myCode) return;
  const adminPin = getAdminPin();
  socket.emit("next_question", { code: myCode, adminPin }, (res) => {
    if (res?.done) $("adminStatus").textContent = "Sista frågan klar. Spelet är slut!";
    else if (!res?.ok) $("adminStatus").textContent = res?.error || "Kunde inte gå vidare.";
  });
});

$("endBtn").addEventListener("click", () => {
  if (!myCode) return;
  const adminPin = getAdminPin();
  socket.emit("end_game", { code: myCode, adminPin }, (res) => {
    if (!res?.ok) $("adminStatus").textContent = res?.error || "Kunde inte avsluta.";
  });
});

// --- Player join ---
function parseHashJoin() {
  const h = location.hash || "";
  const m = h.match(/join=([A-Z0-9]+)/i);
  if (m) {
    $("joinCode").value = m[1].toUpperCase();
    show("join");
  }
}
window.addEventListener("hashchange", parseHashJoin);
parseHashJoin();

$("joinBtn").addEventListener("click", () => {
  isAdmin = false;
  const code = $("joinCode").value.trim().toUpperCase();
  const name = $("joinName").value.trim();

  if (!backend) {
    $("joinStatus").textContent = "Admin behöver hosta backend och ge korrekt länk/URL.";
    return;
  }

  if (!socket) {
    $("backendUrl").value = backend;
    connect();
  }

  socket.emit("join_game", { code, name }, (res) => {
    if (!res?.ok) {
      $("joinStatus").textContent = res?.error || "Kunde inte gå med.";
      return;
    }
    myCode = code;
    $("joinStatus").textContent = `Du är med som: ${res.name}`;
    $("playerArea").classList.remove("hidden");
    $("lobbyCode").textContent = myCode;
    $("waitingBox").classList.remove("hidden");
    $("waitingBox").textContent = "Väntar på att admin startar…";
  });
});

function submitAnswer(idx, btn) {
  btn.disabled = true;
  $("answerStatus").textContent = "Svar skickat ✅";
  document.querySelectorAll(".option").forEach(b => b.disabled = true);
  socket.emit("answer", { code: myCode, optionIndex: idx }, () => {});
}

// --- PWA SW ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

setConn(false);
