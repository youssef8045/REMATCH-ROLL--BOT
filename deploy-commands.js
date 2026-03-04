import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [

  /* ================= REMATCH ================= */

  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create the match control panel')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top players')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show your stats')
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('topassists')
    .setDescription('Show top assists leaderboard')
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('topgoals')
    .setDescription('Show top goals leaderboard')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('topwins')
    .setDescription('Show top wins leaderboard')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('topsaves')
    .setDescription('Show top saves leaderboard')
    .toJSON(),

  new SlashCommandBuilder()
    .setName("matchhistory")
    .setDescription("Show your last 5 matches")
    .addUserOption(option =>
      option
        .setName("player")
        .setDescription("Select a player")
        .setRequired(false)
    )
    .toJSON(),

  /* ================= FINALS ================= */

  new SlashCommandBuilder()
    .setName('finals_profile')
    .setDescription('Show your Finals stats')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('finals_leaderboard')
    .setDescription('Show Finals MMR leaderboard')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('finals_topkills')
    .setDescription('Show top kills leaderboard in Finals')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('finals_topassists')
    .setDescription('Show top assists leaderboard in Finals')
    .toJSON(),

];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('Slash commands registered!');
  } catch (error) {
    console.error(error);
  }
})();