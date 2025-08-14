import fs from 'fs';
import path from 'path';

// Config.jsonの構造定義
export interface Config {
    token: string;
    clientId: string;
    voicevoxUrl: string;
    speakerId: number;
}

// 設定ファイルを読み込む関数
export function loadConfig(): Config {
    // 環境変数から設定を取得（優先）
    if (process.env.DISCORD_TOKEN && process.env.DISCORD_CLIENT_ID) {
        return {
            token: process.env.DISCORD_TOKEN,
            clientId: process.env.DISCORD_CLIENT_ID,
            voicevoxUrl: process.env.VOICEVOX_URL || 'http://localhost:50021',
            speakerId: parseInt(process.env.VOICEVOX_SPEAKER_ID || '1')
        };
    }

    // ファイルから設定を読み込み（フォールバック）
    const filepath = path.resolve(__dirname, '../config.json');

    if (!fs.existsSync(filepath)) {
        throw new Error(`Configuration file not found at ${filepath} and environment variables not set`);
    }

    const rawdata = fs.readFileSync(filepath, 'utf-8');

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawdata);
    } catch (e) {
        throw new Error(`Failed to parse configuration file: ${e instanceof Error ? e.message : String(e)}`);
    }

    const cfg = parsed as Config;

    if (!cfg.token || !cfg.voicevoxUrl || typeof cfg.speakerId !== 'number') {
        throw new Error('Invalid configuration format. Please ensure all required fields are present.');
    }

    return cfg as Config;
}