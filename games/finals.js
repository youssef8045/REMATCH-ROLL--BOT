import {
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
import { createMatchVoiceRooms, moveTeamsToVoice } from "../index.js";
import {
  getAllFinalsPlayers,
  updateFinalsMMRBatch,
  getMatchMVP,
  updateFinalsRivalries
} from "../utils/finalsStats.js";

/* ================= STATE ================= */

let activeLobby = null;
let activeMatch = null;
let draftMode = false;

/* ================= RANDOM SYSTEM ================= */

const LOGO_URL = "https://cdn.discordapp.com/attachments/1477301182547493017/1477415719003226215/images_2.jpg";

const CLASSES = ["Light", "Medium", "Heavy"];

const SPECIALIZATIONS = {
  Light: ["Cloaking Device", "Evasive Dash", "Grappling Hook"],
  Medium: ["Healing Beam", "Guardian Turret", "Dematerializer"],
  Heavy: ["Charge 'N' Slam", "Mesh Shield", "Winch Claw", "Goo Gun"]
};

const WEAPONS = {
  Light: ["SR-84", "THROWING KNIVES", "M11", "SH1900", "ARN-220", "DAGGER", "LH1", "93R", "M26 MATTER", "SWORD", "RECURVE BOW", "V9S", "XP-54"],
  Medium: ["AKM", "MODEL 1887", "FAMAS", "DUAL BLADES", "CB-01 REPEATER", "P90", "CL-40", "RIOT SHIELD", "PIKE-556", "R.357", "FCAR", "CERBERUS 12GA"],
  Heavy: ["50 AKIMBO", "M134 MINIGUN", "SHAK-50", "KS-23", "LEWIS GUN", "M60", "BFR TITAN", "FLAMETHROWER", "SPEAR", "SLEDGEHAMMER", "MGL32", "SA1216"]
};

const GADGETS = {
  Light: ["sonar grenade", "thermal bore", "vanishing bomb", "breach charge", "glitch grenade", "nullifire", "goo grenade", "gas grenade", "gravity vortex", "tracking dart", "smoke grenade", "gateway", "frag grenade", "h+ infuser", "pyro grenade", "flashbang"],
  Medium: ["defibrillator", "jump pad", "aps turret", "glitch trap", "data reshaper", "zipline", "explosive mine", "proximity sensor", "flashbang", "frag grenade", "goo grenade", "breach drill", "pyro grenade", "smoke grenade", "gas grenade", "gas mine"],
  Heavy: ["healing emitter", "dome shield", "explosive mine", "RBG-7", "proximity sensor", "lockbolt", "C4", "barricade", "frag grenade", "pyro grenade", "flashbang", "smoke grenade", "anti-gravity cube", "pyro mine", "goo grenade"]
};

const MAPS = [
  { name: "Monaco", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411279378583705/Monaco_DuckAndCover_Storm.jpg" },
  { name: "Seoul", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411269073178768/Seoul_Default_Afternoon.jpg" },
  { name: "Skyway Stadium", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411373314080819/Skyway_Default_Afternnoon.jpg" },
  { name: "Las Vegas", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411104794869841/Loading_Screen_Las_Vegas_Stadium_Afternoon.jpg" },
  { name: "SYS$HORIZON", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411301482299474/Horizon_default_sunny_day.jpg" },
  { name: "Kyoto", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411385238487254/Kyoto_day.png" },
  { name: "Fortune Stadium", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411537508634664/Fortune_Stadium_Standard_Night.png" },
  { name: "Bernal", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411514750075041/Bernal_Standard_Night.png" },
  { name: "NOZOMI / CITADEL", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411546232655912/NOZOMI_Night.png" },
  { name: "Fangwai City", image: "https://cdn.discordapp.com/attachments/1477301182547493017/1477411124742852702/Fangwai_City_Standard_Day.png" }
];

function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomGadgets(className) {
  const pool = [...GADGETS[className]];
  const selected = [];
  for (let i = 0; i < 3; i++) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
}

/* ✅ FIX: shuffle added */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/* ================= LOBBY ================= */

export async function generateFinalsLobby(
  interaction,
  resultChannelId,
  client,
  createVoiceRooms,
  moveToVoice,
  deleteVoiceRooms
) {

  if (activeLobby || activeMatch) {
    return interaction.reply({ content: "❌ Finals already running.", flags: 64 });
  }

  const teamSize = parseInt(interaction.fields.getTextInputValue("teamsize_input"));
  const teamCount = parseInt(interaction.fields.getTextInputValue("teamcount_input"));

  if (isNaN(teamSize) || isNaN(teamCount) || teamSize < 1 || teamCount < 2) {
    return interaction.reply({ content: "❌ Invalid setup.", flags: 64 });
  }

  const resultChannel = await client.channels.fetch(resultChannelId);

  activeLobby = {
    players: [],
    teamSize,
    teamCount,
    maxPlayers: teamSize * teamCount,
    createVoiceRooms,
    moveToVoice,
    deleteVoiceRooms,
    message: null,
    ownerId: interaction.user.id
  };

  const msg = await resultChannel.send({
    embeds: [buildLobbyEmbed()],
    components: [buildLobbyButtons()]
  });

  activeLobby.message = msg;

  return interaction.reply({ content: "🏆 Finals Lobby Created.", flags: 64 });
}

/* ================= HANDLE BUTTONS ================= */

export async function handleFinalsButtons(interaction) {

  const userId = interaction.user.id;
if (interaction.customId === "finals_end_lobby") {

  try {
    await interaction.deferUpdate(); // لازم أول سطر

    activeLobby = null;
    activeMatch = null;

    await interaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle("🛑 FINALS SESSION CLOSED")
          .setColor(0xe74c3c)
          .setDescription("The finals session has been closed.")
      ],
      components: []
    });

  } catch (err) {
    console.error("End Lobby Error:", err);
  }

  return;
}
  if (activeLobby && !activeMatch) {

    if (interaction.customId === "finals_join") {
      await interaction.deferUpdate();

      if (!activeLobby.players.includes(userId))
        activeLobby.players.push(userId);

      if (activeLobby.players.length === activeLobby.maxPlayers)
        return startFinalsMatch(interaction);

      return activeLobby.message.edit({
        embeds: [buildLobbyEmbed()],
        components: [buildLobbyButtons()]
      });
    }

    if (interaction.customId === "finals_leave") {
      await interaction.deferUpdate();

      activeLobby.players =
        activeLobby.players.filter(id => id !== userId);

      return activeLobby.message.edit({
        embeds: [buildLobbyEmbed()],
        components: [buildLobbyButtons()]
      });
    }


    if (interaction.customId === "finals_toggle_draft") {
      await interaction.deferUpdate();
      draftMode = !draftMode;

      return activeLobby.message.edit({
        embeds: [buildLobbyEmbed()],
        components: [buildLobbyButtons()]
      });
    }
  }

  if (!activeMatch) return;

  if (interaction.isStringSelectMenu() && interaction.customId === "finals_select_winner") {

  if (activeMatch.winner) {
    return interaction.reply({
      content: "⚠ Winner already selected.",
      flags: 64
    });
  }

  const selectedWinner = parseInt(interaction.values[0]);
  activeMatch.winner = selectedWinner;

  // 🏆 رسالة عامة لكل الناس
await interaction.reply({
  embeds: [
    new EmbedBuilder()
      .setTitle("🏆 WINNER DECLARED")
      .setDescription(`🎉 Team ${selectedWinner} wins the match!`)
      .setColor(0xf1c40f)
      .setImage("https://media.discordapp.net/attachments/1478284869271556287/1478429093396742144/The-Finals-SEASON-8-LAUNCH-TRAILER-_-THE-FINALS-0-59-screenshot.png?ex=69a85de3&is=69a70c63&hm=7716865ad9f2b3b7be5997de1e9dcd443f654ad404305e3571944498aca02e37&=&format=webp&quality=lossless&width=1423&height=800") // 👈 حط الصورة هنا
  ]
});

  // 🔒 نقفل الاختيار
  const disabledComponents = interaction.message.components.map(row => {

    row.components.forEach(component => {
      if (component.customId === "finals_select_winner") {
        component.setDisabled(true);
      }
    });

    return row;
  });

  await interaction.message.edit({
    components: disabledComponents
  });

  return;
}

  if (interaction.customId === "finals_submit") {

    if (!activeMatch.winner)
      return interaction.reply({
        content: "❌ Select winner first.",
        flags: 64
      });

    const modal = new ModalBuilder()
      .setCustomId("finals_stats")
      .setTitle("Submit Finals Stats");

    modal.addComponents(
      buildInput("kills", "Kills"),
      buildInput("assists", "Assists"),
      buildInput("combat", "Combat Damage"),
      buildInput("support", "Support"),
      buildInput("objective", "Objective")
    );

    return interaction.showModal(modal);
  }

  if (interaction.customId === "finals_end") {
    await interaction.deferUpdate();
    return endFinalsMatch(interaction);
  }
  /* ================= REROLL FULL MATCH ================= */
console.log("REROLL FULL CLICKED");
if (interaction.customId === "finals_reroll_full") {

  await interaction.deferUpdate();
  draftMode = false;

  const oldTeams = activeMatch.teams;
  const players = oldTeams.flat();

  const shuffled = players.sort(() => Math.random() - 0.5);

  const teamSize = oldTeams[0].length;
  const teamCount = oldTeams.length;

  const newTeams = [];

  for (let i = 0; i < teamCount; i++) {
    newTeams.push(
      shuffled.slice(i * teamSize, (i + 1) * teamSize)
    );
  }

  // 🔥 نعمل voice rooms جديدة
  const { category, channels } =
    await createMatchVoiceRooms(interaction.guild);

  await moveTeamsToVoice(interaction.guild, newTeams);

  const selectedMap = randomFrom(MAPS);

  const randomizedLoadouts = newTeams.map(team =>
    team.map(playerId => {

      const playerClass = randomFrom(CLASSES);

      return {
        id: playerId,
        class: playerClass,
        specialization: randomFrom(SPECIALIZATIONS[playerClass]),
        weapon: randomFrom(WEAPONS[playerClass]),
        gadgets: randomGadgets(playerClass)
      };

    })
  );

  activeMatch.teams = newTeams;
  activeMatch.winner = null;

  const embed = new EmbedBuilder()
    .setTitle("🎲 FINALS REROLL FULL MATCH")
    .setColor(0x10b981)
    .setImage(selectedMap.image)
    .setDescription(`🗺 Map: **${selectedMap.name}**`)
    .addFields(
      randomizedLoadouts.map((team, i) => ({
        name: `Team ${i + 1}`,
        value: team.map(p =>
`👤 <@${p.id}>
🎮 Class: **${p.class}**
⚡ Spec: ${p.specialization}
🔫 Weapon: ${p.weapon}
🧰 Gadgets: ${p.gadgets.join(", ")}`
        ).join("\n\n"),
        inline: false
      }))
    );

  return activeMatch.message.edit({
    embeds: [embed],
    components: buildMatchButtons(newTeams)
  });
}

/* ================= REROLL LOADOUT ONLY ================= */
if (interaction.customId === "finals_reroll_loadout") {
  await interaction.deferUpdate();

  const teams = activeMatch.teams;

  // 🔥 نعمل Voice Rooms جديدة
  const { category, channels } =
    await createMatchVoiceRooms(interaction.guild, teams.length)

  await moveTeamsToVoice(interaction.guild, teams);

  const selectedMap = randomFrom(MAPS);

  const randomizedLoadouts = teams.map(team =>
    team.map(playerId => {

      const playerClass = randomFrom(CLASSES);

      return {
        id: playerId,
        class: playerClass,
        specialization: randomFrom(SPECIALIZATIONS[playerClass]),
        weapon: randomFrom(WEAPONS[playerClass]),
        gadgets: randomGadgets(playerClass)
      };

    })
  );

  activeMatch.winner = null; // reset winner

  const embed = new EmbedBuilder()
    .setTitle("🗺 FINALS REROLL LOADOUT")
    .setColor(0x3498db)
    .setImage(selectedMap.image)
    .setDescription(`🗺 Map: **${selectedMap.name}**`)
    .addFields(
      randomizedLoadouts.map((team, i) => ({
        name: `Team ${i + 1}`,
        value: team.map(p =>
`👤 <@${p.id}>
🎮 Class: **${p.class}**
⚡ Spec: ${p.specialization}
🔫 Weapon: ${p.weapon}
🧰 Gadgets: ${p.gadgets.join(", ")}`
        ).join("\n\n"),
        inline: false
      }))
    );

  return activeMatch.message.edit({
    embeds: [embed],
    components: buildMatchButtons(teams)
  });
}
}

/* ================= START MATCH ================= */

async function startFinalsMatch(interaction) {

  const guild = interaction.guild;
  const data = getAllFinalsPlayers();

  let teams = [];

  if (draftMode) {

    const sorted = activeLobby.players
      .map(id => ({ id, mmr: data[id]?.mmr || 1000 }))
      .sort((a, b) => b.mmr - a.mmr);

    const captains = sorted
      .slice(0, activeLobby.teamCount)
      .map(p => p.id);

    const pool = sorted
      .slice(activeLobby.teamCount)
      .map(p => p.id);

    teams = captains.map(c => [c]);

    let turn = 0;
    let reverse = false;

    while (pool.length) {
      teams[turn].push(pool.shift());

      if (!reverse) {
        turn++;
        if (turn === teams.length) {
          turn--;
          reverse = true;
        }
      } else {
        turn--;
        if (turn < 0) {
          turn = 0;
          reverse = false;
        }
      }
    }

  } else {

    const shuffled = shuffle([...activeLobby.players]);

    for (let i = 0; i < activeLobby.teamCount; i++) {
      teams.push(
        shuffled.slice(
          i * activeLobby.teamSize,
          (i + 1) * activeLobby.teamSize
        )
      );
    }
  }

  const { category, channels } =
    await activeLobby.createVoiceRooms(guild, teams.length);

  await activeLobby.moveToVoice(guild, teams);

  const selectedMap = randomFrom(MAPS);

  const randomizedLoadouts = teams.map(team =>
    team.map(playerId => {

      const playerClass = randomFrom(CLASSES);

      return {
        id: playerId,
        class: playerClass,
        specialization: randomFrom(SPECIALIZATIONS[playerClass]),
        weapon: randomFrom(WEAPONS[playerClass]),
        gadgets: randomGadgets(playerClass)
      };

    })
  );

const embed = new EmbedBuilder()
  .setTitle(`🏆 FINALS MATCH STARTED`)
  .setColor(0x10b981)
  .setThumbnail(LOGO_URL)
  .setImage(selectedMap.image)
  .setDescription(`🗺 Map: **${selectedMap.name}**\n\nSelect Winner • Submit Stats • End Match`)
  .addFields(
    randomizedLoadouts.map((team, i) => ({
      name: `🛡 Team ${i + 1}`,
      value: team.map(p =>
        `👤 **<@${p.id}>**
🎮 ${p.class} | ⚡ ${p.specialization}
🔫 ${p.weapon}
🧰 ${p.gadgets.join(", ")}`
      ).join("\n\n"),
      inline: true
    }))
  )
  .setFooter({ text: "Select Winner • Submit Stats • End Match" });

  activeMatch = {
    teams,
    winner: null,
    message: activeLobby.message,
    deleteVoiceRooms: activeLobby.deleteVoiceRooms
  };

  await activeLobby.message.edit({
    embeds: [embed],
    components: buildMatchButtons(teams)
  });

  activeLobby = null;
}

/* ================= END MATCH ================= */

async function endFinalsMatch(interaction) {

  if (!activeMatch) return;

  let mvp = null;

  if (activeMatch.winner) {

    if (activeMatch.teams.length === 2) {

      updateFinalsMMRBatch(
        activeMatch.teams[0],
        activeMatch.teams[1],
        activeMatch.winner
      );
      updateFinalsRivalries(activeMatch.teams, activeMatch.winner);
    } else {;
      const winnerIndex = activeMatch.winner - 1;
      const winningTeam = activeMatch.teams[winnerIndex];

      activeMatch.teams.forEach((team, index) => {
        if (index !== winnerIndex) {
          updateFinalsMMRBatch(winningTeam, team, 1);
        }
      });
    }

    mvp = getMatchMVP(activeMatch.teams);

    interaction.client.emit("hallUpdate", interaction.guild);
    interaction.client.emit("finalsHallUpdate", interaction.guild);
  }

  await activeMatch.deleteVoiceRooms(interaction.guild);

  const summaryEmbed = new EmbedBuilder()
    .setTitle("🏁 FINALS MATCH ENDED")
    .setColor(0xe74c3c)
    .setImage("https://media.discordapp.net/attachments/1478284869271556287/1478613004621844540/wmremove-transformed.png?ex=69a9092b&is=69a7b7ab&hm=68347ed54a42188bd181c7834a05592ed26ab9b3b3ec7bbf334b488a198939ac&=&format=webp&quality=lossless&width=1434&height=800")
    .setDescription(`🏆 Winner: Team ${activeMatch.winner || "N/A"}`)
    .addFields(
      activeMatch.teams.map((team, i) => ({
        name: `Team ${i + 1}`,
        value: team.map(id => `<@${id}>`).join("\n"),
        inline: true
      }))
    );

  if (mvp) {
    summaryEmbed.addFields({
      name: "🏆 MVP OF THE MATCH",
      value: `👑 <@${mvp.id}>\n⭐ Rating: ${mvp.rating.toFixed(2)}`
    });
  }

  await activeMatch.message.edit({
    embeds: [summaryEmbed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("finals_reroll_full")
          .setLabel("🎲 Reroll Full Match")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("finals_reroll_loadout")
          .setLabel("🗺 Reroll Loadout Only")
          .setStyle(ButtonStyle.Secondary),
      
              new ButtonBuilder()
        .setCustomId("finals_end_lobby")
        .setLabel("🛑 End Lobby")
        .setStyle(ButtonStyle.Danger)
       
    )
  
  ]
});
}
/* ================= UI ================= */

function buildLobbyEmbed() {
  return new EmbedBuilder()
    .setTitle("🏆 FINALS LOBBY")
    .setColor(0x3498db)
    .setImage("https://media.discordapp.net/attachments/1478284869271556287/1478612760718737409/cbpjvegp4nrmy0cwpwj8e30nww.png?ex=69a908f1&is=69a7b771&hm=b6460131b13dcb2e017a95cb7e1083bae310701621aeab25ee69719541a9946f&=&format=webp&quality=lossless&width=1428&height=800") // 👈 صورة اللوبى
    .setDescription(
      `Players: ${activeLobby.players.length}/${activeLobby.maxPlayers}\n\n` +
      (activeLobby.players.length
        ? activeLobby.players.map(id => `<@${id}>`).join("\n")
        : "No players yet.")
    );
}

function buildLobbyButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("finals_join").setLabel("Join").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("finals_leave").setLabel("Leave").setStyle(ButtonStyle.Secondary),
   new ButtonBuilder()
  .setCustomId("finals_end_lobby")
  .setLabel("🛑 End Lobby")
  .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("finals_toggle_draft")
      .setLabel(draftMode ? "Draft ON" : "Balanced")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildMatchButtons(teams) {

  const options = teams.map((_, index) => ({
    label: `Team ${index + 1}`,
    value: String(index + 1)
  }));

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("finals_select_winner")
        .setPlaceholder("🏆 Select Winning Team")
        .addOptions(options)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("finals_submit")
        .setLabel("Submit Stats")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("finals_end")
        .setLabel("End Match")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildInput(id, label) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
  );
}