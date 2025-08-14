import axios from 'axios';
import { 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    VoiceConnection,
    StreamType
} from '@discordjs/voice';
import { Readable } from 'stream';

export interface VoicevoxConfig {
    url: string;
    speakerId: number;
}

// キャラクター情報の型定義
export interface CharacterInfo {
    id: number;
    name: string;
    styles: Array<{
        id: number;
        name: string;
    }>;
}

// 読み上げタスクの型定義
interface SpeechTask {
    text: string;
    connection: VoiceConnection;
    guildId: string;
}

export class VoicevoxClient {
    private config: VoicevoxConfig;
    private currentSpeakerId: number;
    // ギルドごとの読み上げキューを管理
    private speechQueues: Map<string, SpeechTask[]> = new Map();
    // ギルドごとの読み上げ中フラグ
    private isProcessing: Map<string, boolean> = new Map();

    constructor(config: VoicevoxConfig) {
        this.config = config;
        this.currentSpeakerId = config.speakerId;
    }

    /**
     * テキストをキューに追加して読み上げ処理を開始
     */
    async speakText(text: string, connection: VoiceConnection): Promise<void> {
        const guildId = connection.joinConfig.guildId;
        
        // キューが存在しない場合は作成
        if (!this.speechQueues.has(guildId)) {
            this.speechQueues.set(guildId, []);
            this.isProcessing.set(guildId, false);
        }

        // タスクをキューに追加
        const task: SpeechTask = { text, connection, guildId };
        this.speechQueues.get(guildId)!.push(task);

        console.log(`📝 読み上げキューに追加: "${text}" (キュー数: ${this.speechQueues.get(guildId)!.length})`);

        // 処理中でなければキュー処理を開始
        if (!this.isProcessing.get(guildId)) {
            await this.processQueue(guildId);
        }
    }

    /**
     * キューを順次処理する
     */
    private async processQueue(guildId: string): Promise<void> {
        this.isProcessing.set(guildId, true);

        const queue = this.speechQueues.get(guildId);
        if (!queue) {
            this.isProcessing.set(guildId, false);
            return;
        }

        while (queue.length > 0) {
            const task = queue.shift()!;
            
            try {
                console.log(`🔊 読み上げ開始: "${task.text}" (残りキュー: ${queue.length})`);
                
                const audioBuffer = await this.synthesizeVoice(task.text);
                await this.playAudio(audioBuffer, task.connection);
                
                console.log(`✅ 読み上げ完了: "${task.text}"`);
                
                // 少し間隔を空ける（連続読み上げの聞き取りやすさ向上）
                await this.sleep(300);
                
            } catch (error) {
                console.error(`❌ 読み上げエラー: "${task.text}"`, error);
                // エラーが発生してもキューは続行
            }
        }

        this.isProcessing.set(guildId, false);
        console.log(`🏁 読み上げキュー処理完了 (Guild: ${guildId})`);
    }

    /**
     * 指定したギルドの読み上げキューをクリア
     */
    clearQueue(guildId: string): void {
        if (this.speechQueues.has(guildId)) {
            const queueLength = this.speechQueues.get(guildId)!.length;
            this.speechQueues.set(guildId, []);
            console.log(`🗑️ 読み上げキューをクリア (${queueLength}件削除, Guild: ${guildId})`);
        }
    }

    /**
     * 指定したギルドのキュー状態を取得
     */
    getQueueStatus(guildId: string): { queueLength: number; isProcessing: boolean } {
        const queueLength = this.speechQueues.get(guildId)?.length || 0;
        const isProcessing = this.isProcessing.get(guildId) || false;
        return { queueLength, isProcessing };
    }

    /**
     * スリープ関数
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async synthesizeVoice(text: string): Promise<Buffer> {
        // 1. 音声クエリを生成
        const queryResponse = await axios.post(
            `${this.config.url}/audio_query`,
            null,
            {
                params: {
                    text: text,
                    speaker: this.currentSpeakerId
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const audioQuery = queryResponse.data;

        // 2. 音声を生成
        const synthesisResponse = await axios.post(
            `${this.config.url}/synthesis`,
            audioQuery,
            {
                params: {
                    speaker: this.currentSpeakerId
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            }
        );

        return Buffer.from(synthesisResponse.data);
    }

    private async playAudio(audioBuffer: Buffer, connection: VoiceConnection): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // BufferからReadableStreamを作成
                const stream = Readable.from(audioBuffer);
                
                // AudioResourceを作成
                const resource = createAudioResource(stream, {
                    inputType: StreamType.Arbitrary 
                });

                // AudioPlayerを作成
                const player = createAudioPlayer();
                
                // 再生完了時の処理
                player.on(AudioPlayerStatus.Idle, () => {
                    resolve();
                });

                // エラーハンドリング
                player.on('error', (error) => {
                    console.error('AudioPlayer エラー:', error);
                    reject(error);
                });

                // 再生開始
                player.play(resource);
                connection.subscribe(player);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 現在の話者IDを取得
     */
    getCurrentSpeakerId(): number {
        return this.currentSpeakerId;
    }

    /**
     * 話者IDを設定
     */
    setSpeakerId(speakerId: number): void {
        this.currentSpeakerId = speakerId;
        console.log(`🎭 キャラクター変更: Speaker ID ${speakerId}`);
    }

    /**
     * 利用可能なキャラクター一覧を取得
     */
    async getAvailableCharacters(): Promise<CharacterInfo[]> {
        try {
            const response = await axios.get(`${this.config.url}/speakers`);
            return response.data;
        } catch (error) {
            console.error('キャラクター情報取得エラー:', error);
            return [];
        }
    }

    /**
     * 話者名を取得
     */
    async getSpeakerName(speakerId: number): Promise<string> {
        try {
            const characters = await this.getAvailableCharacters();
            for (const character of characters) {
                for (const style of character.styles) {
                    if (style.id === speakerId) {
                        return `${character.name}（${style.name}）`;
                    }
                }
            }
            return `Speaker ID ${speakerId}`;
        } catch (error) {
            return `Speaker ID ${speakerId}`;
        }
    }

    /**
     * VOICEVOXサーバーの接続確認
     */
    async checkConnection(): Promise<boolean> {
        try {
            await axios.get(`${this.config.url}/version`);
            return true;
        } catch (error) {
            console.error('VOICEVOX接続エラー:', error);
            return false;
        }
    }
}