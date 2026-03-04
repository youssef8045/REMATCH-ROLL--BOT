import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} from "discord.js";

import { updateMMRBatch } from "../utils/playerStats.js";
import { getAllPlayers } from "../utils/playerStats.js";
import { updateRivalries } from "../utils/playerStats.js";

let activeLobby = null;
let activeMatch = null;
let draftMode = false;
let lastRematchTeams = null;
/* ================= CREATE LOBBY ================= */

export async function generateRematch(
  interaction,
  resultChannelId,
  client,
  createMatchVoiceRooms,
  moveTeamsToVoice,
  deleteMatchVoiceRooms
) {
  if (activeLobby || activeMatch) {
    return interaction.reply({
      content: "❌ There is already an active match or lobby.",
      flags: 64
    });
  }

  const teamSize = parseInt(
    interaction.fields.getTextInputValue("teamsize_input")
  );

  if (isNaN(teamSize) || teamSize < 1) {
    return interaction.reply({
      content: "❌ Invalid team size.",
      flags: 64
    });
  }

  const resultChannel = await client.channels.fetch(resultChannelId);

activeLobby = {
  players: [],
  teamSize,
  maxPlayers: teamSize * 2,
  createMatchVoiceRooms,
  moveTeamsToVoice,
  deleteMatchVoiceRooms,
  message: null,
  ownerId: interaction.user.id // 👈 ضيف دي
};

  const message = await resultChannel.send({
    embeds: [buildLobbyEmbed()],
    components: [buildLobbyButtons()]
  });

  activeLobby.message = message;

  return interaction.reply({
    content: `⚽ ${teamSize}v${teamSize} Lobby Created!`,
    flags: 64
  });
}

/* ================= HANDLE BUTTONS ================= */

export async function handleRematchButtons(
  interaction,
  createMatchVoiceRooms,
  moveTeamsToVoice,
  deleteMatchVoiceRooms
) {
  const userId = interaction.user.id;

  /* ===== LOBBY ===== */

  if (activeLobby) {
    if (interaction.customId === "join_lobby") {
      await interaction.deferUpdate();

      if (activeLobby.players.includes(userId)) return;
      if (activeLobby.players.length >= activeLobby.maxPlayers) return;

      activeLobby.players.push(userId);

      if (activeLobby.players.length === activeLobby.maxPlayers) {
        return startMatch(interaction);
      }

      return activeLobby.message.edit({
        embeds: [buildLobbyEmbed()],
        components: [buildLobbyButtons()]
      });
    }

    if (interaction.customId === "leave_lobby") {
      await interaction.deferUpdate();

      activeLobby.players =
        activeLobby.players.filter(id => id !== userId);

      return activeLobby.message.edit({
        embeds: [buildLobbyEmbed()],
        components: [buildLobbyButtons()]
      });
    }

if (interaction.customId === "rematch_end_lobby") {

  if (!activeLobby) return;

  if (interaction.user.id !== activeLobby.ownerId) {
    return interaction.reply({
      content: "❌ Only the lobby creator can end this lobby.",
      flags: 64
    });
  }

  await interaction.deferUpdate();

  activeLobby = null;

  return interaction.message.edit({
    embeds: [
      new EmbedBuilder()
        .setTitle("🛑 LOBBY CLOSED")
        .setColor(0xe74c3c)
        .setDescription("The lobby has been closed by its creator.")
    ],
    components: []
  });
}

    if (interaction.customId === "toggle_draft") {
      await interaction.deferUpdate();
      draftMode = !draftMode;

      return activeLobby.message.edit({
        embeds: [buildLobbyEmbed()],
        components: [buildLobbyButtons()]
      });
    }
  }

if (interaction.customId === "rematch_reroll") {

  await interaction.deferUpdate();

  if (!lastRematchTeams) return;

  const team1 = lastRematchTeams.team1;
  const team2 = lastRematchTeams.team2;

  // 🎙️ اعمل رومات جديدة
  const { category, team1Channel, team2Channel } =
    await createMatchVoiceRooms(interaction.guild);

  await moveTeamsToVoice(interaction.guild, team1, team2);

activeMatch = {
  team1,
  team2,
  winner: null,
  message: interaction.message,
  deleteMatchVoiceRooms
};

  const embed = new EmbedBuilder()
    .setTitle("⚽ MATCH STARTED")
    .setColor(0x2ecc71)
    .addFields(
      {
        name: "🔵 Team 1",
        value: team1.map(id => `<@${id}>`).join("\n"),
        inline: true
      },
      {
        name: "🔴 Team 2",
        value: team2.map(id => `<@${id}>`).join("\n"),
        inline: true
      }
    )
    .setFooter({ text: "Submit Stats • End Match" });

  return interaction.message.edit({
    embeds: [embed],
  components: Array.isArray(buildMatchButtons(team1, team2))
  ? buildMatchButtons(team1, team2)
  : [buildMatchButtons(team1, team2)]// 👈 هنا يرجع زرار End Match
  });
}

/* ================= REROLL RANDOM TEAMS ================= */

if (interaction.customId === "rematch_reroll_random") {

  await interaction.deferUpdate();

  if (!lastRematchTeams) return;

  // 🔥 جمع كل اللاعبين
  const players = [
    ...lastRematchTeams.team1,
    ...lastRematchTeams.team2
  ];

  // 🎲 Shuffle
  const shuffled = players.sort(() => Math.random() - 0.5);

  const half = shuffled.length / 2;

  const team1 = shuffled.slice(0, half);
  const team2 = shuffled.slice(half);

  // 🎙️ اعمل رومز جديدة
  const { category, team1Channel, team2Channel } =
    await createMatchVoiceRooms(interaction.guild);

  await moveTeamsToVoice(interaction.guild, team1, team2);

  activeMatch = {
    team1,
    team2,
    winner: null,
    message: interaction.message,
    deleteMatchVoiceRooms
  };

  const embed = new EmbedBuilder()
    .setTitle("🎲 REROLL REMATCH STARTED")
    .setColor(0xf1c40f)
    .addFields(
      {
        name: "🔵 Team 1",
        value: team1.map(id => `<@${id}>`).join("\n"),
        inline: true
      },
      {
        name: "🔴 Team 2",
        value: team2.map(id => `<@${id}>`).join("\n"),
        inline: true
      }
    )
    .setFooter({ text: "Submit Stats • End Match" });

  return interaction.message.edit({
    embeds: [embed],
  components: Array.isArray(buildMatchButtons(team1, team2))
  ? buildMatchButtons(team1, team2)
  : [buildMatchButtons(team1, team2)]
  });
}
    /* ===== DRAFT PICKS ===== */

  if (activeMatch?.draft && interaction.isStringSelectMenu() && interaction.customId === "draft_pick") {

    const picker = interaction.user.id;

    if (picker !== activeMatch.currentCaptain) {
      return interaction.reply({ content: "❌ Not your turn.", flags: 64 });
    }

    const picked = interaction.values[0];

    activeMatch.remaining =
      activeMatch.remaining.filter(id => id !== picked);

    if (activeMatch.team1.includes(picker)) {
      activeMatch.team1.push(picked);
      activeMatch.currentCaptain = activeMatch.captains[1];
    } else {
      activeMatch.team2.push(picked);
      activeMatch.currentCaptain = activeMatch.captains[0];
    }

    if (!activeMatch.remaining.length) {
      return finalizeDraft(interaction);
    }

    return updateDraftEmbed(interaction);
  }
  /* ===== MATCH BUTTONS ===== */

  if (activeMatch) {
if (
  interaction.customId === "team1_win" ||
  interaction.customId === "team2_win"
) {

  if (!activeMatch) return;

  if (activeMatch.winner) {
    return interaction.reply({
      content: "⚠ Winner already selected.",
      flags: 64
    });
  }

  const winner =
    interaction.customId === "team1_win" ? 1 : 2;

  activeMatch.winner = winner;

  await interaction.deferUpdate();

  // 🏆 Embed عام للكل
  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 WINNER DECLARED")
        .setImage("https://cdn.discordapp.com/attachments/1475077848716021833/1478508810724311154/eyJpZCI6InVzZXItTktZUnJiTExSVGJlbTJjTGRtcU9zUVlVOmZpbGVfMDAwMDAwMDBhNmYwNzFmZGI4ZTE2NmU2OWE2ODg5YzMiLCJ0cyI6IjIwNTE1IiwicCI6InB5aSIsImNpZCI6IjEiLCJzaWciOiJjMmQxNWZkNzA0YmZiMDdiNWFlMmYzMjEzNzZhOWU1MmE1MzJiZjRiYWM0OWE3MWNhYTQ4OTczZGVlODljZjc1IiwidiI6IjAiLCJnaXptb19pZCI6bnVsbCwiY3MiOm51bGwsImNkbiI6bnVsbCwiY3AiOm51bGwsIm1hIjpudWxsfQ.png?ex=69a8a821&is=69a756a1&hm=6b94ba116edddfdf7ad45a8d7a65cef216dd0b5f50b700f1be5af2fd874b1e46&")
        .setDescription(`🎉 Team ${winner} wins the match!`)
        .setColor(winner === 1 ? 0x3498db : 0xe74c3c)
    ]
  });

  // 🔒 نقفل أزرار اختيار الفايز
  const disabledRows = interaction.message.components.map(row => {
    row.components.forEach(button => {
      if (
        button.customId === "team1_win" ||
        button.customId === "team2_win"
      ) {
        button.setDisabled(true);
      }
    });
    return row;
  });

  await interaction.message.edit({
    components: disabledRows
  });

  return;
}
    
 if (interaction.customId === "submit_stats") {

  if (!activeMatch) {
    return interaction.reply({
      content: "❌ No active match.",
      flags: 64
    });
  }

  if (!activeMatch.submitted) {
    activeMatch.submitted = [];
  }

  if (!activeMatch.winner) {
    return interaction.reply({
      content: "❌ Select match winner first.",
      flags: 64
    });
  }

  if (activeMatch.submitted.includes(userId)) {
    return interaction.reply({
      content: "❌ You already submitted stats.",
      flags: 64
    });
  }

  const modal = new ModalBuilder()
    .setCustomId("stats_modal")
    .setTitle("Submit Your Match Stats");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("goals")
        .setLabel("Goals")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("assists")
        .setLabel("Assists")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("interceptions")
        .setLabel("Interceptions")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("saves")
        .setLabel("Saves")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  return interaction.showModal(modal);
}
if (interaction.customId === "end_match") {
  await interaction.deferUpdate();

  let rivalryMessage = ""; // ✅ هنا برا

  if (activeMatch.winner) {

    updateMMRBatch(
      activeMatch.team1,
      activeMatch.team2,
      activeMatch.winner
    );

    updateRivalries(
      activeMatch.team1,
      activeMatch.team2,
      activeMatch.winner
    );

    const data = getAllPlayers();

    for (const p1 of activeMatch.team1) {
      for (const p2 of activeMatch.team2) {

        const rivalry = data[p1]?.rivalries?.[p2];

        if (rivalry && rivalry.matches === 5) {
          rivalryMessage +=
            `⚔ Rivalry Detected: <@${p1}> vs <@${p2}> (${rivalry.wins}-${rivalry.losses})\n`;
        }
      }
    }

    interaction.client.emit("hallUpdate", interaction.guild);
  }

  await activeMatch.deleteMatchVoiceRooms(interaction.guild);

await activeMatch.message.edit({
  embeds: [
    new EmbedBuilder()
      .setTitle("🏁 MATCH ENDED")
      .setColor(0xe74c3c)
      .setDescription("Voice rooms deleted.\nMMR updated.")
      .setImage("https://media.discordapp.net/attachments/1475076726299033602/1477688755208061090/content.png?ex=69a5ac65&is=69a45ae5&hm=1dc235eb9bdfff64580c6a16617f5861606404a1efa54a19edbc48bd7ad2458b&=&format=webp&quality=lossless&width=1240&height=826") // 👈 حط لينك الصورة هنا
  ],
components: [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("rematch_reroll")
      .setLabel("🔁 Rematch")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("rematch_reroll_random")
      .setLabel("🎲 Reroll Rematch")
      .setStyle(ButtonStyle.Secondary)
  )
]
});

  // ✅ هنا بقى هيشتغل عادي
  if (rivalryMessage) {
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
      .setTitle("⚔ RIVALRY DETECTED")
      .setColor(0x9b59b6)
      .setDescription(rivalryMessage)
      .setImage("https://media.discordapp.net/attachments/1475076726299033602/1477685032398098563/ChatGPT_Image_Mar_1_2026_05_12_22_PM.png?ex=69a5a8ed&is=69a4576d&hm=afb05c782eb7f0d6b20326cdd731f2392bf6748b0bbf894599ce72efdbfe99e1&=&format=webp&quality=lossless&width=1240&height=826") // 👈 صورة الرايفالري
      .setFooter({ text: "A new rivalry has begun..." })
  ]
});
  }

 lastRematchTeams = {
  team1: activeMatch.team1,
  team2: activeMatch.team2
};

activeMatch = null;
}
  }
}

/* ================= START MATCH ================= */

async function startMatch(interaction) {
  const guild = interaction.guild;
  const data = getAllPlayers();

  if (draftMode) {
    return startDraftMode(interaction, data);
  }

  const playersWithMMR = activeLobby.players.map(id => ({
    id,
    mmr: data[id]?.mmr || 1000
  }));

  playersWithMMR.sort((a, b) => b.mmr - a.mmr);

  const team1 = [];
  const team2 = [];

  playersWithMMR.forEach((player, index) => {
    if (index % 4 === 0 || index % 4 === 3) {
      team1.push(player.id);
    } else {
      team2.push(player.id);
    }
  });

  await activeLobby.createMatchVoiceRooms(guild);
  await activeLobby.moveTeamsToVoice(guild, team1, team2);

  const embed = new EmbedBuilder()
    .setTitle(`⚽ REMATCH — ${activeLobby.teamSize}v${activeLobby.teamSize}`)
    .setColor(0x2ecc71)
    .addFields(
      {
        name: "🔵 Team 1",
        value: team1.map(id => `<@${id}>`).join("\n"),
        inline: true
      },
      {
        name: "🔴 Team 2",
        value: team2.map(id => `<@${id}>`).join("\n"),
        inline: true
      }
    )
    .setFooter({
      text: "Balanced by MMR • Select Winner then Submit Stats"
    });

  await activeLobby.message.edit({
    embeds: [embed],
    components: [buildMatchButtons()]
  });

  activeMatch = {
    team1,
    team2,
    winner: null,
    submitted: [],
    deleteMatchVoiceRooms: activeLobby.deleteMatchVoiceRooms,
    message: activeLobby.message
  };

  activeLobby = null;
}

/* ================= DRAFT MODE ================= */

/* ================= DRAFT MODE START ================= */

async function startDraftMode(interaction, data) {

  const guild = interaction.guild;

  const players = activeLobby.players.map(id => ({
    id,
    mmr: data[id]?.mmr || 1000
  }));

  players.sort((a, b) => b.mmr - a.mmr);

  // لازم يكون في على الأقل 4 لاعيبة
  if (players.length < 4) {
    draftMode = false;
    return startBalancedMatch(interaction, data);
  }

  const captain1 = players[0].id;
  const captain2 = players[1].id;

  const remaining = players.slice(2).map(p => p.id);

  activeMatch = {
    team1: [captain1],
    team2: [captain2],
    captains: [captain1, captain2],
    remaining,
    currentCaptain: captain1,
    pickOrder: 1, // للتحكم في Snake
    winner: null,
    submitted: [],
    deleteMatchVoiceRooms: activeLobby.deleteMatchVoiceRooms,
    message: activeLobby.message,
    draft: true
  };

  await updateDraftEmbed(interaction, true);
}


/* ================= UPDATE DRAFT EMBED ================= */

async function updateDraftEmbed(interaction, first = false) {

  // لو خلصت الاختيارات
  if (!activeMatch.remaining.length) {
    return finalizeDraft(interaction);
  }

  // Discord max 25 options
  const limitedOptions = activeMatch.remaining.slice(0, 25);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("draft_pick")
      .setPlaceholder("Captain pick a player")
      .addOptions(
        limitedOptions.map(id => ({
          label: interaction.guild.members.cache.get(id)?.user.username?.slice(0, 100) || id,
          value: id
        }))
      )
  );

  const embed = new EmbedBuilder()
    .setTitle("🧠 DRAFT MODE — Captain Pick")
    .setColor(0x9b59b6)
    .addFields(
      { name: "🔵 Team 1", value: activeMatch.team1.map(id => `<@${id}>`).join("\n"), inline: true },
      { name: "🔴 Team 2", value: activeMatch.team2.map(id => `<@${id}>`).join("\n"), inline: true },
      { name: "🎯 Turn", value: `<@${activeMatch.currentCaptain}>` }
    );

  await activeMatch.message.edit({
    embeds: [embed],
    components: [row]
  });

  if (first) activeLobby = null;
}


/* ================= HANDLE DRAFT PICK ================= */

export async function handleDraftPick(interaction) {

  if (!activeMatch?.draft) return;

  const userId = interaction.user.id;

  if (userId !== activeMatch.currentCaptain) {
    return interaction.reply({
      content: "❌ Not your turn.",
      flags: 64
    });
  }

  const pickedId = interaction.values[0];

  if (!activeMatch.remaining.includes(pickedId)) {
    return interaction.reply({
      content: "❌ Invalid pick.",
      flags: 64
    });
  }

  await interaction.deferUpdate();

  if (activeMatch.currentCaptain === activeMatch.captains[0]) {
    activeMatch.team1.push(pickedId);
  } else {
    activeMatch.team2.push(pickedId);
  }

  activeMatch.remaining =
    activeMatch.remaining.filter(id => id !== pickedId);

  /* ===== Snake Draft Logic ===== */

  const totalPicks =
    activeMatch.team1.length + activeMatch.team2.length - 2;

  // Snake Pattern: 1,2,2,1,1,2...
  if (totalPicks % 2 === 1) {
    activeMatch.currentCaptain =
      activeMatch.currentCaptain === activeMatch.captains[0]
        ? activeMatch.captains[1]
        : activeMatch.captains[0];
  }

  await updateDraftEmbed(interaction);
}


/* ================= FINALIZE DRAFT ================= */

async function finalizeDraft(interaction) {

  const guild = interaction.guild;

  await activeMatch.deleteMatchVoiceRooms(guild);
  await activeLobby?.createMatchVoiceRooms(guild);

  await activeLobby?.moveTeamsToVoice(
    guild,
    activeMatch.team1,
    activeMatch.team2
  );

  await activeMatch.message.edit({
    embeds: [
      new EmbedBuilder()
        .setTitle("⚽ DRAFT COMPLETE")
        .setColor(0x2ecc71)
        .addFields(
          { name: "🔵 Team 1", value: activeMatch.team1.map(id => `<@${id}>`).join("\n"), inline: true },
          { name: "🔴 Team 2", value: activeMatch.team2.map(id => `<@${id}>`).join("\n"), inline: true }
        )
        .setFooter({ text: "Select Winner then Submit Stats" })
    ],
    components: [buildMatchButtons()]
  });

  activeMatch.draft = false;
}


/* ================= BALANCED FALLBACK ================= */

async function startBalancedMatch(interaction, data) {

  const guild = interaction.guild;

  const playersWithMMR = activeLobby.players.map(id => ({
    id,
    mmr: data[id]?.mmr || 1000
  }));

  playersWithMMR.sort((a, b) => b.mmr - a.mmr);

  const team1 = [];
  const team2 = [];

  playersWithMMR.forEach((player, index) => {
    if (index % 4 === 0 || index % 4 === 3) {
      team1.push(player.id);
    } else {
      team2.push(player.id);
    }
  });

  await activeLobby.createMatchVoiceRooms(guild);
  await activeLobby.moveTeamsToVoice(guild, team1, team2);

  const embed = new EmbedBuilder()
    .setTitle(`⚽ REMATCH — ${activeLobby.teamSize}v${activeLobby.teamSize}`)
    .setColor(0x2ecc71)
    .addFields(
      { name: "🔵 Team 1", value: team1.map(id => `<@${id}>`).join("\n"), inline: true },
      { name: "🔴 Team 2", value: team2.map(id => `<@${id}>`).join("\n"), inline: true }
    )
    .setFooter({ text: "Balanced by MMR • Select Winner then Submit Stats" });

  await activeLobby.message.edit({
    embeds: [embed],
    components: [buildMatchButtons()]
  });

  activeMatch = {
    team1,
    team2,
    winner: null,
    submitted: [],
    deleteMatchVoiceRooms: activeLobby.deleteMatchVoiceRooms,
    message: activeLobby.message
  };

  activeLobby = null;
}
/* ================= UI ================= */

function buildLobbyEmbed() {
  return new EmbedBuilder()
    .setTitle(
      `⚽ REMATCH LOBBY — ${activeLobby.teamSize}v${activeLobby.teamSize}`
    )
    .setColor(0xf1c40f)
    .setImage("https://cdn.discordapp.com/attachments/1475077848716021833/1478505481231138916/eyJpZCI6InVzZXItTktZUnJiTExSVGJlbTJjTGRtcU9zUVlVOmZpbGVfMDAwMDAwMDAzYzVjNzIyZjlkODEzNTYyMjlkZTJmNGYiLCJ0cyI6IjIwNTE1IiwicCI6InB5aSIsImNpZCI6IjEiLCJzaWciOiI1ZjcyMTI2MjUyOGRkOWFkMmNmMTZkYTRiZDQ1N2YzYjQ2ZDJkZDJlNWMxYmE2NDkwYTc1MjYwNjFlNmJkNjk3IiwidiI6IjAiLCJnaXptb19pZCI6bnVsbCwiY3MiOm51bGwsImNkbiI6bnVsbCwiY3AiOm51bGwsIm1hIjpudWxsfQ.png?ex=69a8a508&is=69a75388&hm=53ce21362e41e11f12a0fbf56f3a3732109b11cc5efc98641bbb2f238ae4cef6&")
    .setDescription(
      `Players Joined: **${activeLobby.players.length} / ${activeLobby.maxPlayers}**\n\n` +
        (activeLobby.players.length
          ? activeLobby.players.map(id => `<@${id}>`).join("\n")
          : "No players yet.")
    );
}

function buildLobbyButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("join_lobby")
      .setLabel("➕ Join")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("leave_lobby")
      .setLabel("➖ Leave")
      .setStyle(ButtonStyle.Secondary),
    
    new ButtonBuilder()
      .setCustomId("rematch_end_lobby")
      .setLabel("🛑 End Lobby")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("toggle_draft")
      .setLabel(draftMode ? "🧠 Draft ON" : "⚖️ Balanced")
      .setStyle(ButtonStyle.Primary)
    
    );
}

function buildMatchButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("team1_win")
      .setLabel("🔵 Team 1 Won")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("team2_win")
      .setLabel("🔴 Team 2 Won")
      .setStyle(ButtonStyle.Primary),
    
    new ButtonBuilder()
      .setCustomId("submit_stats")
      .setLabel("📊 Submit Stats")
      .setStyle(ButtonStyle.Success),
        
    new ButtonBuilder()
      .setCustomId("end_match")
      .setLabel("🏁 End Match")
      .setStyle(ButtonStyle.Danger)
  );
}