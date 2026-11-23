// 1. 在 ESM 中，dotenv 的最快加载方式
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import lz4js from 'lz4js';
import { callAI } from './ai.js';

const { Pool } = pg;

// 2. 核心修正：ESM 模式下没有 __dirname，必须手动定义
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载姿势图片库
let poseImages = [];
try {
    const poseImagesPath = path.join(__dirname, 'public', 'images', 'poses', 'pose_images.json');
    if (fs.existsSync(poseImagesPath)) {
        poseImages = JSON.parse(fs.readFileSync(poseImagesPath, 'utf8'));
        console.log(`[姿势图片库] 加载了 ${poseImages.length} 个姿势图片。`);
    } else {
        console.warn(`[姿势图片库] 未找到 ${poseImagesPath} 文件，姿势图片功能将受限。`);
    }
} catch (e) {
    console.error('[姿势图片库] 加载失败:', e.message);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const C_ALGO_SERVICE_URL = 'http://localhost:8080';
const HUFFMAN_SERVICE_URL = process.env.HUFFMAN_SERVICE_URL || 'http://localhost:8081';

// ===== C 算法服务：健康检查 + 断路器 =====
const CIRCUIT_CLOSED = 'CLOSED';     // 正常状态，请求放行
const CIRCUIT_OPEN = 'OPEN';         // 熔断状态，请求直接拒绝
const CIRCUIT_HALF_OPEN = 'HALF_OPEN'; // 半开状态，放行一个请求探测

let cCircuitState = CIRCUIT_CLOSED;
let cFailureCount = 0;
let cCircuitOpenTime = 0;
const C_FAILURE_THRESHOLD = 3;       // 连续失败 3 次触发熔断
const C_OPEN_DURATION_MS = 15000;    // 熔断持续 15 秒
const C_REQUEST_TIMEOUT_MS = 10000;  // 单次请求超时 10s

async function checkCServiceHealth() {
    try {
        const res = await fetch(`${C_ALGO_SERVICE_URL}/api/astar?startLng=116.4&startLat=39.9&endLng=116.41&endLat=39.91`, {
            signal: AbortSignal.timeout(3000)
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * 断路器封装的 C 服务请求
 * - CLOSED: 正常放行，失败计数
 * - OPEN: 直接拒绝，返回错误
 * - HALF_OPEN: 放行一个请求探测，成功则恢复，失败则继续熔断
 */
async function fetchFromCService(url, options = {}) {
    // 熔断状态检查
    if (cCircuitState === CIRCUIT_OPEN) {
        if (Date.now() - cCircuitOpenTime > C_OPEN_DURATION_MS) {
            cCircuitState = CIRCUIT_HALF_OPEN;
            console.log('[断路器] 进入 HALF_OPEN 状态，放行探测请求');
        } else {
            const remaining = Math.ceil((C_OPEN_DURATION_MS - (Date.now() - cCircuitOpenTime)) / 1000);
            throw new Error(`算法服务熔断中，预计 ${remaining}s 后恢复`);
        }
    }

    try {
        const res = await fetch(url, {
            ...options,
            signal: options.signal || AbortSignal.timeout(C_REQUEST_TIMEOUT_MS)
        });
        if (!res.ok) throw new Error(`C 服务返回 HTTP ${res.status}`);

        // 请求成功 → 重置断路器
        cFailureCount = 0;
        if (cCircuitState === CIRCUIT_HALF_OPEN) {
            cCircuitState = CIRCUIT_CLOSED;
            console.log('[断路器] 探测成功，恢复 CLOSED 状态');
        }
        return await res.json();
    } catch (err) {
        cFailureCount++;
        console.error(`[C服务] 请求失败 (${cFailureCount}/${C_FAILURE_THRESHOLD}): ${err.message}`);

        if (cCircuitState === CIRCUIT_HALF_OPEN) {
            // 探测失败 → 重新熔断
            cCircuitState = CIRCUIT_OPEN;
            cCircuitOpenTime = Date.now();
            console.warn('[断路器] 探测失败，重新进入 OPEN 状态');
        } else if (cFailureCount >= C_FAILURE_THRESHOLD) {
            // 连续失败达阈值 → 熔断
            cCircuitState = CIRCUIT_OPEN;
            cCircuitOpenTime = Date.now();
            console.warn(`[断路器] 连续失败 ${C_FAILURE_THRESHOLD} 次，进入 OPEN 状态`);
        }

        throw new Error(`算法服务不可用: ${err.message}`);
    }
}
const HUFFMAN_TIMEOUT_MS = Number.parseInt(process.env.HUFFMAN_TIMEOUT_MS || '2000', 10);
const HUFFMAN_MIN_SAVING_BYTES = Number.parseInt(process.env.HUFFMAN_MIN_SAVING_BYTES || '64', 10);
const HUFFMAN_MAX_RATIO = Number.parseFloat(process.env.HUFFMAN_MAX_RATIO || '0.9');
const HUFFMAN_ENABLED = (process.env.HUFFMAN_ENABLED || 'true') !== 'false';
const DIARY_COMPRESSION_ENABLED = (process.env.DIARY_COMPRESSION_ENABLED || process.env.HUFFMAN_ENABLED || 'true') !== 'false';
const DIARY_COMPRESSION_MIN_SAVING_BYTES = Number.parseInt(
    process.env.DIARY_COMPRESSION_MIN_SAVING_BYTES || process.env.HUFFMAN_MIN_SAVING_BYTES || '24',
    10
);
const DIARY_COMPRESSION_MAX_RATIO = Number.parseFloat(
    process.env.DIARY_COMPRESSION_MAX_RATIO || process.env.HUFFMAN_MAX_RATIO || '0.98'
);
const DIARY_SEARCH_MAX_CHARS = Number.parseInt(process.env.DIARY_SEARCH_MAX_CHARS || '80', 10);
const DIARY_SEARCH_MAX_BYTES = Number.parseInt(process.env.DIARY_SEARCH_MAX_BYTES || '256', 10);
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '1mb';
const DIARY_UPLOAD_DIR = path.join(__dirname, 'storage', 'diaries');
const DIARY_MEDIA_URL_PREFIX = '/uploads/diaries';
const DIARY_MEDIA_MAX_FILES = Number.parseInt(process.env.DIARY_MEDIA_MAX_FILES || '9', 10);
const DIARY_IMAGE_MAX_BYTES = Number.parseInt(process.env.DIARY_IMAGE_MAX_BYTES || String(10 * 1024 * 1024), 10);
const DIARY_VIDEO_MAX_BYTES = Number.parseInt(process.env.DIARY_VIDEO_MAX_BYTES || String(50 * 1024 * 1024), 10);
const AVATAR_IMAGE_MAX_BYTES = Number.parseInt(process.env.AVATAR_IMAGE_MAX_BYTES || String(5 * 1024 * 1024), 10);
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_API_BASE_URL = (process.env.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com').replace(/\/$/, '');
const MINIMAX_T2V_MODEL = process.env.MINIMAX_T2V_MODEL || process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-Hailuo-2.3';
const MINIMAX_I2V_MODEL = process.env.MINIMAX_I2V_MODEL || process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-Hailuo-2.3-Fast';
const MINIMAX_VIDEO_DURATION = Number.parseInt(process.env.MINIMAX_VIDEO_DURATION || '6', 10) || 6;
const MINIMAX_VIDEO_RESOLUTION = process.env.MINIMAX_VIDEO_RESOLUTION || '768P';
const MINIMAX_VIDEO_POLL_INTERVAL_MS = Number.parseInt(process.env.MINIMAX_VIDEO_POLL_INTERVAL_MS || '8000', 10) || 8000;
const MINIMAX_VIDEO_POLL_TIMEOUT_MS = Number.parseInt(process.env.MINIMAX_VIDEO_POLL_TIMEOUT_MS || '900000', 10) || 900000;

fs.mkdirSync(DIARY_UPLOAD_DIR, { recursive: true });

/**
 * 联网搜索工具 (使用 Tavily API)
 */
async function searchTavily(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                search_depth: "basic",
                max_results: 3
            })
        });

        if (!response.ok) return null;
        const data = await response.json();
        // 提取搜索结果的内容片段
        return data.results.map(r => `标题: ${r.title}\n内容: ${r.content}`).join('\n---\n');
    } catch (error) {
        console.error('[Tavily搜索失败]:', error.message);
        return null;
    }
}

const TIME_SLOTS = [
    { id: 'slot1', label: '上午场 09:00-11:00', start: '09:00', end: '11:00' },
    { id: 'slot2', label: '午间场 11:00-13:00', start: '11:00', end: '13:00' },
    { id: 'slot3', label: '下午场 14:00-16:00', start: '14:00', end: '16:00' },
    { id: 'slot4', label: '傍晚场 16:00-18:00', start: '16:00', end: '18:00' }
];

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function topKSort(items, userLat, userLng, sortType, k) {
    const scored = items.map(item => {
        const dist = haversineDistance(userLat, userLng, item.lat, item.lng);
        return { ...item, distance: Math.round(dist * 100) / 100, score: sortType === 'distance' ? dist : -item.hotness };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, k);
}

const CUISINE_STYLE_MAP = {
    '川菜': '古风', '湘菜': '古风', '鲁菜': '古风', '西北菜': '古风',
    '粤菜': '现代', '江浙菜': '古风', '北京菜': '古风', '东北菜': '古风',
    '西餐': '欧风', '日料': '欧风', '韩餐': '现代', '东南亚菜': '欧风',
    '火锅': '现代', '烧烤': '自然', '小吃快餐': '商业', '咖啡甜品': '现代'
};
const DEFAULT_STYLE = '其他';

function getFoodStyle(cuisine) {
    return CUISINE_STYLE_MAP[cuisine] || DEFAULT_STYLE;
}

function assignFoodMeta(food) {
    food.rating = Number(food.rating) || 0;
    food.style = food.style || getFoodStyle(food.cuisine);
    // 生成大众点评搜索链接：去掉店铺后缀提高搜到率
    if (food.name) {
        // 去掉 （国贸店）（三里屯店）等后缀，用核心店名搜索
        let cleanName = food.name.replace(/[（(][^）)]*[店馆厅楼][）)]?$/, '').trim();
        // 去掉 · 后缀，如 "四季民福·涮肉" → "四季民福"
        cleanName = cleanName.replace(/[·\-—].*$/, '').trim();
        const encodedName = encodeURIComponent(cleanName);
        food.dianpingUrl = `https://www.dianping.com/search/keyword/2/0_${encodedName}`;
    }
}

function assignPoiMeta(poi) {
    // 生成百度搜索链接
    if (poi.name) {
        poi.baiduUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(poi.name)}`;
    }
}

function formatHour(h) {
    const day = Math.floor(h / 24);
    const hour = h % 24;
    const hh = String(hour).padStart(2, '0');
    return day > 0 ? `次日${hh}:00` : `${hh}:00`;
}

function scoreFood(food, anchorLat, anchorLng, anchorStyle, maxDist) {
    const dist = haversineDistance(anchorLat, anchorLng, food.lat, food.lng);
    const normDist = dist / (maxDist || 0.01);
    const normRating = food.rating / 5.0;
    const styleMatch = (food.style === anchorStyle) ? 0 : 1;
    return {
        distance: Math.round(dist * 100) / 100,
        _score: 0.8 * normDist + 0.1 * styleMatch - 0.1 * normRating
    };
}

// 3. 配置 PostgreSQL 连接池 (Neon 云数据库专用)
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: ['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST) ? false : { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
    max: 20,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: false
});

/**
 * 带重试的数据库查询（处理连接断开自动重连）
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数
 * @param {number} retries - 重试次数
 */
async function dbQuery(sql, params = [], retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await pool.query(sql, params);
        } catch (err) {
            const isConnectionError =
                err.code === 'ECONNRESET' ||
                err.code === '57P01' ||  // admin_shutdown
                err.code === '57P03' ||  // cannot_connect_now
                err.code === '08003' ||  // connection_does_not_exist
                err.code === '08006' ||  // connection_failure
                err.code === '08P01' ||  // protocol_violation
                err.message?.includes('connection') ||
                err.message?.includes('timeout') ||
                err.message?.includes('ECONNREFUSED');

            if (isConnectionError && attempt < retries) {
                console.warn(`[DB] 查询失败(尝试 ${attempt + 1}/${retries + 1}): ${err.message}，${1000 * (attempt + 1)}ms 后重试...`);
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            throw err;
        }
    }
}


async function ensureDiscoverSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime_type VARCHAR(80);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_content BYTEA;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMP;

        CREATE TABLE IF NOT EXISTS pois (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            hotness DOUBLE PRECISION DEFAULT 0,
            tags TEXT
        );
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS style VARCHAR(80);
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS category VARCHAR(80);
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS ticket VARCHAR(40);
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS rating_avg DOUBLE PRECISION DEFAULT NULL;
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT NULL;
        ALTER TABLE pois ADD COLUMN IF NOT EXISTS base_rating DOUBLE PRECISION DEFAULT NULL;

        CREATE TABLE IF NOT EXISTS foods (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            cuisine VARCHAR(80),
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            hotness DOUBLE PRECISION DEFAULT 0,
            address TEXT,
            district VARCHAR(80),
            price_level INTEGER,
            rating DOUBLE PRECISION DEFAULT NULL,
            avg_price INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS cuisine VARCHAR(80);
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS hotness DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS district VARCHAR(80);
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS price_level INTEGER;
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT NULL;
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS avg_price INTEGER;
        ALTER TABLE foods ADD COLUMN IF NOT EXISTS description TEXT;

        CREATE TABLE IF NOT EXISTS travel_services (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL CHECK (type IN ('photographer', 'makeup', 'drone', 'clothing')),
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            hotness DOUBLE PRECISION DEFAULT 0,
            schedule JSONB DEFAULT '{"status": "available", "slots": []}',
            price INTEGER,
            address TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE travel_services ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT '{"status": "available", "slots": []}';
        ALTER TABLE travel_services ADD COLUMN IF NOT EXISTS hotness DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE travel_services ADD COLUMN IF NOT EXISTS price INTEGER;
        ALTER TABLE travel_services ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE travel_services ADD COLUMN IF NOT EXISTS description TEXT;

        CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            service_id INTEGER REFERENCES travel_services(id) ON DELETE CASCADE,
            booked_time TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_service ON bookings(service_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(booked_time);

        CREATE TABLE IF NOT EXISTS discover_reviews (
            id SERIAL PRIMARY KEY,
            item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('spot', 'food', 'service')),
            item_id TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            comment TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_discover_reviews_item ON discover_reviews(item_type, item_id);

        CREATE TABLE IF NOT EXISTS discover_reactions (
            id SERIAL PRIMARY KEY,
            item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('spot', 'food', 'service')),
            item_id TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reaction_type VARCHAR(20) NOT NULL CHECK (reaction_type IN ('like', 'favorite')),
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(item_type, item_id, user_id, reaction_type)
        );
        CREATE INDEX IF NOT EXISTS idx_discover_reactions_item ON discover_reactions(item_type, item_id);
        CREATE INDEX IF NOT EXISTS idx_discover_reactions_user ON discover_reactions(user_id);

        CREATE TABLE IF NOT EXISTS user_preferences (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            style VARCHAR(80) NOT NULL,
            weight DOUBLE PRECISION DEFAULT 1.0,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, style)
        );

        CREATE TABLE IF NOT EXISTS user_visit_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            poi_id INTEGER REFERENCES pois(id) ON DELETE CASCADE,
            visit_count INTEGER DEFAULT 1,
            last_visited TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, poi_id)
        );

        CREATE TABLE IF NOT EXISTS user_preference_params (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
            preferred_distance DOUBLE PRECISION DEFAULT 10.0,
            preferred_count INTEGER DEFAULT 5,
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS poi_ratings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            poi_id INTEGER REFERENCES pois(id) ON DELETE CASCADE,
            rating DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, poi_id)
        );
    `);


}

async function ensureUserProfileSchema() {
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime_type VARCHAR(80);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_content BYTEA;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMP;
    `);
}

// 测试数据库连接（带重试）
async function connectWithRetry(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();
            client.release();
            console.log('✅ 成功连接到 PostgreSQL 17.9 数据库');
            await ensureDiscoverSchema();
            await ensureDiaryGeneratedSchema();
            processPendingAnimationTasks().catch(err => console.error('[动画任务] 启动处理失败:', err.message));
            setInterval(() => {
                processPendingAnimationTasks().catch(err => console.error('[动画任务] 定时处理失败:', err.message));
            }, 15000);
            return;
        } catch (err) {
            console.error(`❌ 数据库连接失败 (${i + 1}/${retries}):`, err.message);
            if (i < retries - 1) {
                const delay = (i + 1) * 2000;
                console.log(`  等待 ${delay}ms 后重试...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                console.error('  已达最大重试次数，请检查数据库状态');
            }
        }
    }
}
connectWithRetry();

// 数据库连接池错误处理与自动重连
pool.on('error', (err) => {
    console.error('[DB Pool] 未捕获的连接池错误:', err.message);
});

pool.on('remove', (client) => {
    console.log('[DB Pool] 连接被移除，当前池状态：total=%d idle=%d waiting=%d',
        pool.totalCount, pool.idleCount, pool.waitingCount);
});

// ===== JWT 认证配置 =====
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw Error('Set a strong JWT_SECRET before startup');
const JWT_EXPIRES_IN = '24h';

// 中间件配置
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// 托管 public 文件夹
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get('/api/media/:id/content', async (req, res) => {
    try {
        const mediaId = Number(req.params.id);
        if (!Number.isInteger(mediaId) || mediaId <= 0) {
            return res.status(400).send('无效的媒体 ID');
        }

        const expires = Number(req.query.expires);
        const signature = String(req.query.signature || '');
        if (!Number.isSafeInteger(expires) || expires < Date.now() || signature !== mediaSignature(mediaId, expires)) {
            return res.sendStatus(403);
        }
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const mediaRes = await pool.query(
            `SELECT m.id, m.url, m.original_name, m.mime_type, c.content
             FROM diary_media m
             LEFT JOIN diary_media_content c ON c.media_id = m.id
             WHERE m.id = $1`,
            [mediaId]
        );
        if (mediaRes.rows.length === 0) {
            return res.status(404).send('媒体不存在');
        }

        const media = mediaRes.rows[0];
        const mimeType = typeof media.mime_type === 'string' && media.mime_type ? media.mime_type : 'application/octet-stream';

        let buffer = Buffer.isBuffer(media.content) ? media.content : null;
        let filePath = null;

        if (!buffer) {
            filePath = getDiaryFilePathFromUrl(media.url);
            if (filePath && fs.existsSync(filePath)) {
                buffer = await fs.promises.readFile(filePath);
                await upsertDiaryMediaContent(mediaId, buffer);
            }
        }

        if (!buffer && filePath && fs.existsSync(filePath)) {
            const stat = await fs.promises.stat(filePath);
            const range = req.headers.range;
            if (typeof range === 'string' && /^bytes=\d*-\d*$/.test(range)) {
                const [startText, endText] = range.replace('bytes=', '').split('-');
                const start = startText ? Number(startText) : 0;
                const end = endText ? Number(endText) : (stat.size - 1);
                if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
                    res.status(206);
                    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
                    res.setHeader('Accept-Ranges', 'bytes');
                    res.setHeader('Content-Length', String(end - start + 1));
                    res.setHeader('Content-Type', mimeType);
                    return fs.createReadStream(filePath, { start, end }).pipe(res);
                }
            }

            res.setHeader('Content-Length', String(stat.size));
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Accept-Ranges', 'bytes');
            return fs.createReadStream(filePath).pipe(res);
        }

        if (!buffer) {
            return res.status(404).send('媒体内容未同步，请让上传者先运行一次后端并访问该媒体完成同步');
        }

        const range = req.headers.range;
        const total = buffer.length;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', mimeType);

        if (typeof range === 'string' && /^bytes=\d*-\d*$/.test(range)) {
            const [startText, endText] = range.replace('bytes=', '').split('-');
            const start = startText ? Number(startText) : 0;
            const end = endText ? Number(endText) : (total - 1);
            if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
                const chunk = buffer.subarray(start, end + 1);
                res.status(206);
                res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
                res.setHeader('Content-Length', String(chunk.length));
                return res.end(chunk);
            }
        }

        res.setHeader('Content-Length', String(total));
        return res.end(buffer);
    } catch (error) {
        console.error('[媒体读取错误]:', error.message);
        return res.status(500).send('媒体读取失败');
    }
});

function isHuffmanV1Content(content) {
    return typeof content === 'string' && content.startsWith('HUF1:');
}

function isLz4V1Content(content) {
    return typeof content === 'string' && content.startsWith('LZ4:');
}

function parseHuffmanV1Content(content) {
    const withoutPrefix = content.slice('HUF1:'.length);
    const splitIndex = withoutPrefix.indexOf('|');
    if (splitIndex <= 0) return null;
    const treeData = withoutPrefix.slice(0, splitIndex);
    const base64 = withoutPrefix.slice(splitIndex + 1);
    if (!treeData || !base64) return null;
    return { treeData, base64 };
}

function parseLz4V1Content(content) {
    const withoutPrefix = content.slice('LZ4:'.length);
    const splitIndex = withoutPrefix.indexOf('|');
    if (splitIndex <= 0) return null;
    const originalSize = Number.parseInt(withoutPrefix.slice(0, splitIndex), 10);
    const base64 = withoutPrefix.slice(splitIndex + 1);
    if (!Number.isInteger(originalSize) || originalSize <= 0 || !base64) return null;
    return { originalSize, base64 };
}

async function huffmanCompressText(text) {
    const res = await fetch(`${HUFFMAN_SERVICE_URL}/api/huffman/compress`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
        signal: AbortSignal.timeout(Number.isFinite(HUFFMAN_TIMEOUT_MS) ? HUFFMAN_TIMEOUT_MS : 2000)
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.success !== true || typeof data.base64 !== 'string' || typeof data.treeData !== 'string') return null;
    return { base64: data.base64, treeData: data.treeData };
}

async function huffmanDecompressText(treeData, base64) {
    const res = await fetch(`${HUFFMAN_SERVICE_URL}/api/huffman/decompress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ treeData, base64 }),
        signal: AbortSignal.timeout(Number.isFinite(HUFFMAN_TIMEOUT_MS) ? HUFFMAN_TIMEOUT_MS : 2000)
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.success !== true || typeof data.text !== 'string') return null;
    return data.text;
}

function lz4CompressText(text) {
    const input = Buffer.from(text, 'utf8');
    const compressed = lz4js.compress(input);
    return {
        originalSize: input.length,
        compressedSize: compressed.length,
        base64: Buffer.from(compressed).toString('base64')
    };
}

function lz4DecompressText(originalSize, base64) {
    const compressed = Buffer.from(base64, 'base64');
    const decompressed = Buffer.from(lz4js.decompress(compressed));
    if (Number.isInteger(originalSize) && originalSize > 0 && decompressed.length !== originalSize) {
        throw new Error(`LZ4 原始长度校验失败: expected=${originalSize}, actual=${decompressed.length}`);
    }
    return decompressed.toString('utf8');
}

class SearchInputRejectedError extends Error {
    constructor(message, reasons = []) {
        super(message);
        this.name = 'SearchInputRejectedError';
        this.code = 'SEARCH_INPUT_REJECTED';
        this.reasons = reasons;
        this.status = 400;
    }
}

function truncateCodePoints(text, maxChars) {
    const chars = Array.from(String(text || ''));
    if (!Number.isFinite(maxChars) || chars.length <= maxChars) return chars.join('');
    return chars.slice(0, maxChars).join('');
}

function truncateUtf8Bytes(text, maxBytes) {
    if (!Number.isFinite(maxBytes) || Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
    let out = '';
    let bytes = 0;
    for (const char of Array.from(text)) {
        const nextBytes = Buffer.byteLength(char, 'utf8');
        if (bytes + nextBytes > maxBytes) break;
        out += char;
        bytes += nextBytes;
    }
    return out;
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/gu, '')
        .replace(/[\u0000-\u001F\u007F|]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
}

function normalizeSearchComparable(value) {
    return normalizeSearchText(value).toLocaleLowerCase('zh-CN');
}

function assessSearchInjectionRisk(rawValue) {
    const raw = String(rawValue || '');
    const normalized = normalizeSearchText(raw);
    const reasons = [];
    let score = 0;

    const checks = [
        { re: /\b(union\s+select|select\s+.+\s+from|drop\s+table|insert\s+into|delete\s+from|update\s+\w+\s+set|alter\s+table|or\s+1\s*=\s*1|and\s+1\s*=\s*1)\b/iu, weight: 3, reason: 'SQL 注入特征' },
        { re: /(--|\/\*|\*\/|;\s*(drop|select|insert|delete|update|alter|create)\b)/iu, weight: 2, reason: 'SQL 注释或多语句特征' },
        { re: /<\s*script|javascript:|on\w+\s*=|<\s*(iframe|img|svg|object)\b/iu, weight: 3, reason: '脚本注入特征' },
        { re: /(\{\{|\}\}|\$\{|<%|%>)/u, weight: 2, reason: '模板注入特征' },
        { re: /(ignore\s+(all|previous)\s+(instructions?|rules?)|prompt\s*injection|jailbreak|忽略(之前|以上|所有).*(指令|规则|要求)|系统提示词|越狱)/iu, weight: 2, reason: '提示词注入特征' }
    ];

    for (const check of checks) {
        if (check.re.test(normalized)) {
            score += check.weight;
            reasons.push(check.reason);
        }
    }

    const controlCount = (raw.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu) || []).length;
    if (controlCount > 0) {
        score += 2;
        reasons.push('控制字符');
    }

    const chars = Array.from(normalized);
    if (chars.length > 0) {
        const specialCount = chars.filter(ch => /[<>{};'"\\$`]/u.test(ch)).length;
        if (specialCount / chars.length > 0.35) {
            score += 2;
            reasons.push('异常符号占比过高');
        }
    }

    if (Buffer.byteLength(raw, 'utf8') > DIARY_SEARCH_MAX_BYTES * 4) {
        score += 2;
        reasons.push('输入过长');
    }

    return { normalized, score, reasons, rejected: score >= 3 };
}

function sanitizeDiarySearchInput(value, fieldName) {
    if (value === undefined || value === null || value === '') return '';
    const assessed = assessSearchInjectionRisk(value);
    if (assessed.rejected) {
        throw new SearchInputRejectedError('搜索内容包含疑似恶意注入片段，请修改后再搜索', assessed.reasons);
    }
    const maxChars = fieldName === 'keyword' ? DIARY_SEARCH_MAX_CHARS : Math.min(DIARY_SEARCH_MAX_CHARS, 40);
    return truncateUtf8Bytes(truncateCodePoints(assessed.normalized, maxChars), DIARY_SEARCH_MAX_BYTES);
}

function escapeLikePattern(value) {
    return String(value || '').replace(/[\\%_]/g, ch => `\\${ch}`);
}

function tokenizeDiaryKeyword(keyword) {
    const normalized = normalizeSearchComparable(keyword);
    const tokens = normalized
        .split(/[\s,，、。.!！?？;；:：()[\]{}<>《》"'“”‘’]+/u)
        .map(item => item.trim())
        .filter(Boolean);
    return [...new Set([normalized, ...tokens].filter(item => item.length > 0))];
}

function boyerMooreIncludes(text, pattern) {
    const source = Array.from(text || '');
    const pat = Array.from(pattern || '');
    if (pat.length === 0 || source.length < pat.length) return false;

    const badChar = new Map();
    for (let i = 0; i < pat.length - 1; i++) {
        badChar.set(pat[i], pat.length - 1 - i);
    }

    let shift = 0;
    while (shift <= source.length - pat.length) {
        let j = pat.length - 1;
        while (j >= 0 && pat[j] === source[shift + j]) j--;
        if (j < 0) return true;
        const step = badChar.get(source[shift + j]) || pat.length;
        shift += step > 1 ? step : 1;
    }
    return false;
}

function scoreDiaryByBm(row, keyword) {
    const terms = tokenizeDiaryKeyword(keyword);
    if (terms.length === 0) return 0;

    const fields = [
        { value: row.title, weight: 2 },
        { value: row.content, weight: 1 },
        { value: row.style, weight: 3 },
        { value: row.scenic_spot, weight: 3 }
    ].map(field => ({
        ...field,
        value: normalizeSearchComparable(field.value)
    }));

    let score = 0;
    for (const term of terms) {
        for (const field of fields) {
            if (boyerMooreIncludes(field.value, term)) score += field.weight;
        }
    }
    return score;
}

async function maybeCompressDiaryContent(originalContent) {
    if (!DIARY_COMPRESSION_ENABLED) return { storedContent: originalContent, didCompress: false, algorithm: 'none' };
    if (typeof originalContent !== 'string' || originalContent.length === 0) return { storedContent: originalContent, didCompress: false };

    let originalBytes = 0;
    try {
        originalBytes = Buffer.byteLength(originalContent, 'utf8');
    } catch {
        originalBytes = originalContent.length;
    }

    const compressed = lz4CompressText(originalContent);
    const stored = `LZ4:${compressed.originalSize}|${compressed.base64}`;

    let storedBytes = 0;
    try {
        storedBytes = Buffer.byteLength(stored, 'utf8');
    } catch {
        storedBytes = stored.length;
    }

    const minSaving = Number.isFinite(DIARY_COMPRESSION_MIN_SAVING_BYTES) ? DIARY_COMPRESSION_MIN_SAVING_BYTES : 24;
    const maxRatio = Number.isFinite(DIARY_COMPRESSION_MAX_RATIO) ? DIARY_COMPRESSION_MAX_RATIO : 0.98;

    if (storedBytes >= originalBytes - minSaving) return { storedContent: originalContent, didCompress: false, algorithm: 'lz4' };
    if (originalBytes > 0 && storedBytes / originalBytes > maxRatio) return { storedContent: originalContent, didCompress: false, algorithm: 'lz4' };

    return { storedContent: stored, didCompress: true, algorithm: 'lz4' };
}

async function maybeDecompressDiaryContent(storedContent) {
    if (isLz4V1Content(storedContent)) {
        const parsed = parseLz4V1Content(storedContent);
        if (!parsed) return storedContent;
        try {
            return lz4DecompressText(parsed.originalSize, parsed.base64);
        } catch (error) {
            console.warn('[LZ4解压失败]:', error.message);
            return storedContent;
        }
    }
    if (!isHuffmanV1Content(storedContent)) return storedContent;
    const parsed = parseHuffmanV1Content(storedContent);
    if (!parsed) return storedContent;
    const text = await huffmanDecompressText(parsed.treeData, parsed.base64).catch(() => null);
    return typeof text === 'string' ? text : storedContent;
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const out = new Array(items.length);
    let nextIndex = 0;
    const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
        while (true) {
            const i = nextIndex;
            nextIndex++;
            if (i >= items.length) return;
            out[i] = await mapper(items[i], i);
        }
    });
    await Promise.all(workers);
    return out;
}

function normalizeBoolean(value) {
    return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

function toTextArray(value) {
    if (Array.isArray(value)) {
        return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(/[、,，\n]/).map(item => item.trim()).filter(Boolean);
    }
    return [];
}

function getDiaryMediaType(mimeType) {
    if (typeof mimeType !== 'string') return null;
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return null;
}

function getDiaryMediaExt(file) {
    const extByMime = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov'
    };
    const mimeExt = extByMime[file.mimetype];
    if (mimeExt) return mimeExt;
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    return /^[.a-z0-9]{1,10}$/.test(originalExt) ? originalExt : '';
}

function getDiaryFilePathFromUrl(url) {
    if (typeof url !== 'string' || !url.startsWith(DIARY_MEDIA_URL_PREFIX)) return null;
    const filename = path.basename(url);
    if (!filename) return null;
    return path.join(DIARY_UPLOAD_DIR, filename);
}

function mediaSignature(id, expires) {
    return crypto.createHmac('sha256', JWT_SECRET).update(`media:${id}:${expires}`).digest('hex');
}

function getDiaryMediaContentUrl(mediaId) {
    const id = Number(mediaId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const expires = Date.now() + 3600000;
    const signature = mediaSignature(id, expires);
    return `/api/media/${id}/content?expires=${expires}&signature=${signature}`;
}

function toClientDiaryMediaRow(mediaRow) {
    const url = getDiaryMediaContentUrl(mediaRow?.id);
    if (!url) return mediaRow;
    return { ...mediaRow, url };
}

function toClientDiaryMediaRows(mediaRows = []) {
    return Array.isArray(mediaRows) ? mediaRows.map(toClientDiaryMediaRow) : [];
}

function buildUserAvatarUrl(userId, version = Date.now()) {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return '';
    const stamp = version instanceof Date ? version.getTime() : Number(version) || Date.now();
    return `/api/users/${id}/avatar?v=${stamp}`;
}

function toClientUser(row, role = 'user') {
    const avatarUrl = row?.avatar_url || (row?.avatar_updated_at ? buildUserAvatarUrl(row.id, row.avatar_updated_at) : '');
    return {
        id: row.id,
        username: row.username,
        role,
        avatar: avatarUrl || '',
        avatar_url: avatarUrl || ''
    };
}

const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: AVATAR_IMAGE_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return cb(new Error('头像只能上传图片文件'));
        }
        cb(null, true);
    }
});

function runAvatarUpload(req, res, next) {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: '头像图片不能超过 5MB' });
        }
        return res.status(400).json({ success: false, error: err.message || '头像上传失败' });
    });
}

const diaryMediaUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, DIARY_UPLOAD_DIR),
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${getDiaryMediaExt(file)}`)
    }),
    limits: {
        files: Number.isFinite(DIARY_MEDIA_MAX_FILES) ? DIARY_MEDIA_MAX_FILES : 9,
        fileSize: DIARY_VIDEO_MAX_BYTES
    },
    fileFilter: (_req, file, cb) => {
        if (!getDiaryMediaType(file.mimetype)) {
            return cb(new Error('只支持图片或视频文件'));
        }
        cb(null, true);
    }
});

function runDiaryMediaUpload(req, res, next) {
    const maxFiles = Number.isFinite(DIARY_MEDIA_MAX_FILES) ? DIARY_MEDIA_MAX_FILES : 9;
    diaryMediaUpload.array('media', maxFiles)(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? '文件过大：图片不超过 10MB，视频不超过 50MB'
                : `最多上传 ${maxFiles} 个图片或视频`;
            return res.status(400).json({ success: false, error: message });
        }
        return res.status(400).json({ success: false, error: err.message || '媒体上传失败' });
    });
}

function removeUploadedFiles(files = []) {
    for (const file of files) {
        if (!file?.path) continue;
        fs.unlink(file.path, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.warn('[日记媒体] 删除临时文件失败:', err.message);
            }
        });
    }
}

function removeDiaryMediaFiles(mediaRows = []) {
    for (const media of mediaRows) {
        const filePath = getDiaryFilePathFromUrl(media?.url);
        if (!filePath) continue;
        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.warn('[日记媒体] 删除保存文件失败:', err.message);
            }
        });
    }
}

async function upsertDiaryMediaContent(mediaId, contentBuffer) {
    if (!Buffer.isBuffer(contentBuffer) || contentBuffer.length === 0) return;
    await pool.query(
        `INSERT INTO diary_media_content (media_id, content)
         VALUES ($1, $2)
         ON CONFLICT (media_id) DO UPDATE SET content = EXCLUDED.content`,
        [mediaId, contentBuffer]
    );
}

async function bulkSyncDiaryMediaContentFromUploads(options = {}) {
    const limit = Number.isInteger(Number(options.limit)) ? Number(options.limit) : 200;
    const concurrency = Number.isInteger(Number(options.concurrency)) ? Number(options.concurrency) : 2;
    const dryRun = options.dryRun === true;

    const rowsRes = await pool.query(
        `SELECT m.id, m.url, m.mime_type
         FROM diary_media m
         LEFT JOIN diary_media_content c ON c.media_id = m.id
         WHERE c.media_id IS NULL
           AND m.url LIKE $1
         ORDER BY m.id ASC
         LIMIT $2`,
        [`${DIARY_MEDIA_URL_PREFIX}/%`, limit]
    );

    const rows = rowsRes.rows || [];
    const stats = {
        queried: rows.length,
        synced: 0,
        missing: 0,
        skipped: 0
    };

    await mapWithConcurrency(rows, Math.max(1, concurrency), async (row) => {
        const filePath = getDiaryFilePathFromUrl(row.url);
        if (!filePath) {
            stats.skipped++;
            return;
        }

        let stat = null;
        try {
            stat = await fs.promises.stat(filePath);
        } catch {
            stats.missing++;
            return;
        }

        const mimeType = typeof row.mime_type === 'string' ? row.mime_type : '';
        const isVideo = mimeType.startsWith('video/');
        const isImage = mimeType.startsWith('image/');
        const maxBytes = isVideo ? DIARY_VIDEO_MAX_BYTES : (isImage ? DIARY_IMAGE_MAX_BYTES : DIARY_VIDEO_MAX_BYTES);
        if (Number.isFinite(maxBytes) && stat.size > maxBytes) {
            stats.skipped++;
            return;
        }

        if (dryRun) {
            stats.synced++;
            return;
        }

        const buffer = await fs.promises.readFile(filePath);
        await upsertDiaryMediaContent(row.id, buffer);
        stats.synced++;
    });

    return stats;
}

async function saveDiaryMedia(diaryId, files = []) {
    if (!files.length) return [];

    const values = [];
    const placeholders = [];
    files.forEach((file, index) => {
        const offset = index * 6;
        const mediaType = getDiaryMediaType(file.mimetype);
        const url = `${DIARY_MEDIA_URL_PREFIX}/${file.filename}`;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        values.push(diaryId, mediaType, url, file.originalname || file.filename, file.mimetype, file.size);
    });

    const mediaRes = await pool.query(
        `INSERT INTO diary_media (diary_id, media_type, url, original_name, mime_type, file_size)
         VALUES ${placeholders.join(', ')}
         RETURNING id, diary_id, media_type, url, original_name, mime_type, file_size, created_at`,
        values
    );
    await mapWithConcurrency(mediaRes.rows, 2, async (row, index) => {
        const file = files[index];
        if (!file?.path) return;
        try {
            const buffer = await fs.promises.readFile(file.path);
            await upsertDiaryMediaContent(row.id, buffer);
        } catch (syncErr) {
            console.error(`[日记媒体] ⚠️ 媒体 ID=${row.id} 写入数据库失败:`, syncErr.message);
            console.error(`[日记媒体] 文件仍存于本地: ${file.path}。其他用户需从此电脑同步后可见。`);
        }
    });
    return mediaRes.rows;
}

async function saveGeneratedVideoMedia(diaryId, videoData) {
    const existingRes = await pool.query(
        `SELECT id, diary_id, media_type, url, original_name, mime_type, file_size, created_at
         FROM diary_media
         WHERE diary_id = $1 AND media_type = 'video' AND url = $2
         LIMIT 1`,
        [diaryId, videoData.url]
    );
    if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        if (Buffer.isBuffer(videoData?.buffer) && videoData.buffer.length > 0) {
            await upsertDiaryMediaContent(existing.id, videoData.buffer);
        }
        return existing;
    }

    const mediaRes = await pool.query(
        `INSERT INTO diary_media (diary_id, media_type, url, original_name, mime_type, file_size)
         VALUES ($1, 'video', $2, $3, $4, $5)
         RETURNING id, diary_id, media_type, url, original_name, mime_type, file_size, created_at`,
        [
            diaryId,
            videoData.url,
            videoData.originalName || path.basename(videoData.url || '') || `animation_${diaryId}.mp4`,
            videoData.mimeType || 'video/mp4',
            Number.isFinite(videoData.size) ? videoData.size : null
        ]
    );
    const created = mediaRes.rows[0];
    if (Buffer.isBuffer(videoData?.buffer) && videoData.buffer.length > 0) {
        await upsertDiaryMediaContent(created.id, videoData.buffer);
    }
    return created;
}

async function getDiaryMediaMap(diaryIds) {
    const ids = [...new Set((diaryIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
    const mediaMap = new Map(ids.map(id => [id, []]));
    if (ids.length === 0) return mediaMap;

    const mediaRes = await pool.query(
        `SELECT id, diary_id, media_type, url, original_name, mime_type, file_size, created_at
         FROM diary_media
         WHERE diary_id = ANY($1::int[])
         ORDER BY diary_id, id`,
        [ids]
    );
    for (const media of mediaRes.rows) {
        if (!mediaMap.has(media.diary_id)) mediaMap.set(media.diary_id, []);
        mediaMap.get(media.diary_id).push(media);
    }
    return mediaMap;
}

async function getDiaryAnimationTasksMap(diaryIds) {
    const ids = [...new Set((diaryIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
    const taskMap = new Map();
    if (ids.length === 0) return taskMap;

    const taskRes = await pool.query(
        `SELECT DISTINCT ON (diary_id) diary_id, status, error_message, updated_at
         FROM diary_animation_tasks
         WHERE diary_id = ANY($1::int[])
         ORDER BY diary_id, updated_at DESC, id DESC`,
        [ids]
    );
    for (const task of taskRes.rows) {
        taskMap.set(task.diary_id, {
            status: task.status,
            error: task.error_message
        });
    }
    return taskMap;
}

async function getDiaryMedia(diaryId) {
    const mediaMap = await getDiaryMediaMap([diaryId]);
    return mediaMap.get(Number(diaryId)) || [];
}

async function enrichDiaryRows(rows) {
    const diaryIds = rows.map(row => row.id);
    const [mediaMap, animationMap] = await Promise.all([
        getDiaryMediaMap(diaryIds),
        getDiaryAnimationTasksMap(diaryIds)
    ]);

    return mapWithConcurrency(rows, 4, async (row) => ({
        ...row,
        content: await maybeDecompressDiaryContent(row.content),
        media: toClientDiaryMediaRows(mediaMap.get(row.id) || []),
        animationStatus: animationMap.get(row.id) || null
    }));
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function normalizeAnimationErrorMessage(message) {
    const text = String(message || '').trim();
    if (!text) return '旅游动画生成失败';
    const lower = text.toLowerCase();
    if (lower.includes('insufficient balance')) return 'MiniMax 余额不足，请充值后重试';
    if (lower.includes('input new_sensitive') || lower.includes('first_frame_image sensitive') || lower.includes('sensitive')) {
        return '上传图片触发了内容审核，已建议改为仅文字生成或更换图片';
    }
    if (lower.includes('timeout') || lower.includes('超时')) return '视频生成超时，请稍后重试';
    if (lower.includes('not authorized') || lower.includes('invalid api key') || lower.includes('authentication failed')) {
        return 'MiniMax API Key 无效或已失效，请检查配置';
    }
    return text;
}

function isMiniMaxSensitiveError(message) {
    const text = String(message || '').toLowerCase();
    return text.includes('sensitive') || text.includes('1026') || text.includes('1027');
}

async function buildDiaryAnimationContext(diaryId) {
    const diaryRes = await pool.query(
        `SELECT id, user_id, title, content, style, scenic_spot, created_at
         FROM diaries
         WHERE id = $1`,
        [diaryId]
    );
    if (diaryRes.rows.length === 0) {
        throw new Error('日记不存在');
    }

    const diary = diaryRes.rows[0];
    const media = await getDiaryMedia(diaryId);
    const content = await maybeDecompressDiaryContent(diary.content);
    const photoHints = media
        .filter(item => item.media_type === 'image')
        .map(item => item.original_name || path.basename(item.url || ''))
        .filter(Boolean);

    const prompt = buildMiniMaxAnimationPrompt({
        title: diary.title,
        content,
        scenicSpot: diary.scenic_spot,
        style: diary.style,
        photoHints
    });

    return {
        diary,
        media,
        prompt,
        hasImages: media.some(item => item.media_type === 'image')
    };
}

function buildMiniMaxAnimationPrompt(diary) {
    const { title, content, scenicSpot, style, date, weather, photoHints } = diary;
    let prompt = '请生成一段 6 秒的精美旅游短视频。';

    if (title) prompt += `视频标题：${title}。`;
    if (scenicSpot && scenicSpot !== '默认') prompt += `场景位于：${scenicSpot}。`;
    if (weather) prompt += `天气情况：${weather}。`;
    if (date) prompt += `游览日期：${date}。`;
    if (style && style !== '默认') prompt += `视频风格：${style}。`;

    const summary = (content || '').substring(0, 200).replace(/\n/g, ' ');
    if (summary) prompt += `画面内容描述：${summary}。`;
    if (photoHints && photoHints.length) {
        prompt += `请参考提供的照片内容进行生成。`;
    }

    prompt += '要求：画面自然、光影真实、构图优美，像高品质旅游宣传片。';
    return prompt.substring(0, 2000);
}

async function getDiaryImageAsBase64(mediaRow) {
    if (!mediaRow || mediaRow.media_type !== 'image') return null;
    try {
        const contentRes = await pool.query(
            'SELECT content FROM diary_media_content WHERE media_id = $1',
            [mediaRow.id]
        );
        const buffer = Buffer.isBuffer(contentRes.rows?.[0]?.content) ? contentRes.rows[0].content : null;
        if (buffer && buffer.length > 0) {
            const mime = typeof mediaRow.mime_type === 'string' && mediaRow.mime_type ? mediaRow.mime_type : 'image/jpeg';
            return `data:${mime};base64,${buffer.toString('base64')}`;
        }

        const filePath = getDiaryFilePathFromUrl(mediaRow.url);
        if (!filePath) return null;
        const data = await fs.promises.readFile(filePath);
        await upsertDiaryMediaContent(mediaRow.id, data);
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        const mime = `image/${ext === 'jpg' ? 'jpeg' : ext || 'jpeg'}`;
        return `data:${mime};base64,${data.toString('base64')}`;
    } catch (error) {
        console.error(`[MiniMax] 读取图片失败: ${mediaRow?.id}`, error.message);
        return null;
    }
}

async function createMiniMaxVideoTask(payload) {
    if (!MINIMAX_API_KEY) {
        throw new Error('未配置 MiniMax API Key');
    }

    const isI2V = typeof payload?.first_frame_image === 'string' && payload.first_frame_image.length > 0;
    const model = payload?.model || (isI2V ? MINIMAX_I2V_MODEL : MINIMAX_T2V_MODEL);
    const supportsResolution = /^MiniMax-Hailuo/i.test(model);

    const response = await fetch(`${MINIMAX_API_BASE_URL}/v1/video_generation`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MINIMAX_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            duration: MINIMAX_VIDEO_DURATION,
            ...(supportsResolution ? { resolution: MINIMAX_VIDEO_RESOLUTION } : {}),
            ...payload
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.base_resp?.status_code !== 0) {
        throw new Error(data.base_resp?.status_msg || `请求失败 (${response.status})`);
    }
    if (!data.task_id) {
        throw new Error('MiniMax 未返回 task_id');
    }
    return data.task_id;
}

async function queryMiniMaxVideoTask(taskId) {
    const response = await fetch(`${MINIMAX_API_BASE_URL}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${MINIMAX_API_KEY}`
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.base_resp?.status_code !== 0) {
        throw new Error(data.base_resp?.status_msg || `查询失败 (${response.status})`);
    }
    return data;
}

async function waitForMiniMaxVideoTask(taskId, onTick = null) {
    const startTime = Date.now();
    while (Date.now() - startTime < MINIMAX_VIDEO_POLL_TIMEOUT_MS) {
        const statusData = await queryMiniMaxVideoTask(taskId);
        const normalizedStatus = String(statusData.status || '').toLowerCase();

        if (normalizedStatus === 'success' || normalizedStatus === 'succeeded' || normalizedStatus === 'completed') {
            return statusData;
        }
        if (normalizedStatus === 'failed' || normalizedStatus === 'fail' || normalizedStatus === 'error') {
            const statusCode = statusData.base_resp?.status_code;
            const statusMsg = statusData.base_resp?.status_msg || statusData.status || '未知错误';
            throw new Error(`MiniMax 生成失败: ${statusMsg}${statusCode ? ` (code: ${statusCode})` : ''}`);
        }

        try {
            if (typeof onTick === 'function') await onTick();
        } catch { }

        await sleep(MINIMAX_VIDEO_POLL_INTERVAL_MS);
    }
    throw new Error('生成超时');
}

async function downloadAndSaveMiniMaxVideo(fileId, diaryId) {
    const fileInfoRes = await fetch(`${MINIMAX_API_BASE_URL}/v1/files/retrieve?file_id=${fileId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${MINIMAX_API_KEY}`
        }
    });
    const fileInfo = await fileInfoRes.json().catch(() => ({}));
    if (!fileInfoRes.ok || fileInfo.base_resp?.status_code !== 0) {
        throw new Error(fileInfo.base_resp?.status_msg || '获取文件信息失败');
    }

    let downloadRes = null;
    if (typeof fileInfo.file?.download_url === 'string' && /^https?:\/\//i.test(fileInfo.file.download_url)) {
        try {
            downloadRes = await fetch(fileInfo.file.download_url);
        } catch (error) {
            console.warn(`[MiniMax] download_url 下载失败，改用 retrieve_content: ${error.message}`);
        }
    }

    if (!downloadRes || !downloadRes.ok) {
        downloadRes = await fetch(`${MINIMAX_API_BASE_URL}/v1/files/retrieve_content?file_id=${encodeURIComponent(fileId)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${MINIMAX_API_KEY}`
            }
        });
    }

    if (!downloadRes.ok) throw new Error(`下载视频失败 (${downloadRes.status})`);

    const buffer = await downloadRes.arrayBuffer();
    const nodeBuffer = Buffer.from(buffer);
    const remoteFilename = typeof fileInfo.file?.filename === 'string' ? path.basename(fileInfo.file.filename) : '';
    const safeRemoteFilename = remoteFilename && /\.mp4$/i.test(remoteFilename)
        ? `animation_${diaryId}_${fileId}_${remoteFilename}`
        : `animation_${diaryId}_${fileId}_${Date.now()}.mp4`;
    const filename = safeRemoteFilename;
    const filePath = path.join(DIARY_UPLOAD_DIR, filename);

    await fs.promises.writeFile(filePath, nodeBuffer);

    return {
        url: `${DIARY_MEDIA_URL_PREFIX}/${filename}`,
        originalName: filename,
        size: buffer.byteLength,
        mimeType: 'video/mp4',
        buffer: nodeBuffer
    };
}

function normalizeAIDiaryInput(body, files = []) {
    const uploadedPhotoNames = files
        .filter(file => getDiaryMediaType(file.mimetype) === 'image')
        .map(file => `上传图片：${file.originalname || file.filename}`);

    return {
        trajectory: typeof body.trajectory === 'string' ? body.trajectory : '',
        photos: [...toTextArray(body.photos), ...uploadedPhotoNames],
        tags: toTextArray(body.tags),
        scenicSpot: typeof body.scenicSpot === 'string' ? body.scenicSpot : '',
        date: typeof body.date === 'string' && body.date ? body.date : undefined,
        weather: typeof body.weather === 'string' && body.weather ? body.weather : '晴',
        generateAnimationImage: normalizeBoolean(body.generateAnimationImage)
    };
}

function validateAIDiaryImageFiles(files = []) {
    for (const file of files) {
        if (getDiaryMediaType(file.mimetype) !== 'image') return 'AI 生成日记目前只支持上传图片';
        if (file.size > DIARY_IMAGE_MAX_BYTES) return '单张图片不能超过 10MB';
    }
    return null;
}

function validateDiaryMediaFiles(files = []) {
    for (const file of files) {
        const mediaType = getDiaryMediaType(file.mimetype);
        if (!mediaType) return '只支持图片或视频文件';
        if (mediaType === 'image' && file.size > DIARY_IMAGE_MAX_BYTES) return '单张图片不能超过 10MB';
        if (mediaType === 'video' && file.size > DIARY_VIDEO_MAX_BYTES) return '单个视频不能超过 50MB';
    }
    return null;
}

const aiDiarySchema = Joi.object({
    trajectory: Joi.string().max(500).allow('').messages({
        'string.max': '轨迹描述不能超过 500 个字符'
    }),
    photos: Joi.array().items(Joi.string()).max(10).default([]).messages({
        'array.max': '照片数量不能超过 10 张'
    }),
    tags: Joi.array().items(Joi.string()).max(5).default([]).messages({
        'array.max': '风格标签不能超过 5 个'
    }),
    scenicSpot: Joi.string().max(200).allow('').default(''),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('').message('日期格式必须为 YYYY-MM-DD'),
    weather: Joi.string().valid('晴', '多云', '阴', '雨', '雪', '大风').default('晴'),
    generateAnimationImage: Joi.any().optional()
}).or('trajectory', 'photos');

async function ensureDiaryGeneratedSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS diaries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    summary VARCHAR(200) DEFAULT '',
    is_public BOOLEAN DEFAULT FALSE,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    rating_avg DOUBLE PRECISION DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    system_rating_avg DOUBLE PRECISION DEFAULT 0,
    system_rating_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diary_ratings (
    id SERIAL PRIMARY KEY,
    diary_id INTEGER REFERENCES diaries(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(diary_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_ratings_unique ON diary_ratings(diary_id, user_id);


ALTER TABLE diaries ADD COLUMN IF NOT EXISTS style TEXT;
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS scenic_spot TEXT;
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS spot_tags TEXT[] DEFAULT '{}';
CREATE TABLE IF NOT EXISTS diary_views (
            id SERIAL PRIMARY KEY,
            diary_id INTEGER REFERENCES diaries(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(diary_id, user_id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_views_unique ON diary_views(diary_id, user_id);

        CREATE TABLE IF NOT EXISTS diary_media (
            id SERIAL PRIMARY KEY,
            diary_id INTEGER REFERENCES diaries(id) ON DELETE CASCADE,
            media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
            url TEXT NOT NULL,
            original_name TEXT,
            mime_type TEXT,
            file_size INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_diary_media_diary_id ON diary_media(diary_id);

        CREATE TABLE IF NOT EXISTS diary_media_content (
            media_id INTEGER PRIMARY KEY REFERENCES diary_media(id) ON DELETE CASCADE,
            content BYTEA NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_diary_media_content_media_id ON diary_media_content(media_id);

        CREATE TABLE IF NOT EXISTS diary_animation_tasks (
            id SERIAL PRIMARY KEY,
            diary_id INTEGER REFERENCES diaries(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            provider VARCHAR(20) DEFAULT 'minimax',
            mode VARCHAR(10) CHECK (mode IN ('i2v', 't2v')),
            status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'success', 'failed')),
            prompt TEXT,
            model VARCHAR(50),
            task_id TEXT,
            file_id TEXT,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            finished_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_animation_tasks_diary_id ON diary_animation_tasks(diary_id);
        CREATE INDEX IF NOT EXISTS idx_animation_tasks_status ON diary_animation_tasks(status);

        CREATE TABLE IF NOT EXISTS diary_comments (
            id SERIAL PRIMARY KEY,
            diary_id INTEGER REFERENCES diaries(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            comment TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_diary_comments_diary_id ON diary_comments(diary_id);
        ALTER TABLE diary_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES diary_comments(id) ON DELETE CASCADE;

        CREATE TABLE IF NOT EXISTS diary_reactions (
            id SERIAL PRIMARY KEY,
            diary_id INTEGER REFERENCES diaries(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reaction_type VARCHAR(20) NOT NULL CHECK (reaction_type IN ('like', 'favorite')),
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(diary_id, user_id, reaction_type)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_reactions_unique ON diary_reactions(diary_id, user_id, reaction_type);

        CREATE TABLE IF NOT EXISTS diary_notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            diary_id INTEGER REFERENCES diaries(id) ON DELETE CASCADE,
            type VARCHAR(20) NOT NULL CHECK (type IN ('like', 'favorite', 'comment', 'reply')),
            actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            actor_name VARCHAR(50),
            diary_title VARCHAR(255),
            comment_text TEXT,
            comment_id INTEGER REFERENCES diary_comments(id) ON DELETE SET NULL,
            parent_comment_id INTEGER REFERENCES diary_comments(id) ON DELETE SET NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE diary_notifications ADD COLUMN IF NOT EXISTS comment_id INTEGER REFERENCES diary_comments(id) ON DELETE SET NULL;
        ALTER TABLE diary_notifications ADD COLUMN IF NOT EXISTS parent_comment_id INTEGER REFERENCES diary_comments(id) ON DELETE SET NULL;
        ALTER TABLE diary_notifications DROP CONSTRAINT IF EXISTS diary_notifications_type_check;
        ALTER TABLE diary_notifications ADD CONSTRAINT diary_notifications_type_check CHECK (type IN ('like', 'favorite', 'comment', 'reply'));
        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON diary_notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_unread ON diary_notifications(user_id, is_read);
    `);
}

async function enqueueAnimationTask(diaryId, userId, prompt, mode = 't2v') {
    await pool.query(
        `INSERT INTO diary_animation_tasks (diary_id, user_id, prompt, mode, status)
         VALUES ($1, $2, $3, $4, 'queued')`,
        [diaryId, userId, prompt, mode]
    );

    processPendingAnimationTasks().catch(err => console.error('[动画任务] 触发处理失败:', err.message));
}

async function finalizeAnimationTask(task, finishedTask) {
    const videoData = await downloadAndSaveMiniMaxVideo(finishedTask.file_id, task.diary_id);
    await saveGeneratedVideoMedia(task.diary_id, videoData);
    await pool.query(
        `UPDATE diary_animation_tasks
         SET status = 'success', file_id = $1, updated_at = NOW(), finished_at = NOW()
         WHERE id = $2`,
        [finishedTask.file_id, task.id]
    );
}


let isProcessingAnimationTasks = false;
async function processPendingAnimationTasks() {
    if (isProcessingAnimationTasks) return;
    isProcessingAnimationTasks = true;

    try {
        while (true) {
            const taskRes = await pool.query(
                `SELECT t.*, d.title, d.content, d.scenic_spot, d.style
                 FROM diary_animation_tasks t
                 JOIN diaries d ON t.diary_id = d.id
                 WHERE t.status = 'queued'
                    OR (t.status = 'processing' AND t.updated_at < NOW() - INTERVAL '45 seconds')
                 ORDER BY CASE WHEN t.status = 'processing' THEN 0 ELSE 1 END, t.created_at ASC
                 LIMIT 1`
            );

            if (taskRes.rows.length === 0) break;

            const task = taskRes.rows[0];
            const isResuming = task.status === 'processing' && typeof task.task_id === 'string' && task.task_id.length > 0;
            if (!isResuming) {
                await pool.query(
                    `UPDATE diary_animation_tasks
                     SET status = $1, error_message = NULL, finished_at = NULL, updated_at = NOW()
                     WHERE id = $2`,
                    ['processing', task.id]
                );
            }

            try {
                const mediaRows = await getDiaryMedia(task.diary_id);
                const firstImage = mediaRows.find(item => item.media_type === 'image');
                const diaryContent = await maybeDecompressDiaryContent(task.content);

                const basePrompt = buildMiniMaxAnimationPrompt({
                    title: task.title,
                    content: diaryContent,
                    scenicSpot: task.scenic_spot,
                    style: task.style
                });

                let payload = { prompt: basePrompt };
                let currentMode = task.mode || 't2v';

                if (firstImage) {
                    const base64 = await getDiaryImageAsBase64(firstImage);
                    if (base64) {
                        payload = {
                            prompt: basePrompt,
                            first_frame_image: base64,
                            model: MINIMAX_I2V_MODEL
                        };
                        currentMode = 'i2v';
                    }
                }

                if (currentMode !== task.mode) {
                    await pool.query('UPDATE diary_animation_tasks SET mode = $1 WHERE id = $2', [currentMode, task.id]);
                }

                let minimaxTaskId = isResuming ? task.task_id : null;
                let finishedTask = null;

                if (minimaxTaskId) {
                    const resumedStatus = await queryMiniMaxVideoTask(minimaxTaskId);
                    const resumedNormalized = String(resumedStatus.status || '').toLowerCase();
                    if (resumedNormalized === 'success') {
                        finishedTask = resumedStatus;
                    } else if (resumedNormalized === 'fail' || resumedNormalized === 'failed' || resumedNormalized === 'error') {
                        throw new Error(`MiniMax 生成失败: ${resumedStatus.base_resp?.status_msg || resumedStatus.status || '未知错误'}`);
                    }
                } else {
                    try {
                        minimaxTaskId = await createMiniMaxVideoTask(payload);
                    } catch (firstErr) {
                        if (payload.first_frame_image && isMiniMaxSensitiveError(firstErr.message)) {
                            console.warn(`[动画任务] 任务 ${task.id} 图生视频审核未通过，降级为文生视频`);
                            payload = { prompt: basePrompt, model: MINIMAX_T2V_MODEL };
                            currentMode = 't2v';
                            await pool.query('UPDATE diary_animation_tasks SET mode = $1 WHERE id = $2', [currentMode, task.id]);
                            minimaxTaskId = await createMiniMaxVideoTask(payload);
                        } else {
                            throw firstErr;
                        }
                    }
                }

                const selectedModel = currentMode === 'i2v' ? MINIMAX_I2V_MODEL : MINIMAX_T2V_MODEL;
                await pool.query(
                    'UPDATE diary_animation_tasks SET task_id = $1, model = $2, updated_at = NOW() WHERE id = $3',
                    [minimaxTaskId, selectedModel, task.id]
                );

                if (!finishedTask) {
                    try {
                        finishedTask = await waitForMiniMaxVideoTask(minimaxTaskId, async () => {
                            await pool.query('UPDATE diary_animation_tasks SET updated_at = NOW() WHERE id = $1', [task.id]);
                        });
                    } catch (pollErr) {
                        if (!isResuming && payload.first_frame_image && (/超时|timeout/i.test(pollErr.message) || isMiniMaxSensitiveError(pollErr.message))) {
                            console.warn(`[动画任务] 任务 ${task.id} 图生视频失败，降级为文生视频重试`);
                            payload = { prompt: basePrompt, model: MINIMAX_T2V_MODEL };
                            currentMode = 't2v';
                            await pool.query('UPDATE diary_animation_tasks SET mode = $1 WHERE id = $2', [currentMode, task.id]);
                            minimaxTaskId = await createMiniMaxVideoTask(payload);
                            await pool.query(
                                'UPDATE diary_animation_tasks SET task_id = $1, model = $2, updated_at = NOW() WHERE id = $3',
                                [minimaxTaskId, MINIMAX_T2V_MODEL, task.id]
                            );
                            finishedTask = await waitForMiniMaxVideoTask(minimaxTaskId, async () => {
                                await pool.query('UPDATE diary_animation_tasks SET updated_at = NOW() WHERE id = $1', [task.id]);
                            });
                        } else {
                            throw pollErr;
                        }
                    }
                }

                await finalizeAnimationTask(task, finishedTask);
            } catch (error) {
                console.error(`[动画任务] 任务 ${task.id} 失败:`, error.message);
                await pool.query(
                    `UPDATE diary_animation_tasks
                     SET status = 'failed', error_message = $1, updated_at = NOW(), finished_at = NOW()
                     WHERE id = $2`,
                    [normalizeAnimationErrorMessage(error.message), task.id]
                );
            }
        }
    } finally {
        isProcessingAnimationTasks = false;
    }
}

async function createAIDiary(user, value, files = []) {
    let createdDiaryId = null;
    try {
        const { trajectory, photos, tags, scenicSpot, date, weather, generateAnimationImage } = value;

        const safeTrajectory = trajectory && trajectory.length > 500
            ? trajectory.substring(0, 500)
            : (trajectory || '');
        const safePhotos = photos.slice(0, 10);
        const safeTags = tags.slice(0, 5);

        const photoDesc = safePhotos.length
            ? `照片内容：${safePhotos.join('、')}。`
            : '';
        const tagStr = safeTags.length ? `风格标签：${safeTags.join('、')}。` : '';
        const dateStr = date ? `日期：${date}。` : '';
        const weatherStr = weather ? `天气：${weather}。` : '';

        const prompt = `请根据以下信息写一篇旅行日记：
游览轨迹：${safeTrajectory || '未记录'}。
${photoDesc}
${tagStr}
${dateStr}
${weatherStr}
要求：标题自拟，字数300-400字，语言优美生动。`;

        console.log(`[AI日记] 用户 ${user.username} 请求生成，轨迹: ${trajectory}`);
        const aiResponse = await callAI(prompt);

        const lines = aiResponse.trim().split('\n').filter(l => l.trim());
        let title = `${date || '某日'}的旅行`;
        let content = aiResponse;

        if (lines.length > 0) {
            const firstLine = lines[0];
            if (firstLine.startsWith('标题：')) {
                title = firstLine.replace('标题：', '').trim();
                content = lines.slice(1).join('\n');
            } else if (firstLine.length <= 30 && !firstLine.includes('。')) {
                title = firstLine;
                content = lines.slice(1).join('\n');
            } else {
                title = `${date || '旅行日记'} · ${safeTags[0] || '随记'}`;
            }
        }

        const originalContent = content;
        const { storedContent } = await maybeCompressDiaryContent(originalContent);

        const aiStyle = safeTags.length > 0 ? safeTags[0] : '默认';
        const aiSpot = scenicSpot || (safeTrajectory ? safeTrajectory.substring(0, 50) : '默认');
        const spotTagsArray = scenicSpot ? scenicSpot.split(/[、,，\s]+/).filter(t => t.trim()) : [];

        const dbRes = await pool.query(
            `INSERT INTO diaries
             (user_id, title, content, summary, is_public, is_ai_generated, style, scenic_spot, spot_tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, title, content, summary, is_public, is_ai_generated, style, scenic_spot, spot_tags, created_at`,
            [user.id, title, storedContent, originalContent.substring(0, 100), false, true, aiStyle, aiSpot, spotTagsArray]
        );
        createdDiaryId = dbRes.rows[0].id;

        const media = await saveDiaryMedia(createdDiaryId, files);

        if (generateAnimationImage) {
            const hasImages = media.some(m => m.media_type === 'image');
            const animationPrompt = buildMiniMaxAnimationPrompt({
                title,
                content: originalContent,
                scenicSpot: aiSpot,
                style: aiStyle,
                date,
                weather,
                photoHints: safePhotos
            });
            await enqueueAnimationTask(createdDiaryId, user.id, animationPrompt, hasImages ? 'i2v' : 't2v');
        }

        return { ...dbRes.rows[0], content: originalContent, media: toClientDiaryMediaRows(media) };
    } catch (error) {
        if (createdDiaryId) {
            const mediaRows = await getDiaryMedia(createdDiaryId).catch(() => []);
            await pool.query('DELETE FROM diaries WHERE id = $1 AND user_id = $2', [createdDiaryId, user.id]).catch(() => { });
            removeDiaryMediaFiles(mediaRows);
        }
        throw error;
    }
}

async function createDiaryRecord(user, value, files = []) {
    const { title, content, style, scenicSpot, generateAnimationImage } = value;
    let diaryId = null;

    try {
        if (!title || !title.trim()) {
            throw new Error('标题不能为空');
        }
        if (!content || !content.trim()) {
            throw new Error('内容不能为空');
        }

        const cleanTitle = title.trim();
        const cleanContent = content.trim();
        const diaryStyle = (style && style.trim()) ? style.trim() : '默认';
        const diarySpot = (scenicSpot && scenicSpot.trim()) ? scenicSpot.trim() : '默认';
        const spotTagsArray = (scenicSpot && scenicSpot.trim()) ? scenicSpot.trim().split(/[、,，\s]+/).filter(t => t.trim()) : [];
        const { storedContent } = await maybeCompressDiaryContent(cleanContent);

        const dbRes = await pool.query(
            `INSERT INTO diaries
             (user_id, title, content, summary, style, scenic_spot, spot_tags)
             VALUES ($1, $2, $3, '', $4, $5, $6)
             RETURNING id, title, content, summary, style, scenic_spot, spot_tags, created_at`,
            [user.id, cleanTitle, storedContent, diaryStyle, diarySpot, spotTagsArray]
        );

        diaryId = dbRes.rows[0].id;
        const media = await saveDiaryMedia(diaryId, files);

        if (normalizeBoolean(generateAnimationImage)) {
            const hasImages = media.some(m => m.media_type === 'image');
            const animationPrompt = buildMiniMaxAnimationPrompt({
                title: cleanTitle,
                content: cleanContent,
                scenicSpot: diarySpot,
                style: diaryStyle,
                photoHints: media.filter(m => m.media_type === 'image').map(m => m.original_name)
            });
            await enqueueAnimationTask(diaryId, user.id, animationPrompt, hasImages ? 'i2v' : 't2v');
        }

        return { ...dbRes.rows[0], content: cleanContent, media: toClientDiaryMediaRows(media) };
    } catch (error) {
        if (diaryId) {
            const mediaRows = await getDiaryMedia(diaryId).catch(() => []);
            await pool.query('DELETE FROM diaries WHERE id = $1 AND user_id = $2', [diaryId, user.id]).catch(() => { });
            removeDiaryMediaFiles(mediaRows);
        }
        throw error;
    }
}

/**
 * POST /api/register - 用户注册
 */
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
        }

        if (!/^.{8,128}$/u.test(password)) {
            return res.status(400).json({ success: false, error: '密码必须为8至128个字符' });
        }

        const existRes = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existRes.rows.length > 0) {
            return res.status(409).json({ success: false, error: '用户名已存在' });
        }

        await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, await bcrypt.hash(password, 12)]);

        console.log(`[注册] 新用户: ${username}`);
        res.json({ success: true, message: '注册成功' });

    } catch (error) {
        console.error('[注册错误]:', error.message);
        res.status(500).json({ success: false, error: '注册失败，请稍后重试' });
    }
});

/**
 * POST /api/login - 用户登录
 */
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: '请输入用户名和密码' });
        }

        if (adminPassword && username === adminUsername && password === adminPassword) {
            const adminUser = {
                id: 0,
                username: adminUsername,
                role: 'admin'
            };
            const adminToken = jwt.sign(adminUser, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            console.log(`[登录] 管理员: ${username}`);
            return res.json({ success: true, token: adminToken, user: adminUser });
        }

        const dbRes = await pool.query(
            'SELECT id, username, password, avatar_url, avatar_updated_at FROM users WHERE username = $1',
            [username]
        );

        if (!dbRes.rows.length || !await bcrypt.compare(password, dbRes.rows[0].password)) {
            return res.status(401).json({ success: false, error: '用户名或密码错误' });
        }

        const user = toClientUser(dbRes.rows[0], 'user');
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        console.log(`[登录] 用户: ${username}`);
        res.json({ success: true, token, user });

    } catch (error) {
        console.error('[登录错误]:', error.message);
        res.status(500).json({ success: false, error: '登录失败，请稍后重试' });
    }
});

/**
 * GET /api/auth/check - 验证登录状态
 */
app.get('/api/auth/check', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false });
    try {
        const user = jwt.verify(token, JWT_SECRET);
        if (user?.id && Number(user.id) > 0) {
            const dbRes = await pool.query(
                'SELECT id, username, avatar_url, avatar_updated_at FROM users WHERE id = $1',
                [user.id]
            );
            if (dbRes.rows.length > 0) {
                return res.json({ success: true, user: toClientUser(dbRes.rows[0], user.role || 'user') });
            }
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(401).json({ success: false, error: '登录已过期' });
    }
});

/**
 * POST /api/logout - 退出登录（JWT 无状态，前端删除 token 即可）
 */
app.post('/api/logout', (req, res) => {
    res.json({ success: true, message: '已退出登录' });
});

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, error: '未登录或登录已过期' });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
        }
        return res.status(401).json({ success: false, error: '无效凭证' });
    }
}

function optionalUserFromRequest(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function normalizeDiscoverType(type) {
    return ['spot', 'food', 'service'].includes(type) ? type : null;
}

function parseDiscoverItemKey(rawKey) {
    const text = String(rawKey || '').trim();
    const firstColon = text.indexOf(':');
    if (firstColon <= 0) return null;
    const itemType = normalizeDiscoverType(text.slice(0, firstColon));
    const itemId = text.slice(firstColon + 1).trim();
    if (!itemType || !itemId || itemId.length > 120) return null;
    return { key: `${itemType}:${itemId}`, itemType, itemId };
}

function buildDiscoverTupleCondition(items, startIndex = 1) {
    const params = [];
    const tuples = items.map((item, idx) => {
        params.push(item.itemType, item.itemId);
        const base = startIndex + idx * 2;
        return `($${base}, $${base + 1})`;
    }).join(', ');
    return {
        clause: `(item_type, item_id) IN (${tuples})`,
        params
    };
}

function formatRelativeTime(dateValue) {
    const created = new Date(dateValue);
    const diffMs = Date.now() - created.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return '刚刚';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    const months = Math.floor(days / 30);
    return `${months}月前`;
}

async function getDiscoverInteractionSummaries(rawKeys, currentUserId = null) {
    const byKey = new Map();
    rawKeys.forEach(rawKey => {
        const parsed = parseDiscoverItemKey(rawKey);
        if (parsed) byKey.set(parsed.key, parsed);
    });

    const items = Array.from(byKey.values()).slice(0, 100);
    const summaries = {};
    items.forEach(item => {
        summaries[item.key] = {
            likeCount: 0,
            favoriteCount: 0,
            myLike: false,
            myFavorite: false,
            ratingAvg: 0,
            ratingCount: 0,
            reviews: []
        };
    });

    if (items.length === 0) return summaries;

    const tupleA = buildDiscoverTupleCondition(items);
    const reactionRes = await pool.query(
        `SELECT item_type, item_id, reaction_type, COUNT(*)::int AS count
         FROM discover_reactions
         WHERE ${tupleA.clause}
         GROUP BY item_type, item_id, reaction_type`,
        tupleA.params
    );
    reactionRes.rows.forEach(row => {
        const key = `${row.item_type}:${row.item_id}`;
        if (!summaries[key]) return;
        if (row.reaction_type === 'like') summaries[key].likeCount = Number(row.count) || 0;
        if (row.reaction_type === 'favorite') summaries[key].favoriteCount = Number(row.count) || 0;
    });

    const tupleB = buildDiscoverTupleCondition(items);
    const ratingRes = await pool.query(
        `SELECT item_type, item_id, AVG(rating)::float AS rating_avg, COUNT(*)::int AS rating_count
         FROM discover_reviews
         WHERE ${tupleB.clause}
         GROUP BY item_type, item_id`,
        tupleB.params
    );
    ratingRes.rows.forEach(row => {
        const key = `${row.item_type}:${row.item_id}`;
        if (!summaries[key]) return;
        summaries[key].ratingAvg = Number(row.rating_avg) || 0;
        summaries[key].ratingCount = Number(row.rating_count) || 0;
    });

    const tupleC = buildDiscoverTupleCondition(items);
    const reviewRes = await pool.query(
        `SELECT *
         FROM (
             SELECT r.item_type, r.item_id, r.rating, r.comment, r.created_at, u.username,
                    ROW_NUMBER() OVER (PARTITION BY r.item_type, r.item_id ORDER BY r.created_at DESC) AS rn
             FROM discover_reviews r
             JOIN users u ON r.user_id = u.id
             WHERE ${tupleC.clause}
         ) ranked
         WHERE rn <= 20
         ORDER BY item_type, item_id, created_at ASC`,
        tupleC.params
    );
    reviewRes.rows.forEach(row => {
        const key = `${row.item_type}:${row.item_id}`;
        if (!summaries[key]) return;
        const username = row.username || '旅者';
        summaries[key].reviews.push({
            user: username,
            avatar: username.charAt(0) || '旅',
            stars: Number(row.rating) || 5,
            text: row.comment,
            time: formatRelativeTime(row.created_at)
        });
    });

    if (currentUserId && currentUserId > 0) {
        const tupleD = buildDiscoverTupleCondition(items, 2);
        const myReactionRes = await pool.query(
            `SELECT item_type, item_id, reaction_type
             FROM discover_reactions
             WHERE user_id = $1 AND ${tupleD.clause}`,
            [currentUserId, ...tupleD.params]
        );
        myReactionRes.rows.forEach(row => {
            const key = `${row.item_type}:${row.item_id}`;
            if (!summaries[key]) return;
            if (row.reaction_type === 'like') summaries[key].myLike = true;
            if (row.reaction_type === 'favorite') summaries[key].myFavorite = true;
        });
    }

    return summaries;
}

/**
 * PUT /api/user/profile - 更新当前用户昵称、头像和密码
 */
app.put('/api/user/profile', authMiddleware, runAvatarUpload, async (req, res) => {
    try {
        await ensureUserProfileSchema();
        const userId = Number(req.user?.id);
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '').trim();

        if (!userId || userId < 1) {
            return res.status(403).json({ success: false, error: '当前账号不支持修改资料' });
        }
        if (!username) {
            return res.status(400).json({ success: false, error: '昵称不能为空' });
        }
        if (username.length > 50) {
            return res.status(400).json({ success: false, error: '昵称不能超过50个字符' });
        }
        if (password && !/^.{8,128}$/u.test(password)) {
            return res.status(400).json({ success: false, error: '密码必须为8至128个字符' });
        }

        const existRes = await pool.query(
            'SELECT id FROM users WHERE username = $1 AND id <> $2',
            [username, userId]
        );
        if (existRes.rows.length > 0) {
            return res.status(409).json({ success: false, error: '昵称已被使用' });
        }

        const assignments = ['username = $1'];
        const updateParams = [username];
        let paramIndex = 2;
        if (password) {
            assignments.push(`password = $${paramIndex}`);
            updateParams.push(await bcrypt.hash(password, 12));
            paramIndex++;
        }
        if (req.file) {
            assignments.push(`avatar_content = $${paramIndex}`);
            updateParams.push(req.file.buffer);
            paramIndex++;
            assignments.push(`avatar_mime_type = $${paramIndex}`);
            updateParams.push(req.file.mimetype);
            paramIndex++;
            assignments.push(`avatar_url = $${paramIndex}`);
            updateParams.push(buildUserAvatarUrl(userId));
            paramIndex++;
            assignments.push('avatar_updated_at = NOW()');
        }

        updateParams.push(userId);
        const updateRes = await pool.query(
            `UPDATE users
             SET ${assignments.join(', ')}
             WHERE id = $${paramIndex}
             RETURNING id, username, avatar_url, avatar_updated_at`,
            updateParams
        );

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '用户不存在' });
        }

        const user = toClientUser(updateRes.rows[0], req.user.role || 'user');
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ success: true, user, token });

    } catch (error) {
        console.error('[更新用户资料错误]:', error.message);
        res.status(500).json({ success: false, error: '资料保存失败，请稍后重试' });
    }
});

app.get('/api/users/:id/avatar', async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).send('无效的用户 ID');
        }
        const avatarRes = await pool.query(
            'SELECT avatar_content, avatar_mime_type, avatar_updated_at FROM users WHERE id = $1',
            [userId]
        );
        const row = avatarRes.rows[0];
        if (!row?.avatar_content) {
            return res.status(404).send('头像不存在');
        }

        res.setHeader('Content-Type', row.avatar_mime_type || 'image/jpeg');
        if (row.avatar_updated_at) {
            res.setHeader('Last-Modified', new Date(row.avatar_updated_at).toUTCString());
        }
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(row.avatar_content);
    } catch (error) {
        console.error('[头像读取错误]:', error.message);
        res.status(500).send('头像读取失败');
    }
});

function adminMiddleware(req, res, next) {
    authMiddleware(req, res, () => {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ success: false, error: '需要管理员权限' });
        }
        next();
    });
}

/**
 * GET /api/admin/diaries - 管理员查看全部日记
 */
app.get('/api/admin/diaries', adminMiddleware, async (req, res) => {
    try {
        const { user = '', title = '', publicStatus = 'all', sort = 'new' } = req.query;
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (typeof user === 'string' && user.trim()) {
            conditions.push(`u.username ILIKE $${paramIndex++}`);
            params.push(`%${user.trim()}%`);
        }
        if (typeof title === 'string' && title.trim()) {
            conditions.push(`d.title ILIKE $${paramIndex++}`);
            params.push(`%${title.trim()}%`);
        }
        if (publicStatus === 'public') {
            conditions.push('d.is_public = TRUE');
        } else if (publicStatus === 'private') {
            conditions.push('d.is_public = FALSE');
        }

        let orderBy = 'd.created_at DESC';
        if (sort === 'hot') {
            orderBy = 'd.view_count DESC, d.created_at DESC';
        } else if (sort === 'rating') {
            orderBy = 'd.rating_avg DESC, d.rating_count DESC, d.created_at DESC';
        } else if (sort === 'user') {
            orderBy = 'u.username ASC, d.created_at DESC';
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const diaryRes = await pool.query(
            `SELECT d.id, d.user_id, d.title, d.content, d.summary, d.is_public, d.is_ai_generated,
                    d.style, d.scenic_spot, d.spot_tags, d.view_count, d.rating_avg, d.rating_count,
                    d.created_at, u.username
             FROM diaries d
             JOIN users u ON d.user_id = u.id
             ${whereClause}
             ORDER BY ${orderBy}
             LIMIT 200`,
            params
        );

        const statsRes = await pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE is_public = TRUE)::int AS public_count,
                    COUNT(*) FILTER (WHERE is_public = FALSE)::int AS private_count,
                    COALESCE(SUM(view_count), 0)::int AS total_views,
                    COALESCE(AVG(rating_avg), 0)::float AS avg_rating
             FROM diaries`
        );

        const data = await enrichDiaryRows(diaryRes.rows);
        res.json({
            success: true,
            data,
            stats: statsRes.rows[0] || {
                total: 0,
                public_count: 0,
                private_count: 0,
                total_views: 0,
                avg_rating: 0
            }
        });
    } catch (error) {
        console.error('[管理员日记查询错误]:', error.message);
        res.status(500).json({ success: false, error: '管理员查询失败' });
    }
});

/**
 * DELETE /api/admin/diaries/:id - 管理员删除任意日记
 */
app.delete('/api/admin/diaries/:id', adminMiddleware, async (req, res) => {
    try {
        const diaryId = Number(req.params.id);
        if (!Number.isInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ success: false, error: '无效的日记 ID' });
        }

        const checkRes = await pool.query('SELECT id FROM diaries WHERE id = $1', [diaryId]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '日记不存在' });
        }

        const mediaRows = await getDiaryMedia(diaryId);
        await pool.query('DELETE FROM diaries WHERE id = $1', [diaryId]);
        removeDiaryMediaFiles(mediaRows);

        console.log(`[管理员删除日记] admin 删除了日记 ID:${diaryId}`);
        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        console.error('[管理员删除日记错误]:', error.message);
        res.status(500).json({ success: false, error: '删除失败，请稍后重试' });
    }
});

app.post('/api/admin/media/sync-uploads', adminMiddleware, async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const limit = Number.isInteger(Number(body.limit)) ? Number(body.limit) : 200;
        const concurrency = Number.isInteger(Number(body.concurrency)) ? Number(body.concurrency) : 2;
        const dryRun = body.dryRun === true;

        const stats = await bulkSyncDiaryMediaContentFromUploads({ limit, concurrency, dryRun });
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[管理员同步媒体错误]:', error.message);
        res.status(500).json({ success: false, error: '同步失败，请稍后重试' });
    }
});

/**
 * GET /api/diaries/community/:id - 获取社区日记详情并记录浏览量
 */
/**
 * GET /api/diaries/community/:id - 获取社区日记详情并记录浏览量
 */
app.get('/api/diaries/community/:id', async (req, res) => {
    try {
        const diaryId = req.params.id;
        const authHeader = req.headers.authorization;
        let currentUserId = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded) currentUserId = decoded.id;
            } catch (e) { /* token 无效，忽略 */ }
        }

        // 1. 获取详情 (允许作者查看私有日记)
        const dbRes = await pool.query(`
            SELECT d.*, u.username
            FROM diaries d
            JOIN users u ON d.user_id = u.id
            WHERE d.id = $1 AND (d.is_public = TRUE OR d.user_id = $2)
        `, [diaryId, currentUserId]);

        if (dbRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '日记不存在或已私有' });
        }

        const diary = dbRes.rows[0];
        diary.content = await maybeDecompressDiaryContent(diary.content);
        diary.media = toClientDiaryMediaRows(await getDiaryMedia(diaryId));
        diary.animationStatus = (await getDiaryAnimationTasksMap([diaryId])).get(Number(diaryId)) || null;
        diary.my_rating = 0;
        diary.my_like = false;
        diary.my_favorite = false;
        diary.like_count = 0;
        diary.favorite_count = 0;
        diary.comments = [];

        try {
            const commentsRes = await pool.query(`
                SELECT c.id, c.parent_id, c.comment, c.created_at, u.username
                FROM diary_comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.diary_id = $1
                ORDER BY c.created_at DESC
                LIMIT 50
            `, [diaryId]);
            diary.comments = commentsRes.rows;

            const reactionStatsRes = await pool.query(`
                SELECT reaction_type, COUNT(*)::int AS count
                FROM diary_reactions
                WHERE diary_id = $1
                GROUP BY reaction_type
            `, [diaryId]);
            reactionStatsRes.rows.forEach(row => {
                if (row.reaction_type === 'like') diary.like_count = row.count;
                if (row.reaction_type === 'favorite') diary.favorite_count = row.count;
            });
        } catch (e) {
            console.error('[日记互动读取错误]:', e.message);
        }

        // 2. 记录浏览量与获取我的评分
        if (currentUserId) {
            try {
                // 记录浏览 (仅对公开日记计数)
                if (diary.is_public && diary.user_id !== currentUserId) {
                    const viewRes = await pool.query(
                        'INSERT INTO diary_views (diary_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
                        [diaryId, currentUserId]
                    );
                    if (viewRes.rows.length > 0) {
                        await pool.query('UPDATE diaries SET view_count = view_count + 1 WHERE id = $1', [diaryId]);
                        diary.view_count += 1;
                    }
                }

                // 获取当前用户对此日记的评分
                const rateRes = await pool.query(
                    'SELECT rating FROM diary_ratings WHERE diary_id = $1 AND user_id = $2',
                    [diaryId, currentUserId]
                );
                if (rateRes.rows.length > 0) {
                    diary.my_rating = rateRes.rows[0].rating;
                }

                const reactionRes = await pool.query(
                    'SELECT reaction_type FROM diary_reactions WHERE diary_id = $1 AND user_id = $2',
                    [diaryId, currentUserId]
                );
                diary.my_like = reactionRes.rows.some(row => row.reaction_type === 'like');
                diary.my_favorite = reactionRes.rows.some(row => row.reaction_type === 'favorite');
            } catch (e) {
                console.error('[详情增强错误]:', e.message);
            }
        }

        res.json({ success: true, data: diary });

    } catch (error) {
        console.error('[日记详情错误]:', error.message);
        res.status(500).json({ success: false, error: '获取详情失败' });
    }
});

/**
 * POST /api/diaries/:id/rate - 对日记进行评分
 */
app.post('/api/diaries/:id/rate', authMiddleware, async (req, res) => {
    try {
        const diaryId = req.params.id;
        const { rating } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: '评分必须在 1-5 之间' });
        }

        // 1. 更新或插入评分记录
        await pool.query(`
            INSERT INTO diary_ratings (diary_id, user_id, rating)
            VALUES ($1, $2, $3)
            ON CONFLICT (diary_id, user_id) DO UPDATE SET rating = EXCLUDED.rating
        `, [diaryId, req.user.id, rating]);

        // 2. 重新计算该日记的平均分和总次数
        const statsRes = await pool.query(`
            SELECT AVG(rating) as avg_rating, COUNT(*) as count_rating
            FROM diary_ratings
            WHERE diary_id = $1
        `, [diaryId]);

        const { avg_rating, count_rating } = statsRes.rows[0];

        // 3. 同步到 diaries 主表
        await pool.query(`
            UPDATE diaries
            SET rating_avg = $1, rating_count = $2
            WHERE id = $3
        `, [avg_rating, count_rating, diaryId]);

        console.log(`[日记评分] 用户 ${req.user.username} 给日记 ${diaryId} 评了 ${rating} 分`);
        res.json({ success: true, rating_avg: parseFloat(avg_rating).toFixed(2), rating_count: count_rating });

    } catch (error) {
        console.error('[评分错误]:', error.message);
        res.status(500).json({ success: false, error: '评分失败' });
    }
});

/**
 * POST /api/diaries/:id/reaction - 点赞或收藏日记
 */
app.post('/api/diaries/:id/reaction', authMiddleware, async (req, res) => {
    try {
        const diaryId = Number(req.params.id);
        const reactionType = String(req.body.reaction_type || '').trim();

        if (!Number.isInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ success: false, error: '无效的日记 ID' });
        }
        if (!req.user?.id || req.user.id < 1) {
            return res.status(403).json({ success: false, error: '当前账号不支持该操作' });
        }
        if (!['like', 'favorite'].includes(reactionType)) {
            return res.status(400).json({ success: false, error: '无效的互动类型' });
        }

        const diaryRes = await pool.query(
            'SELECT id, user_id, title FROM diaries WHERE id = $1 AND (is_public = TRUE OR user_id = $2)',
            [diaryId, req.user.id]
        );
        if (diaryRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '日记不存在或不可访问' });
        }

        const existRes = await pool.query(
            'SELECT id FROM diary_reactions WHERE diary_id = $1 AND user_id = $2 AND reaction_type = $3',
            [diaryId, req.user.id, reactionType]
        );

        let active = true;
        if (existRes.rows.length > 0) {
            await pool.query(
                'DELETE FROM diary_reactions WHERE diary_id = $1 AND user_id = $2 AND reaction_type = $3',
                [diaryId, req.user.id, reactionType]
            );
            active = false;
        } else {
            await pool.query(`
                INSERT INTO diary_reactions (diary_id, user_id, reaction_type)
                VALUES ($1, $2, $3)
                ON CONFLICT (diary_id, user_id, reaction_type) DO NOTHING
            `, [diaryId, req.user.id, reactionType]);
        }

        const statsRes = await pool.query(`
            SELECT reaction_type, COUNT(*)::int AS count
            FROM diary_reactions
            WHERE diary_id = $1
            GROUP BY reaction_type
        `, [diaryId]);
        const stats = { like_count: 0, favorite_count: 0 };
        statsRes.rows.forEach(row => {
            if (row.reaction_type === 'like') stats.like_count = row.count;
            if (row.reaction_type === 'favorite') stats.favorite_count = row.count;
        });

        // 创建通知（非自己操作自己）
        const diaryInfo = diaryRes.rows[0];
        if (active && diaryInfo && diaryInfo.user_id !== req.user.id) {
            await pool.query(
                `INSERT INTO diary_notifications (user_id, diary_id, type, actor_id, actor_name, diary_title)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [diaryInfo.user_id, diaryId, reactionType, req.user.id, req.user.username || '旅者', diaryInfo.title]
            );
        }

        res.json({ success: true, reaction_type: reactionType, active, ...stats });

    } catch (error) {
        console.error('[日记互动错误]:', error.message);
        res.status(500).json({ success: false, error: '互动失败，请稍后重试' });
    }
});

/**
 * POST /api/diaries/:id/comments - 评论日记
 */
app.post('/api/diaries/:id/comments', authMiddleware, async (req, res) => {
    try {
        const diaryId = Number(req.params.id);
        const comment = String(req.body.comment || '').trim();

        if (!Number.isInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ success: false, error: '无效的日记 ID' });
        }
        if (!req.user?.id || req.user.id < 1) {
            return res.status(403).json({ success: false, error: '当前账号不支持评论' });
        }
        if (!comment) {
            return res.status(400).json({ success: false, error: '评论不能为空' });
        }
        if (comment.length > 500) {
            return res.status(400).json({ success: false, error: '评论不能超过500个字符' });
        }

        const diaryRes = await pool.query(
            'SELECT id FROM diaries WHERE id = $1 AND (is_public = TRUE OR user_id = $2)',
            [diaryId, req.user.id]
        );
        if (diaryRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '日记不存在或不可访问' });
        }

        const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
        let parentComment = null;
        if (parentId !== null) {
            if (!Number.isInteger(parentId) || parentId <= 0) {
                return res.status(400).json({ success: false, error: '无效的回复对象' });
            }
            const parentRes = await pool.query(
                `SELECT c.id, c.user_id, u.username
                 FROM diary_comments c
                 LEFT JOIN users u ON c.user_id = u.id
                 WHERE c.id = $1 AND c.diary_id = $2`,
                [parentId, diaryId]
            );
            if (parentRes.rows.length === 0) {
                return res.status(404).json({ success: false, error: '被回复的评论不存在' });
            }
            parentComment = parentRes.rows[0];
        }

        const insertRes = await pool.query(`
            INSERT INTO diary_comments (diary_id, user_id, comment, parent_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, comment, parent_id, created_at
        `, [diaryId, req.user.id, comment, parentId]);
        const newComment = insertRes.rows[0];

        // 创建评论/回复通知
        const diaryOwner = await pool.query('SELECT user_id, title FROM diaries WHERE id = $1', [diaryId]);
        const ownerInfo = diaryOwner.rows[0];
        if (ownerInfo && ownerInfo.user_id !== req.user.id) {
            await pool.query(
                `INSERT INTO diary_notifications
                 (user_id, diary_id, type, actor_id, actor_name, diary_title, comment_text, comment_id, parent_comment_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    ownerInfo.user_id,
                    diaryId,
                    parentComment ? 'reply' : 'comment',
                    req.user.id,
                    req.user.username || '旅者',
                    ownerInfo.title,
                    comment,
                    newComment.id,
                    parentId
                ]
            );
        }

        if (
            parentComment &&
            parentComment.user_id !== req.user.id &&
            (!ownerInfo || parentComment.user_id !== ownerInfo.user_id)
        ) {
            await pool.query(
                `INSERT INTO diary_notifications
                 (user_id, diary_id, type, actor_id, actor_name, diary_title, comment_text, comment_id, parent_comment_id)
                 VALUES ($1, $2, 'reply', $3, $4, $5, $6, $7, $8)`,
                [
                    parentComment.user_id,
                    diaryId,
                    req.user.id,
                    req.user.username || '旅者',
                    ownerInfo?.title || '',
                    comment,
                    newComment.id,
                    parentId
                ]
            );
        }

        res.json({
            success: true,
            comment: {
                ...insertRes.rows[0],
                username: req.user.username || '旅者'
            }
        });

    } catch (error) {
        console.error('[日记评论错误]:', error.message);
        res.status(500).json({ success: false, error: '评论失败，请稍后重试' });
    }
});

/**
 * GET /api/notifications - 获取当前用户的通知列表
 */
app.get('/api/notifications', authMiddleware, async (req, res) => {
    try {
        const dbRes = await pool.query(`
            SELECT n.*, d.title AS diary_title
            FROM diary_notifications n
            LEFT JOIN diaries d ON n.diary_id = d.id
            WHERE n.user_id = $1
            ORDER BY n.created_at DESC
            LIMIT 50
        `, [req.user.id]);
        const unreadRes = await pool.query(
            'SELECT COUNT(*)::int AS count FROM diary_notifications WHERE user_id = $1 AND is_read = FALSE',
            [req.user.id]
        );
        res.json({ success: true, notifications: dbRes.rows, unread_count: unreadRes.rows[0]?.count || 0 });
    } catch (error) {
        console.error('[通知错误]:', error.message);
        res.status(500).json({ success: false, error: '获取通知失败' });
    }
});

/**
 * POST /api/notifications/:id/read - 标记单条通知为已读
 */
app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
        const notificationId = Number(req.params.id);
        if (!Number.isInteger(notificationId) || notificationId <= 0) {
            return res.status(400).json({ success: false, error: '无效的通知 ID' });
        }
        await pool.query(
            'UPDATE diary_notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
            [notificationId, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('[通知单条已读错误]:', error.message);
        res.status(500).json({ success: false, error: '标记通知失败' });
    }
});

/**
 * POST /api/notifications/read - 标记所有通知为已读
 */
app.post('/api/notifications/read', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'UPDATE diary_notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
            [req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('[通知已读错误]:', error.message);
        res.status(500).json({ success: false, error: '标记已读失败' });
    }
});

/**
 * GET /api/diaries/my - 获取当前用户的日记列表
 */
app.get('/api/diaries/my', authMiddleware, async (req, res) => {
    try {
        const dbRes = await pool.query(
            'SELECT id, title, content, summary, is_public, is_ai_generated, style, scenic_spot, spot_tags, view_count, rating_avg, rating_count, created_at FROM diaries WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        console.log(`[日记] 用户 ${req.user.username} 查询了 ${dbRes.rows.length} 篇日记`);
        const data = await enrichDiaryRows(dbRes.rows);
        res.json({ success: true, data });
    } catch (error) {
        console.error('[日记查询错误]:', error.message);
        res.status(500).json({ success: false, error: '查询失败，请稍后重试' });
    }
});

/**
 * POST /api/diaries/:id/animation/retry - 重新尝试生成旅游动画
 */
app.post('/api/diaries/:id/animation/retry', authMiddleware, async (req, res) => {
    try {
        const diaryId = Number(req.params.id);
        if (!Number.isInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ success: false, error: '无效的日记 ID' });
        }

        const context = await buildDiaryAnimationContext(diaryId);
        if (context.diary.user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: '只能重试自己的日记动画任务' });
        }

        const latestTaskRes = await pool.query(
            `SELECT id, status
             FROM diary_animation_tasks
             WHERE diary_id = $1
             ORDER BY updated_at DESC, id DESC
             LIMIT 1`,
            [diaryId]
        );

        if (latestTaskRes.rows.length > 0) {
            const latestTask = latestTaskRes.rows[0];
            if (latestTask.status === 'queued' || latestTask.status === 'processing') {
                return res.json({ success: true, message: '动画任务已在处理中' });
            }
        }

        await enqueueAnimationTask(
            diaryId,
            req.user.id,
            context.prompt,
            context.hasImages ? 'i2v' : 't2v'
        );

        res.json({ success: true, message: '已重新提交旅游动画生成任务' });
    } catch (error) {
        console.error('[动画重试错误]:', error.message);
        res.status(500).json({ success: false, error: '重新生成失败，请稍后重试' });
    }
});

/**
 * POST /api/diaries - 新建日记
 */
app.post('/api/diaries', authMiddleware, async (req, res) => {
    try {
        const diary = await createDiaryRecord(req.user, req.body);
        console.log(`[日记] 用户 ${req.user.username} 创建了新日记: ${diary.title} [风格:${diary.style} 景点:${diary.scenic_spot}]`);
        res.json({ success: true, diary });
    } catch (error) {
        console.error('[日记创建错误]:', error.message);
        res.status(500).json({ success: false, error: '创建失败，请稍后重试' });
    }
});

/**
 * POST /api/diaries/with-media - 新建带图片/视频的日记
 */
app.post('/api/diaries/with-media', authMiddleware, runDiaryMediaUpload, async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    try {
        const mediaError = validateDiaryMediaFiles(files);
        if (mediaError) {
            removeUploadedFiles(files);
            return res.status(400).json({ success: false, error: mediaError });
        }

        const diary = await createDiaryRecord(req.user, {
            ...req.body,
            generateAnimationImage: normalizeBoolean(req.body.generateAnimationImage)
        }, files);
        console.log(`[日记] 用户 ${req.user.username} 创建了带媒体日记: ${diary.title}，媒体 ${diary.media.length} 个`);
        res.json({ success: true, diary });
    } catch (error) {
        removeUploadedFiles(files);
        console.error('[多媒体日记创建错误]:', error.message);
        res.status(500).json({ success: false, error: '创建失败，请稍后重试' });
    }
});

/**
 * DELETE /api/diaries/:id - 删除日记
 */
app.delete('/api/diaries/:id', authMiddleware, async (req, res) => {
    try {
        const checkRes = await pool.query(
            'SELECT id FROM diaries WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '日记不存在或不属于你' });
        }

        const mediaRows = await getDiaryMedia(req.params.id);
        await pool.query('DELETE FROM diaries WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        removeDiaryMediaFiles(mediaRows);
        console.log(`[日记] 用户 ${req.user.username} 删除了日记 ID:${req.params.id}`);
        res.json({ success: true, message: '删除成功' });

    } catch (error) {
        console.error('[日记删除错误]:', error.message);
        res.status(500).json({ success: false, error: '删除失败，请稍后重试' });
    }
});

/**
 * PUT /api/diaries/:id - 编辑日记
 */
app.put('/api/diaries/:id', authMiddleware, async (req, res) => {
    try {
        const { title, content } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, error: '标题不能为空' });
        }
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: '内容不能为空' });
        }

        const checkRes = await pool.query(
            'SELECT id FROM diaries WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '日记不存在或不属于你' });
        }

        const cleanTitle = title.trim();
        const cleanContent = content.trim();
        const { storedContent } = await maybeCompressDiaryContent(cleanContent);

        const dbRes = await pool.query(
            'UPDATE diaries SET title = $1, content = $2 WHERE id = $3 AND user_id = $4 RETURNING id, title, content, summary, is_public, created_at',
            [cleanTitle, storedContent, req.params.id, req.user.id]
        );

        console.log(`[日记] 用户 ${req.user.username} 编辑了日记 ID:${req.params.id}`);
        res.json({ success: true, diary: { ...dbRes.rows[0], content: cleanContent } });

    } catch (error) {
        console.error('[日记编辑错误]:', error.message);
        res.status(500).json({ success: false, error: '编辑失败，请稍后重试' });
    }
});

/**
 * PUT /api/diaries/:id/public - 切换公开/私有
 */
app.put('/api/diaries/:id/public', authMiddleware, async (req, res) => {
    try {
        const checkRes = await pool.query(
            'SELECT id, is_public FROM diaries WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '日记不存在或不属于你' });
        }

        const newPublic = !checkRes.rows[0].is_public;
        await pool.query(
            'UPDATE diaries SET is_public = $1 WHERE id = $2 AND user_id = $3',
            [newPublic, req.params.id, req.user.id]
        );

        console.log(`[日记] 用户 ${req.user.username} ${newPublic ? '公开了' : '取消了公开'} 日记 ID:${req.params.id}`);
        res.json({ success: true, is_public: newPublic });

    } catch (error) {
        console.error('[公开切换错误]:', error.message);
        res.status(500).json({ success: false, error: '操作失败，请稍后重试' });
    }
});

/**
 * GET /api/diaries/community - 获取所有公开日记（驴友社区）
 */
/**
 * 通用快速排序算法 (用于日记推荐排序)
 */
function diaryQuickSort(arr, compareFn) {
    if (arr.length <= 1) return arr;
    const pivot = arr[Math.floor(arr.length / 2)];
    const left = arr.filter(x => compareFn(x, pivot) < 0);
    const middle = arr.filter(x => compareFn(x, pivot) === 0);
    const right = arr.filter(x => compareFn(x, pivot) > 0);
    return [...diaryQuickSort(left, compareFn), ...middle, ...diaryQuickSort(right, compareFn)];
}

/**
 * GET /api/diaries/community - 获取社区日记列表（支持热度、评分、兴趣度排序）
 */
app.get('/api/diaries/community', async (req, res) => {
    try {
        const { sortType = 'new', dest } = req.query;

        // 1. 基础查询
        let query = `
            SELECT d.id, d.title, d.content, d.summary, d.style, d.scenic_spot, d.spot_tags, 
                   d.view_count, d.rating_avg, d.rating_count, d.is_ai_generated, 
                   d.created_at, u.username
            FROM diaries d
            JOIN users u ON d.user_id = u.id
            WHERE d.is_public = TRUE
        `;
        const params = [];

        if (dest && dest.trim()) {
            // 使用 ILIKE 进行模糊匹配，支持普通字段和数组内的每一个元素
            query += ` AND (d.scenic_spot ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(d.spot_tags) t WHERE t ILIKE $1))`;
            params.push(`%${dest.trim()}%`);
        }

        const dbRes = await pool.query(query, params);
        let diaries = dbRes.rows;

        // 2. 排序算法实现
        if (sortType === 'hot') {
            diaries = diaryQuickSort(diaries, (a, b) => b.view_count - a.view_count);
        } else if (sortType === 'rating') {
            diaries = diaryQuickSort(diaries, (a, b) => {
                if (parseFloat(b.rating_avg) !== parseFloat(a.rating_avg))
                    return parseFloat(b.rating_avg) - parseFloat(a.rating_avg);
                return b.rating_count - a.rating_count;
            });
        } else if (sortType === 'interest') {
            const authHeader = req.headers.authorization;
            let userTags = new Set();
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    if (decoded) {
                        const userHistoryRes = await pool.query(
                            'SELECT spot_tags FROM diaries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
                            [decoded.id]
                        );
                        userHistoryRes.rows.forEach(row => {
                            if (row.spot_tags) row.spot_tags.forEach(t => userTags.add(t));
                        });
                    }
                } catch (e) { /* token 无效，忽略 */ }
            }
            diaries = diaryQuickSort(diaries, (a, b) => {
                const getScore = (d) => {
                    let score = d.view_count * 0.1 + parseFloat(d.rating_avg) * 2;
                    if (userTags.size > 0 && d.spot_tags) {
                        const matchCount = d.spot_tags.filter(t => userTags.has(t)).length;
                        score += matchCount * 5;
                    }
                    return score;
                };
                return getScore(b) - getScore(a);
            });
        } else {
            diaries = diaryQuickSort(diaries, (a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        const data = await enrichDiaryRows(diaries.slice(0, 50));
        res.json({ success: true, data });

    } catch (error) {
        console.error('[社区日记排序错误]:', error.message);
        res.status(500).json({ success: false, error: '获取日记列表失败' });
    }
});

/**
 * GET /api/diaries/search - 日记搜索（标签匹配 + BM 全文检索）
 * 查询参数: keyword, style, scenicSpot
 * 标签匹配优先，BM 内容检索走 C 引擎
 */
app.get('/api/diaries/search', async (req, res) => {
    try {
        const keyword = sanitizeDiarySearchInput(req.query.keyword, 'keyword');
        const style = sanitizeDiarySearchInput(req.query.style, 'style');
        const scenicSpot = sanitizeDiarySearchInput(req.query.scenicSpot, 'scenicSpot');

        if (!keyword && !style && !scenicSpot) {
            return res.status(400).json({ success: false, error: '请提供至少一个搜索条件' });
        }

        let tagResults = [];

        if (style || scenicSpot) {
            const conditions = ['d.is_public = TRUE'];
            const params = [];
            let paramIdx = 1;

            if (style && style !== '默认') {
                // 移除之前的 OR d.style = '默认'，实现精确风格匹配
                conditions.push(`d.style = $${paramIdx}`);
                params.push(style);
                paramIdx++;
            }
            if (scenicSpot && scenicSpot !== '默认') {
                // 同时支持模糊匹配旧的 scenic_spot 字段和新的 spot_tags 数组中的元素
                conditions.push(`(d.scenic_spot ILIKE $${paramIdx} ESCAPE '\\' OR EXISTS (SELECT 1 FROM unnest(d.spot_tags) t WHERE t ILIKE $${paramIdx} ESCAPE '\\'))`);
                params.push(`%${escapeLikePattern(scenicSpot)}%`);
                paramIdx++;
            }

            const whereClause = conditions.join(' AND ');
            const tagRes = await pool.query(
                `SELECT d.id, d.title, d.content, d.summary, d.style, d.scenic_spot, d.spot_tags, d.view_count, d.rating_avg, d.is_ai_generated, d.created_at, u.username
                 FROM diaries d JOIN users u ON d.user_id = u.id
                 WHERE ${whereClause}
                 ORDER BY d.created_at DESC LIMIT 50`,
                params
            );

            tagResults = tagRes.rows.map(row => ({
                ...row,
                matchType: 'tag',
                matchScore: (row.style === style ? 3 : 0) + (String(row.scenic_spot || '').includes(scenicSpot || '') ? 3 : 0)
            }));
        }

        let bmResults = [];

        if (keyword && keyword.trim()) {
            const allDiaries = await pool.query(
                `SELECT d.id, d.title, d.content, d.summary, d.style, d.scenic_spot, d.is_ai_generated, d.created_at, u.username
                 FROM diaries d JOIN users u ON d.user_id = u.id
                 WHERE d.is_public = TRUE
                 ORDER BY d.created_at DESC LIMIT 200`
            );

            if (allDiaries.rows.length > 0) {
                const searchableDiaries = await mapWithConcurrency(allDiaries.rows, 4, async (row) => ({
                    ...row,
                    content: await maybeDecompressDiaryContent(row.content)
                }));

                try {
                    let payload = `keyword=${encodeURIComponent(normalizeSearchComparable(keyword))}\n`;
                    for (const d of searchableDiaries) {
                        const cleanTitle = truncateUtf8Bytes(normalizeSearchComparable(d.title).replace(/[|\r\n]/g, ' '), 240);
                        const cleanContent = truncateUtf8Bytes(normalizeSearchComparable(d.content).replace(/[|\r\n]/g, ' '), 3800);
                        const cleanStyle = truncateUtf8Bytes(normalizeSearchComparable(d.style || '默认').replace(/[|\r\n]/g, ' '), 60);
                        const cleanSpot = truncateUtf8Bytes(normalizeSearchComparable(d.scenic_spot || '默认').replace(/[|\r\n]/g, ' '), 120);
                        payload += `${d.id}|${cleanTitle}|${cleanContent}|${cleanStyle}|${cleanSpot}\n`;
                    }

                    const algoData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/diarySearch`, {
                        method: 'POST',
                        body: payload,
                        signal: AbortSignal.timeout(5000)
                    });

                    if (algoData.results && algoData.results.length > 0) {
                        const diaryMap = new Map(searchableDiaries.map(d => [d.id, d]));
                        bmResults = algoData.results
                            .map(r => {
                                const d = diaryMap.get(r.id);
                                if (!d) return null;
                                return {
                                    id: d.id,
                                    title: d.title,
                                    content: d.content,
                                    summary: d.summary,
                                    style: d.style,
                                    scenic_spot: d.scenic_spot,
                                    is_ai_generated: d.is_ai_generated,
                                    created_at: d.created_at,
                                    username: d.username,
                                    matchType: 'content',
                                    matchScore: r.matchScore || 1
                                };
                            })
                            .filter(Boolean);
                    }
                } catch (e) {
                    console.warn('[日记搜索] C引擎不可用，使用 Node BM 兜底:', e.message);
                    bmResults = searchableDiaries
                        .map(d => ({
                            d,
                            matchScore: scoreDiaryByBm(d, keyword)
                        }))
                        .filter(item => item.matchScore > 0)
                        .sort((a, b) => b.matchScore - a.matchScore)
                        .slice(0, 50)
                        .map(({ d, matchScore }) => ({
                            id: d.id,
                            title: d.title,
                            content: d.content,
                            summary: d.summary,
                            style: d.style,
                            scenic_spot: d.scenic_spot,
                            is_ai_generated: d.is_ai_generated,
                            created_at: d.created_at,
                            username: d.username,
                            matchType: 'content',
                            matchScore
                        }));
                }
            }
        }

        const mergedMap = new Map();
        for (const r of tagResults) {
            mergedMap.set(r.id, { ...r, matchType: 'tag' });
        }
        for (const r of bmResults) {
            if (mergedMap.has(r.id)) {
                const existing = mergedMap.get(r.id);
                existing.matchType = 'tag+content';
                existing.matchScore = (existing.matchScore || 0) + (r.matchScore || 0);
            } else {
                mergedMap.set(r.id, r);
            }
        }

        const results = Array.from(mergedMap.values())
            .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
            .slice(0, 50);

        const enrichedResults = await enrichDiaryRows(results);
        res.json({ success: true, data: enrichedResults, total: enrichedResults.length });

    } catch (error) {
        if (error instanceof SearchInputRejectedError) {
            return res.status(error.status).json({
                success: false,
                error: error.message,
                code: error.code,
                reasons: error.reasons
            });
        }
        console.error('[日记搜索错误]:', error.message);
        res.status(500).json({ success: false, error: '搜索失败，请稍后重试' });
    }
});

/**
 * POST /api/ai/photo-guidance - 获取景点拍照姿势指导
 */
app.post('/api/ai/photo-guidance', authMiddleware, async (req, res) => {
    try {
        const { spotName, spotStyle, clothing, makeup, weather } = req.body;
        if (!spotName) {
            return res.status(400).json({ success: false, error: '景点名称不能为空' });
        }

        // 1. 联网搜索最新的景点拍照攻略
        const searchQuery = `${spotName} 最佳拍照点 摄影攻略 2026`;
        const searchResults = await searchTavily(searchQuery);

        const poseKeywordHint = poseImages.length
            ? `\n        5. 姿势描述尽量使用这些关键词（用于匹配图片）：${poseImages.map(p => p.keyword).filter(Boolean).slice(0, 20).join('、')}。`
            : '';

        const systemPrompt = `你是一个拥有实时联网能力的专业旅拍策划师。
        请结合【联网搜索到的实时攻略】、景点特征、用户的【服装】、【妆造】以及当前【天气】，给出极具针对性的拍照建议。
        【要求】
        1. 必须优先参考搜索结果中的具体打卡位置（如：某棵树、某个窗户、某段围墙）。
        2. 必须根据用户的服装和妆造风格给出匹配的动作建议。
        3. 字数控制在200-300字之间，包含：2-3个具体打卡位、具体动作示例。
        4. 使用连贯的段落，不要使用列表。${poseKeywordHint}`;

        let context = `景点名称：${spotName}${spotStyle ? `，风格类型：${spotStyle}` : ''}。`;
        if (clothing) context += ` 顾客服装：${clothing}。`;
        if (makeup) context += ` 妆造风格：${makeup}。`;
        if (weather) context += ` 当前天气：${weather}。`;

        if (searchResults) {
            context += `\n【最新联网搜索参考信息】：\n${searchResults}`;
        }

        const prompt = `${context}\n\n请根据以上信息，为我规划这组旅拍的深度拍照姿势和构图建议。`;

        const guidance = await callAI(prompt, { systemPrompt, maxTokens: 800 });

        const guidanceText = typeof guidance === 'string' ? guidance : '';
        const matchedPoseImages = poseImages.filter(p => {
            const kw = typeof p?.keyword === 'string' ? p.keyword.trim() : '';
            if (!kw) return false;
            return guidanceText.includes(kw);
        });

        const pose_images = (matchedPoseImages.length > 0 ? matchedPoseImages : poseImages).slice(0, 6);

        res.json({ success: true, data: guidanceText, pose_images });
    } catch (error) {
        console.error('[AI拍照指导错误]:', error.message);
        res.status(500).json({ success: false, error: '生成指导失败，请稍后重试' });
    }
});

/**
 * POST /api/diaries/prefill-tags
 * 从轨迹描述中预填景点和风格标签（支持多标签）
 */
app.post('/api/diaries/prefill-tags', authMiddleware, async (req, res) => {
    try {
        const { trajectory } = req.body;
        if (!trajectory) {
            return res.json({ success: true, data: { spots: [], styles: [] } });
        }

        // 1. 获取所有 POI 候选 (增加到 1000 个，确保覆盖更多景点)
        const dbRes = await pool.query('SELECT name, style FROM pois ORDER BY hotness DESC LIMIT 1000');
        const allPois = dbRes.rows;

        const foundSpots = new Set();
        const foundStyles = new Set();

        // 2. 匹配逻辑：检查轨迹中是否包含 POI 名称
        for (const poi of allPois) {
            // 简单的包含匹配
            if (poi.name && trajectory.includes(poi.name)) {
                foundSpots.add(poi.name);
                if (poi.style && poi.style !== '默认') {
                    poi.style.split(/[,，]/).forEach(s => {
                        const cleanS = s.trim();
                        if (cleanS) foundStyles.add(cleanS);
                    });
                }
            } else if (poi.name && poi.name.length > 2) {
                // 模糊匹配：如果轨迹包含景点名的核心部分（如“颐和园”匹配“北京颐和园”）
                const shortName = poi.name.replace(/^(北京|上海|广州|深圳|西安)/, '').replace(/(公园|景区|遗址|博物馆)$/, '');
                if (shortName.length >= 2 && trajectory.includes(shortName)) {
                    foundSpots.add(poi.name);
                    if (poi.style && poi.style !== '默认') {
                        poi.style.split(/[,，]/).forEach(s => {
                            const cleanS = s.trim();
                            if (cleanS) foundStyles.add(cleanS);
                        });
                    }
                }
            }
        }

        // 3. 兜底策略：如果通过名字没匹配到，尝试用正则匹配“已游览了...计划前往...”等结构
        if (foundSpots.size === 0) {
            const regex = /(?:已游览了|计划前往|到达|去过|参观了)([^，。、,.]+)/g;
            let match;
            while ((match = regex.exec(trajectory)) !== null) {
                const names = match[1].split(/[、,]/);
                names.forEach(n => {
                    const cleanN = n.trim();
                    if (cleanN && cleanN.length > 1 && cleanN.length < 20) {
                        foundSpots.add(cleanN);
                    }
                });
            }
        }

        console.log(`[标签预填] 轨迹: ${trajectory.substring(0, 30)}... -> 景点: ${Array.from(foundSpots)}, 风格: ${Array.from(foundStyles)}`);

        res.json({
            success: true,
            data: {
                spots: Array.from(foundSpots).slice(0, 8), // 最多返回 8 个景点
                styles: Array.from(foundStyles).slice(0, 5) // 最多返回 5 个风格
            }
        });

    } catch (error) {
        console.error('[标签预填错误]:', error.message);
        res.status(500).json({ success: false, error: '预填失败' });
    }
});

/**
 * POST /api/diaries/generate - AI 生成日记并自动保存
 */
app.post('/api/diaries/generate', authMiddleware, async (req, res) => {
    try {
        const { error, value } = aiDiarySchema.validate(normalizeAIDiaryInput(req.body));
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }
        const diary = await createAIDiary(req.user, value);
        console.log(`[AI日记] 用户 ${req.user.username} 生成并保存了日记: ${diary.title}`);
        res.json({ success: true, diary });
    } catch (error) {
        console.error('[AI日记生成错误]:', error.message);
        res.status(500).json({
            success: false,
            error: error.message.includes('AI') ? error.message : '生成失败，请稍后重试'
        });
    }
});

/**
 * POST /api/diaries/generate-with-media - 上传图片并生成 AI 日记
 */
app.post('/api/diaries/generate-with-media', authMiddleware, runDiaryMediaUpload, async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    try {
        const mediaError = validateAIDiaryImageFiles(files);
        if (mediaError) {
            removeUploadedFiles(files);
            return res.status(400).json({ success: false, error: mediaError });
        }

        const { error, value } = aiDiarySchema.validate(normalizeAIDiaryInput(req.body, files));
        if (error) {
            removeUploadedFiles(files);
            return res.status(400).json({ success: false, error: error.details[0].message });
        }

        const diary = await createAIDiary(req.user, value, files);
        console.log(`[AI多媒体日记] 用户 ${req.user.username} 生成并保存了日记: ${diary.title}`);
        res.json({ success: true, diary });
    } catch (error) {
        removeUploadedFiles(files);
        console.error('[AI多媒体日记生成错误]:', error.message);
        res.status(500).json({
            success: false,
            error: error.message.includes('AI') ? error.message : '生成失败，请稍后重试'
        });
    }
});

/**
 * GET /api/recommend
 * 优先C引擎，失败时Node.js直接排序（fallback）
 */
app.get('/api/recommend', async (req, res) => {
    try {
        const { lat, lng, sortType } = req.query;
        const userLat = parseFloat(lat) || 39.9;
        const userLng = parseFloat(lng) || 116.4;
        const sort = sortType === 'distance' ? 'distance' : 'hotness';

        const dbRes = await pool.query('SELECT id, name, lat, lng, hotness, style, tags, description, category, address, ticket, rating_avg FROM pois');
        const allPois = dbRes.rows;
        allPois.forEach(assignPoiMeta);

        if (allPois.length === 0) {
            return res.json({ success: true, data: [] });
        }

        let finalData = null;

        try {
            let payloadText = `${userLat} ${userLng} ${sort}\n`;
            allPois.forEach(p => {
                payloadText += `${p.id} ${p.lat} ${p.lng} ${p.hotness}\n`;
            });

            const algoData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/compute`, {
                method: 'POST',
                body: payloadText,
                signal: AbortSignal.timeout(3000)
            });

            if (algoData.data && Array.isArray(algoData.data) && algoData.data.length > 0) {
                finalData = algoData.data.map(item => {
                    const dbPoi = allPois.find(p => p.id === item.id);
                    return {
                        ...item,
                        ...dbPoi,
                        name: (dbPoi && dbPoi.name && !dbPoi.name.includes('?')) ? dbPoi.name : item.name
                    };
                });
                console.log(`[推荐] C引擎成功 sort=${sort} top=${finalData.length}`);
            }
        } catch (e) {
            console.warn(`[推荐] C引擎不可用，使用数据库排序: ${e.message}`);
        }

        if (!finalData) {
            finalData = topKSort(allPois, userLat, userLng, sort, 10);
            console.log(`[推荐] Node.js fallback sort=${sort} top=${finalData.length}`);
        }

        res.json({ success: true, data: finalData });

    } catch (error) {
        console.error('[网关错误]:', error.message);
        res.status(500).json({ success: false, error: '后端服务异常' });
    }
});

/**
 * GET /api/foods?lat=39.9&lng=116.4&sortType=rating&cuisine=川菜
 * 美食推荐：利用 topK 算法返回 Top-10 美食
 * sortType: rating(评分) | hotness(热度) | distance(距离) | composite(距离90%+评分10%)
 * cuisine: 可选，按菜系过滤
 * 默认使用 composite 排序
 */
app.get('/api/foods', async (req, res) => {
    try {
        const { lat, lng, sortType, cuisine } = req.query;
        const userLat = parseFloat(lat) || 39.9;
        const userLng = parseFloat(lng) || 116.4;
        const sort = sortType;

        let sql = 'SELECT id, name, cuisine, lat, lng, hotness, address, district, price_level, rating, avg_price FROM foods';
        const params = [];
        if (cuisine && cuisine !== '全部') {
            sql += ' WHERE cuisine = $1';
            params.push(cuisine);
        }
        const dbRes = await pool.query(sql, params);
        const allFoods = dbRes.rows;

        if (allFoods.length === 0) {
            return res.json({ success: true, data: [] });
        }

        allFoods.forEach(assignFoodMeta);

        const maxDist = Math.max(...allFoods.map(item => haversineDistance(userLat, userLng, item.lat, item.lng)), 0.01);

        const scored = allFoods.map(item => {
            const dist = haversineDistance(userLat, userLng, item.lat, item.lng);
            let score;
            if (sort === 'composite') {
                score = 0.8 * (dist / maxDist) - 0.1 * (item.rating / 5.0);
            } else if (sort === 'rating') {
                score = -item.rating;
            } else if (sort === 'hotness') {
                score = -item.hotness;
            } else {
                score = dist;
            }
            return { ...item, distance: Math.round(dist * 100) / 100, _score: score };
        });

        scored.sort((a, b) => a._score - b._score);
        const result = scored.slice(0, 10).map(({ _score, ...rest }) => rest);

        console.log(`[美食推荐] sort=${sort} top=${result.length}`);
        res.json({ success: true, data: result });

    } catch (error) {
        console.error('[美食推荐错误]:', error.message);
        res.status(500).json({ success: false, error: '获取美食推荐失败' });
    }
});

/**
 * GET /api/foods/nearby?lat=39.9&lng=116.4&radius=3&style=古风
 * 推荐附近美食：距离80%+风格10%+评分10%排序
 */
app.get('/api/foods/nearby', async (req, res) => {
    try {
        const { lat, lng, radius, style } = req.query;
        const centerLat = parseFloat(lat);
        const centerLng = parseFloat(lng);
        const r = parseFloat(radius) || 3;
        const anchorStyle = style || '';

        if (!centerLat || !centerLng) {
            return res.status(400).json({ success: false, error: '需要 lat 和 lng 参数' });
        }

        const dbRes = await pool.query('SELECT id, name, cuisine, lat, lng, hotness, address, district, price_level, rating, avg_price FROM foods');
        const allFoods = dbRes.rows;
        allFoods.forEach(assignFoodMeta);

        const anchorLat = parseFloat(lat) || 39.9;
        const withDist = allFoods
            .map(item => ({
                ...item,
                distance: Math.round(haversineDistance(centerLat, centerLng, item.lat, item.lng) * 100) / 100
            }))
            .filter(item => item.distance <= r);

        const maxDist = Math.max(...withDist.map(item => item.distance), 0.01);

        const nearby = withDist
            .map(item => {
                const s = scoreFood(item, centerLat, centerLng, anchorStyle, maxDist);
                return { ...item, _score: s._score };
            })
            .sort((a, b) => a._score - b._score)
            .slice(0, 10)
            .map(({ _score, ...rest }) => rest);

        console.log(`[附近美食] center=(${centerLat},${centerLng}) radius=${r}km style=${anchorStyle} found=${nearby.length}`);
        res.json({ success: true, data: nearby });

    } catch (error) {
        console.error('[附近美食错误]:', error.message);
        res.status(500).json({ success: false, error: '查询附近美食失败' });
    }
});

/**
 * POST /api/smartItinerary
 * 多位一体推荐算法：基于已规划路线，推荐用餐时段美食 + 首景点旅拍服务
 * body: { spots: [{lat,lng,name}], startHour: 8 }
 * - 每个景点默认2h游览
 * - 用餐时段：早7-10 / 午11-14 / 晚17-20 / 夜22-24
 * - 在对应时段所在景点附近推荐美食（距离80%+风格10%+评分10%排序）
 * - 在第一个景点附近推荐旅拍服务
 * - 返回融合后的完整时间轴（景点+美食+旅拍按时间排列）
 */
app.post('/api/smartItinerary', async (req, res) => {
    try {
        const { spots, startHour } = req.body;
        if (!spots || !Array.isArray(spots) || spots.length === 0) {
            return res.status(400).json({ success: false, error: '需要 spots 数组' });
        }

        const start = parseInt(startHour) || 8;
        const SPOT_DURATION = 2;
        const MEAL_DURATION = 2;
        const TRAVEL_PHOTO_DURATION = 3;

        const mealWindows = [
            { key: 'breakfast', label: '早餐', start: 7, end: 10 },
            { key: 'lunch', label: '午餐', start: 11, end: 14 },
            { key: 'dinner', label: '晚餐', start: 17, end: 20 },
            { key: 'midnight', label: '夜宵', start: 22, end: 24 }
        ];

        const dbFoods = await pool.query('SELECT id, name, cuisine, lat, lng, hotness, address, district, price_level, rating, avg_price FROM foods');
        const allFoods = dbFoods.rows;
        allFoods.forEach(assignFoodMeta);

        const dbServices = await pool.query('SELECT id, type, name, lat, lng, hotness FROM travel_services');
        const allServices = dbServices.rows;

        let travelPhotoService = null;
        if (spots.length > 0 && allServices.length > 0) {
            const firstSpot = spots[0];
            const sortedServices = allServices
                .map(s => ({
                    ...s,
                    distance: Math.round(haversineDistance(firstSpot.lat, firstSpot.lng, s.lat, s.lng) * 100) / 100
                }))
                .sort((a, b) => a.distance - b.distance);

            if (sortedServices.length > 0) {
                travelPhotoService = {
                    ...sortedServices[0],
                    duration: TRAVEL_PHOTO_DURATION,
                    anchorSpot: firstSpot.name
                };
            }
        }

        const events = [];
        let currentHour = start;

        if (travelPhotoService) {
            events.push({
                type: 'photo',
                name: `旅拍：${travelPhotoService.name}`,
                startHour: currentHour,
                endHour: currentHour + TRAVEL_PHOTO_DURATION,
                startLabel: formatHour(currentHour),
                endLabel: formatHour(currentHour + TRAVEL_PHOTO_DURATION),
                data: travelPhotoService
            });
            currentHour += TRAVEL_PHOTO_DURATION;
        }

        const mealRecommendations = [];

        for (let i = 0; i < spots.length; i++) {
            const spot = spots[i];
            const spotStart = currentHour;
            const spotEnd = currentHour + SPOT_DURATION;

            const spotStyle = spot.style || '';

            const overlappingMeals = mealWindows.filter(mw => {
                const mealMid = (mw.start + mw.end) / 2;
                return mealMid > spotStart && mealMid < spotEnd + SPOT_DURATION && mealMid >= start;
            });

            for (const mw of overlappingMeals) {
                const alreadyRecommended = mealRecommendations.some(mr => mr.mealKey === mw.key);
                if (alreadyRecommended) continue;

                const nearbyFoods = allFoods
                    .map(f => {
                        const s = scoreFood(f, spot.lat, spot.lng, spotStyle, 0);
                        return { ...f, distance: s.distance };
                    })
                    .filter(f => f.distance <= 5);

                if (nearbyFoods.length === 0) continue;

                const maxDist = Math.max(...nearbyFoods.map(f => f.distance), 0.01);
                const topFood = nearbyFoods
                    .map(f => {
                        const s = scoreFood(f, spot.lat, spot.lng, spotStyle, maxDist);
                        return { ...f, _score: s._score };
                    })
                    .sort((a, b) => a._score - b._score)[0];

                const { _score, ...foodData } = topFood;

                mealRecommendations.push({
                    mealKey: mw.key,
                    mealLabel: mw.label,
                    timeSlot: `${mw.start}:00-${mw.end}:00`,
                    duration: MEAL_DURATION,
                    anchorSpot: spot.name,
                    food: foodData
                });

                events.push({
                    type: 'meal',
                    name: `${mw.label}：${foodData.name}`,
                    startHour: currentHour,
                    endHour: currentHour + MEAL_DURATION,
                    startLabel: formatHour(currentHour),
                    endLabel: formatHour(currentHour + MEAL_DURATION),
                    data: { ...foodData, mealKey: mw.key, mealLabel: mw.label }
                });
                currentHour += MEAL_DURATION;
            }

            events.push({
                type: 'spot',
                name: spot.name,
                startHour: currentHour,
                endHour: currentHour + SPOT_DURATION,
                startLabel: formatHour(currentHour),
                endLabel: formatHour(currentHour + SPOT_DURATION),
                data: spot
            });
            currentHour += SPOT_DURATION;
        }

        const finalEndHour = currentHour;
        const totalHours = finalEndHour - start;
        const endHourOnClock = finalEndHour % 24;
        const isOvernight = finalEndHour >= 24;
        const isLateNight = finalEndHour >= 27;
        const warning = isLateNight
            ? `行程结束于${formatHour(finalEndHour)}，建议减少景点数量或提前出发，避免熬夜`
            : isOvernight
                ? `行程跨越至${formatHour(finalEndHour)}，请注意休息`
                : null;

        console.log(`[多位一体] spots=${spots.length} meals=${mealRecommendations.length} photo=${travelPhotoService ? 'yes' : 'no'} total=${totalHours}h end=${formatHour(finalEndHour)}`);
        res.json({
            success: true,
            data: {
                events,
                mealRecommendations,
                travelPhotoService,
                totalHours,
                startHour: start,
                endHour: finalEndHour,
                endLabel: formatHour(finalEndHour),
                isOvernight,
                warning
            }
        });

    } catch (error) {
        console.error('[多位一体错误]:', error.message, error.stack);
        res.status(500).json({ success: false, error: '多位一体推荐失败: ' + error.message });
    }
});

/**
 * GET /api/styleRecommend?style=古风&lat=39.9&lng=116.4&count=5
 * 按风格推荐景点：优先C引擎，失败时Node.js fallback
 */
app.get('/api/styleRecommend', async (req, res) => {
    try {
        const { style, lat, lng, count } = req.query;
        if (!style || !style.trim()) {
            return res.status(400).json({ success: false, error: '请选择风格' });
        }
        const userLat = parseFloat(lat) || 39.9;
        const userLng = parseFloat(lng) || 116.4;
        const k = Math.min(Math.max(parseInt(count) || 5, 1), 8);

        const dbRes = await pool.query('SELECT id, name, lat, lng, hotness, style, description FROM pois WHERE style = $1', [style.trim()]);
        const stylePois = dbRes.rows;
        stylePois.forEach(assignPoiMeta);

        if (stylePois.length === 0) {
            return res.json({ success: true, data: [], order: [] });
        }

        let finalData = null;

        try {
            let payloadText = `${userLat} ${userLng} ${style.trim()} ${k}\n`;
            stylePois.forEach(p => {
                payloadText += `${p.id} ${p.lat} ${p.lng} ${p.hotness} ${p.style || ''}\n`;
            });

            const algoData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/styleRecommend`, {
                method: 'POST',
                body: payloadText,
                signal: AbortSignal.timeout(5000)
            });

            if (algoData.order && Array.isArray(algoData.order) && algoData.order.length > 0) {
                const poiMap = new Map(stylePois.map(p => [p.id, p]));
                finalData = algoData.order.map(item => {
                    const dbPoi = poiMap.get(item.id);
                    return {
                        ...item,
                        ...dbPoi,
                        name: dbPoi?.name || ''
                    };
                });
                console.log(`[风格推荐] C引擎成功 style=${style} k=${k} results=${finalData.length}`);
            }
        } catch (e) {
            console.error(`[风格推荐] C引擎不可用: ${e.message}`);
            return res.status(503).json({ success: false, error: '推荐服务暂时不可用' });
        }

        res.json({ success: true, data: finalData });

    } catch (error) {
        console.error('[风格推荐错误]:', error.message);
        res.status(500).json({ success: false, error: '推荐失败，请稍后重试' });
    }
});

/**
 * GET /api/styles
 * 获取所有可用的风格标签
 */
app.get('/api/styles', async (req, res) => {
    try {
        const dbRes = await pool.query("SELECT DISTINCT style FROM pois WHERE style IS NOT NULL AND style != '' AND style NOT LIKE '校园%' ORDER BY style");
        const styles = dbRes.rows.map(r => r.style);
        res.json({ success: true, data: styles });
    } catch (error) {
        console.error('[风格列表错误]:', error.message);
        res.status(500).json({ success: false, error: '获取风格列表失败' });
    }
});

/**
 * GET /api/contentRecommend - 个性化内容推荐
 * 综合用户风格偏好、距离偏好、已访问历史进行推荐
 */
app.get('/api/contentRecommend', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { lat, lng, count } = req.query;
        const userLat = parseFloat(lat) || 39.9;
        const userLng = parseFloat(lng) || 116.4;
        const k = Math.min(Math.max(parseInt(count) || 5, 1), 20);

        /* 并行获取：用户偏好、已访问景点、所有景点 */
        const [prefRes, visitRes, poiRes, paramsRes] = await Promise.all([
            pool.query('SELECT style, weight FROM user_preferences WHERE user_id = $1', [userId]),
            pool.query('SELECT poi_id FROM user_visit_history WHERE user_id = $1', [userId]),
            pool.query("SELECT id, name, lat, lng, hotness, style, tags, description, category, address, ticket, rating_avg FROM pois WHERE style IS NOT NULL AND style != '' AND style NOT LIKE '校园%'"),
            pool.query('SELECT preferred_distance, preferred_count FROM user_preference_params WHERE user_id = $1', [userId])
        ]);

        const preferences = prefRes.rows;
        const visitedIds = visitRes.rows.map(r => r.poi_id);
        const pois = poiRes.rows;
        const params = paramsRes.rows[0] || { preferred_distance: 10.0, preferred_count: 5 };
        const hasHistory = preferences.length > 0 || visitedIds.length > 0;

        if (pois.length === 0) {
            return res.json({ success: true, data: [], preferences, personalMessage: '数据库暂无可推荐景点。', hasHistory });
        }

        /* 构造 C 服务请求体 */
        let payloadText = `${userLat} ${userLng} ${k} ${params.preferred_distance} ${params.preferred_count}\n`;

        /* 第二行：用户偏好风格 style:weight
         * 优先使用显式偏好，否则从访问历史自动推断：
         * 统计用户去过的景点的风格分布，按频率计算权重 */
        let styleLine = '';
        if (preferences.length > 0) {
            styleLine = preferences.map(p => `${p.style}:${p.weight}`).join(' ');
        } else if (visitedIds.length > 0) {
            /* 从访问历史推断风格偏好 */
            const visitedPois = pois.filter(p => visitedIds.includes(p.id));
            if (visitedPois.length > 0) {
                const styleCounts = {};
                visitedPois.forEach(p => {
                    const s = p.style || '其他';
                    styleCounts[s] = (styleCounts[s] || 0) + 1;
                });
                const maxCount = Math.max(...Object.values(styleCounts));
                styleLine = Object.entries(styleCounts)
                    .map(([s, c]) => `${s}:${(c / maxCount).toFixed(2)}`)
                    .join(' ');
            }
        }
        /* 若无偏好也无历史，使用全局热门风格 */
        if (!styleLine) {
            const hotStyles = {};
            pois.forEach(p => { hotStyles[p.style] = (hotStyles[p.style] || 0) + (p.hotness || 0); });
            const sorted = Object.entries(hotStyles).sort((a, b) => b[1] - a[1]);
            const maxH = sorted[0]?.[1] || 1;
            styleLine = sorted.slice(0, 4).map(([s, h]) => `${s}:${(h / maxH).toFixed(2)}`).join(' ');
        }
        payloadText += styleLine + '\n';

        /* 第三行：已访问景点 ID */
        payloadText += (visitedIds.length > 0 ? visitedIds.join(' ') : '0') + '\n';

        /* 第四行起：景点数据 */
        pois.forEach(p => {
            payloadText += `${p.id} ${p.lat} ${p.lng} ${Math.round(p.hotness || 0)} ${p.style || ''}\n`;
        });

        const buildPersonalMessage = () => {
            if (hasHistory) {
                let topStyle = '';
                if (preferences.length > 0) {
                    const sorted = [...preferences].sort((a, b) => b.weight - a.weight);
                    topStyle = sorted[0].style;
                } else if (visitedIds.length > 0) {
                    const visitedPois = pois.filter(p => visitedIds.includes(p.id));
                    if (visitedPois.length > 0) {
                        const styleCounts = {};
                        visitedPois.forEach(p => { styleCounts[p.style] = (styleCounts[p.style] || 0) + 1; });
                        topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
                    }
                }
                return topStyle
                    ? `根据您以前的行为，您更偏好${topStyle}景点，为您推荐个性化方案`
                    : '根据您以前的行为，为您推荐个性化方案';
            }
            return '系统还不知道您喜欢什么，先用全局热门风格为您兜底推荐。';
        };

        const styleWeights = new Map();
        styleLine.split(/\s+/).filter(Boolean).forEach(pair => {
            const [style, weight] = pair.split(':');
            const n = parseFloat(weight);
            if (style && Number.isFinite(n)) styleWeights.set(style, n);
        });
        const maxWeight = Math.max(1, ...Array.from(styleWeights.values()));
        const preferredDistance = Math.max(parseFloat(params.preferred_distance) || 10, 0.1);
        const visitedSet = new Set(visitedIds.map(String));
        const buildDbFallback = () => {
            return pois.map(p => {
                const distance = haversineDistance(userLat, userLng, Number(p.lat), Number(p.lng));
                const styleScore = (styleWeights.get(p.style) || 0) / maxWeight;
                const distanceScore = Math.max(0, 1 - Math.min(distance / preferredDistance, 1));
                const hotnessScore = Math.min((Number(p.hotness) || 0) / 100, 1);
                const visitedPenalty = visitedSet.has(String(p.id)) ? 0.45 : 0;
                const score = styleScore * 0.45 + distanceScore * 0.3 + hotnessScore * 0.25 - visitedPenalty;
                return {
                    ...p,
                    distance: Math.round(distance * 10) / 10,
                    score: Math.round(score * 1000) / 1000
                };
            })
                .sort((a, b) => b.score - a.score)
                .slice(0, k);
        };

        const poiMap = new Map(pois.map(p => [String(p.id), p]));
        let finalData = [];
        let source = 'database';
        try {
            const algoData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/contentRecommend`, {
                method: 'POST',
                body: payloadText,
                signal: AbortSignal.timeout(5000)
            });

            if (algoData.recommendations && Array.isArray(algoData.recommendations) && algoData.recommendations.length > 0) {
                finalData = algoData.recommendations.map(item => {
                    const dbPoi = poiMap.get(String(item.id));
                    const distance = Number.isFinite(Number(item.distance))
                        ? Math.round(Number(item.distance) * 10) / 10
                        : Math.round(haversineDistance(userLat, userLng, Number(dbPoi?.lat), Number(dbPoi?.lng)) * 10) / 10;
                    return {
                        ...dbPoi,
                        ...item,
                        id: dbPoi?.id || item.id,
                        name: dbPoi?.name || item.name || '',
                        style: dbPoi?.style || item.style || '',
                        distance
                    };
                }).filter(item => item.name);
                source = 'algorithm';
            }
        } catch (algoError) {
            console.warn(`[内容推荐] C服务不可用，使用数据库兜底: ${algoError.message}`);
        }

        if (finalData.length === 0) {
            finalData = buildDbFallback();
            source = 'database';
        }

        const personalMessage = buildPersonalMessage();
        finalData.forEach(assignPoiMeta);
        console.log(`[内容推荐] userId=${userId} k=${k} results=${finalData.length} hasHistory=${hasHistory} source=${source}`);
        res.json({ success: true, data: finalData, preferences, personalMessage, hasHistory, source });
    } catch (error) {
        console.error('[内容推荐错误]:', error.message);
        res.status(500).json({ success: false, error: '推荐失败，请稍后重试' });
    }
});

/**
 * POST /api/userPreference - 更新用户偏好
 * 记录用户对某风格的偏好权重
 */
app.post('/api/userPreference', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { style, weight } = req.body;
        if (!style) {
            return res.status(400).json({ success: false, error: '缺少风格参数' });
        }
        const w = Math.min(Math.max(parseFloat(weight) || 1.0, 0.1), 5.0);

        await pool.query(
            `INSERT INTO user_preferences (user_id, style, weight, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, style) DO UPDATE SET weight = $3, updated_at = NOW()`,
            [userId, style, w]
        );

        res.json({ success: true, message: '偏好已更新' });
    } catch (error) {
        console.error('[用户偏好更新错误]:', error.message);
        res.status(500).json({ success: false, error: '更新偏好失败' });
    }
});

/**
 * POST /api/poiRating - 用户对景点评分
 * 评分以0.1比例平均加/减到初始设定的评分上，对所有用户更新
 */
app.post('/api/poiRating', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { poiId, rating } = req.body;
        if (!poiId || rating === undefined) {
            return res.status(400).json({ success: false, error: '缺少景点ID或评分' });
        }
        const userRating = Math.min(Math.max(parseFloat(rating), 0), 5);
        if (isNaN(userRating)) {
            return res.status(400).json({ success: false, error: '评分格式错误' });
        }

        /* 获取景点初始评分 */
        const poiRes = await pool.query('SELECT base_rating FROM pois WHERE id = $1', [poiId]);
        if (poiRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '景点不存在' });
        }
        const baseRating = parseFloat(poiRes.rows[0].base_rating) || 0;

        /* 插入或更新用户评分 */
        await pool.query(
            `INSERT INTO poi_ratings (user_id, poi_id, rating, created_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, poi_id) DO UPDATE SET rating = $3, created_at = NOW()`,
            [userId, poiId, userRating]
        );

        /* 计算所有用户对该景点的平均评分 */
        const avgRes = await pool.query(
            'SELECT AVG(rating) as avg_rating FROM poi_ratings WHERE poi_id = $1',
            [poiId]
        );
        const avgUserRating = parseFloat(avgRes.rows[0].avg_rating) || 0;

        /* 新评分 = 初始评分 * 0.9 + 用户平均评分 * 0.1 */
        const newRating = Math.round((baseRating * 0.9 + avgUserRating * 0.1) * 10) / 10;
        await pool.query('UPDATE pois SET rating = $1 WHERE id = $2', [newRating, poiId]);

        console.log(`[景点评分] userId=${userId} poiId=${poiId} rating=${userRating} baseRating=${baseRating} avgUserRating=${avgUserRating.toFixed(1)} newRating=${newRating}`);
        res.json({ success: true, rating: newRating, baseRating, avgUserRating: Math.round(avgUserRating * 10) / 10 });
    } catch (error) {
        console.error('[景点评分错误]:', error.message);
        res.status(500).json({ success: false, error: '评分失败' });
    }
});

/**
 * GET /api/poiRating?poiId=123 - 获取景点评分信息
 */
app.get('/api/poiRating', async (req, res) => {
    try {
        const { poiId } = req.query;
        if (!poiId) {
            return res.status(400).json({ success: false, error: '缺少景点ID' });
        }

        const poiRes = await pool.query('SELECT rating, base_rating FROM pois WHERE id = $1', [poiId]);
        if (poiRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: '景点不存在' });
        }

        const avgRes = await pool.query(
            'SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM poi_ratings WHERE poi_id = $1',
            [poiId]
        );

        /* 检查当前用户是否已评分 */
        let myRating = null;
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const user = jwt.verify(token, JWT_SECRET);
                const myRes = await pool.query(
                    'SELECT rating FROM poi_ratings WHERE user_id = $1 AND poi_id = $2',
                    [user.id, poiId]
                );
                if (myRes.rows.length > 0) {
                    myRating = parseFloat(myRes.rows[0].rating);
                }
            } catch (e) { /* 未登录，忽略 */ }
        }

        res.json({
            success: true,
            rating: parseFloat(poiRes.rows[0].rating),
            baseRating: parseFloat(poiRes.rows[0].base_rating),
            avgUserRating: parseFloat(avgRes.rows[0].avg_rating) || 0,
            ratingCount: parseInt(avgRes.rows[0].count) || 0,
            myRating
        });
    } catch (error) {
        console.error('[获取景点评分错误]:', error.message);
        res.status(500).json({ success: false, error: '获取评分失败' });
    }
});

/**
 * POST /api/userVisit - 记录用户访问景点
 * 访问过的景点在推荐时降低优先级
 */
app.post('/api/userVisit', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { poiId } = req.body;
        if (!poiId) {
            return res.status(400).json({ success: false, error: '缺少景点ID' });
        }

        /* 记录访问 */
        await pool.query(
            `INSERT INTO user_visit_history (user_id, poi_id, visit_count, last_visited)
             VALUES ($1, $2, 1, NOW())
             ON CONFLICT (user_id, poi_id) DO UPDATE SET visit_count = user_visit_history.visit_count + 1, last_visited = NOW()`,
            [userId, poiId]
        );

        /* 自动推断并更新风格偏好：查询该景点的风格，增加对应偏好权重 */
        const poiRes = await pool.query('SELECT style FROM pois WHERE id = $1', [poiId]);
        if (poiRes.rows.length > 0 && poiRes.rows[0].style) {
            const style = poiRes.rows[0].style;
            /* 每次访问该风格景点，权重增加 0.2，上限 5.0 */
            await pool.query(
                `INSERT INTO user_preferences (user_id, style, weight, updated_at)
                 VALUES ($1, $2, 1.2, NOW())
                 ON CONFLICT (user_id, style) DO UPDATE SET weight = LEAST(5.0, user_preferences.weight + 0.2), updated_at = NOW()`,
                [userId, style]
            );
        }

        res.json({ success: true, message: '访问已记录' });
    } catch (error) {
        console.error('[用户访问记录错误]:', error.message);
        res.status(500).json({ success: false, error: '记录访问失败' });
    }
});

/**
 * GET /api/userPreference - 获取用户偏好
 */
app.get('/api/userPreference', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const [prefRes, visitRes, paramsRes] = await Promise.all([
            pool.query('SELECT style, weight FROM user_preferences WHERE user_id = $1', [userId]),
            pool.query('SELECT poi_id, visit_count, last_visited FROM user_visit_history WHERE user_id = $1', [userId]),
            pool.query('SELECT preferred_distance, preferred_count FROM user_preference_params WHERE user_id = $1', [userId])
        ]);

        res.json({
            success: true,
            preferences: prefRes.rows,
            visitHistory: visitRes.rows,
            params: paramsRes.rows[0] || { preferred_distance: 10.0, preferred_count: 5 }
        });
    } catch (error) {
        console.error('[获取用户偏好错误]:', error.message);
        res.status(500).json({ success: false, error: '获取偏好失败' });
    }
});

/** GET /api/cuisines — 获取所有菜系列表 */
app.get('/api/cuisines', async (req, res) => {
    try {
        const dbRes = await pool.query('SELECT DISTINCT cuisine FROM foods WHERE cuisine IS NOT NULL ORDER BY cuisine');
        const cuisines = dbRes.rows.map(r => r.cuisine);
        res.json({ success: true, data: cuisines });
    } catch (error) {
        console.error('[菜系列表错误]:', error.message);
        res.status(500).json({ success: false, error: '获取菜系列表失败' });
    }
});

/**
 * 根据交通方式获取理想速度 (km/h)
 */
function getIdealSpeed(transportMode) {
    const speeds = { driving: 60, cycling: 20, walking: 5 };
    return speeds[transportMode] || 60;
}

/**
 * 根据当前时间和道路拥挤区域，计算实际拥挤因子
 * 真实速度 = 拥挤因子 * 理想速度
 */
async function computeCongestionFactor(congestionZones) {
    if (!congestionZones || congestionZones.length === 0) return 1.0;

    const now = new Date();
    // 转为北京时间
    const bjHour = (now.getUTCHours() + 8) % 24;
    const bjDay = now.getUTCDay(); // 0=周日

    try {
        const rules = await pool.query('SELECT * FROM congestion_time_rules');
        let minFactor = 1.0;

        for (const zone of congestionZones) {
            for (const rule of rules.rows) {
                if (rule.zone_tag !== zone) continue;
                // 检查时间
                if (bjHour < rule.hour_start || bjHour >= rule.hour_end) continue;
                // 检查星期
                if (rule.day_of_week && !rule.day_of_week.includes(bjDay)) continue;
                minFactor = Math.min(minFactor, rule.congestion_factor);
            }
        }
        return minFactor;
    } catch (e) {
        return 1.0;
    }
}

/**
 * 查询路径沿途的拥挤因子（综合各段道路的基础拥挤度和时间规则）
 */
async function queryPathCongestionFactor(pathCoords) {
    if (!pathCoords || pathCoords.length < 2) return 1.0;

    // 采样路径中若干点，查询附近道路拥挤度
    const SAMPLE_STEP = Math.max(1, Math.floor(pathCoords.length / 10));
    let totalFactor = 0;
    let sampleCount = 0;

    for (let i = 0; i < pathCoords.length; i += SAMPLE_STEP) {
        const [lng, lat] = pathCoords[i];
        try {
            const nearRoads = await pool.query(`
                SELECT e.base_congestion, e.congestion_zone
                FROM road_edges e
                JOIN road_nodes n ON (e.from_node = n.id OR e.to_node = n.id)
                WHERE n.lat BETWEEN $1 - 0.002 AND $1 + 0.002
                  AND n.lng BETWEEN $2 - 0.002 AND $2 + 0.002
                LIMIT 5
            `, [lat, lng]);

            if (nearRoads.rows.length > 0) {
                const allZones = new Set();
                let avgBase = 0;
                for (const r of nearRoads.rows) {
                    if (r.congestion_zone) r.congestion_zone.forEach(z => allZones.add(z));
                    avgBase += (r.base_congestion || 1.0);
                }
                avgBase /= nearRoads.rows.length;

                let factor = avgBase;
                if (allZones.size > 0) {
                    const timeFactor = await computeCongestionFactor([...allZones]);
                    factor = Math.min(avgBase, timeFactor);
                }
                totalFactor += factor;
                sampleCount++;
            }
        } catch (e) {
            // 跳过
        }
    }

    return sampleCount > 0 ? totalFactor / sampleCount : 1.0;
}

/**
 * 查询路径每个采样点的拥挤度（拥挤度 = 1 - 畅通度）
 * 返回与 pathCoords 等长的数组，每个元素为拥挤度值 (0~1)
 */
async function querySegmentCongestion(pathCoords) {
    if (!pathCoords || pathCoords.length < 2) return pathCoords.map(() => 0);

    const result = new Array(pathCoords.length).fill(0);

    try {
        // 优化：一次性加载所有时间规则，避免每个点重复查询
        const rulesRes = await pool.query('SELECT * FROM congestion_time_rules');
        const allRules = rulesRes.rows;
        const now = new Date();
        const bjHour = (now.getUTCHours() + 8) % 24;
        const bjDay = now.getUTCDay();

        // 批量查询：用 UNION ALL 一次获取所有点附近的道路
        // 每20个点一批，避免 SQL 过长
        const BATCH_SIZE = 20;
        for (let batchStart = 0; batchStart < pathCoords.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, pathCoords.length);
            const batchConditions = [];
            const batchParams = [];

            for (let i = batchStart; i < batchEnd; i++) {
                const [lng, lat] = pathCoords[i];
                batchConditions.push(`(n.lat BETWEEN $${batchParams.length + 1} - 0.003 AND $${batchParams.length + 1} + 0.003 AND n.lng BETWEEN $${batchParams.length + 2} - 0.003 AND $${batchParams.length + 2} + 0.003)`);
                batchParams.push(lat, lng);
            }

            if (batchConditions.length === 0) continue;

            const nearRoads = await pool.query(`
                SELECT n.lat, n.lng, e.base_congestion, e.congestion_zone
                FROM road_edges e
                JOIN road_nodes n ON (e.from_node = n.id OR e.to_node = n.id)
                WHERE ${batchConditions.join(' OR ')}
            `, batchParams);

            // 按坐标点分组匹配结果（容差 0.003）
            for (let i = batchStart; i < batchEnd; i++) {
                const [lng, lat] = pathCoords[i];
                const matched = nearRoads.rows.filter(r =>
                    Math.abs(r.lat - lat) <= 0.003 && Math.abs(r.lng - lng) <= 0.003
                );

                if (matched.length > 0) {
                    const allZones = new Set();
                    let avgBase = 0;
                    for (const r of matched) {
                        if (r.congestion_zone) r.congestion_zone.forEach(z => allZones.add(z));
                        avgBase += (r.base_congestion || 1.0);
                    }
                    avgBase /= matched.length;

                    let factor = avgBase;
                    if (allZones.size > 0) {
                        // 在内存中计算，不再额外查库
                        let minFactor = 1.0;
                        for (const zone of allZones) {
                            for (const rule of allRules) {
                                if (rule.zone_tag !== zone) continue;
                                if (bjHour < rule.hour_start || bjHour >= rule.hour_end) continue;
                                if (rule.day_of_week && !rule.day_of_week.includes(bjDay)) continue;
                                minFactor = Math.min(minFactor, rule.congestion_factor);
                            }
                        }
                        factor = Math.min(avgBase, minFactor);
                    }
                    result[i] = Math.max(0, Math.min(1, 1 - factor));
                }
            }
        }
    } catch (e) {
        console.warn('批量拥挤度查询失败', e.message);
    }

    return result;
}

/**
 * 调用 C 算法服务估算三种交通方式的通行时间
 * 返回 { driving, cycling, walking, turnCount, distance, innerDist, outerDist, congestionFactor }
 */
async function estimateTravelTimeAllModes(pathCoords) {
    if (!pathCoords || pathCoords.length < 2) {
        return { driving: 0, cycling: 0, walking: 0, turnCount: 0, distance: 0, innerDist: 0, outerDist: 0, congestionFactor: 1.0 };
    }

    // 查询路径拥挤因子
    const congestionFactor = process.env.TRAFFIC_ENABLED === 'true' ? await queryPathCongestionFactor(pathCoords) : 1;

    // 调用 C 服务的 /api/travelTime
    try {
        const travelTimeData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/travelTime`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: pathCoords,
                congestionFactor
            })
        });

        const data = travelTimeData;
        if (data.success) {
            return {
                driving: data.driving,
                cycling: data.cycling,
                walking: data.walking,
                turnCount: data.turnCount,
                distance: data.distance,
                innerDist: data.innerDist,
                outerDist: data.outerDist,
                congestionFactor
            };
        }
    } catch (e) {
        console.error('[travelTime] C服务不可用:', e.message);
        throw new Error('行程时间服务暂时不可用');
    }
}

/**
 * 降级方案：Node.js 本地时间估算（C 服务不可用时）
 */
function estimateTravelTimeFallback(pathCoords, congestionFactor) {
    let totalDist = 0, innerDist = 0, outerDist = 0;
    const RING4 = { latMin: 39.85, latMax: 40.02, lngMin: 116.28, lngMax: 116.49 };

    for (let i = 0; i < pathCoords.length - 1; i++) {
        const [lng1, lat1] = pathCoords[i];
        const [lng2, lat2] = pathCoords[i + 1];
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const segDist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDist += segDist;

        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;
        if (midLat >= RING4.latMin && midLat <= RING4.latMax && midLng >= RING4.lngMin && midLng <= RING4.lngMax) {
            innerDist += segDist;
        } else {
            outerDist += segDist;
        }
    }

    // 拐点估算
    let turnCount = 0;
    for (let i = 1; i < pathCoords.length - 1; i++) {
        const dx1 = pathCoords[i][0] - pathCoords[i - 1][0];
        const dy1 = pathCoords[i][1] - pathCoords[i - 1][1];
        const dx2 = pathCoords[i + 1][0] - pathCoords[i][0];
        const dy2 = pathCoords[i + 1][1] - pathCoords[i][1];
        const dot = dx1 * dx2 + dy1 * dy2;
        const cross = dx1 * dy2 - dy1 * dx2;
        const angle = Math.atan2(Math.abs(cross), Math.abs(dot)) * 180 / Math.PI;
        if (angle > 30) turnCount++;
    }

    const trafficLightMin = turnCount * 1;

    // 驾车：四环内50km/h，外65km/h
    const innerSpeed = 50 * congestionFactor;
    const outerSpeed = 65 * congestionFactor;
    const drivingMin = (innerDist / Math.max(innerSpeed, 1) + outerDist / Math.max(outerSpeed, 1)) * 60 + trafficLightMin;

    // 骑车：20km/h
    const cyclingMin = (totalDist / Math.max(20 * congestionFactor, 3)) * 60 + trafficLightMin * 0.5;

    // 步行：5km/h
    const walkingMin = (totalDist / Math.max(5 * congestionFactor, 2)) * 60 + trafficLightMin * 0.3;

    return { driving: drivingMin, cycling: cyclingMin, walking: walkingMin, turnCount, distance: totalDist, innerDist, outerDist, congestionFactor };
}

/**
 * GET /api/fastRoute
 * 快速路径规划：仅返回 C 引擎的路径结果，不计算拥挤度和通行时间
 * 用于前端先画蓝线，再异步请求完整数据
 */
app.get('/api/fastRoute', async (req, res) => {
    try {
        const { startLng, startLat, endLng, endLat } = req.query;
        const routeData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/astar?startLng=${startLng}&startLat=${startLat}&endLng=${endLng}&endLat=${endLat}`);
        res.json(routeData);
    } catch (error) {
        console.error('[快速路径错误]:', error.message);
        res.status(503).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/route
 * 路径规划：Node 网关负责转发起点终点给 C 计算引擎，并根据交通方式和拥挤度计算时间
 * 返回三种交通方式的时间估算
 */
app.get('/api/route', async (req, res) => {
    try {
        const { startLng, startLat, endLng, endLat, transportMode, congestionWeight } = req.query;
        const mode = transportMode || 'driving';
        const cw = parseFloat(congestionWeight || '0.25');

        const routeData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/astar?startLng=${startLng}&startLat=${startLat}&endLng=${endLng}&endLat=${endLat}&congestionWeight=${cw}`);

        // 计算三种交通方式的通行时间
        let travelTimes = null;
        let segmentCongestion = null;
        if (routeData.success && routeData.path && routeData.path.length > 1) {
            travelTimes = await estimateTravelTimeAllModes(routeData.path);
            if (process.env.TRAFFIC_ENABLED === 'true') segmentCongestion = await querySegmentCongestion(routeData.path);
        }

        console.log(`[路径规划网关] 从 (${startLat}, ${startLng}) 到 (${endLat}, ${endLng}) 的路径已计算，交通方式: ${mode}。`);

        res.json({
            ...routeData,
            transportMode: mode,
            idealSpeed: getIdealSpeed(mode),
            timeEstimate: travelTimes ? { durationMinutes: travelTimes[mode] || travelTimes.driving } : null,
            travelTimes,
            segmentCongestion
        });

    } catch (error) {
        console.error('[网关错误]:', error.message);
        res.status(500).json({ success: false, error: '后端服务异常，请检查 C 引擎是否启动' });
    }
});

/**
 * GET /api/multiRoute
 * 多点路径规划：Node 网关负责转发多个途经点给 C 计算引擎，并根据交通方式和拥挤度计算时间
 * 返回三种交通方式的时间估算
 */
app.get('/api/multiRoute', async (req, res) => {
    try {
        const { points, transportMode, congestionWeight } = req.query;
        const mode = transportMode || 'driving';
        const cw = parseFloat(congestionWeight || '0.25');

        if (!points) {
            return res.status(400).json({ success: false, error: '缺少途经点参数' });
        }

        const routeData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/multiRoute?points=${encodeURIComponent(points)}&congestionWeight=${cw}`);

        // 计算三种交通方式的通行时间
        let travelTimes = null;
        let segmentCongestion = null;
        if (routeData.success && routeData.fullPath && routeData.fullPath.length > 1) {
            travelTimes = await estimateTravelTimeAllModes(routeData.fullPath);
            if (process.env.TRAFFIC_ENABLED === 'true') segmentCongestion = await querySegmentCongestion(routeData.fullPath);
        }

        console.log(`[多点路径规划网关] 路径已计算，交通方式: ${mode}。`);

        res.json({
            ...routeData,
            transportMode: mode,
            idealSpeed: getIdealSpeed(mode),
            timeEstimate: travelTimes ? { durationMinutes: travelTimes[mode] || travelTimes.driving } : null,
            travelTimes,
            segmentCongestion
        });

    } catch (error) {
        console.error('[网关错误]:', error.message);
        res.status(500).json({ success: false, error: '后端服务异常，请检查 C 引擎是否启动' });
    }
});

/**
 * GET /api/scenic/path
 * 景区A*寻路：前端只负责渲染，后端处理所有路径计算
 */


/**
 * GET /api/searchPois
 * 搜索 POI：根据关键词模糊搜索景点
 */
app.get('/api/searchPois', async (req, res) => {
    try {
        const { keyword } = req.query;

        if (!keyword || !keyword.trim()) {
            return res.status(400).json({ success: false, error: '搜索关键词不能为空' });
        }

        const dbRes = await pool.query(
            'SELECT id, name, lat, lng, hotness, description FROM pois WHERE name ILIKE $1 ORDER BY hotness DESC LIMIT 20',
            [`%${keyword.trim()}%`]
        );
        dbRes.rows.forEach(assignPoiMeta);

        console.log(`[POI搜索] 关键词: ${keyword}, 结果: ${dbRes.rows.length} 条`);
        res.json({ success: true, data: dbRes.rows });

    } catch (error) {
        console.error('[POI搜索错误]:', error.message);
        res.status(500).json({ success: false, error: '搜索失败，请稍后重试' });
    }
});

// ====== New Unified Search API Routes ======

/**
 * GET /api/search?q=keyword&category=all
 * Unified fuzzy search across POIs, Foods, and Travel Services
 * category: all | poi | food | service | makeup | photographer | drone | clothing
 * Returns grouped results: { pois: [...], foods: [...], services: [...] }
 */
app.get('/api/search', async (req, res) => {
    try {
        const { q, category = 'all' } = req.query;
        if (!q || !q.trim()) {
            return res.json({ success: true, data: { pois: [], foods: [], services: [] } });
        }
        const keyword = q.trim();

        const promises = [];
        const cats = category === 'all' ? ['poi', 'food', 'service'] : [category];

        // POI search
        if (cats.includes('poi')) {
            promises.push(
                pool.query(`
                    SELECT DISTINCT ON (name) id, name, lat, lng, hotness, style, description
                    FROM pois
                    WHERE name ILIKE $1 OR tags ILIKE $1 OR similarity(name, $2) > 0.15
                    ORDER BY name,
                        CASE WHEN name ILIKE $1 THEN 1 ELSE 0 END DESC,
                        LENGTH(name) ASC,
                        hotness DESC
                    LIMIT 12
                `, [`%${keyword}%`, keyword]).then(r => ({ key: 'pois', rows: r.rows }))
            );
        }

        // Food search (name + cuisine)
        if (cats.includes('food')) {
            promises.push(
                pool.query(`
                    SELECT DISTINCT ON (name) id, name, cuisine, lat, lng, hotness, address, district, price_level, avg_price
                    FROM foods
                    WHERE name ILIKE $1 OR cuisine ILIKE $1 OR similarity(name, $2) > 0.15
                    ORDER BY name,
                        CASE WHEN name ILIKE $1 OR cuisine ILIKE $1 THEN 1 ELSE 0 END DESC,
                        LENGTH(name) ASC,
                        hotness DESC
                    LIMIT 12
                `, [`%${keyword}%`, keyword]).then(r => ({ key: 'foods', rows: r.rows }))
            );
        }

        // Travel Services search (妆娘/摄影师/无人机/服装租赁)
        if (cats.includes('service')) {
            let serviceTypeFilter = '';
            const serviceParams = [`%${keyword}%`, keyword];
            const serviceCats = ['makeup', 'photographer', 'drone', 'clothing'].filter(t => cats.includes(t));
            if (serviceCats.length > 0) {
                serviceTypeFilter = ` AND type IN (${serviceCats.map((_, i) => `$${i + 3}`).join(', ')})`;
                serviceParams.push(...serviceCats);
            }
            promises.push(
                pool.query(`
                    SELECT DISTINCT ON (name) id, name, type, lat, lng, hotness
                    FROM travel_services
                    WHERE (name ILIKE $1 OR similarity(name, $2) > 0.15)${serviceTypeFilter}
                    ORDER BY name,
                        CASE WHEN name ILIKE $1 THEN 1 ELSE 0 END DESC,
                        LENGTH(name) ASC,
                        hotness DESC
                    LIMIT 12
                `, serviceParams).then(r => ({ key: 'services', rows: r.rows }))
            );
        }

        const results = await Promise.all(promises);
        const data = { pois: [], foods: [], services: [] };
        for (const r of results) {
            data[r.key] = r.rows;
        }

        data.pois.forEach(assignPoiMeta);
        data.foods.forEach(assignFoodMeta);
        console.log(`[搜索-统一] 关键词: ${keyword}, 类别: ${category}, POI: ${data.pois.length}, 美食: ${data.foods.length}, 服务: ${data.services.length}`);
        res.json({ success: true, data });
    } catch (error) {
        console.error('[搜索-统一错误]:', error.message);
        res.status(500).json({ success: false, data: { pois: [], foods: [], services: [] }, error: '搜索失败，请稍后重试' });
    }
});

/**
 * GET /api/poiCategories - 获取所有景点类别
 */
app.get('/api/poiCategories', async (req, res) => {
    try {
        const dbRes = await pool.query(
            `SELECT style, COUNT(*) as count FROM pois
             WHERE style IS NOT NULL AND style != '' AND style NOT LIKE '校园%'
             GROUP BY style ORDER BY count DESC`
        );
        res.json({ success: true, data: dbRes.rows });
    } catch (error) {
        console.error('[景点类别错误]:', error.message);
        res.status(500).json({ success: false, error: '获取类别失败' });
    }
});

/**
 * GET /api/searchByCategory?category=古风 - 按类别搜索景点
 * 返回该类别下按热度排序的最多5个景点
 */
app.get('/api/searchByCategory', async (req, res) => {
    try {
        const { category } = req.query;
        if (!category || !category.trim()) {
            return res.status(400).json({ success: false, error: '缺少类别参数' });
        }
        const cat = category.trim();

        /* 先从数据库获取该类别的景点，按热度降序 */
        const dbRes = await pool.query(
            `SELECT id, name, lat, lng, hotness, style, rating, description
             FROM pois WHERE style = $1
             ORDER BY hotness DESC LIMIT 5`,
            [cat]
        );
        dbRes.rows.forEach(assignPoiMeta);

        /* 如果有 C 服务可用，调用快排算法排序 */
        try {
            if (dbRes.rows.length > 1) {
                let payloadText = `${dbRes.rows.length}\n`;
                dbRes.rows.forEach(p => {
                    payloadText += `${p.id} ${p.hotness}\n`;
                });
                const algoData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/quickSort`, {
                    method: 'POST',
                    body: payloadText,
                    signal: AbortSignal.timeout(3000)
                });
                if (algoData.ids && Array.isArray(algoData.ids)) {
                    const poiMap = new Map(dbRes.rows.map(p => [p.id, p]));
                    const sorted = algoData.ids.map(id => poiMap.get(id)).filter(Boolean);
                    console.log(`[类别搜索] category=${cat} results=${sorted.length} (quickSort)`);
                    return res.json({ success: true, data: sorted });
                }
            }
        } catch (e) {
            console.log(`[类别搜索] C服务不可用，使用数据库排序: ${e.message}`);
        }

        console.log(`[类别搜索] category=${cat} results=${dbRes.rows.length}`);
        res.json({ success: true, data: dbRes.rows });
    } catch (error) {
        console.error('[类别搜索错误]:', error.message);
        res.status(500).json({ success: false, error: '搜索失败' });
    }
});

/**
 * GET /api/search/autocomplete?q=keyword
 * Combined autocomplete (POIs + Foods + Services) for search-as-you-type
 * Returns: { pois: [...], foods: [...], services: [...] }
 */
app.get('/api/search/autocomplete', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || !q.trim()) {
            return res.json({ success: true, data: { pois: [], foods: [], services: [] } });
        }
        const keyword = q.trim();
        const runSearch = async (label, query, params) => {
            try {
                const result = await pool.query(query, params);
                return result.rows;
            } catch (error) {
                console.warn(`[搜索-自动补全] ${label} 查询失败: ${error.message}`);
                return [];
            }
        };

        const [pois, foods, services] = await Promise.all([
            runSearch(
                '景点',
                `SELECT DISTINCT ON (name) id, name, lat, lng, hotness, style
                 FROM pois WHERE name ILIKE $1 OR tags ILIKE $1
                 ORDER BY name, LENGTH(name) ASC, hotness DESC LIMIT 5`,
                [`%${keyword}%`]
            ),
            runSearch(
                '美食',
                `SELECT DISTINCT ON (name) id, name, cuisine, lat, lng, hotness, address, district, avg_price
                 FROM foods WHERE name ILIKE $1 OR cuisine ILIKE $1
                 ORDER BY name, LENGTH(name) ASC, hotness DESC LIMIT 5`,
                [`%${keyword}%`]
            ),
            runSearch(
                '旅拍服务',
                `SELECT DISTINCT ON (name) id, name, type, lat, lng, hotness
                 FROM travel_services WHERE name ILIKE $1
                 ORDER BY name, LENGTH(name) ASC, hotness DESC LIMIT 5`,
                [`%${keyword}%`]
            )
        ]);

        console.log(`[搜索-自动补全] 关键词: ${keyword}, POI: ${pois.length}, 美食: ${foods.length}, 服务: ${services.length}`);
        res.json({ success: true, data: { pois, foods, services } });
    } catch (error) {
        console.error('[搜索-自动补全错误]:', error.message);
        res.status(500).json({ success: false, data: { pois: [], foods: [], services: [] } });
    }
});

/**
 * GET /api/discover/interactions?items=spot:1,food:2
 * 返回发现页卡片的全局点赞、收藏、评论和当前用户状态。
 */
app.get('/api/discover/interactions', async (req, res) => {
    try {
        const rawItems = String(req.query.items || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        const currentUser = optionalUserFromRequest(req);
        const data = await getDiscoverInteractionSummaries(rawItems, currentUser?.id || null);
        res.json({ success: true, data });
    } catch (error) {
        console.error('[发现页互动查询错误]:', error.message);
        res.status(500).json({ success: false, error: '发现页互动数据加载失败', data: {} });
    }
});

/**
 * POST /api/discover/:type/:id/reaction
 * reactionType: like | favorite，重复点击会取消。
 */
app.post('/api/discover/:type/:id/reaction', authMiddleware, async (req, res) => {
    try {
        const itemType = normalizeDiscoverType(req.params.type);
        const itemId = String(req.params.id || '').trim();
        const reactionType = String(req.body.reactionType || '').trim();
        const userId = Number(req.user?.id);

        if (!itemType || !itemId) {
            return res.status(400).json({ success: false, error: '无效的发现页对象' });
        }
        if (!userId || userId < 1) {
            return res.status(403).json({ success: false, error: '当前账号不支持该操作' });
        }
        if (!['like', 'favorite'].includes(reactionType)) {
            return res.status(400).json({ success: false, error: '无效的互动类型' });
        }

        const existsRes = await pool.query(
            'SELECT id FROM discover_reactions WHERE item_type = $1 AND item_id = $2 AND user_id = $3 AND reaction_type = $4',
            [itemType, itemId, userId, reactionType]
        );

        let active = false;
        if (existsRes.rows.length > 0) {
            await pool.query(
                'DELETE FROM discover_reactions WHERE item_type = $1 AND item_id = $2 AND user_id = $3 AND reaction_type = $4',
                [itemType, itemId, userId, reactionType]
            );
        } else {
            await pool.query(
                `INSERT INTO discover_reactions (item_type, item_id, user_id, reaction_type)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (item_type, item_id, user_id, reaction_type) DO NOTHING`,
                [itemType, itemId, userId, reactionType]
            );
            active = true;
        }

        const key = `${itemType}:${itemId}`;
        const data = await getDiscoverInteractionSummaries([key], userId);
        res.json({ success: true, active, data: data[key] || null });
    } catch (error) {
        console.error('[发现页互动保存错误]:', error.message);
        res.status(500).json({ success: false, error: '互动保存失败，请稍后重试' });
    }
});

/**
 * POST /api/discover/:type/:id/reviews
 * 所有用户可见的发现页评价。
 */
app.post('/api/discover/:type/:id/reviews', authMiddleware, async (req, res) => {
    try {
        const itemType = normalizeDiscoverType(req.params.type);
        const itemId = String(req.params.id || '').trim();
        const rating = Number(req.body.rating);
        const comment = String(req.body.comment || '').trim();
        const userId = Number(req.user?.id);

        if (!itemType || !itemId) {
            return res.status(400).json({ success: false, error: '无效的发现页对象' });
        }
        if (!userId || userId < 1) {
            return res.status(403).json({ success: false, error: '当前账号不支持该操作' });
        }
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: '评分必须为1到5星' });
        }
        if (!comment) {
            return res.status(400).json({ success: false, error: '评论不能为空' });
        }
        if (comment.length > 500) {
            return res.status(400).json({ success: false, error: '评论不能超过500字' });
        }

        await pool.query(
            `INSERT INTO discover_reviews (item_type, item_id, user_id, rating, comment)
             VALUES ($1, $2, $3, $4, $5)`,
            [itemType, itemId, userId, rating, comment]
        );

        const key = `${itemType}:${itemId}`;
        const data = await getDiscoverInteractionSummaries([key], userId);
        res.json({ success: true, data: data[key] || null });
    } catch (error) {
        console.error('[发现页评价保存错误]:', error.message);
        res.status(500).json({ success: false, error: '评价提交失败，请稍后重试' });
    }
});

/**
 * GET /api/services
 * 优先C引擎，失败时Node.js直接排序（fallback），返回全部服务
 */
app.get('/api/services', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        const token = req.headers.authorization?.replace('Bearer ', '');
        let currentUser = null;
        if (token) {
            try { currentUser = jwt.verify(token, JWT_SECRET); } catch (e) { /* 忽略 */ }
        }

        let myBookedServiceIds = [];
        if (currentUser) {
            const bookingRes = await pool.query(
                'SELECT service_id FROM bookings WHERE user_id = $1',
                [currentUser.id]
            );
            myBookedServiceIds = bookingRes.rows.map(b => b.service_id);
        }

        const dbRes = await pool.query('SELECT id, type, name, lat, lng, hotness, schedule, price, address, description FROM travel_services');
        const allServices = dbRes.rows;

        if (allServices.length === 0) {
            return res.json({ success: true, data: [] });
        }

        let finalData = null;

        try {
            let payloadText = `${lat} ${lng}\n`;
            allServices.forEach(s => {
                payloadText += `${s.id} ${s.type} ${s.lat} ${s.lng} ${s.hotness}\n`;
            });

            const algoData = await fetchFromCService(`${C_ALGO_SERVICE_URL}/api/services`, {
                method: 'POST',
                body: payloadText,
                signal: AbortSignal.timeout(3000)
            });

            const topServices = algoData.services || [];
            if (topServices.length > 0) {
                finalData = topServices.map(service => {
                    const original = allServices.find(s => s.id === service.id);
                    return {
                        ...original,
                        ...service,
                        name: original?.name || service.name,
                        schedule: original?.schedule || service.schedule,
                        is_booked_by_me: currentUser ? myBookedServiceIds.includes(service.id) : false
                    };
                });
                console.log(`[旅拍服务] C引擎成功 top=${finalData.length}`);
            }
        } catch (e) {
            console.warn(`[旅拍服务] C引擎不可用，使用数据库排序: ${e.message}`);
        }

        if (!finalData) {
            finalData = topKSort(allServices, userLat || 39.9, userLng || 116.4, 'hotness', 10)
                .map(service => ({
                    ...service,
                    is_booked_by_me: currentUser ? myBookedServiceIds.includes(service.id) : false
                }));
            console.log(`[旅拍服务] Node.js fallback top=${finalData.length}`);
        }

        res.json({ success: true, data: finalData });

    } catch (error) {
        console.error('[网关错误]:', error.message);
        res.status(500).json({ success: false, error: '后端服务异常' });
    }
});

/**
 * GET /api/services/:id/slots - 获取某服务某天的可用时间段
 */
const WEATHER_CACHE = new Map();
const WEATHER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getWeatherEmoji(code) {
    if (code === 0) return '☀️';
    if (code <= 2) return '⛅';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 55) return '🌦️';
    if (code >= 56 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 85 && code <= 86) return '❄️';
    if (code >= 95) return '⛈️';
    return '🌡️';
}

function isRainCode(code) {
    return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

/**
 * GET /api/weather?lat=39.9&lng=116.4
 * Returns current weather + hourly forecast from Open-Meteo (no API key needed)
 */
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ success: false, error: '需要 lat 和 lng 参数' });
        }

        const cacheKey = `${parseFloat(lat).toFixed(2)},${parseFloat(lng).toFixed(2)}`;
        const cached = WEATHER_CACHE.get(cacheKey);
        if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL) {
            return res.json({ success: true, data: cached.data, cached: true });
        }

        const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,precipitation&hourly=precipitation_probability,weather_code,temperature_2m&timezone=Asia%2FShanghai&forecast_hours=12`;
        const apiRes = await fetch(apiUrl);
        if (!apiRes.ok) {
            throw new Error(`Open-Meteo 返回 ${apiRes.status}`);
        }
        const apiData = await apiRes.json();

        const current = {
            temp: Math.round(apiData.current.temperature_2m),
            code: apiData.current.weather_code,
            emoji: getWeatherEmoji(apiData.current.weather_code),
            precipitation: apiData.current.precipitation || 0
        };

        const hourly = apiData.hourly.time.slice(0, 12).map((t, i) => ({
            time: t,
            temp: Math.round(apiData.hourly.temperature_2m[i]),
            code: apiData.hourly.weather_code[i],
            emoji: getWeatherEmoji(apiData.hourly.weather_code[i]),
            precipProb: apiData.hourly.precipitation_probability[i] || 0
        }));

        // Check for rain in next hours
        const rainAlert = hourly.some(h => isRainCode(h.code) || h.precipProb > 50);

        const result = { current, hourly, rainAlert };
        WEATHER_CACHE.set(cacheKey, { data: result, ts: Date.now() });

        console.log(`[天气] lat=${lat}, lng=${lng}, 当前: ${current.emoji} ${current.temp}°C`);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[天气接口错误]:', error.message);
        res.status(500).json({ success: false, error: '获取天气失败' });
    }
});

// ====== 反向地理编码（坐标 → 地址） ======

const GEO_CACHE = new Map();
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时缓存

/**
 * GET /api/geocode/reverse?lat=39.9&lng=116.4
 * 通过 Nominatim (OpenStreetMap) 将坐标转为可读地址
 */
app.get('/api/geocode/reverse', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ success: false, error: '需要 lat 和 lng 参数' });
        }

        const cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
        const cached = GEO_CACHE.get(cacheKey);
        if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
            return res.json({ success: true, data: cached.data, cached: true });
        }

        const apiUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh`;
        const apiRes = await fetch(apiUrl, {
            headers: { 'User-Agent': 'SmartMap/1.0 (travel planner)' }
        });
        if (!apiRes.ok) {
            throw new Error(`Nominatim 返回 ${apiRes.status}`);
        }
        const apiData = await apiRes.json();

        const displayName = apiData.display_name || '';
        // 简化地址：提取城市/区 + 街道级别的信息
        const parts = displayName.split(',').map(s => s.trim());
        const address = parts.slice(0, 3).join(', '); // 取前三级（街道/区/城市）

        const result = {
            address: address || displayName,
            raw: displayName
        };
        GEO_CACHE.set(cacheKey, { data: result, ts: Date.now() });

        console.log(`[地理编码] lat=${lat}, lng=${lng} → ${address}`);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[地理编码错误]:', error.message);
        res.status(500).json({ success: false, error: '获取地址失败' });
    }
});

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.includes('.')) {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    } else {
        next();
    }
});


app.listen(PORT, process.env.HOST || '127.0.0.1', () => {
    console.log(`=========================================`);
    console.log(`[Node.js API 网关] 已启动 (ESM 模式)`);
    console.log(`访问前端页面: http://localhost:${PORT}/index.html`);
    console.log(`=========================================`);
});


