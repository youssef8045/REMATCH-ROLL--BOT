import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelType
} from "discord.js";

import dotenv from "dotenv";
dotenv.config();
import {
  generateFinalsLobby,
  handleFinalsButtons
} from "./games/finals.js";
import {
  getAllFinalsPlayers,
  updateFinalsStats,
  getFinalsPlayer
} from "./utils/finalsStats.js";
import { handleDraftPick } from "./games/rematch.js";
import { generateRematch, handleRematchButtons } from "./games/rematch.js";
import {
  updatePlayer,
  getAllPlayers,
  getRankByMMR,
  updateMMRBatch
} from "./utils/playerStats.js";
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const RESULT_CHANNEL_ID = process.env.RESULT_CHANNEL_ID;
const HOF_CHANNEL_ID = process.env.HOF_CHANNEL_ID;

let chaosMode = false;
let mapVotingMode = false;

/* ================= VOICE FUNCTIONS ================= */

export async function createMatchVoiceRooms(guild, teamCount = 2) {

  const category = await guild.channels.create({
    name: "🎮 MATCH ROOMS",
    type: ChannelType.GuildCategory
  });

  const channels = [];

  for (let i = 0; i < teamCount; i++) {

    const icon = i % 2 === 0 ? "🔵" : "🔴";

    const channel = await guild.channels.create({
      name: `${icon} Team ${i + 1}`,
      type: ChannelType.GuildVoice,
      parent: category.id
    });

    channels.push(channel);
  }

  return { category, channels };
}

export async function moveTeamsToVoice(guild, team1OrTeams, team2 = null) {

  // 🔵 نظام الريماتش (team1, team2)
  if (Array.isArray(team1OrTeams) && Array.isArray(team2)) {

    const team1Channel = guild.channels.cache.find(c => c.name.includes("Team 1"));
    const team2Channel = guild.channels.cache.find(c => c.name.includes("Team 2"));

    for (const id of team1OrTeams) {
      const member = await guild.members.fetch(id).catch(() => null);
      if (member?.voice?.channel && team1Channel) {
        await member.voice.setChannel(team1Channel).catch(() => {});
      }
    }

    for (const id of team2) {
      const member = await guild.members.fetch(id).catch(() => null);
      if (member?.voice?.channel && team2Channel) {
        await member.voice.setChannel(team2Channel).catch(() => {});
      }
    }

    return;
  }

  // 🏆 نظام فاينلز (teams array)
  const teams = team1OrTeams;

  for (let i = 0; i < teams.length; i++) {

    const teamChannel = guild.channels.cache.find(
      c => c.name.endsWith(`Team ${i + 1}`)
    );

    for (const id of teams[i]) {
      const member = await guild.members.fetch(id).catch(() => null);
      if (member?.voice?.channel && teamChannel) {
        await member.voice.setChannel(teamChannel).catch(() => {});
      }
    }
  }
}

async function deleteMatchVoiceRooms(guild) {

  const category = guild.channels.cache.find(c => c.name === "🎮 MATCH ROOMS");
  if (!category) return;

  const children = guild.channels.cache.filter(c => c.parentId === category.id);

  for (const channel of children.values()) {
    await channel.delete().catch(() => {});
  }

  await category.delete().catch(() => {});
}

/* ================= PANEL ================= */

function buildPanel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("start_match")
      .setLabel("🎮 Start Match")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("toggle_chaos")
      .setLabel(chaosMode ? "💀 Chaos ON" : "⚖️ Balanced")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("toggle_voting")
      .setLabel(mapVotingMode ? "🗳️ Voting ON" : "🎲 Random Map")
      .setStyle(ButtonStyle.Secondary)
  );
}

/* ================= EVENTS ================= */
async function updateMVP(guild) {

  const data = getAllPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => {
      const avg = stats.matches ? (stats.ratingTotal / stats.matches) : 0;
      return { id, avg };
    })
    .sort((a, b) => (b.mmr || 1000) - (a.mmr || 1000))

  if (!sorted.length) return;

  const topPlayerId = sorted[0].id;

  const mvpRole = guild.roles.cache.find(r => r.name === "Current MVP");
  if (!mvpRole) return;

  const currentHolder = guild.members.cache.find(m =>
    m.roles.cache.has(mvpRole.id)
  );

  if (currentHolder && currentHolder.id !== topPlayerId) {
    await currentHolder.roles.remove(mvpRole).catch(() => {});
  }

  const newMvp = await guild.members.fetch(topPlayerId).catch(() => null);
  if (newMvp && !newMvp.roles.cache.has(mvpRole.id)) {
    await newMvp.roles.add(mvpRole).catch(() => {});
  }
}

async function updateHallOfFame(guild) {

  const data = getAllPlayers();
  const players = Object.entries(data);

  if (!players.length) return;

  const sortedByMMR = [...players].sort(
    (a, b) => (b[1].mmr || 1000) - (a[1].mmr || 1000)
  );

  const sortedByGoals = [...players].sort(
    (a, b) => (b[1].goals || 0) - (a[1].goals || 0)
  );

  const sortedByWins = [...players].sort(
    (a, b) => (b[1].wins || 0) - (a[1].wins || 0)
  );

  const sortedByWinrate = [...players]
    .filter(([_, p]) => p.matches >= 5)
    .sort((a, b) =>
      (b[1].wins / b[1].matches) - (a[1].wins / a[1].matches)
    );

  const hofChannel = await guild.channels.fetch(HOF_CHANNEL_ID).catch(() => null);
  if (!hofChannel) return;

  const embed = new EmbedBuilder()
    .setTitle("🏆 HALL OF FAME")
    .setColor(0xf1c40f)
    .addFields(
      {
        name: "🥇 Highest MMR",
        value: sortedByMMR[0]
          ? `<@${sortedByMMR[0][0]}> — ⭐ ${sortedByMMR[0][1].mmr}`
          : "N/A"
      },
      {
        name: "⚽ Top Goals",
        value: sortedByGoals[0]
          ? `<@${sortedByGoals[0][0]}> — ${sortedByGoals[0][1].goals}`
          : "N/A"
      },
      {
        name: "🏆 Most Wins",
        value: sortedByWins[0]
          ? `<@${sortedByWins[0][0]}> — ${sortedByWins[0][1].wins}`
          : "N/A"
      },
      {
        name: "🔥 Best Winrate (min 5 matches)",
        value: sortedByWinrate[0]
          ? `<@${sortedByWinrate[0][0]}> — ${(
              (sortedByWinrate[0][1].wins /
                sortedByWinrate[0][1].matches) *
              100
            ).toFixed(1)}%`
          : "N/A"
      }
    )
    .setFooter({ text: "Auto Updated After Every Match" });

  const messages = await hofChannel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === guild.client.user.id);

  if (existing) {
    await existing.edit({ embeds: [embed] });
  } else {
    await hofChannel.send({ embeds: [embed] });
  }
}
// Event خاص بالـ Hall Of Fame
client.on("hallUpdate", async (guild) => {
  await updateHallOfFame(guild);
});

/* ================= FINALS MVP ================= */

client.on("finalsHallUpdate", async (guild) => {

  const data = getAllFinalsPlayers();
  const sorted = Object.entries(data)
    .sort((a, b) => (b[1].mmr || 1000) - (a[1].mmr || 1000));

  if (!sorted.length) return;

  const topId = sorted[0][0];

  const role = guild.roles.cache.find(r => r.name === "Finals MVP");
  if (!role) return;

  const currentHolder = guild.members.cache.find(m =>
    m.roles.cache.has(role.id)
  );

  if (currentHolder && currentHolder.id !== topId) {
    await currentHolder.roles.remove(role).catch(() => {});
  }

  const newMvp = await guild.members.fetch(topId).catch(() => null);

  if (newMvp && !newMvp.roles.cache.has(role.id)) {
    await newMvp.roles.add(role).catch(() => {});
  }

});

client.on("interactionCreate", async interaction => {

  console.log("🔥 Interaction:", interaction.customId, interaction.type);
  
  /* ===== DRAFT PICK ===== */
  if (interaction.isStringSelectMenu() && interaction.customId === "draft_pick") {
    return handleDraftPick(interaction);
  }

  /* باقي الشروط هنا */


  /* ========= SETUP ========= */
  if (interaction.isChatInputCommand() && interaction.commandName === "setup") {

    const embed = new EmbedBuilder()
      .setTitle("🎮 Multi Game Panel")
      .setDescription("Choose mode, then start match.")
      .setColor(0x10b981)
      .setImage("https://cdn.discordapp.com/attachments/1477301182547493017/1477389774846300301/file_000000002980724688d0b4d6a4104797.png")
      .setThumbnail("https://cdn.discordapp.com/attachments/1477301182547493017/1477399505140842517/Video_Project.gif")
      .setFooter({ text: " Powered By : El-MooDeer . YOUSSEF ⚡" });

    return interaction.reply({
      embeds: [embed],
      components: [buildPanel()]
    });
  }
   
if (interaction.isChatInputCommand() && interaction.commandName === "leaderboard") {

  const data = getAllPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => {
      const avg = stats.matches ? (stats.ratingTotal / stats.matches) : 0;
      return { id, avg, ...stats };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  if (!sorted.length) {
    return interaction.reply("No players yet.");
  }

  const medals = ["🥇", "🥈", "🥉"];

  const description = sorted.map((p, i) => {

    const base =
`${medals[i] || "🔹"} **<@${p.id}>**
⭐ Avg: ${p.avg.toFixed(2)}
🏆 Wins: ${p.wins}
⚽ Goals: ${p.goals}`;

    if (i === 0) {
      return `🏆 **CURRENT MVP**
${base}`;
    }

    return base;

  }).join("\n\n");

  const topPlayer = sorted[0];
  const avg = topPlayer.avg;
  const rankName = getRankByMMR(topPlayer.mmr).split(" ")[1];

  const member = await interaction.guild.members.fetch(topPlayer.id);

  /* ================= MOVE MVP ROLE ================= */

  const mvpRole = interaction.guild.roles.cache.find(r => r.name === "Current MVP");

  if (mvpRole) {

    const currentHolder = interaction.guild.members.cache.find(m =>
      m.roles.cache.has(mvpRole.id)
    );

    if (currentHolder && currentHolder.id !== topPlayer.id) {
      await currentHolder.roles.remove(mvpRole).catch(() => {});
    }

    if (!member.roles.cache.has(mvpRole.id)) {
      await member.roles.add(mvpRole).catch(() => {});
    }
  }

  /* ================= RANK IMAGES ================= */

  const rankImages = {
    Bronze: "https://media.discordapp.net/attachments/1475076726299033602/1477518943009898630/image.png",
    Silver: "https://media.discordapp.net/attachments/1475076726299033602/1477518981207162940/image.png",
    Gold: "https://media.discordapp.net/attachments/1475076726299033602/1477519018968743966/image.png",
    Diamond: "https://media.discordapp.net/attachments/1475076726299033602/1477519096575688887/image.png",
    Elite: "https://media.discordapp.net/attachments/1475076726299033602/1477519133514924122/image.png"
  };

  const embed = new EmbedBuilder()
    .setTitle("🏆 GLOBAL LEADERBOARD")
    .setColor(0xf1c40f)
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
    .setImage(rankImages[rankName] || null)
    .setFooter({ text: "Season Ranking System" });

  return interaction.reply({ embeds: [embed] });
}

if (interaction.isChatInputCommand() && interaction.commandName === "profile") {

  const data = getAllPlayers();
  const user = data[interaction.user.id];

  if (!user) {
    return interaction.reply("You have no stats yet.");
  }

  /* ================= TOP RIVAL SECTION ================= */

  let topRivalText = "No rivalries yet.";

  if (user.rivalries) {

    const rivalEntries = Object.entries(user.rivalries);

    if (rivalEntries.length) {

      const topRival = rivalEntries.sort(
        (a, b) => b[1].matches - a[1].matches
      )[0];

      const rivalId = topRival[0];
      const rivalData = topRival[1];

      const winRate =
        rivalData.matches
          ? ((rivalData.wins / rivalData.matches) * 100).toFixed(1)
          : 0;

      let rivalryTitle = "⚔ Rival";

      if (rivalData.matches >= 10) rivalryTitle = "🔥 Legendary Rival";
      else if (winRate >= 70) rivalryTitle = "👑 Dominated";
      else if (winRate <= 40) rivalryTitle = "💀 Nemesis";

      topRivalText =
        `**${rivalryTitle}**\n` +
        `<@${rivalId}>\n` +
        `⚔ Matches: ${rivalData.matches}\n` +
        `🏆 Wins: ${rivalData.wins}\n` +
        `💀 Losses: ${rivalData.losses}\n` +
        `📊 Winrate: ${winRate}%`;
    }
  }

  /* ================= BASIC STATS ================= */

  const mmr = user.mmr || 1000;
  const rank = getRankByMMR(mmr);

  const winrate = user.matches
    ? ((user.wins / user.matches) * 100).toFixed(1)
    : 0;

  const change = user.lastMMRChange || 0;

  const indicator =
    change > 0
      ? `🟢 ↑ +${change}`
      : change < 0
      ? `🔴 ↓ ${change}`
      : "⚪ 0";

  /* ================= MATCH HISTORY ================= */

  const history = user.matchHistory || [];

  const last5 = history.length
    ? history
        .slice(-5)
        .reverse()
        .map(h => `${h.result} (${h.change > 0 ? "+" : ""}${h.change})`)
        .join(" • ")
    : "No recent matches";

  /* ================= QUICKCHART GRAPH ================= */

  const mmrHistory = history.map(h => h.mmr);

  const chartConfig = {
    type: "line",
    data: {
      labels: mmrHistory.map((_, i) => `Match ${i + 1}`),
      datasets: [{
        label: "MMR",
        data: mmrHistory,
        borderColor: "rgb(52,152,219)",
        fill: false
      }]
    }
  };

  const chartURL =
    "https://quickchart.io/chart?c=" +
    encodeURIComponent(JSON.stringify(chartConfig));

  /* ================= EMBED ================= */

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${interaction.user.username} Player Card`)
    .setColor(0x3498db)
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
    .addFields(
      { name: "🏅 Rank", value: rank, inline: true },
      { name: "⭐ MMR", value: mmr.toString(), inline: true },
      { name: "🧨 Last Change", value: indicator, inline: true },
      { name: "📈 Winrate", value: `${winrate}%`, inline: true },

      { name: "🎯 Last 5 Matches", value: last5 },

      { name: "⚽ Goals", value: String(user.goals ?? 0), inline: true },
      { name: "🎯 Assists", value: String(user.assists ?? 0), inline: true },
      { name: "🛡 Interceptions", value: String(user.interceptions ?? 0), inline: true },
      { name: "🧤 Saves", value: String(user.saves ?? 0), inline: true },
      { name: "🏆 Wins", value: String(user.wins ?? 0), inline: true },
      { name: "🎮 Matches", value: String(user.matches ?? 0), inline: true },

      { name: "⚔ Top Rival", value: topRivalText }
    )
    .setImage(chartURL)
    .setFooter({ text: "Ranked MMR System • Rivalry System Active" });

  return interaction.reply({ embeds: [embed] });
}

if (interaction.isChatInputCommand() && interaction.commandName === "matchhistory") {

  const target = interaction.options.getUser("player") || interaction.user;

  const data = getAllPlayers();
  const player = data[target.id];

  if (!player || !player.matchHistory || !player.matchHistory.length) {
    return interaction.reply({
      content: "No match history found.",
      flags: 64
    });
  }

  const history = [...player.matchHistory].reverse(); // الأحدث الأول

  const text = history.map((match, i) => {
    const sign = match.change > 0 ? "+" : "";
    return `**${i + 1}.** ${match.result} (${sign}${match.change}) — ${match.mmr} MMR`;
  }).join("\n");

  // 🔥 Streak Calculation
  let streak = 0;
  for (const match of history) {
    if (match.result === history[0].result) {
      streak++;
    } else {
      break;
    }
  }

  const streakText =
    history[0].result === "W"
      ? `🔥 Win Streak: ${streak}`
      : `💀 Losing Streak: ${streak}`;

  const embed = new EmbedBuilder()
    .setTitle(`📜 Match History — ${target.username}`)
    .setColor(0x3498db)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .setDescription(text)
    .addFields({
      name: "Streak",
      value: streakText
    })
    .setFooter({ text: "Last 5 Ranked Matches" });

  return interaction.reply({ embeds: [embed] });
}
 
if (interaction.isChatInputCommand() && interaction.commandName === "topassists") {

  const data = getAllPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => ({
      id,
      assists: stats.assists || 0
    }))
    .sort((a, b) => b.assists - a.assists)
    .slice(0, 10);

  if (!sorted.length) {
    return interaction.reply("No assists recorded yet.");
  }

  const text = sorted.map((p, i) =>
    `**${i + 1}.** <@${p.id}> — 🎯 ${p.assists} Assists`
  ).join("\n");

  return interaction.reply({
    content: `🎯 **TOP ASSISTS LEADERBOARD**\n\n${text}`
  });
}

if (interaction.isChatInputCommand() && interaction.commandName === "topgoals") {

  const data = getAllPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => ({ id, value: stats.goals || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (!sorted.length) return interaction.reply("No data yet.");

  const medals = ["🥇", "🥈", "🥉"];

  const description = sorted.map((p, i) =>
    `${medals[i] || "🔹"} **<@${p.id}>** — ⚽ ${p.value} Goals`
  ).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🏆 TOP GOALS LEADERBOARD")
    .setColor(0xf1c40f)
    .setDescription(description)
    .setFooter({ text: "Esports Ranking System" });

  return interaction.reply({ embeds: [embed] });
}

if (interaction.isChatInputCommand() && interaction.commandName === "finals_profile") {

  const data = getAllFinalsPlayers();
  const user = data[interaction.user.id];

  if (!user) {
    return interaction.reply("No Finals stats yet.");
  }

  /* ================= FINALS PRO RANK SYSTEM ================= */

  function getFinalsRankData(mmr) {

    const ranks = [
      { name: "Bronze", min: 0, max: 1099, color: 0x8e6e53, image: "https://cdn.discordapp.com/attachments/1478044330022408353/1478044405389721802/Common_S9_MARK-bronze.png" },
      { name: "Silver", min: 1100, max: 1299, color: 0xbdc3c7, image: "https://cdn.discordapp.com/attachments/1478044330022408353/1478044405968408709/Common_S9_MARK-silver.png" },
      { name: "Gold", min: 1300, max: 1499, color: 0xf1c40f, image: "https://cdn.discordapp.com/attachments/1478044330022408353/1478044406459273360/Common_S9_MARK-gold.png" },
      { name: "Platinum", min: 1500, max: 1699, color: 0x1abc9c, image: "https://cdn.discordapp.com/attachments/1478044330022408353/1478044403846348921/Common_S9_MARK-platinum.png" },
      { name: "Diamond", min: 1700, max: 1899, color: 0x3498db, image: "https://cdn.discordapp.com/attachments/1478044330022408353/1478044404664111216/Common_S9_MARK-diamond.png" },
      { name: "Ruby", min: 1900, max: 9999, color: 0xe74c3c, image: "https://cdn.discordapp.com/attachments/1478044330022408353/1478044405066633430/Common_S9_MARK-ruby.png" }
    ];

    return ranks.find(r => mmr >= r.min && mmr <= r.max);
  }

  function getDivision(mmr, rankData) {
    if (!rankData || rankData.name === "Ruby") return "I";

    const range = rankData.max - rankData.min;
    const part = range / 3;

    if (mmr < rankData.min + part) return "III";
    if (mmr < rankData.min + part * 2) return "II";
    return "I";
  }

  function buildProgressBar(mmr, rankData) {
    if (!rankData) return "----------";

    const progress = (mmr - rankData.min) / (rankData.max - rankData.min);
    const filled = Math.max(0, Math.min(10, Math.round(progress * 10)));
    const empty = 10 - filled;

    return "█".repeat(filled) + "░".repeat(empty);
  }

  const mmr = user.mmr || 1000;
  const rankData = getFinalsRankData(mmr);
  const division = getDivision(mmr, rankData);
  const progressBar = buildProgressBar(mmr, rankData);

  const rankName = rankData
    ? `${rankData.name} ${rankData.name !== "Ruby" ? division : "I"}`
    : "Unranked";

  const color = rankData?.color || 0x10b981;

  /* ================= BASIC CALCULATIONS ================= */

  const winrate = user.matches
    ? ((user.wins / user.matches) * 100).toFixed(1)
    : 0;

  const avgRating = user.matches
    ? (user.ratingTotal / user.matches).toFixed(2)
    : "0.00";

  const change = user.lastMMRChange || 0;

  const indicator =
    change > 0
      ? `🟢 +${change}`
      : change < 0
      ? `🔴 ${change}`
      : "⚪ 0";

  /* ================= MVP CHECK ================= */

  const sorted = Object.entries(data)
    .sort((a, b) => (b[1].mmr || 1000) - (a[1].mmr || 1000));

  const isTop = sorted.length && sorted[0][0] === interaction.user.id;

  /* ================= MMR GRAPH ================= */

  const history = user.matchHistory || [];
  const mmrHistory = history.map(h => h.mmr);

  const chartConfig = {
    type: "line",
    data: {
      labels: mmrHistory.map((_, i) => `Match ${i + 1}`),
      datasets: [{
        label: "MMR",
        data: mmrHistory,
        borderColor: "rgb(231,76,60)",
        backgroundColor: "rgba(231,76,60,0.2)",
        fill: true,
        tension: 0.3
      }]
    }
  };

  const chartURL =
    "https://quickchart.io/chart?c=" +
    encodeURIComponent(JSON.stringify(chartConfig));

  /* ================= PLAYSTYLE ================= */

  const bestStat = Math.max(
    user.kills || 0,
    user.assists || 0,
    user.combat || 0,
    user.support || 0,
    user.objective || 0
  );

  let highlight = "Balanced Player";

  if (bestStat === user.kills) highlight = "🔫 Frag Machine";
  else if (bestStat === user.assists) highlight = "🎯 Team Player";
  else if (bestStat === user.combat) highlight = "⚔ Combat Dominator";
  else if (bestStat === user.support) highlight = "🛠 Support Engine";
  else if (bestStat === user.objective) highlight = "🏆 Objective Master";

  /* ================= LAST 5 ================= */

  const last5 = history.length
    ? history
        .slice(-5)
        .reverse()
        .map(h => `${h.result} (${h.change > 0 ? "+" : ""}${h.change})`)
        .join(" • ")
    : "No recent matches";
/* ================= FINALS RIVALRY ================= */

let rivalryText = "No major rivalries yet.";

if (user.rivalries) {

  const entries = Object.entries(user.rivalries);

  if (entries.length) {

    const top = entries
      .sort((a, b) => b[1].matches - a[1].matches)[0];

    const rivalId = top[0];
    const rivalData = top[1];

    if (rivalData.matches >= 5) {

      const last5Matches = rivalData.matches;
      const wins = rivalData.wins;
      const losses = rivalData.losses;

      let title = "⚔ Rivalry";

      if (wins >= 4) title = "👑 Dominated";
      else if (losses >= 4) title = "💀 Nemesis";

      rivalryText =
        `**${title}**\n` +
        `<@${rivalId}>\n` +
        `⚔ Matches: ${last5Matches}\n` +
        `🏆 Wins: ${wins}\n` +
        `💀 Losses: ${losses}`;
    }
  }
}
  /* ================= EMBED ================= */

  const embed = new EmbedBuilder()
    .setTitle(
      `${rankData?.name === "Ruby" ? "💎 RUBY ELITE " : ""}${isTop ? "👑 " : ""}${interaction.user.username} — FINALS PROFILE`
    )
    .setColor(color)
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
    .setAuthor({
      name: rankName,
      iconURL: rankData?.image
    })
    .setImage(chartURL)
    .addFields(

      {
        name: "🎖 Rank Progress",
        value: `**${rankName}**\n${progressBar}\n${mmr} MMR`,
        inline: true
      },
      { name: "⭐ MMR", value: `${mmr} (${indicator})`, inline: true },
      { name: "📊 Winrate", value: `${winrate}%`, inline: true },

      { name: "⭐ Avg Rating", value: avgRating, inline: true },
      { name: "🏆 Wins", value: String(user.wins), inline: true },
      { name: "💀 Losses", value: String(user.losses), inline: true },

      { name: "🔫 Kills", value: String(user.kills ?? 0), inline: true },
      { name: "🎯 Assists", value: String(user.assists ?? 0), inline: true },
      { name: "⚔ Combat", value: String(user.combat ?? 0), inline: true },
      { name: "🛠 Support", value: String(user.support ?? 0), inline: true },
      { name: "🏆 Objective", value: String(user.objective ?? 0), inline: true },

      { name: "🔥 Playstyle", value: highlight },
      { name: "📜 Last 5 Matches", value: last5 },
      { name: "⚔ Rivalry", value: rivalryText }
    )
    .setFooter({ text: "The Finals Ranked System • Elite Competitive Mode" });

  return interaction.reply({ embeds: [embed] });
}
if (interaction.isChatInputCommand() && interaction.commandName === "finals_leaderboard") {

  const data = getAllFinalsPlayers();

  const sorted = Object.entries(data)
    .sort((a, b) => (b[1].mmr || 1000) - (a[1].mmr || 1000))
    .slice(0, 10);

  if (!sorted.length) {
    return interaction.reply("No Finals data yet.");
  }

  const medals = ["🥇", "🥈", "🥉"];

  const description = sorted.map((p, i) =>
    `${medals[i] || "🔹"} **<@${p[0]}>**
⭐ ${p[1].mmr} MMR
🏆 ${p[1].wins} Wins`
  ).join("\n\n");

  const topPlayerId = sorted[0][0];
  const topPlayerMMR = sorted[0][1].mmr || 1000;

  const user = await interaction.client.users.fetch(topPlayerId);
  const avatar = user.displayAvatarURL({ dynamic: true, size: 512 });

  // 👇 تحديد صورة الرانك
  let rankImage = "";

  if (topPlayerMMR >= 2000) rankImage = "https://media.discordapp.net/attachments/1478044330022408353/1478044404664111216/Common_S9_MARK-diamond.png?ex=69a8f1de&is=69a7a05e&hm=5536d089c1a25417128a2271cfbec5cd01ee8f559ecaff95f469815cf5dfe84f&=&format=webp&quality=lossless&width=150&height=150";
  else if (topPlayerMMR >= 1700) rankImage = "https://media.discordapp.net/attachments/1478044330022408353/1478044403846348921/Common_S9_MARK-platinum.png?ex=69a8f1de&is=69a7a05e&hm=0a194ecc225a6a84bd836de1e7f393942f874ebae0e1eef0d9fb13099ff45aff&=&format=webp&quality=lossless&width=150&height=150";
  else if (topPlayerMMR >= 1400) rankImage = "https://media.discordapp.net/attachments/1478044330022408353/1478044406459273360/Common_S9_MARK-gold.png?ex=69a8f1df&is=69a7a05f&hm=269b40ad37f37e60dd6759fbd341ba6a96899baec36dac8fecb658b49fb30d78&=&format=webp&quality=lossless&width=150&height=150";
  else if (topPlayerMMR >= 1200) rankImage = "https://media.discordapp.net/attachments/1478044330022408353/1478044405968408709/Common_S9_MARK-silver.png?ex=69a8f1df&is=69a7a05f&hm=19551d6fe1604047ec0f2efa48b51fab2f30d9f05742c2e9da4c024242a34b57&=&format=webp&quality=lossless&width=150&height=150";
  else rankImage = "https://media.discordapp.net/attachments/1478044330022408353/1478044405389721802/Common_S9_MARK-bronze.png?ex=69a8f1de&is=69a7a05e&hm=b474fbb2c8542c7873d157d5b983e23abf10eb93203e43bb37b0021bc97dc78d&=&format=webp&quality=lossless&width=150&height=150";

  const embed = new EmbedBuilder()
    .setTitle("🏆 FINALS LEADERBOARD")
    .setColor(0xf1c40f)
    .setThumbnail(avatar) // صورة اللاعب الأول
    .setImage(rankImage) // 👈 صورة الرانك تحت
    .setDescription(description)
    .setFooter({ text: "Top Finals Players" });

  return interaction.reply({ embeds: [embed] });
}

if (interaction.isChatInputCommand() && interaction.commandName === "finals_topkills") {

  const data = getAllFinalsPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => ({ id, value: stats.kills || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (!sorted.length) return interaction.reply("No kills recorded.");

  const text = sorted.map((p, i) =>
    `**${i + 1}.** <@${p.id}> — 🔫 ${p.value}`
  ).join("\n");

  return interaction.reply({
    content: `🔫 **FINALS TOP KILLS**\n\n${text}`
  });
}

if (interaction.isChatInputCommand() && interaction.commandName === "finals_topassists") {

  const data = getAllFinalsPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => ({ id, value: stats.assists || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (!sorted.length) return interaction.reply("No assists recorded.");

  const text = sorted.map((p, i) =>
    `**${i + 1}.** <@${p.id}> — 🎯 ${p.value}`
  ).join("\n");

  return interaction.reply({
    content: `🎯 **FINALS TOP ASSISTS**\n\n${text}`
  });
}

if (interaction.isChatInputCommand() && interaction.commandName === "topwins") {

  const data = getAllPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => ({ id, value: stats.wins || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (!sorted.length) return interaction.reply("No data yet.");

  const medals = ["🥇", "🥈", "🥉"];

  const description = sorted.map((p, i) =>
    `${medals[i] || "🔹"} **<@${p.id}>** — 🏆 ${p.value} Wins`
  ).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🏅 TOP WINS LEADERBOARD")
    .setColor(0x2ecc71)
    .setDescription(description)
    .setFooter({ text: "Esports Ranking System" });

  return interaction.reply({ embeds: [embed] });
}

if (interaction.isChatInputCommand() && interaction.commandName === "topsaves") {

  const data = getAllPlayers();

  const sorted = Object.entries(data)
    .map(([id, stats]) => ({ id, value: stats.saves || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (!sorted.length) return interaction.reply("No data yet.");

  const medals = ["🥇", "🥈", "🥉"];

  const description = sorted.map((p, i) =>
    `${medals[i] || "🔹"} **<@${p.id}>** — 🧤 ${p.value} Saves`
  ).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🛡 TOP SAVES LEADERBOARD")
    .setColor(0x3498db)
    .setDescription(description)
    .setFooter({ text: "Esports Ranking System" });

  return interaction.reply({ embeds: [embed] });
}
  /* ========= TOGGLES ========= */
  if (interaction.isButton() && interaction.customId === "toggle_chaos") {
    chaosMode = !chaosMode;
    return interaction.update({ components: [buildPanel()] });
  }

  if (interaction.isButton() && interaction.customId === "toggle_voting") {
    mapVotingMode = !mapVotingMode;
    return interaction.update({ components: [buildPanel()] });
  }

  /* ========= START MATCH ========= */
  if (interaction.isButton() && interaction.customId === "start_match") {

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("select_game")
        .setPlaceholder("Choose a game")
        .addOptions([
          { label: "The Finals", value: "finals" },
          { label: "Rematch", value: "rematch" }
        ])
    );

    return interaction.reply({
      content: "Select a game:",
      components: [row],
      flags: 64
    });
  }

  /* ========= GAME SELECTED ========= */
  if (interaction.isStringSelectMenu() && interaction.customId === "select_game") {

  const game = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`modal_${game}`)
    .setTitle(`Generate ${game === "finals" ? "The Finals" : "Rematch"} Match`);

  const playersInput = new TextInputBuilder()
    .setCustomId("players_input")
    .setLabel("Players (comma separated)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const teamSizeInput = new TextInputBuilder()
    .setCustomId("teamsize_input")
    .setLabel("Team Size (مثال: 3)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  // 👇 نضيف ده هنا
  const teamCountInput = new TextInputBuilder()
    .setCustomId("teamcount_input")
    .setLabel("Number of Teams (2-4)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  if (game === "finals") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(playersInput),
      new ActionRowBuilder().addComponents(teamSizeInput),
      new ActionRowBuilder().addComponents(teamCountInput)
    );
  } else {
    modal.addComponents(
      new ActionRowBuilder().addComponents(playersInput),
      new ActionRowBuilder().addComponents(teamSizeInput)
    );
  }

  return interaction.showModal(modal);
}

  /* ========= MODAL SUBMIT ========= */
  if (interaction.isModalSubmit()) {

if (interaction.customId === "modal_finals") {
  return generateFinalsLobby(
    interaction,
    RESULT_CHANNEL_ID,
    client,
    createMatchVoiceRooms,
    moveTeamsToVoice,
    deleteMatchVoiceRooms
  );
}

 if (interaction.customId === "finals_stats") {

  const kills = parseInt(interaction.fields.getTextInputValue("kills")) || 0;
  const assists = parseInt(interaction.fields.getTextInputValue("assists")) || 0;
  const combat = parseInt(interaction.fields.getTextInputValue("combat")) || 0;
  const support = parseInt(interaction.fields.getTextInputValue("support")) || 0;
  const objective = parseInt(interaction.fields.getTextInputValue("objective")) || 0;

  // ✅ تحديث بيانات اللاعب في finalsStats
  const rating = updateFinalsStats(
    interaction.user.id,
    kills,
    assists,
    combat,
    support,
    objective
  );

  // ✅ نحدث هول اوف فيم فاينلز بعد كل ستاتس
  interaction.client.emit("finalsHallUpdate", interaction.guild);

  return interaction.reply({
    content:
      `📊 Finals Stats Saved!\n` +
      `🔫 Kills: ${kills}\n` +
      `🎯 Assists: ${assists}\n` +
      `⭐ Rating: ${rating.toFixed(1)}`,
    flags: 64
  });
}
    if (interaction.customId === "modal_rematch") {
      return generateRematch(
        interaction,
        RESULT_CHANNEL_ID,
        client,
        createMatchVoiceRooms,
        moveTeamsToVoice,
        deleteMatchVoiceRooms
      );
    }

    /* ========= STATS MODAL ========= */

    if (interaction.customId === "stats_modal") {

      const goals = parseInt(interaction.fields.getTextInputValue("goals"));
      const assists = parseInt(interaction.fields.getTextInputValue("assists"));
      const interceptions = parseInt(interaction.fields.getTextInputValue("interceptions"));
      const saves = parseInt(interaction.fields.getTextInputValue("saves"));

      const rating = updatePlayer(
        interaction.user.id,
        { goals, assists, interceptions, saves },
        true // مؤقتًا اعتبرناه فائز — هنربطه بالفريق بعدين
      );
      
      await updateMVP(interaction.guild);

      return interaction.reply({
        content: `⭐ Match Rating: **${rating.toFixed(1)}**`,
        flags: 64
      });
    }
  }

/* ========= BUTTONS & SELECT MENUS ========= */

if (interaction.isButton() || interaction.isStringSelectMenu()) {

  // Finals interactions
  if (interaction.customId.startsWith("finals_")) {
    return handleFinalsButtons(interaction);
  }

  // Rematch interactions
  return handleRematchButtons(
  interaction,
  createMatchVoiceRooms,
  moveTeamsToVoice,
  deleteMatchVoiceRooms
);
}
});

client.login(process.env.TOKEN);
client.on("error", console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);