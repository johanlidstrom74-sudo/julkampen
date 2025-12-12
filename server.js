import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(express.json());

// Set this on your host (e.g. Render) to allow your GitHub Pages origin.
// Example: https://youruser.github.io
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5500";

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: FRONTEND_ORIGIN, credentials: true }
});

// =======================
// International question bank (Swedish)
// =======================
const QUESTION_BANK = {
  easy: [
    { q: "Vilket datum är juldagen i de flesta länder?", options: ["24 december", "25 december", "26 december"], correct: 1 },
    { q: "Vilken figur förknippas i många kulturer med att dela ut julklappar?", options: ["Tomten", "Cupid", "Tandfen", "Påskharen"], correct: 0 },
    { q: "Vilken växt används ofta som juldekoration?", options: ["Mistel", "Bambu", "Kaktus", "Lavendel"], correct: 0 },
    { q: "Vilket land brukar man ofta säga populariserade den moderna julgranstraditionen?", options: ["Tyskland", "Brasilien", "Indien", "Australien"], correct: 0 },
    { q: "Vad kallas perioden före jul som många kristna uppmärksammar?", options: ["Advent", "Fastan", "Pesach", "Diwali"], correct: 0 },
    { q: "Vilket hav ligger närmast Julön (territorium tillhörande Australien)?", options: ["Atlanten", "Indiska oceanen", "Arktiska havet", "Södra ishavet"], correct: 1 }
  ],
  medium: [
    { q: "I sången 'Tolv dagar av jul' – vad ges på den 7:e dagen?", options: ["Sju svanar som simmar", "Sju ringar", "Sju trummisar som trummar", "Sju mjölkerskor"], correct: 0 },
    { q: "Vad betyder 'Noël' (som ofta syns kring jul) på franska?", options: ["Nyår", "Natt", "Jul", "Snö"], correct: 2 },
    { q: "Vilket land förknippas starkt med annandagen ('Boxing Day') den 26 december?", options: ["Storbritannien", "Spanien", "Japan", "Mexiko"], correct: 0 },
    { q: "Vilket bakverk är starkt förknippat med Italien vid jul?", options: ["Panettone", "Baklava", "Churros", "Mochi"], correct: 0 },
    { q: "I Japan finns en modern jultradition där många äter mat från vilken kedja?", options: ["KFC", "Subway", "Domino’s", "Taco Bell"], correct: 0 },
    { q: "Vilken figur är känd för att straffa olydiga barn i alpin folklore?", options: ["Krampus", "Leprechaun", "Baba Jaga", "Jack Frost"], correct: 0 },
    { q: "Vad betyder 'Nochebuena' i många spansktalande länder?", options: ["Julafton", "Nyårsafton", "Trettondagen", "Första advent"], correct: 0 },
    { q: "Vilken stad är starkt förknippad med Sankt Nikolaus och är ett viktigt pilgrimsmål?", options: ["Bari", "Lissabon", "Reykjavík", "Edinburgh"], correct: 0 }
  ],
  hard: [
    { q: "Vilken romersk festival diskuteras ofta som en möjlig påverkan på julens tidpunkt i senantiken?", options: ["Saturnalia", "Lupercalia", "Floralia", "Lemuria"], correct: 0 },
    { q: "Traditionen med 'julstocken' (Yule log) kopplas starkast till vilken kulturregion?", options: ["Nordisk och keltisk Europa", "Andinska Sydamerika", "Västafrika", "Sydostasien"], correct: 0 },
    { q: "I USA: vilken delstat brukar ofta anges som den första som officiellt erkände julen som helgdag (historiskt omdiskuterat men ofta citerat)?", options: ["Alabama", "New York", "Kalifornien", "Illinois"], correct: 0 },
    { q: "Vilken kristen högtid firas den 6 januari i många länder och kopplas till de vise männen?", options: ["Trettondagen (Epifania)", "Pingst", "Kristi himmelsfärd", "Alla helgons dag"], correct: 0 },
    { q: "I Nederländerna: från vilket land sägs Sinterklaas traditionellt komma (i folkloren)?", options: ["Spanien", "Frankrike", "Tyskland", "Italien"], correct: 0 },
    { q: "I Mexiko: hur många kvällar pågår traditionellt 'Las Posadas' före jul?", options: ["9", "7", "12", "3"], correct: 0 },
    { q: "Vilken kompositör skrev baletten 'Nötknäpparen'?", options: ["Tjajkovskij", "Mozart", "Beethoven", "Vivaldi"], correct: 0 },
    { q: "Vilket land har en traditionell julmåltid på julafton som kallas 'Wigilia'?", options: ["Polen", "Grekland", "Portugal", "Irland"], correct: 0 },
    { q: "Vilken figur förknippas mest med att komma med gåvor vid trettondagen i delar av Italien?", options: ["La Befana", "Sankt Göran", "Fru Holle", "Banshee"], correct: 0 },
    { q: "Vilken medeltida julsång nämns ofta som en av de tidigast kända i engelskspråkig tradition?", options: ["'The Boar’s Head Carol'", "'Jingle Bells'", "'Stilla natt'", "'Deck the Halls'"], correct: 0 }
  ]
};

// =======================
// Game state (in-memory)
// =======================
/**
 * games: Map<code, {
 *   code,
 *   hostSocketId: string | null,
 *   adminPin: string,
 *   players: Map<socketId, { name, score, answered: boolean, lastAnswer?: number }>,
 *   started: boolean,
 *   questionIndex: number,
 *   questionOrder: number[],
 *   questionPool: Array<{q, options, correct}>
 * }>
 */
const games = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function makePin() {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4 digits
}

function safeEq(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= (x.charCodeAt(i) ^ y.charCodeAt(i));
  return out === 0;
}

function isAdmin(game, socket, pin) {
  // Either original host socket OR valid PIN (allows reconnect)
  return (game.hostSocketId && game.hostSocketId === socket.id) || safeEq(pin, game.adminPin);
}

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function publicLobbyState(game) {
  const players = Array.from(game.players.values()).map(p => ({ name: p.name, score: p.score }));
  players.sort((a, b) => b.score - a.score);
  return {
    code: game.code,
    started: game.started,
    questionIndex: game.questionIndex,
    playerCount: players.length,
    players
  };
}

function currentQuestion(game) {
  const idx = game.questionOrder[game.questionIndex];
  const q = game.questionPool[idx];
  return { q: q.q, options: q.options, number: game.questionIndex + 1, total: game.questionOrder.length };
}

function questionResults(game) {
  const qIdx = game.questionOrder[game.questionIndex];
  const q = game.questionPool[qIdx];

  const counts = Array(q.options.length).fill(0);
  const details = [];

  for (const p of game.players.values()) {
    if (typeof p.lastAnswer === "number") {
      const a = p.lastAnswer;
      if (a >= 0 && a < counts.length) counts[a] += 1;
      details.push({ name: p.name, answerIndex: a, correct: a === q.correct });
    } else {
      details.push({ name: p.name, answerIndex: null, correct: false });
    }
  }

  // sort details: correct first, then name
  details.sort((a, b) => (Number(b.correct) - Number(a.correct)) || a.name.localeCompare(b.name));

  return {
    question: q.q,
    options: q.options,
    correctIndex: q.correct,
    counts,
    totalAnswers: counts.reduce((s, x) => s + x, 0),
    details
  };
}

io.on("connection", (socket) => {
  socket.on("create_game", ({ questionCount = 10, difficulty = "mix", adminPin } = {}, cb) => {
    const code = makeCode();

    const diff = (difficulty || "mix").toLowerCase();
    let pool = [];
    if (diff === "easy") pool = QUESTION_BANK.easy;
    else if (diff === "medium") pool = QUESTION_BANK.medium;
    else if (diff === "hard") pool = QUESTION_BANK.hard;
    else pool = [...QUESTION_BANK.easy, ...QUESTION_BANK.medium, ...QUESTION_BANK.hard]; // mix

    const maxCount = pool.length;
    const count = Math.max(5, Math.min(questionCount, maxCount));
    const order = shuffledIndices(pool.length).slice(0, count);

    const pin = (String(adminPin ?? "").trim() || makePin());

    const game = {
      code,
      hostSocketId: socket.id,
      adminPin: pin,
      players: new Map(),
      started: false,
      questionIndex: 0,
      questionOrder: order,
      questionPool: pool
    };

    games.set(code, game);
    socket.join(code);

    // Return PIN only to creator (admin)
    cb?.({ ok: true, code, adminPin: pin });
    io.to(code).emit("lobby_update", publicLobbyState(game));
  });

  socket.on("join_game", ({ code, name }, cb) => {
    code = (code || "").toUpperCase().trim();
    name = (name || "").trim();

    const game = games.get(code);
    if (!game) return cb?.({ ok: false, error: "Ingen lobby med den koden." });
    if (game.started) return cb?.({ ok: false, error: "Quizen har redan startat." });
    if (game.players.size >= 18) return cb?.({ ok: false, error: "Lobbyn är full (max 18 spelare)." });
    if (!name) return cb?.({ ok: false, error: "Skriv ett namn." });

    const existingNames = new Set(Array.from(game.players.values()).map(p => p.name.toLowerCase()));
    let finalName = name;
    if (existingNames.has(finalName.toLowerCase())) {
      let i = 2;
      while (existingNames.has(`${name} ${i}`.toLowerCase())) i++;
      finalName = `${name} ${i}`;
    }

    game.players.set(socket.id, { name: finalName, score: 0, answered: false });
    socket.join(code);

    cb?.({ ok: true, name: finalName });
    io.to(code).emit("lobby_update", publicLobbyState(game));
  });

  socket.on("start_game", ({ code, adminPin }, cb) => {
    code = (code || "").toUpperCase().trim();
    const game = games.get(code);
    if (!game) return cb?.({ ok: false, error: "Lobby saknas." });
    if (!isAdmin(game, socket, adminPin)) return cb?.({ ok: false, error: "Fel admin-PIN." });

    // If admin reconnects, lock hostSocketId to this socket.
    game.hostSocketId = socket.id;

    game.started = true;
    for (const p of game.players.values()) {
      p.answered = false;
      p.lastAnswer = undefined;
    }

    io.to(code).emit("game_started", publicLobbyState(game));
    io.to(code).emit("question", currentQuestion(game));
    cb?.({ ok: true });
  });

  socket.on("answer", ({ code, optionIndex }, cb) => {
    code = (code || "").toUpperCase().trim();
    const game = games.get(code);
    if (!game || !game.started) return cb?.({ ok: false, error: "Spelet är inte igång." });

    const player = game.players.get(socket.id);
    if (!player) return cb?.({ ok: false, error: "Du är inte med i lobbyn." });
    if (player.answered) return cb?.({ ok: true });

    const qIdx = game.questionOrder[game.questionIndex];
    const correct = game.questionPool[qIdx].correct;

    player.answered = true;
    player.lastAnswer = optionIndex;

    if (optionIndex === correct) player.score += 1;

    io.to(code).emit("lobby_update", publicLobbyState(game));
    cb?.({ ok: true });
  });

  socket.on("reveal_results", ({ code, adminPin }, cb) => {
    code = (code || "").toUpperCase().trim();
    const game = games.get(code);
    if (!game) return cb?.({ ok: false, error: "Lobby saknas." });
    if (!game.started) return cb?.({ ok: false, error: "Spelet är inte startat." });
    if (!isAdmin(game, socket, adminPin)) return cb?.({ ok: false, error: "Fel admin-PIN." });

    // bind admin socket
    game.hostSocketId = socket.id;

    const res = questionResults(game);
    // Send only to admin (privacy + no spoilers)
    socket.emit("question_results", res);
    cb?.({ ok: true });
  });

  socket.on("next_question", ({ code, adminPin }, cb) => {
    code = (code || "").toUpperCase().trim();
    const game = games.get(code);
    if (!game) return cb?.({ ok: false, error: "Lobby saknas." });
    if (!game.started) return cb?.({ ok: false, error: "Spelet är inte startat." });
    if (!isAdmin(game, socket, adminPin)) return cb?.({ ok: false, error: "Fel admin-PIN." });

    game.hostSocketId = socket.id;

    game.questionIndex += 1;

    for (const p of game.players.values()) {
      p.answered = false;
      p.lastAnswer = undefined;
    }

    if (game.questionIndex >= game.questionOrder.length) {
      io.to(code).emit("game_over", publicLobbyState(game));
      cb?.({ ok: true, done: true });
      return;
    }

    io.to(code).emit("question", currentQuestion(game));
    io.to(code).emit("lobby_update", publicLobbyState(game));
    cb?.({ ok: true });
  });

  socket.on("end_game", ({ code, adminPin }, cb) => {
    code = (code || "").toUpperCase().trim();
    const game = games.get(code);
    if (!game) return cb?.({ ok: false, error: "Lobby saknas." });
    if (!isAdmin(game, socket, adminPin)) return cb?.({ ok: false, error: "Fel admin-PIN." });

    io.to(code).emit("game_over", publicLobbyState(game));
    games.delete(code);
    cb?.({ ok: true });
  });

  socket.on("disconnect", () => {
    for (const [code, game] of games.entries()) {
      let changed = false;

      // If admin disconnects: keep game alive (admin can reconnect using PIN)
      if (game.hostSocketId === socket.id) {
        game.hostSocketId = null;
        changed = true;
      }

      if (game.players.has(socket.id)) {
        game.players.delete(socket.id);
        changed = true;
      }

      if (changed) io.to(code).emit("lobby_update", publicLobbyState(game));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Backend on :${PORT} (frontend origin: ${FRONTEND_ORIGIN})`);
});
