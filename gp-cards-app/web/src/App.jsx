import React, { useEffect, useMemo, useState } from "react";
import cardsData from "./data/cards.json";

const DEFAULT_LIBRARY = Array.isArray(cardsData) ? cardsData : [];

const DEFAULT_TEMPLATE = [
  { id: "c1", label: "Mise en route" },
  { id: "c2", label: "Lancement / consigne" },
  { id: "c3", label: "Travail" },
  { id: "c4", label: "Régulations" },
  { id: "c5", label: "Institutionnalisation" },
  { id: "c6", label: "Clôture / transition" }
];

const LS_KEY = "gp_cards_app_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}
function uuid(prefix="") { return prefix + Math.random().toString(16).slice(2) + Date.now().toString(16); }

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const persisted = loadState();

  const [route, setRoute] = useState(persisted?.route ?? "home");
  const [library, setLibrary] = useState(persisted?.library ?? DEFAULT_LIBRARY);

  const [planProject, setPlanProject] = useState(persisted?.planProject ?? newPlanProject());
  const [obsProject, setObsProject] = useState(persisted?.obsProject ?? newObsProject());

  const [wsUrl, setWsUrl] = useState(persisted?.wsUrl ?? "ws://localhost:8787");
  const [gameClient, setGameClient] = useState(persisted?.gameClient ?? null); // { clientId, sessionId, playerId, name }
  const [gameSession, setGameSession] = useState(null);
  const [gameName, setGameName] = useState(persisted?.gameClient?.name ?? "Joueur");
  const [joinCode, setJoinCode] = useState("");

  const [rightTab, setRightTab] = useState("details");
  const [selectedCardId, setSelectedCardId] = useState(null);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    saveState({ route, library, planProject, obsProject, wsUrl, gameClient });
  }, [route, library, planProject, obsProject, wsUrl, gameClient]);

  const filteredCards = useMemo(() => {
    const query = q.trim().toLowerCase();
    return library.filter(c => {
      const okType = typeFilter === "all" ? true : c.type === typeFilter;
      if (!okType) return false;
      if (!query) return true;
      const hay = `${c.title} ${c.short_def} ${(c.tags||[]).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
  }, [library, q, typeFilter]);

  const selectedCard = useMemo(() => library.find(c => c.id === selectedCardId) ?? null, [library, selectedCardId]);

  // WebSocket lifecycle
  const [ws, setWs] = useState(null);

  useEffect(() => {
    return () => { try { ws?.close(); } catch {} };
  }, [ws]);

  function connectWs() {
    if (ws && ws.readyState === 1) return;
    const socket = new WebSocket(wsUrl);
    setWs(socket);

    socket.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === "hello") {
        setGameClient(prev => ({ ...(prev||{}), clientId: msg.clientId, name: gameName }));
      }
      if (msg.type === "session:created") setGameSession(msg.session);
      if (msg.type === "session:update") setGameSession(msg.session);

      if (msg.type === "session:joined") {
        setGameClient(prev => ({ ...(prev||{}), sessionId: msg.sessionId, playerId: msg.playerId, name: gameName }));
      }
      if (msg.type === "error") {
        alert(`Erreur: ${msg.code}${msg.message ? " — " + msg.message : ""}`);
      }
    };

    socket.onclose = () => setWs(null);
  }

  function wsSend(obj) {
    if (!ws || ws.readyState !== 1) {
      alert("WebSocket non connecté. Démarre le serveur puis clique sur Connecter.");
      return;
    }
    ws.send(JSON.stringify(obj));
  }

  function onDragStartCard(e, cardId) {
    e.dataTransfer.setData("text/plain", cardId);
  }

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <span>GP Cards</span>
          <span className="badge">Web • 3 modes</span>
        </div>

        <div className="row">
          <button className={"btn " + (route==="home" ? "primary": "")} onClick={() => setRoute("home")}>Accueil</button>
          <button className={"btn " + (route==="plan" ? "primary": "")} onClick={() => { setRoute("plan"); setRightTab("details"); }}>Planification</button>
          <button className={"btn " + (route==="obs" ? "primary": "")} onClick={() => { setRoute("obs"); setRightTab("details"); }}>Observation</button>
          <button className={"btn " + (route==="game" ? "primary": "")} onClick={() => { setRoute("game"); setRightTab("details"); }}>Jeu</button>
        </div>
      </div>

      <div className="container">
        {route === "home" && (
          <Home
            onGoPlan={() => setRoute("plan")}
            onGoObs={() => setRoute("obs")}
            onGoGame={() => setRoute("game")}
            libraryCount={library.length}
            onExportAll={() => downloadJson("gp-cards-export.json", { library, planProject, obsProject })}
            onReset={() => {
              if (!confirm("Réinitialiser tout (bibliothèque + projets) ?")) return;
              setLibrary(DEFAULT_LIBRARY);
              setPlanProject(newPlanProject());
              setObsProject(newObsProject());
              setSelectedCardId(null);
            }}
          />
        )}

        {route === "plan" && (
          <Editor3Cols
            mode="planification"
            filteredCards={filteredCards}
            q={q} setQ={setQ}
            typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            onDragStartCard={onDragStartCard}
            onSelectCard={setSelectedCardId}
            selectedCard={selectedCard}
            rightTab={rightTab}
            setRightTab={setRightTab}
            project={planProject}
            setProject={setPlanProject}
            library={library}
          />
        )}

        {route === "obs" && (
          <Editor3Cols
            mode="observation"
            filteredCards={filteredCards}
            q={q} setQ={setQ}
            typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            onDragStartCard={onDragStartCard}
            onSelectCard={setSelectedCardId}
            selectedCard={selectedCard}
            rightTab={rightTab}
            setRightTab={setRightTab}
            project={obsProject}
            setProject={setObsProject}
            library={library}
          />
        )}

        {route === "game" && (
          <GameMode
            wsUrl={wsUrl}
            setWsUrl={setWsUrl}
            connectWs={connectWs}
            wsConnected={!!ws && ws.readyState===1}
            gameSession={gameSession}
            setGameSession={setGameSession}
            wsSend={wsSend}
            gameName={gameName}
            setGameName={setGameName}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            library={library}
            gameClient={gameClient}
          />
        )}
      </div>
    </div>
  );
}

function Home({ onGoPlan, onGoObs, onGoGame, libraryCount, onExportAll, onReset }) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <div>Accueil</div>
        <div className="muted">Bibliothèque : {libraryCount} cartes</div>
      </div>
      <div className="panelBody">
        <div className="row" style={{gap: 10, flexWrap: "wrap"}}>
          <button className="btn primary" onClick={onGoPlan}>Nouveau • Planification</button>
          <button className="btn primary" onClick={onGoObs}>Nouveau • Observation</button>
          <button className="btn primary" onClick={onGoGame}>Nouveau • Jeu</button>
        </div>
        <hr />
        <div className="row" style={{gap: 10, flexWrap: "wrap"}}>
          <button className="btn" onClick={onExportAll}>Exporter tout (JSON)</button>
          <button className="btn danger" onClick={onReset}>Réinitialiser</button>
        </div>
        <p className="muted" style={{marginTop: 12}}>
          MVP : Planification/Observation fonctionnent offline (stockage local). Le mode Jeu multijoueur utilise un serveur WebSocket.
        </p>
      </div>
    </div>
  );
}

function Editor3Cols({
  mode,
  filteredCards,
  q, setQ,
  typeFilter, setTypeFilter,
  onDragStartCard,
  onSelectCard,
  selectedCard,
  rightTab,
  setRightTab,
  project,
  setProject,
  library
}) {
  const isObs = mode === "observation";
  const activeVariant = project.variants.find(v => v.id === project.activeVariantId) || project.variants[0];
  const columns = project.template;

  function addPlacedCard(cardId, columnId) {
    const card = library.find(c => c.id === cardId);
    if (!card) return;

    const placed = {
      id: uuid("pc_"),
      cardId,
      columnId,
      order: Date.now(),
      notes: "",
      evidence: "",
      confidence: "probable"
    };

    setProject(prev => {
      const next = structuredClone(prev);
      const v = next.variants.find(x => x.id === next.activeVariantId);
      v.placedCards.push(placed);
      return next;
    });

    onSelectCard(cardId);
  }

  function onDropToColumn(e, columnId) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;
    addPlacedCard(cardId, columnId);
  }

  function removePlaced(placedId) {
    setProject(prev => {
      const next = structuredClone(prev);
      const v = next.variants.find(x => x.id === next.activeVariantId);
      v.placedCards = v.placedCards.filter(p => p.id !== placedId);
      return next;
    });
  }

  function updatePlaced(placedId, patch) {
    setProject(prev => {
      const next = structuredClone(prev);
      const v = next.variants.find(x => x.id === next.activeVariantId);
      const p = v.placedCards.find(x => x.id === placedId);
      if (!p) return prev;
      Object.assign(p, patch);
      return next;
    });
  }

  function addVariant() {
    setProject(prev => {
      const next = structuredClone(prev);
      const newId = uuid("v_");
      next.variants.push({ id: newId, name: `Variante ${next.variants.length+1}`, placedCards: [] });
      next.activeVariantId = newId;
      return next;
    });
  }

  function exportProject() {
    const filename = `gp-${mode}-${project.title.replace(/\s+/g,"_").toLowerCase()}.json`;
    downloadJson(filename, project);
  }

  function addSegment() {
    if (!isObs) return;
    setProject(prev => {
      const next = structuredClone(prev);
      next.segments.push({ id: uuid("seg_"), label: `Segment ${next.segments.length+1}`, from: "", to: "" });
      return next;
    });
  }

  return (
    <div className="grid3">
      <div className="panel">
        <div className="panelHeader">
          <div>Bibliothèque</div>
          <div className="row" style={{gap: 8}}>
            <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)} title="Filtre type">
              <option value="all">Tout</option>
              <option value="gp">GP</option>
              <option value="contrainte">Contraintes</option>
              <option value="analyse">Analyse</option>
              <option value="numerique">Numérique</option>
              <option value="moment">Moment</option>
              <option value="posture">Posture</option>
              <option value="focale">Focale</option>
              <option value="preoccupation">Préoccupation</option>
            </select>
          </div>
        </div>
        <div className="panelBody">
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Rechercher…" />
          <div style={{height: 10}} />
          <div className="list">
            {filteredCards.map(c => (
              <div
                key={c.id}
                className="cardItem"
                draggable
                onDragStart={(e)=>onDragStartCard(e, c.id)}
                onClick={() => onSelectCard(c.id)}
                title="Glisser-déposer vers le plateau"
              >
                <div className="row" style={{justifyContent:"space-between"}}>
                  <strong>{c.title}</strong>
                  <span className="pill">{c.type}</span>
                </div>
                <div className="small">{c.short_def}</div>
                <div className="row" style={{gap: 6, flexWrap:"wrap", marginTop: 6}}>
                  {(c.tags||[]).slice(0,3).map(t => <span key={t} className="pill">{t}</span>)}
                </div>
              </div>
            ))}
            {filteredCards.length === 0 && <div className="muted">Aucune carte.</div>}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div>
            <div style={{fontWeight: 750}}>{mode === "planification" ? "Planification" : "Observation"} — {project.title}</div>
            <div className="small muted">
              {activeVariant?.name} • {activeVariant?.placedCards?.length ?? 0} cartes posées
            </div>
          </div>
          <div className="row" style={{gap: 8, flexWrap:"wrap", justifyContent:"flex-end"}}>
            <button className="btn" onClick={addVariant}>+ Variante</button>
            {isObs && <button className="btn" onClick={addSegment}>+ Segment</button>}
            <button className="btn" onClick={exportProject}>Exporter (JSON)</button>
          </div>
        </div>

        {isObs && (
          <div className="panelBody">
            <div className="muted small">Segments (optionnels)</div>
            <div className="list" style={{marginTop: 8}}>
              {project.segments.map(seg => (
                <div key={seg.id} className="placed">
                  <div className="row" style={{justifyContent:"space-between"}}>
                    <strong>{seg.label}</strong>
                    <button className="btn danger" onClick={() => {
                      setProject(prev => {
                        const next = structuredClone(prev);
                        next.segments = next.segments.filter(s => s.id !== seg.id);
                        return next;
                      });
                    }}>Suppr.</button>
                  </div>
                  <div className="split" style={{marginTop: 6}}>
                    <input placeholder="De (ex. 10:15)" value={seg.from} onChange={(e)=>{
                      setProject(prev => {
                        const next = structuredClone(prev);
                        const s = next.segments.find(x => x.id === seg.id);
                        s.from = e.target.value;
                        return next;
                      });
                    }} />
                    <input placeholder="À (ex. 10:22)" value={seg.to} onChange={(e)=>{
                      setProject(prev => {
                        const next = structuredClone(prev);
                        const s = next.segments.find(x => x.id === seg.id);
                        s.to = e.target.value;
                        return next;
                      });
                    }} />
                  </div>
                </div>
              ))}
              {project.segments.length === 0 && <div className="muted small">Aucun segment — tu peux en ajouter si utile.</div>}
            </div>
            <hr />
          </div>
        )}

        <div className="panelBody">
          <div className="columns">
            {columns.map(col => (
              <div key={col.id} className="column"
                   onDragOver={(e)=>e.preventDefault()}
                   onDrop={(e)=>onDropToColumn(e, col.id)}
              >
                <div className="columnHeader">{col.label}</div>
                <div className="dropZone">
                  {activeVariant.placedCards
                    .filter(p => p.columnId === col.id)
                    .sort((a,b)=>a.order-b.order)
                    .map(p => {
                      const card = library.find(c => c.id === p.cardId);
                      return (
                        <div key={p.id} className="placed" onClick={() => onSelectCard(p.cardId)}>
                          <div className="row" style={{justifyContent:"space-between"}}>
                            <strong style={{fontSize: 14}}>{card?.title ?? p.cardId}</strong>
                            <button className="btn danger" onClick={(e)=>{ e.stopPropagation(); removePlaced(p.id); }}>×</button>
                          </div>
                          <div className="small">{card?.short_def ?? ""}</div>
                          <div className="small muted" style={{marginTop: 6}}>Notes (instance)</div>
                          <textarea
                            value={p.notes}
                            onChange={(e)=>updatePlaced(p.id, { notes: e.target.value })}
                            placeholder="Notes…"
                          />
                          {isObs && (
                            <>
                              <div className="small muted" style={{marginTop: 6}}>Preuve (factuelle)</div>
                              <textarea
                                value={p.evidence}
                                onChange={(e)=>updatePlaced(p.id, { evidence: e.target.value })}
                                placeholder="Verbatim / faits observables…"
                              />
                              <div className="row" style={{marginTop: 6}}>
                                <span className="small muted">Confiance</span>
                                <select
                                  value={p.confidence}
                                  onChange={(e)=>updatePlaced(p.id, { confidence: e.target.value })}
                                >
                                  <option value="certain">certain</option>
                                  <option value="probable">probable</option>
                                  <option value="hypothese">hypothèse</option>
                                </select>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  {activeVariant.placedCards.filter(p => p.columnId === col.id).length === 0 && (
                    <div className="muted small">Glisse ici…</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div>Panneau</div>
          <div className="muted small">{selectedCard ? selectedCard.id : "Aucune carte sélectionnée"}</div>
        </div>

        <div className="tabs">
          <button className={"tab " + (rightTab==="details" ? "active":"")} onClick={()=>setRightTab("details")}>Détails</button>
          <button className={"tab " + (rightTab==="calques" ? "active":"")} onClick={()=>setRightTab("calques")}>Calques</button>
          <button className={"tab " + (rightTab==="synthese" ? "active":"")} onClick={()=>setRightTab("synthese")}>Synthèse</button>
        </div>

        <div className="panelBody">
          {rightTab === "details" && (
            <div>
              {selectedCard ? (
                <>
                  <div className="row" style={{justifyContent:"space-between"}}>
                    <strong>{selectedCard.title}</strong>
                    <span className="pill">{selectedCard.type}</span>
                  </div>
                  <p className="muted">{selectedCard.short_def}</p>
                  <div className="small muted">Indicateurs</div>
                  <ul>
                    {(selectedCard.indicators || []).map((it, idx) => <li key={idx}>{it}</li>)}
                  </ul>
                  <div className="small muted">Tags</div>
                  <div className="row" style={{gap: 6, flexWrap:"wrap"}}>
                    {(selectedCard.tags||[]).map(t => <span key={t} className="pill">{t}</span>)}
                  </div>
                </>
              ) : <div className="muted">Clique une carte dans la bibliothèque ou sur le plateau.</div>}
            </div>
          )}

          {rightTab === "calques" && (
            <CalquesSummary placed={activeVariant.placedCards} library={library} />
          )}

          {rightTab === "synthese" && (
            <Synthesis mode={mode} project={project} activeVariant={activeVariant} library={library} />
          )}
        </div>
      </div>
    </div>
  );
}

function CalquesSummary({ placed, library }) {
  const counts = useMemo(() => {
    const c = {};
    for (const p of placed) {
      const card = library.find(x => x.id === p.cardId);
      const ma = card?.attributes?.multi_agenda || [];
      for (const k of ma) c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [placed, library]);

  const keys = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);

  return (
    <div>
      <div className="muted">Calques (MVP) : comptage par “multi-agenda”.</div>
      <div style={{height: 10}} />
      {keys.length === 0 ? (
        <div className="muted">Aucune donnée de calque (pose des cartes GP avec attributs).</div>
      ) : (
        <div className="list">
          {keys.map(k => (
            <div key={k} className="placed">
              <div className="row" style={{justifyContent:"space-between"}}>
                <strong>{k}</strong>
                <span className="pill">{counts[k]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <hr />
      <div className="small muted">
        Extension prévue : surlignage sur le plateau + légende + postures/focales/numérique.
      </div>
    </div>
  );
}

function Synthesis({ mode, project, activeVariant, library }) {
  const byType = useMemo(() => {
    const c = { gp: 0, contrainte: 0, analyse: 0, numerique: 0, moment: 0, posture: 0, focale: 0, preoccupation: 0 };
    for (const p of activeVariant.placedCards) {
      const card = library.find(x => x.id === p.cardId);
      if (card?.type && c[card.type] !== undefined) c[card.type]++;
    }
    return c;
  }, [activeVariant, library]);

  const checklist = useMemo(() => {
    const hasPilotage = activeVariant.placedCards.some(p => (library.find(x => x.id === p.cardId)?.attributes?.multi_agenda || []).includes("pilotage"));
    const hasEtayage = activeVariant.placedCards.some(p => (library.find(x => x.id === p.cardId)?.attributes?.multi_agenda || []).includes("étayage"));
    const hasAtmos = activeVariant.placedCards.some(p => (library.find(x => x.id === p.cardId)?.attributes?.multi_agenda || []).includes("atmosphère"));

    if (mode === "observation") {
      const evidenceMissing = activeVariant.placedCards.filter(p => !p.evidence?.trim()).length;
      return [
        { ok: evidenceMissing === 0, label: `Preuves renseignées (manquantes : ${evidenceMissing})` },
        { ok: true, label: "Faits / interprétations : vérifier dans les notes" }
      ];
    }
    return [
      { ok: hasPilotage, label: "Au moins un geste lié au pilotage" },
      { ok: hasEtayage, label: "Au moins un geste lié à l’étayage" },
      { ok: hasAtmos, label: "Au moins un geste lié à l’atmosphère" }
    ];
  }, [mode, activeVariant, library]);

  return (
    <div>
      <div className="row" style={{justifyContent:"space-between"}}>
        <strong>Synthèse</strong>
        <button className="btn" onClick={() => downloadJson(`export-${mode}.json`, project)}>Exporter projet</button>
      </div>

      <div style={{height: 10}} />
      <div className="small muted">Répartition par types</div>
      <div className="list" style={{marginTop: 8}}>
        {Object.entries(byType).map(([k,v]) => (
          <div key={k} className="placed">
            <div className="row" style={{justifyContent:"space-between"}}>
              <strong>{k}</strong>
              <span className="pill">{v}</span>
            </div>
          </div>
        ))}
      </div>

      <hr />
      <div className="small muted">Checklist formative (MVP)</div>
      <div className="list" style={{marginTop: 8}}>
        {checklist.map((it, idx) => (
          <div key={idx} className="placed">
            <div className="row" style={{justifyContent:"space-between"}}>
              <span>{it.label}</span>
              <span className="pill">{it.ok ? "OK" : "À voir"}</span>
            </div>
          </div>
        ))}
      </div>

      <hr />
      <div className="small muted">
        Extensions : comparaison variantes + exports PDF/PNG + checklists personnalisables.
      </div>
    </div>
  );
}

function GameMode({
  wsUrl, setWsUrl, connectWs, wsConnected,
  gameSession, setGameSession, wsSend,
  gameName, setGameName, joinCode, setJoinCode,
  library, gameClient
}) {
  const [createMaxPlayers, setCreateMaxPlayers] = useState(4);
  const [createBoardSize, setCreateBoardSize] = useState(40);
  const [createTimer, setCreateTimer] = useState(180);

  const myPlayerId = gameClient?.playerId ?? null;
  const status = gameSession?.state?.status ?? "no-session";
  const phase = gameSession?.state?.phase ?? "";

  const activePlayer = useMemo(() => {
    if (!gameSession) return null;
    return gameSession.players?.[gameSession.state.turnIndex] ?? null;
  }, [gameSession]);

  const isLobby = status === "lobby";
  const isPlaying = status === "playing";
  const isEnded = status === "ended";

  const amIActive = !!myPlayerId && activePlayer?.id === myPlayerId;

  return (
    <div className="panel">
      <div className="panelHeader">
        <div>Mode Jeu — multijoueur (jeu de l’oie)</div>
        <div className="row" style={{gap: 8}}>
          <span className="badge">{wsConnected ? "WS connecté" : "WS non connecté"}</span>
          {myPlayerId && <span className="badge">Mon ID: {myPlayerId.slice(0,6)}…</span>}
        </div>
      </div>

      <div className="panelBody">
        <div className="split">
          <div>
            <div className="small muted">Serveur WebSocket</div>
            <input value={wsUrl} onChange={(e)=>setWsUrl(e.target.value)} placeholder="ws://localhost:8787" />
            <div style={{height: 8}} />
            <button className="btn primary" onClick={connectWs}>Connecter</button>
          </div>
          <div>
            <div className="small muted">Nom</div>
            <input value={gameName} onChange={(e)=>setGameName(e.target.value)} placeholder="Joueur" />
          </div>
        </div>

        <hr />

        {!gameSession && (
          <div className="split">
            <div className="panel" style={{padding: 10}}>
              <strong>Créer une partie</strong>
              <div className="small muted" style={{marginTop: 6}}>2–4 joueurs, lobby + ready.</div>
              <div style={{height: 8}} />
              <div className="split">
                <div>
                  <div className="small muted">Max joueurs</div>
                  <select value={createMaxPlayers} onChange={(e)=>setCreateMaxPlayers(parseInt(e.target.value,10))}>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                </div>
                <div>
                  <div className="small muted">Taille plateau</div>
                  <input value={createBoardSize} onChange={(e)=>setCreateBoardSize(parseInt(e.target.value||"40",10))} />
                </div>
              </div>
              <div style={{height: 8}} />
              <div>
                <div className="small muted">Timer (sec / tour)</div>
                <input value={createTimer} onChange={(e)=>setCreateTimer(parseInt(e.target.value||"180",10))} />
              </div>
              <div style={{height: 10}} />
              <button className="btn primary" onClick={() => wsSend({ type: "session:create", maxPlayers: createMaxPlayers, boardSize: createBoardSize, timerSec: createTimer })}>
                Créer
              </button>
            </div>

            <div className="panel" style={{padding: 10}}>
              <strong>Rejoindre une partie</strong>
              <div className="small muted" style={{marginTop: 6}}>Colle le code de session (ex. s_ab12…).</div>
              <div style={{height: 8}} />
              <input value={joinCode} onChange={(e)=>setJoinCode(e.target.value)} placeholder="Code session" />
              <div style={{height: 10}} />
              <button className="btn primary" onClick={() => wsSend({ type: "session:join", sessionId: joinCode.trim(), name: gameName })}>
                Rejoindre
              </button>
            </div>
          </div>
        )}

        {gameSession && (
          <div className="panel" style={{padding: 10}}>
            <div className="row" style={{justifyContent:"space-between"}}>
              <div>
                <strong>Session</strong> <span className="pill">{gameSession.id}</span>
                <div className="small muted">Statut : {status} • Phase : {phase} • Actif : {activePlayer?.name ?? "—"} {amIActive ? "(moi)" : ""}</div>
              </div>
              <button className="btn danger" onClick={() => { setGameSession(null); }}>Quitter (local)</button>
            </div>

            <hr />

            {isLobby && (
              <Lobby gameSession={gameSession} wsSend={wsSend} />
            )}

            {isPlaying && (
              <GamePlay gameSession={gameSession} wsSend={wsSend} library={library} myPlayerId={myPlayerId} />
            )}

            {isEnded && (
              <GameEnd gameSession={gameSession} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Lobby({ gameSession, wsSend }) {
  return (
    <div>
      <div className="row" style={{justifyContent:"space-between", flexWrap:"wrap", gap: 8}}>
        <div className="muted">
          Partage le code : <span className="pill">{gameSession.id}</span>
        </div>
        <div className="row" style={{gap: 8, flexWrap:"wrap"}}>
          <button className="btn" onClick={() => wsSend({ type: "lobby:ready", ready: true })}>Je suis prêt</button>
          <button className="btn" onClick={() => wsSend({ type: "lobby:ready", ready: false })}>Pas prêt</button>
          <button className="btn primary" onClick={() => wsSend({ type: "game:start" })}>Démarrer</button>
        </div>
      </div>

      <div style={{height: 10}} />
      <div className="small muted">Joueurs</div>
      <div className="list" style={{marginTop: 8}}>
        {gameSession.players.map(p => (
          <div key={p.id} className="placed">
            <div className="row" style={{justifyContent:"space-between"}}>
              <strong>{p.name}</strong>
              <span className="pill">{p.ready ? "prêt" : "en attente"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GamePlay({ gameSession, wsSend, library, myPlayerId }) {
  const boardSize = gameSession.settings.boardSize;
  const cells = useMemo(() => Array.from({ length: boardSize + 1 }, (_, i) => i), [boardSize]);

  const active = gameSession.players[gameSession.state.turnIndex];
  const phase = gameSession.state.phase;
  const card = gameSession.state.card;
  const roll = gameSession.state.roll;
  const cellType = gameSession.state.cellType;
  const answer = gameSession.state.answer;
  const judging = gameSession.state.judging;

  const amIActive = !!myPlayerId && active?.id === myPlayerId;

  const [gpPick, setGpPick] = useState([]);
  const [answerText, setAnswerText] = useState("");
  const [justif, setJustif] = useState("");

  const [qText, setQText] = useState("");
  const [vote, setVote] = useState("partial");
  const [comment, setComment] = useState("");

  useEffect(() => {
    setGpPick([]);
    setAnswerText("");
    setJustif("");
    setQText("");
    setVote("partial");
    setComment("");
  }, [phase, card?.id]);

  const gpOptions = useMemo(() => library.filter(c => c.type === "gp"), [library]);

  return (
    <div className="grid3" style={{gridTemplateColumns: "1fr 420px 360px"}}>
      <div className="panel">
        <div className="panelHeader">
          <div>Plateau (0 → {boardSize})</div>
          <div className="muted small">Tour : {active?.name ?? "?"} • Phase : {phase}</div>
        </div>
        <div className="gameBoard">
          {cells.slice(0, 50).map(n => (
            <div key={n} className="cell" title={`Case ${n}`}>
              <div className="cellNum">{n}</div>
              <div className="tokens">
                {gameSession.players.filter(p => p.position === n).map(p => <span key={p.id} className="token" />)}
              </div>
            </div>
          ))}
        </div>
        {cells.length > 50 && (
          <div className="panelBody muted small">
            MVP affichage plateau : 0–49 uniquement. Extension : plateau déroulant/serpentin.
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div>Carte & tour</div>
          <div className="muted small">Dé : {roll ?? "—"} • Case : {cellType ?? "—"}</div>
        </div>
        <div className="panelBody">
          {phase === "roll" && (
            <>
              <div className="muted">
                Joueur actif : <strong>{active?.name ?? "?"}</strong> {amIActive ? "(toi)" : "(pas toi)"}
              </div>
              <div style={{height: 10}} />
              <button className="btn primary" onClick={() => wsSend({ type: "turn:roll" })} disabled={!amIActive}>
                Lancer le dé
              </button>
              {!amIActive && <div className="small muted" style={{marginTop: 8}}>Attends le joueur actif.</div>}
            </>
          )}

          {phase !== "roll" && (
            <>
              <div className="placed">
                <div className="row" style={{justifyContent:"space-between"}}>
                  <strong>{card?.type ?? "carte"}</strong>
                  <span className="pill">{card?.id ?? ""}</span>
                </div>
                <div style={{marginTop: 6}}>{card?.text ?? "—"}</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div>{amIActive ? "Réponse (joueur actif)" : "Juges (toi)"}</div>
          <div className="muted small">Actif : {active?.name ?? "?"}</div>
        </div>

        <div className="panelBody">
          {phase === "answer" && (
            <>
              {amIActive ? (
                <>
                  <div className="small muted">Choisir 3–7 GP (MVP)</div>
                  <div style={{height: 6}} />
                  <select multiple value={gpPick} onChange={(e)=>{
                    const vals = Array.from(e.target.selectedOptions).map(o=>o.value);
                    setGpPick(vals.slice(0, 8));
                  }}>
                    {gpOptions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>

                  <div style={{height: 8}} />
                  <div className="small muted">Action concrète</div>
                  <textarea value={answerText} onChange={(e)=>setAnswerText(e.target.value)} placeholder="Que fais-tu, dans quel ordre ?" />

                  <div style={{height: 8}} />
                  <div className="small muted">Justification</div>
                  <textarea value={justif} onChange={(e)=>setJustif(e.target.value)} placeholder="Pourquoi ? Effet attendu ? Risques/plan B ?" />

                  <div style={{height: 10}} />
                  <button className="btn primary" onClick={() => wsSend({
                    type: "turn:submit_answer",
                    answer: { gpCards: gpPick, text: answerText, justification: justif }
                  })}>
                    Soumettre
                  </button>
                </>
              ) : (
                <div className="muted">
                  Le joueur actif prépare sa réponse. Tu seras juge ensuite.
                </div>
              )}
            </>
          )}

          {phase === "judge" && (
            <>
              <div className="placed">
                <div className="small muted">Réponse du joueur actif</div>
                <div style={{marginTop: 6}}><strong>GP</strong> : {(answer?.gpCards||[]).join(", ") || "—"}</div>
                <div style={{marginTop: 6}}><strong>Action</strong> : {answer?.text || "—"}</div>
                <div style={{marginTop: 6}}><strong>Justification</strong> : {answer?.justification || "—"}</div>
              </div>

              {!amIActive ? (
                <>
                  <div style={{height: 10}} />
                  <div className="small muted">Question</div>
                  <input value={qText} onChange={(e)=>setQText(e.target.value)} placeholder="Ex. Quel risque as-tu anticipé ?" />
                  <div style={{height: 8}} />
                  <button className="btn" onClick={() => wsSend({ type: "judge:ask_question", question: qText })} disabled={!qText.trim()}>
                    Envoyer la question
                  </button>

                  <div style={{height: 10}} />
                  <div className="small muted">Vote</div>
                  <select value={vote} onChange={(e)=>setVote(e.target.value)}>
                    <option value="convincing">Convaincant</option>
                    <option value="partial">Partiel</option>
                    <option value="no">Non</option>
                  </select>

                  <div style={{height: 8}} />
                  <div className="small muted">Commentaire (option)</div>
                  <input value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="court commentaire…" />

                  <div style={{height: 10}} />
                  <button className="btn primary" onClick={() => wsSend({ type: "judge:vote", vote, comment })}>
                    Voter
                  </button>
                </>
              ) : (
                <div className="muted" style={{marginTop: 10}}>
                  Tu es le joueur actif : tu ne votes pas.
                </div>
              )}

              <div style={{height: 12}} />
              <div className="small muted">Questions posées</div>
              <div className="list" style={{marginTop: 8}}>
                {(judging?.questions || []).slice(-6).map((q, idx) => (
                  <div key={idx} className="placed">
                    <div className="small muted">{q.judgeId}</div>
                    <div>{q.question}</div>
                  </div>
                ))}
                {(judging?.questions || []).length === 0 && <div className="muted small">Aucune.</div>}
              </div>
            </>
          )}

          {phase === "resolve" && (
            <div className="placed">
              <strong>Résolution…</strong>
              <div className="muted small">Le serveur résout quand tous les juges ont voté.</div>
            </div>
          )}

          {gameSession.state.status === "ended" && (
            <div className="placed">
              <strong>Partie terminée</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GameEnd({ gameSession }) {
  const winner = [...gameSession.players].sort((a,b)=>b.position-a.position)[0];
  return (
    <div>
      <strong>Fin de partie</strong>
      <div className="muted">Gagnant (position max) : {winner?.name ?? "—"}</div>
      <hr />
      <button className="btn" onClick={() => downloadJson(`game-${gameSession.id}.json`, gameSession)}>
        Exporter la session (JSON)
      </button>
    </div>
  );
}

function newPlanProject() {
  return {
    id: uuid("board_"),
    mode: "planification",
    title: "Séance (planification)",
    template: DEFAULT_TEMPLATE,
    variants: [{ id: "v1", name: "Variante 1", placedCards: [] }],
    activeVariantId: "v1"
  };
}
function newObsProject() {
  return {
    id: uuid("board_"),
    mode: "observation",
    title: "Observation (moment d’enseignement)",
    template: DEFAULT_TEMPLATE,
    segments: [],
    variants: [{ id: "v1", name: "Trace 1", placedCards: [] }],
    activeVariantId: "v1"
  };
}
