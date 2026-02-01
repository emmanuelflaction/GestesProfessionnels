import { WebSocketServer } from "ws";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 8787;
const wss = new WebSocketServer({ port: PORT });

/**
 * In-memory sessions:
 * sessionId -> {
 *   id, createdAt,
 *   players: [{id,name,ws,ready,position}],
 *   settings: {maxPlayers, boardSize, timerSec, scoring, difficulty},
 *   state: { status, turnIndex, phase, roll, cellType, card, answer, judging, history }
 * }
 */
const sessions = new Map();

function uid(prefix = "") {
  return prefix + crypto.randomBytes(6).toString("hex");
}

function safeSend(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch {}
}

function broadcast(session, obj) {
  for (const p of session.players) safeSend(p.ws, obj);
}

function publicSessionView(session) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    settings: session.settings,
    state: session.state,
    players: session.players.map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      position: p.position
    }))
  };
}

function ensureSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("SESSION_NOT_FOUND");
  return s;
}

function nextTurn(session) {
  const n = session.players.length;
  if (n === 0) return;
  session.state.turnIndex = (session.state.turnIndex + 1) % n;
  session.state.phase = "roll";
  session.state.roll = null;
  session.state.cellType = null;
  session.state.card = null;
  session.state.answer = null;
  session.state.judging = { questions: [], votes: [], result: null };
}

function computeCellType(pos) {
  // Simple mapping by modulo: adjust later as needed
  const mod = pos % 10;
  if (mod === 0) return "analysis";
  if (mod === 3) return "constraint";
  if (mod === 6) return "twist";
  if (mod === 8) return "bonus";
  if (mod === 5) return "quick_choice";
  return "situation";
}

// Decks loaded from ./decks.json (generated from your .xlsx)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DECKS = { scenarios: [], constraints: [], twists: [] };
try {
  const raw = fs.readFileSync(path.join(__dirname, "decks.json"), "utf-8");
  const parsed = JSON.parse(raw);
  DECKS = {
    scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
    constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
    twists: Array.isArray(parsed.twists) ? parsed.twists : []
  };
  console.log(`Loaded decks: scenarios=${DECKS.scenarios.length}, constraints=${DECKS.constraints.length}, twists=${DECKS.twists.length}`);
} catch (e) {
  console.warn("Could not load decks.json; falling back to empty decks.", e?.message);
}

function draw(deckName) {
  const arr = DECKS[deckName] || [];
  return arr[Math.floor(Math.random() * arr.length)];
}

wss.on("connection", (ws) => {
  const clientId = uid("c_");
  safeSend(ws, { type: "hello", clientId, serverPort: PORT });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    try {
      if (msg.type === "session:create") {
        const sessionId = uid("s_");
        const session = {
          id: sessionId,
          createdAt: new Date().toISOString(),
          players: [],
          settings: {
            maxPlayers: Math.min(Math.max(msg.maxPlayers ?? 4, 2), 4),
            boardSize: msg.boardSize ?? 40,
            timerSec: msg.timerSec ?? 180,
            scoring: !!msg.scoring,
            difficulty: msg.difficulty ?? "medium"
          },
          state: {
            status: "lobby", // lobby | playing | ended
            turnIndex: 0,
            phase: "roll",   // roll | answer | judge | resolve | ended
            roll: null,
            cellType: null,
            card: null,
            answer: null,
            judging: { questions: [], votes: [], result: null },
            history: []
          }
        };
        sessions.set(sessionId, session);
        safeSend(ws, { type: "session:created", session: publicSessionView(session) });
        return;
      }

      if (msg.type === "session:join") {
        const session = ensureSession(msg.sessionId);
        if (session.players.length >= session.settings.maxPlayers) {
          safeSend(ws, { type: "error", code: "SESSION_FULL" });
          return;
        }
        const playerId = uid("p_");
        const name = (msg.name ?? "Joueur").toString().slice(0, 24);

        session.players.push({ id: playerId, name, ws, ready: false, position: 0 });
        ws._sessionId = session.id;
        ws._playerId = playerId;

        // send join acknowledgement so the client can know its playerId
        safeSend(ws, { type: "session:joined", sessionId: session.id, playerId });

        broadcast(session, { type: "session:update", session: publicSessionView(session) });
        return;
      }

      if (msg.type === "lobby:ready") {
        const session = ensureSession(ws._sessionId);
        const p = session.players.find(x => x.id === ws._playerId);
        if (!p) return;
        p.ready = !!msg.ready;
        broadcast(session, { type: "session:update", session: publicSessionView(session) });
        return;
      }

      if (msg.type === "game:start") {
        const session = ensureSession(ws._sessionId);
        if (session.state.status !== "lobby") return;

        const allReady = session.players.length >= 2 && session.players.every(p => p.ready);
        if (!allReady) {
          safeSend(ws, { type: "error", code: "NOT_ALL_READY" });
          return;
        }

        session.state.status = "playing";
        session.state.turnIndex = 0;
        session.state.phase = "roll";
        session.state.history = [];
        session.players.forEach(p => (p.position = 0));

        broadcast(session, { type: "session:update", session: publicSessionView(session) });
        return;
      }

      if (msg.type === "turn:roll") {
        const session = ensureSession(ws._sessionId);
        if (session.state.status !== "playing") return;

        const active = session.players[session.state.turnIndex];
        if (!active || active.id !== ws._playerId) {
          safeSend(ws, { type: "error", code: "NOT_YOUR_TURN" });
          return;
        }
        if (session.state.phase !== "roll") return;

        const roll = Math.floor(Math.random() * 6) + 1;
        active.position = Math.min(active.position + roll, session.settings.boardSize);

        const cellType = computeCellType(active.position);
        let card;
        if (cellType === "constraint") card = { type: "constraint", ...draw("constraints") };
        else if (cellType === "twist") card = { type: "twist", ...draw("twists") };
        else if (cellType === "analysis") card = { type: "analysis", id: "an_001", text: "Analyse : active un calque et explicite une priorité (savoirs / climat / équité / temps)." };
        else if (cellType === "quick_choice") card = { type: "quick_choice", id: "qc_001", text: "Choix rapide : que fais-tu en premier ? (30 sec)" };
        else if (cellType === "bonus") card = { type: "bonus", id: "bo_001", text: "Bonus : si ta réponse est jugée convaincante, avance +1." };
        else card = { type: "scenario", ...draw("scenarios") };

        session.state.roll = roll;
        session.state.cellType = cellType;
        session.state.card = card;
        session.state.answer = null;
        session.state.judging = { questions: [], votes: [], result: null };
        session.state.phase = "answer";

        broadcast(session, { type: "session:update", session: publicSessionView(session) });
        return;
      }

      if (msg.type === "turn:submit_answer") {
        const session = ensureSession(ws._sessionId);
        const active = session.players[session.state.turnIndex];
        if (!active || active.id !== ws._playerId) {
          safeSend(ws, { type: "error", code: "NOT_YOUR_TURN" });
          return;
        }
        if (session.state.phase !== "answer") return;

        const answer = msg.answer ?? {};
        answer.text = (answer.text ?? "").toString().slice(0, 2000);
        answer.gpCards = Array.isArray(answer.gpCards) ? answer.gpCards.slice(0, 8) : [];
        answer.justification = (answer.justification ?? "").toString().slice(0, 2000);

        session.state.answer = { ...answer, byPlayerId: active.id, at: new Date().toISOString() };
        session.state.phase = "judge";

        broadcast(session, { type: "session:update", session: publicSessionView(session) });
        return;
      }

      if (msg.type === "judge:ask_question") {
        const session = ensureSession(ws._sessionId);
        if (session.state.phase !== "judge") return;
        const judgeId = ws._playerId;
        const active = session.players[session.state.turnIndex];
        if (judgeId === active?.id) return;

        const question = (msg.question ?? "").toString().slice(0, 300);
        if (!question) return;

        session.state.judging.questions.push({ judgeId, question, at: new Date().toISOString() });
        broadcast(session, { type: "session:update", session: publicSessionView(session) });
        return;
      }

      if (msg.type === "judge:vote") {
        const session = ensureSession(ws._sessionId);
        if (session.state.phase !== "judge") return;
        const judgeId = ws._playerId;
        const active = session.players[session.state.turnIndex];
        if (judgeId === active?.id) return;

        const vote = msg.vote; // "convincing" | "partial" | "no"
        if (!["convincing","partial","no"].includes(vote)) return;

        session.state.judging.votes = session.state.judging.votes.filter(v => v.judgeId !== judgeId);
        session.state.judging.votes.push({
          judgeId,
          vote,
          comment: (msg.comment ?? "").toString().slice(0, 300),
          at: new Date().toISOString()
        });

        const judgesCount = session.players.length - 1;
        if (session.state.judging.votes.length >= judgesCount) {
          session.state.phase = "resolve";

          const counts = { convincing: 0, partial: 0, no: 0 };
          for (const v of session.state.judging.votes) counts[v.vote]++;

          let result = "partial";
          if (counts.no > Math.max(counts.convincing, counts.partial)) result = "no";
          else if (counts.convincing > Math.max(counts.partial, counts.no)) result = "convincing";

          session.state.judging.result = result;

          const activePlayer = session.players[session.state.turnIndex];
          if (result === "convincing") {
            if (session.state.cellType === "bonus") {
              activePlayer.position = Math.min(activePlayer.position + 1, session.settings.boardSize);
            }
          } else if (result === "no") {
            activePlayer.position = Math.max(activePlayer.position - 1, 0);
          }

          session.state.history.push({
            at: new Date().toISOString(),
            activePlayerId: activePlayer.id,
            roll: session.state.roll,
            cellType: session.state.cellType,
            card: session.state.card,
            answer: session.state.answer,
            judging: session.state.judging
          });

          if (activePlayer.position >= session.settings.boardSize) {
            session.state.status = "ended";
            session.state.phase = "ended";
          } else {
            nextTurn(session);
          }
        }

        broadcast(session, { type: "session:update", session: publicSessionView(session) });
        return;
      }

    } catch (e) {
      safeSend(ws, { type: "error", code: "SERVER_ERROR", message: e?.message ?? "error" });
    }
  });

  ws.on("close", () => {
    const sessionId = ws._sessionId;
    const playerId = ws._playerId;
    if (!sessionId || !playerId) return;

    const session = sessions.get(sessionId);
    if (!session) return;

    session.players = session.players.filter(p => p.id !== playerId);

    if (session.players.length === 0) {
      sessions.delete(sessionId);
      return;
    }

    // If game running and active player left, normalize state
    if (session.state.status === "playing") {
      const active = session.players[session.state.turnIndex];
      if (!active) {
        session.state.turnIndex = 0;
        session.state.phase = "roll";
      }
    }
    broadcast(session, { type: "session:update", session: publicSessionView(session) });
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
