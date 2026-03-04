import fs from "fs";

const FILE = "./data/players.json";

function loadData() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE));
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/* ================= BASIC STATS UPDATE ================= */

export function updatePlayer(id, stats, won) {

  const data = loadData();

  if (!data[id]) {
    data[id] = {
      goals: 0,
      assists: 0,
      interceptions: 0,
      saves: 0,
      wins: 0,
      matches: 0,
      ratingTotal: 0,
      mmr: 1000,
      lastMMRChange: 0,
      matchHistory: [],
      rivalries: {} 
    };
  }

  // 🛡 Safety للاعبين القدامى
  if (!data[id].matchHistory) data[id].matchHistory = [];
  if (typeof data[id].lastMMRChange !== "number") data[id].lastMMRChange = 0;
  if (typeof data[id].mmr !== "number") data[id].mmr = 1000;

  let rating = 6.0;
  rating += stats.goals * 0.5;
  rating += stats.assists * 0.3;
  rating += stats.interceptions * 0.2;
  rating += stats.saves * 0.2;
  if (won) rating += 1;

  rating = Math.min(10, rating);

  data[id].goals += stats.goals;
  data[id].assists += stats.assists;
  data[id].interceptions += stats.interceptions;
  data[id].saves += stats.saves;
  data[id].matches += 1;
  if (won) data[id].wins += 1;
  data[id].ratingTotal += rating;

  saveData(data);
  return rating;
}

/* ================= GETTERS ================= */

export function getAllPlayers() {
  return loadData();
}

export function getPlayer(id) {
  const data = loadData();
  return data[id] || null;
}

/* ================= RANK ================= */

export function getRankByMMR(mmr) {
  if (mmr < 900) return "🥉 Bronze";
  if (mmr < 1100) return "🥈 Silver";
  if (mmr < 1300) return "🥇 Gold";
  if (mmr < 1500) return "💎 Diamond";
  return "🔥 Elite";
}

/* ================= ELO ================= */

function calculateNewMMR(playerMMR, enemyAvgMMR, result) {
  const K = 32;

  const expectedScore =
    1 / (1 + Math.pow(10, (enemyAvgMMR - playerMMR) / 400));

  return Math.round(playerMMR + K * (result - expectedScore));
}

/* ================= UPDATE MMR ================= */

export function updateMMRBatch(team1, team2, winnerTeam) {

  const data = loadData();

  const avg1 =
    team1.reduce((sum, id) => sum + (data[id]?.mmr || 1000), 0) /
    team1.length;

  const avg2 =
    team2.reduce((sum, id) => sum + (data[id]?.mmr || 1000), 0) /
    team2.length;

  for (const id of team1) {
    if (!data[id]) continue;

    // 🛡 Safety
    if (!data[id].matchHistory) data[id].matchHistory = [];
    if (typeof data[id].lastMMRChange !== "number") data[id].lastMMRChange = 0;
    if (typeof data[id].mmr !== "number") data[id].mmr = 1000;

    const result = winnerTeam === 1 ? 1 : 0;
    const oldMMR = data[id].mmr;
    const newMMR = calculateNewMMR(oldMMR, avg2, result);

    data[id].mmr = newMMR;
    data[id].lastMMRChange = newMMR - oldMMR;

    data[id].matchHistory.push({
      result: result === 1 ? "W" : "L",
      change: data[id].lastMMRChange,
      mmr: newMMR,
      date: Date.now()
    });

    if (data[id].matchHistory.length > 5) {
      data[id].matchHistory.shift();
    }
  }

  for (const id of team2) {
    if (!data[id]) continue;

    // 🛡 Safety
    if (!data[id].matchHistory) data[id].matchHistory = [];
    if (typeof data[id].lastMMRChange !== "number") data[id].lastMMRChange = 0;
    if (typeof data[id].mmr !== "number") data[id].mmr = 1000;

    const result = winnerTeam === 2 ? 1 : 0;
    const oldMMR = data[id].mmr;
    const newMMR = calculateNewMMR(oldMMR, avg1, result);

    data[id].mmr = newMMR;
    data[id].lastMMRChange = newMMR - oldMMR;

    data[id].matchHistory.push({
      result: result === 1 ? "W" : "L",
      change: data[id].lastMMRChange,
      mmr: newMMR,
      date: Date.now()
    });

    if (data[id].matchHistory.length > 5) {
      data[id].matchHistory.shift();
    }
  }

  saveData(data);
}
export function updateRivalries(team1, team2, winnerTeam) {

  const data = loadData();

  const updatePair = (playerA, playerB, didWin) => {

    if (!data[playerA].rivalries)
      data[playerA].rivalries = {};

    if (!data[playerA].rivalries[playerB]) {
      data[playerA].rivalries[playerB] = {
        matches: 0,
        wins: 0,
        losses: 0
      };
    }

    const rivalry = data[playerA].rivalries[playerB];

    rivalry.matches++;
    if (didWin) rivalry.wins++;
    else rivalry.losses++;
  };

  for (const p1 of team1) {
    for (const p2 of team2) {

      const team1Won = winnerTeam === 1;

      updatePair(p1, p2, team1Won);
      updatePair(p2, p1, !team1Won);
    }
  }

  saveData(data);
}