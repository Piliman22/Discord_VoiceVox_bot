import { 
    Client, 
    GatewayIntentBits, 
    ChatInputCommandInteraction,
    Message,
    EmbedBuilder
} from 'discord.js';
import { registerCommands } from './command';
import { Config } from '../config';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { VoicevoxClient } from './fetch';

export async function launch(config: Config) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent // メッセージ内容を取得するため
        ]
    });

    // VOICEVOXクライアントを初期化
    const voicevox = new VoicevoxClient({
        url: config.voicevoxUrl,
        speakerId: config.speakerId
    });

    // 読み上げ対象チャンネルを管理するMap（guildId => channelId）
    const readingChannels = new Map<string, string>();

    client.once("ready", async () => {
        console.log(`✅ ログイン完了: ${client.user?.tag}`);
        
        // VOICEVOX接続確認
        const isVoicevoxConnected = await voicevox.checkConnection();
        if (isVoicevoxConnected) {
            console.log('✅ VOICEVOX接続確認完了');
        } else {
            console.log('❌ VOICEVOX接続失敗');
        }
    });

    // メッセージ読み上げ処理
    client.on('messageCreate', async (message: Message) => {
        // Botのメッセージは無視
        if (message.author.bot) return;
        
        // ギルドIDが存在しない場合は処理しない
        if (!message.guildId) return;

        // VCに参加しているかチェック
        const connection = getVoiceConnection(message.guildId);
        if (!connection) return;

        // 読み上げ対象チャンネルが設定されているかチェック
        const targetChannelId = readingChannels.get(message.guildId);
        if (!targetChannelId) return;

        // メッセージが読み上げ対象チャンネルからのものかチェック
        if (message.channelId !== targetChannelId) return;

        // 空メッセージや長すぎるメッセージは読み上げない
        if (!message.content.trim() || message.content.length > 200) return;

        try {
            console.log(`📥 メッセージ受信: "${message.content}" (チャンネル: ${message.channel})`);
            // キューシステムを使って読み上げ（非同期でキューに追加）
            voicevox.speakText(message.content, connection).catch(error => {
                console.error('読み上げキュー追加エラー:', error);
            });
        } catch (error) {
            console.error('メッセージ読み上げエラー:', error);
        }
    });

    client.on("interactionCreate", async interaction => {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === "join") {
            await handleJoin(interaction);
        }

        if (interaction.commandName === "leave") {
            await handleLeave(interaction);
        }

        if (interaction.commandName === "status") {
            await handleStatus(interaction);
        }

        if (interaction.commandName === "set-channel") {
            await handleSetChannel(interaction);
        }

        if (interaction.commandName === "character") {
            await handleCharacter(interaction);
        }

        if (interaction.commandName === "characters") {
            await handleCharacters(interaction);
        }

        if (interaction.commandName === "queue") {
            await handleQueue(interaction);
        }

        if (interaction.commandName === "skip") {
            await handleSkip(interaction);
        }
    });

    async function handleJoin(interaction: ChatInputCommandInteraction) {
        const channel = interaction.options.getChannel("channel");

        if (
            !channel ||
            (channel.type !== 2 && channel.type !== 13) // 2: GuildVoice, 13: GuildStageVoice
        ) {
            await interaction.reply({ content: "ボイスチャンネルを選択してください。", ephemeral: true });
            return;
        }

        if (!interaction.guild) {
            await interaction.reply({ content: "ギルド情報が取得できませんでした。", ephemeral: true });
            return;
        }

        // ボイスチャンネルに参加
        joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator
        });

        // 読み上げ対象チャンネルを設定（/joinが実行されたチャンネル）
        readingChannels.set(interaction.guildId!, interaction.channelId);

        console.log(`🎯 読み上げ対象チャンネル設定: ${interaction.channel?.toString()} (Guild: ${interaction.guild.name})`);

        await interaction.reply(
            `**${channel.name}** に参加しました!\n` +
            `📢 このチャンネル（<#${interaction.channelId}>）のメッセージを読み上げます。`
        );
    }

    async function handleLeave(interaction: ChatInputCommandInteraction) {
        const connection = getVoiceConnection(interaction.guildId!);
        if (connection) {
            connection.destroy();
            
            // 読み上げキューをクリア
            voicevox.clearQueue(interaction.guildId!);
            
            // 読み上げ対象チャンネルの設定をクリア
            readingChannels.delete(interaction.guildId!);
            
            console.log(`👋 VC退出 & 読み上げ設定クリア (Guild: ${interaction.guild?.name})`);
            
            await interaction.reply(`VCから退出しました！読み上げ設定とキューもクリアしました。`);
        } else {
            await interaction.reply({ content: "BotはVCに参加していません。", ephemeral: true });
        }
    }

    async function handleStatus(interaction: ChatInputCommandInteraction) {
        const connection = getVoiceConnection(interaction.guildId!);
        const targetChannelId = readingChannels.get(interaction.guildId!);
        const currentSpeakerId = voicevox.getCurrentSpeakerId();
        const speakerName = await voicevox.getSpeakerName(currentSpeakerId);
        const queueStatus = voicevox.getQueueStatus(interaction.guildId!);

        let statusMessage = "📊 **Bot状態**\n";
        
        if (connection) {
            statusMessage += "🔊 ボイスチャンネル: **接続中**\n";
        } else {
            statusMessage += "🔇 ボイスチャンネル: **未接続**\n";
        }

        if (targetChannelId) {
            statusMessage += `📢 読み上げ対象: <#${targetChannelId}>\n`;
        } else {
            statusMessage += "📢 読み上げ対象: **未設定**\n";
        }

        statusMessage += `🎭 現在のキャラクター: **${speakerName}**\n`;
        statusMessage += `📝 読み上げキュー: **${queueStatus.queueLength}件**`;
        
        if (queueStatus.isProcessing) {
            statusMessage += " *(処理中)*";
        }

        await interaction.reply({ content: statusMessage, ephemeral: true });
    }

    async function handleSetChannel(interaction: ChatInputCommandInteraction) {
        const connection = getVoiceConnection(interaction.guildId!);
        if (!connection) {
            await interaction.reply({ 
                content: "先にボイスチャンネルに参加してください（`/join`）。", 
                ephemeral: true 
            });
            return;
        }

        const channel = interaction.options.getChannel("channel");
        const targetChannelId = channel ? channel.id : interaction.channelId;

        // チャンネルがテキストチャンネルかチェック
        if (channel && channel.type !== 0) { // 0: GuildText
            await interaction.reply({ 
                content: "テキストチャンネルを選択してください。", 
                ephemeral: true 
            });
            return;
        }

        readingChannels.set(interaction.guildId!, targetChannelId);

        await interaction.reply(
            `📢 読み上げ対象チャンネルを <#${targetChannelId}> に設定しました！`
        );
    }

    async function handleCharacter(interaction: ChatInputCommandInteraction) {
        const speakerId = interaction.options.getInteger("speaker", true);
        
        try {
            // キャラクターを変更
            voicevox.setSpeakerId(speakerId);
            
            // キャラクター名を取得
            const speakerName = await voicevox.getSpeakerName(speakerId);
            
            await interaction.reply(
                `🎭 読み上げキャラクターを **${speakerName}** に変更しました！`
            );

            // テスト読み上げ（VCに参加している場合）
            const connection = getVoiceConnection(interaction.guildId!);
            if (connection) {
                try {
                    voicevox.speakText("よろしくお願いします", connection);
                } catch (error) {
                    console.error('テスト読み上げエラー:', error);
                }
            }
        } catch (error) {
            console.error('キャラクター変更エラー:', error);
            await interaction.reply({ 
                content: "キャラクターの変更に失敗しました。", 
                ephemeral: true 
            });
        }
    }

    async function handleCharacters(interaction: ChatInputCommandInteraction) {
        try {
            const characters = await voicevox.getAvailableCharacters();
            
            if (characters.length === 0) {
                await interaction.reply({ 
                    content: "キャラクター情報を取得できませんでした。", 
                    ephemeral: true 
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("🎭 利用可能なキャラクター一覧")
                .setColor(0x0099FF)
                .setDescription("以下のキャラクターが利用可能です：");

            let description = "";
            for (const character of characters.slice(0, 10)) { // 最初の10キャラクターのみ表示
                description += `**${character.name}**\n`;
                for (const style of character.styles) {
                    description += `　└ ${style.name} (ID: ${style.id})\n`;
                }
                description += "\n";
            }

            embed.setDescription(description);
            embed.setFooter({ text: "キャラクター変更: /character speaker:<ID>" });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('キャラクター一覧取得エラー:', error);
            await interaction.reply({ 
                content: "キャラクター一覧の取得に失敗しました。", 
                ephemeral: true 
            });
        }
    }

    async function handleQueue(interaction: ChatInputCommandInteraction) {
        const queueStatus = voicevox.getQueueStatus(interaction.guildId!);
        
        let message = `📝 **読み上げキュー状態**\n`;
        message += `待機中: **${queueStatus.queueLength}件**\n`;
        
        if (queueStatus.isProcessing) {
            message += `状態: **処理中** 🔄`;
        } else {
            message += `状態: **待機中** ⏸️`;
        }

        await interaction.reply({ content: message, ephemeral: true });
    }

    async function handleSkip(interaction: ChatInputCommandInteraction) {
        const connection = getVoiceConnection(interaction.guildId!);
        if (!connection) {
            await interaction.reply({ 
                content: "BotはVCに参加していません。", 
                ephemeral: true 
            });
            return;
        }

        voicevox.clearQueue(interaction.guildId!);
        
        await interaction.reply("⏭️ 読み上げキューをクリアしました！");
    }

    await registerCommands(config);
    await client.login(config.token);
}
