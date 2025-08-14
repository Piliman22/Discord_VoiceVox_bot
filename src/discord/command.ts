import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { loadConfig, Config } from "../config";

export async function registerCommands(config: Config) {
    const commands = [
        new SlashCommandBuilder()
            .setName("join")
            .setDescription("指定したVCに参加します。")
            .addChannelOption(option => 
                option
                    .setName("channel")
                    .setDescription("参加するVCを選択してください。")
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName("leave")
            .setDescription("現在のVCから退出します。"),
        new SlashCommandBuilder()
            .setName("status")
            .setDescription("読み上げ設定の状態を確認します。"),
        new SlashCommandBuilder()
            .setName("set-channel")
            .setDescription("読み上げ対象チャンネルを変更します。")
            .addChannelOption(option =>
                option
                    .setName("channel")
                    .setDescription("読み上げ対象にするテキストチャンネル")
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName("character")
            .setDescription("読み上げキャラクターを変更します。")
            .addIntegerOption(option =>
                option
                    .setName("speaker")
                    .setDescription("キャラクターを選択してください")
                    .setRequired(true)
                    .addChoices(
                        { name: "四国めたん（ノーマル）", value: 2 },
                        { name: "四国めたん（あまあま）", value: 0 },
                        { name: "四国めたん（ツンツン）", value: 6 },
                        { name: "四国めたん（セクシー）", value: 4 },
                        { name: "ずんだもん（ノーマル）", value: 3 },
                        { name: "ずんだもん（あまあま）", value: 1 },
                        { name: "ずんだもん（ツンツン）", value: 7 },
                        { name: "ずんだもん（セクシー）", value: 5 },
                        { name: "春日部つむぎ（ノーマル）", value: 8 },
                        { name: "波音リツ（ノーマル）", value: 9 },
                        { name: "玄野武宏（ノーマル）", value: 11 },
                        { name: "白上虎太郎（ふつう）", value: 12 },
                        { name: "青山龍星（ノーマル）", value: 13 },
                        { name: "冥鳴ひまり（ノーマル）", value: 14 },
                        { name: "九州そら（ノーマル）", value: 16 },
                        { name: "九州そら（あまあま）", value: 15 },
                        { name: "九州そら（ツンツン）", value: 18 },
                        { name: "九州そら（セクシー）", value: 17 },
                        { name: "もち子さん（ノーマル）", value: 20 },
                        { name: "剣崎雌雄（ノーマル）", value: 21 }
                    )
            ),
        new SlashCommandBuilder()
            .setName("characters")
            .setDescription("利用可能なキャラクター一覧を表示します。"),
        new SlashCommandBuilder()
            .setName("queue")
            .setDescription("読み上げキューの状態を確認します。"),
        new SlashCommandBuilder()
            .setName("skip")
            .setDescription("現在の読み上げキューをクリアします。")
            .setDefaultMemberPermissions(0)
            .setDMPermission(false),
        new SlashCommandBuilder()
            .setName("speed")
            .setDescription("読み上げ速度を調整します。")
            .addNumberOption(option =>
                option
                    .setName("value")
                    .setDescription("読み上げ速度（0.5～2.0、デフォルト：1.0）")
                    .setRequired(true)
                    .setMinValue(0.5)
                    .setMaxValue(2.0)
            ),
        new SlashCommandBuilder()
            .setName("voice-settings")
            .setDescription("音声設定を詳細調整します。")
            .addNumberOption(option =>
                option
                    .setName("speed")
                    .setDescription("読み上げ速度（0.5～2.0）")
                    .setRequired(false)
                    .setMinValue(0.5)
                    .setMaxValue(2.0)
            )
            .addNumberOption(option =>
                option
                    .setName("pitch")
                    .setDescription("音の高さ（-0.15～0.15）")
                    .setRequired(false)
                    .setMinValue(-0.15)
                    .setMaxValue(0.15)
            )
            .addNumberOption(option =>
                option
                    .setName("volume")
                    .setDescription("音量（0.5～2.0）")
                    .setRequired(false)
                    .setMinValue(0.5)
                    .setMaxValue(2.0)
            )
    ].map( cmd => cmd.toJSON() );

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log("コマンド登録中...");
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands }
        );
        console.log("✅ コマンド登録完了");
    } catch (e) {
        console.error("Error registering commands:", e);
    }
}