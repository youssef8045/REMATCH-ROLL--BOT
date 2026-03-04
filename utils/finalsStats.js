import fs from "fs";

const FILE = "/data/finalsStats.json";

/* ================= LOAD / SAVE ================= */

function load() {
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/* ================= GET PLAYER ================= */

export function getFinalsPlayer(id) {
  const data = load();

  if (!data[id]) {
    data[id] = {
      mmr: 1000,
      wins: 0,
      losses: 0,
      matches: 0,

      // 🆕 Stats
      kills: 0,
      assists: 0,
      combat: 0,
      support: 0,
      objective: 0,

      ratingTotal: 0,
      lastRating: 0,          // 🆕
      lastMMRChange: 0,

      matchHistory: [],
      rivalries: {}
    };

    save(data);
  }

  return data[id];
}

export function getAllFinalsPlayers() {
  return load();
}

/* ================= CLASS BASED RATING ================= */

function calculateClassMultiplier(playerClass) {
  switch (playerClass) {
    case "Light":
      return { kills: 0.5, assists: 0.25, combat: 0.15, support: 0.05, objective: 0.05 };

    case "Medium":
      return { kills: 0.3, assists: 0.3, combat: 0.15, support: 0.15, objective: 0.1 };

    case "Heavy":
      return { kills: 0.25, assists: 0.2, combat: 0.25, support: 0.1, objective: 0.2 };

    default:
      return { kills: 0.4, assists: 0.3, combat: 0.15, support: 0.1, objective: 0.05 };
  }
}

/* ================= UPDATE STATS ================= */

export function updateFinalsStats(
  id,
  kills,
  assists,
  combat,
  support,
  objective,
  playerClass = null
) {

  const data = load();
  const p = getFinalsPlayer(id);

  p.kills += kills;
  p.assists += assists;
  p.combat += combat;
  p.support += support;
  p.objective += objective;

  // 🧠 حساب حسب الكلاس
  const weights = calculateClassMultiplier(playerClass);

  const rating =
    kills * weights.kills +
    assists * weights.assists +
    combat * weights.combat +
    support * weights.support +
    objective * weights.objective;

  p.ratingTotal += rating;
  p.lastRating = rating;

  data[id] = p;
  save(data);

  return rating;
}

/* ================= GET MATCH MVP ================= */

export function getMatchMVP(teamIds) {

  const data = load();

  let top = null;

  teamIds.flat().forEach(id => {
    const player = data[id];
    if (!player) return;

    if (!top || player.lastRating > top.rating) {
      top = {
        id,
        rating: player.lastRating
      };
    }
  });

  return top; // { id, rating }
}

/* ================= UPDATE MMR ================= */

export function updateFinalsMMRBatch(team1, team2, winner) {

  const data = load();
  const K = 32;

  function avgMMR(team) {
    return team.reduce((sum, id) => {
      if (!data[id]) {
        data[id] = getFinalsPlayer(id);
      }
      return sum + data[id].mmr;
    }, 0) / team.length;
  }

  const avg1 = avgMMR(team1);
  const avg2 = avgMMR(team2);

  const expected1 = 1 / (1 + Math.pow(10, (avg2 - avg1) / 400));
  const expected2 = 1 / (1 + Math.pow(10, (avg1 - avg2) / 400));

  const score1 = winner === 1 ? 1 : 0;
  const score2 = winner === 2 ? 1 : 0;

  team1.forEach(id => {

    if (!data[id]) data[id] = getFinalsPlayer(id);

    const change = Math.round(K * (score1 - expected1));

    data[id].mmr += change;
    data[id].lastMMRChange = change;
    data[id].matches++;
    score1 ? data[id].wins++ : data[id].losses++;

    data[id].matchHistory.push({
      result: score1 ? "W" : "L",
      change,
      mmr: data[id].mmr
    });
  });

  team2.forEach(id => {

    if (!data[id]) data[id] = getFinalsPlayer(id);

    const change = Math.round(K * (score2 - expected2));

    data[id].mmr += change;
    data[id].lastMMRChange = change;
    data[id].matches++;
    score2 ? data[id].wins++ : data[id].losses++;

    data[id].matchHistory.push({
      result: score2 ? "W" : "L",
      change,
      mmr: data[id].mmr
    });
  });

  save(data);
}

/* ================= RIVALRIES ================= */

export function updateFinalsRivalries(teams, winnerTeamIndex) {

  const data = load();

  if (teams.length !== 2) return;

  const team1 = teams[0];
  const team2 = teams[1];

  team1.forEach(p1 => {
    team2.forEach(p2 => {

      const player1 = getFinalsPlayer(p1);
      const player2 = getFinalsPlayer(p2);

      if (!player1.rivalries[p2]) {
        player1.rivalries[p2] = {
          wins: 0,
          losses: 0,
          matches: 0,
          history: []
        };
      }

      if (!player2.rivalries[p1]) {
        player2.rivalries[p1] = {
          wins: 0,
          losses: 0,
          matches: 0,
          history: []
        };
      }

      player1.rivalries[p2].matches++;
      player2.rivalries[p1].matches++;

      if (winnerTeamIndex === 1) {

        player1.rivalries[p2].wins++;
        player2.rivalries[p1].losses++;

        player1.rivalries[p2].history.push("W");
        player2.rivalries[p1].history.push("L");

      } else {

        player1.rivalries[p2].losses++;
        player2.rivalries[p1].wins++;

        player1.rivalries[p2].history.push("L");
        player2.rivalries[p1].history.push("W");
      }

      // نخلي الهستوري بحد أقصى 20
      if (player1.rivalries[p2].history.length > 20)
        player1.rivalries[p2].history.shift();

      if (player2.rivalries[p1].history.length > 20)
        player2.rivalries[p1].history.shift();

    });
  });

  save(data);

}
