import { 
    Client, 
    GatewayIntentBits, 
    ChatInputCommandInteraction,
    Message,
    EmbedBuilder,
    VoiceState
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

    // ボイスチャンネルの入退室を監視
    client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
        // Botの状態変化は無視
        if (newState.member?.user.bot) return;

        // ギルドIDが存在しない場合は処理しない
        if (!newState.guild?.id) return;

        // VCに参加しているかチェック
        const connection = getVoiceConnection(newState.guild.id);
        if (!connection) return;

        // Botが現在入っているVCのIDを取得
        const botVoiceChannelId = connection.joinConfig.channelId;
        if (!botVoiceChannelId) return;

        // 読み上げ対象チャンネルが設定されているかチェック
        const targetChannelId = readingChannels.get(newState.guild.id);
        if (!targetChannelId) return;

        const user = newState.member?.user;
        if (!user) return;

        // ユーザー名を取得（表示名を優先、なければユーザー名）
        const userName = newState.member?.displayName || user.displayName || user.username;

        try {
            // 入室の場合（BotがいるVCに入った場合のみ）
            if (
                !oldState.channel &&
                newState.channel &&
                newState.channel.id === botVoiceChannelId
            ) {
                const message = `${userName}さんが入室しました`;
                console.log(`🔵 入室通知: ${message}`);
                voicevox.speakText(message, connection).catch(error => {
                    console.error('入室通知読み上げエラー:', error);
                });
            }
            // 退室の場合（BotがいるVCから出た場合のみ）
            else if (
                oldState.channel &&
                !newState.channel &&
                oldState.channel.id === botVoiceChannelId
            ) {
                const message = `${userName}さんが退室しました`;
                console.log(`🔴 退室通知: ${message}`);
                voicevox.speakText(message, connection).catch(error => {
                    console.error('退室通知読み上げエラー:', error);
                });
            }
            // チャンネル移動の場合（BotがいるVCへの入室 or 退室のみ通知）
            else if (
                oldState.channel &&
                newState.channel &&
                oldState.channel.id !== newState.channel.id
            ) {
                // BotがいるVCに入った場合
                if (newState.channel.id === botVoiceChannelId) {
                    const message = `${userName}さんが入室しました`;
                    console.log(`🔵 入室通知: ${message}`);
                    voicevox.speakText(message, connection).catch(error => {
                        console.error('入室通知読み上げエラー:', error);
                    });
                }
                // BotがいるVCから出た場合
                else if (oldState.channel.id === botVoiceChannelId) {
                    const message = `${userName}さんが退室しました`;
                    console.log(`🔴 退室通知: ${message}`);
                    voicevox.speakText(message, connection).catch(error => {
                        console.error('退室通知読み上げエラー:', error);
                    });
                }
            }

            // --- ここから自動退出処理を追加 ---
            // BotがいるVCの状態を取得
            const guild = newState.guild;
            const botChannel = guild.channels.cache.get(botVoiceChannelId);
            if (botChannel && botChannel.isVoiceBased()) {
                // ボイスチャンネルのメンバー一覧を取得
                const members = (botChannel as any).members as Map<string, any>;
                // Bot以外のユーザーがいない場合は退出
                const nonBotMembers = Array.from(members.values()).filter((m: any) => !m.user.bot);
                if (nonBotMembers.length === 0) {
                    // 退出処理
                    connection.destroy();
                    voicevox.clearQueue(guild.id);
                    readingChannels.delete(guild.id);
                    console.log(`👋 ボイスチャンネルにBotのみとなったため自動退出 (Guild: ${guild.name})`);
                }
            }
            // --- ここまで自動退出処理 ---
        } catch (error) {
            console.error('入退室通知処理エラー:', error);
        }
    });

    // メッセージ読み上げ処理（ユーザーID対応）
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

        // セミコロン（;）から始まるメッセージは読み上げをスキップ
        if (message.content.trim().startsWith(';')) {
            console.log(`🔇 読み上げスキップ: "${message.content}" (セミコロンで開始)`);
            return;
        }

        // スポイラーは読み上げない
        if (message.content.includes('||')) {
            console.log(`🔇 読み上げスキップ: "${message.content}" (スポイラー含む)`);
            return;
        }

        try {
            // メッセージ内容を処理（URL変換など）
            const processedText = processMessageText(message.content);
            
            console.log(`📥 メッセージ受信: "${message.content}" → "${processedText}" (User: ${message.author.username})`);
            
            // キューシステムを使って読み上げ（ユーザーIDを指定）
            voicevox.speakTextWithUser(processedText, connection, message.author.id).catch(error => {
                console.error('読み上げキュー追加エラー:', error);
            });
        } catch (error) {
            console.error('メッセージ読み上げエラー:', error);
        }
    });

    /**
     * メッセージテキストを読み上げ用に処理する
     */
    function processMessageText(text: string): string {
        let processedText = text;

        // URLを「URL」に置換（複数のURLパターンに対応）
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.[a-zA-Z]{2,}\/[^\s]*)/g;
        processedText = processedText.replace(urlRegex, 'URL');

        // 連続する「URL」を一つにまとめる
        processedText = processedText.replace(/URL\s*URL/g, 'URL');

        // Discordのメンション記法を読みやすい形に変換
        processedText = processedText.replace(/<@!?(\d+)>/g, 'メンション');
        processedText = processedText.replace(/<#(\d+)>/g, 'チャンネル');
        processedText = processedText.replace(/<@&(\d+)>/g, 'ロール');

        // カスタム絵文字を「絵文字」に変換
        processedText = processedText.replace(/<a?:\w+:\d+>/g, '絵文字');

        // 改行を句読点に変換
        processedText = processedText.replace(/\n+/g, '。');

        // 余分な空白を削除
        processedText = processedText.replace(/\s+/g, ' ').trim();

        return processedText;
    }

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

        if (interaction.commandName === "speed") {
            await handleSpeed(interaction);
        }

        if (interaction.commandName === "voice-settings") {
            await handleVoiceSettings(interaction);
        }

        if (interaction.commandName === "toggle-join-leave") {
            await handleToggleJoinLeave(interaction);
        }

        if (interaction.commandName === "my-voice") {
            await handleMyVoice(interaction);
        }

        if (interaction.commandName === "reset-my-voice") {
            await handleResetMyVoice(interaction);
        }

        if (interaction.commandName === "voice-list") {
            await handleVoiceList(interaction);
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
            `📢 このチャンネル（<#${interaction.channelId}>）のメッセージを読み上げます。\n` +
            `🔔 入退室通知も有効になりました。`
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
        const voiceSettings = voicevox.getVoiceSettings(interaction.guildId!);

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

        statusMessage += `\n🔔 入退室通知: **有効**\n`;
        statusMessage += `🏃 読み上げ速度: **${voiceSettings.speedScale}**\n`;
        statusMessage += `🎵 音の高さ: **${voiceSettings.pitchScale >= 0 ? '+' : ''}${voiceSettings.pitchScale}**\n`;
        statusMessage += `🔊 音量: **${voiceSettings.volumeScale}**`;

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

    async function handleSpeed(interaction: ChatInputCommandInteraction) {
        const speed = interaction.options.getNumber("value", true);
        
        try {
            voicevox.setSpeed(interaction.guildId!, speed);
            
            await interaction.reply(
                `🏃 読み上げ速度を **${speed}** に設定しました！\n`
            );

            // テスト読み上げ（VCに参加している場合）
            const connection = getVoiceConnection(interaction.guildId!);
            if (connection) {
                try {
                    voicevox.speakText("読み上げ速度を変更しました", connection);
                } catch (error) {
                    console.error('テスト読み上げエラー:', error);
                }
            }
        } catch (error) {
            console.error('速度変更エラー:', error);
            await interaction.reply({ 
                content: "読み上げ速度の変更に失敗しました。", 
                ephemeral: true 
            });
        }
    }

    async function handleVoiceSettings(interaction: ChatInputCommandInteraction) {
        const speed = interaction.options.getNumber("speed");
        const pitch = interaction.options.getNumber("pitch");
        const volume = interaction.options.getNumber("volume");

        if (!speed && !pitch && !volume) {
            await interaction.reply({ 
                content: "少なくとも一つのパラメータを指定してください。", 
                ephemeral: true 
            });
            return;
        }

        try {
            const updates: any = {};
            if (speed !== null) updates.speedScale = speed;
            if (pitch !== null) updates.pitchScale = pitch;
            if (volume !== null) updates.volumeScale = volume;

            voicevox.updateVoiceSettings(interaction.guildId!, updates);

            let message = "🎛️ **音声設定を更新しました！**\n";
            if (speed !== null) message += `🏃 速度: **${speed}**\n`;
            if (pitch !== null) message += `🎵 音の高さ: **${pitch >= 0 ? '+' : ''}${pitch}**\n`;
            if (volume !== null) message += `🔊 音量: **${volume}**`;

            await interaction.reply(message);

            // テスト読み上げ（VCに参加している場合）
            const connection = getVoiceConnection(interaction.guildId!);
            if (connection) {
                try {
                    voicevox.speakText("音声設定を変更しました", connection);
                } catch (error) {
                    console.error('テスト読み上げエラー:', error);
                }
            }
        } catch (error) {
            console.error('音声設定変更エラー:', error);
            await interaction.reply({ 
                content: "音声設定の変更に失敗しました。", 
                ephemeral: true 
            });
        }
    }

    async function handleToggleJoinLeave(interaction: ChatInputCommandInteraction) {
        await interaction.reply({ 
            content: "入退室通知は常に有効です。無効化機能は今後のアップデートで追加予定です。", 
            ephemeral: true 
        });
    }

    async function handleMyVoice(interaction: ChatInputCommandInteraction) {
        const speakerId = interaction.options.getInteger("speaker", true);
        
        try {
            // 個人用の声を設定
            voicevox.setUserSpeaker(interaction.guildId!, interaction.user.id, speakerId);
            
            // キャラクター名を取得
            const speakerName = await voicevox.getSpeakerName(speakerId);
            
            await interaction.reply(
                `🎭 **${interaction.user.displayName || interaction.user.username}** さん専用の読み上げ声を **${speakerName}** に設定しました！\n` +
                `これで、あなたのメッセージは ${speakerName} の声で読み上げられます。`
            );

            // テスト読み上げ（VCに参加している場合）
            const connection = getVoiceConnection(interaction.guildId!);
            if (connection) {
                try {
                    voicevox.speakTextWithUser("個人専用の声設定が完了しました", connection, interaction.user.id);
                } catch (error) {
                    console.error('テスト読み上げエラー:', error);
                }
            }
        } catch (error) {
            console.error('個人声設定エラー:', error);
            await interaction.reply({ 
                content: "個人専用声の設定に失敗しました。", 
                ephemeral: true 
            });
        }
    }

    async function handleResetMyVoice(interaction: ChatInputCommandInteraction) {
        try {
            voicevox.removeUserSpeaker(interaction.guildId!, interaction.user.id);
            
            await interaction.reply(
                `🔄 **${interaction.user.displayName || interaction.user.username}** さんの専用声設定をリセットしました！\n` +
                `これからはサーバーのデフォルト設定で読み上げられます。`
            );
        } catch (error) {
            console.error('個人声リセットエラー:', error);
            await interaction.reply({ 
                content: "個人専用声のリセットに失敗しました。", 
                ephemeral: true 
            });
        }
    }

    async function handleVoiceList(interaction: ChatInputCommandInteraction) {
        try {
            const userSpeakers = voicevox.getGuildUserSpeakers(interaction.guildId!);
            
            if (userSpeakers.size === 0) {
                await interaction.reply({ 
                    content: "現在、個人専用声を設定しているユーザーはいません。", 
                    ephemeral: true 
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("🎭 個人専用声設定一覧")
                .setColor(0x0099FF)
                .setDescription("このサーバーで個人専用声を設定しているユーザー：");

            let description = "";
            for (const [userId, speakerId] of userSpeakers) {
                try {
                    const user = await client.users.fetch(userId);
                    const speakerName = await voicevox.getSpeakerName(speakerId);
                    const displayName = user.displayName || user.username;
                    description += `**${displayName}** → ${speakerName}\n`;
                } catch (error) {
                    description += `**Unknown User** → Speaker ID ${speakerId}\n`;
                }
            }

            embed.setDescription(description);
            embed.setFooter({ text: "個人専用声設定: /my-voice | リセット: /reset-my-voice" });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('個人声一覧取得エラー:', error);
            await interaction.reply({ 
                content: "個人専用声一覧の取得に失敗しました。", 
                ephemeral: true 
            });
        }
    }

    await registerCommands(config);
    await client.login(config.token);
}
