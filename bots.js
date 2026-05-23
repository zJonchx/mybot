#!/usr/bin/env node
/**
 * Bot MCPE/PocketMine-MP — Replica de player real con evasión anti-bot avanzada
 * Proto 70 (MCPE 0.15.x) y Proto 84 (MCPE 0.16.x)
 * 
 * Uso: node bot.js <ip> <port> <nombre> <bots> <tiempo> [register_cmd] [mensajes] [intervalo_msg]
 *
 * Ejemplos:
 *   node bot.js 127.0.0.1 19132 Bot 1 0
 *   node bot.js 127.0.0.1 19132 Bot 5 60 "/register" "Hola!|Como-estas" 5
 *   node bot.js 127.0.0.1 19132 Bot 3 0 "mipass123" "Hola" 4
 *
 * Skin: coloca "skin.png" (64x64 RGBA) en la misma carpeta del script.
 *       Si no existe, se usa la skin de Steve por defecto.
 *       npm install jimp   ← necesario para leer el .png
 */

'use strict';

const dgram  = require('dgram');
const zlib   = require('zlib');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ─── Argumentos ───────────────────────────────────────────────────────────────
const HOST          = process.argv[2]  || '127.0.0.1';
const PORT          = parseInt(process.argv[3])  || 19132;
const NOMBRE        = process.argv[4]  || 'Steve';
const BOTS          = parseInt(process.argv[5])  || 1;
const TIEMPO        = parseInt(process.argv[6])  || 0;
const REGISTER_RAW  = process.argv[7]  !== undefined ? process.argv[7] : null;
const MENSAJES_RAW  = process.argv[8]  || '';
const MSG_INTERVALO = parseInt(process.argv[9])  || 5;

// ─── Constantes de conexión ───────────────────────────────────────────────────
const MAX_CONCURRENT_CONNECTIONS = 10;
const BOT_SPAWN_TIMEOUT = 90000;
const MAX_RETRIES = 3;

// ─── Nombres realistas para evadir detección ──────────────────────────────────
const NOMBRES_REALES = [
  // Originales
  'ProPlayer', 'xXDarkXx', 'Minecrafter', 'CraftKing', 'PixelWarrior',
  'DiamondHunt', 'RedstonePro', 'BuildMaster', 'SurvivalGuy', 'PvP_Legend',
  'NotchFan', 'Herobrine', 'CreeperSlay', 'EnderDragon', 'WitherKill',
  'NetherStar', 'Enchanted', 'EmeraldPro', 'IronGolem', 'SnowGolem',
  'AlexPlayz', 'CraftMiner', 'BlockKing', 'SkyWarsPro', 'BedWarsGod',
  'PvP_Master', 'SurvivalPro', 'CreativeAce', 'Hardcore_OG', 'MCPE_Pro',
  'BlockBreaker', 'Creeper_AED', 'TNT_Master', 'ObsidianKing', 'DiamondSword',
  'GoldenApple', 'EnchantedBow', 'ArrowMaster', 'SkeletonKing', 'ZombieSlayer',
  'SpiderKiller', 'EndermanPro', 'BlazeHunter', 'GhastSlayer', 'MagmaCube',
  'SlimeKing', 'WitchHunter', 'GuardianPro', 'ElderGuard', 'WitherSkeleton',
  'DragonSlayer', 'PhoenixPro', 'ThunderGod', 'IceQueen', 'FireLord',
  'ShadowBlade', 'DarkKnight', 'LightMage', 'StormBringer', 'EarthShaker',
  'WindWalker', 'WaterBender', 'SunWarrior', 'MoonChild', 'StarGazer',
  'VortexMaster', 'QuantumPro', 'PixelNinja', 'CyberWolf', 'DigitalAce',
  'NeonBlade', 'CrystalKing', 'FrostByte', 'ShadowFox', 'GhostRider',
  'BlazeFury', 'StormChaser', 'NightHawk', 'DayWalker', 'DuskBlade',
  'DawnBreaker', 'SoulReaper', 'BloodMoon', 'DarkVoid', 'LightBringer',
  'ChaosLord', 'OrderKing', 'TimeBender', 'SpaceWalker', 'RealityWarper',
  'MindBender', 'SoulEater', 'DreamWeaver', 'Nightmare', 'DayDreamer',
  'CloudWalker', 'RainMaker', 'SnowFall', 'ThunderBolt', 'LightningStrike',
  'HurricanePro', 'TornadoKing', 'Earthquake', 'VolcanoGod', 'TsunamiPro',
  'xXNoScoperXx', 'QuickScope', 'HeadHunter', 'SniperKing', 'RushMaster',
  'CampKing', 'FlankMaster', 'SprayPro', 'TacticalAce', 'StrategyGod',
  'PvP_God', 'PvP_King', 'PvP_Lord', 'PvP_Master', 'PvP_Pro',
  'PvP_Noob', 'PvP_Legend', 'PvP_Mythic', 'PvP_Immortal', 'PvP_Divine',
  'GalaxyPlayer', 'CosmicAce', 'AstroMiner', 'NebulaKing', 'StarDust',
  'LunarCraft', 'SolarFlare', 'CometBlaze', 'MeteorKing', 'OrbitMaster',
  'ZenithPro', 'ApexHunter', 'PrimeCrafter', 'EliteBuilder', 'UltraMiner',
  'MegaPlayer', 'HyperCraft', 'SuperBuilder', 'OmegaMiner', 'AlphaCrafter',
  'ZeroGravity', 'InfinityEdge', 'EternalFlame', 'FrozenSoul', 'BurningIce',
  'CrystalClear', 'DiamondEdge', 'GoldenHeart', 'SilverSword', 'BronzeAxe',
  'IronWill', 'SteelNerve', 'TitaniumPro', 'PlatinumKing', 'UraniumGod',
  // Nuevos — estilo español / latinoamérica
  'ElCrack', 'NoSoyBot', 'SoyReal', 'JugadorPro', 'ElMejor',
  'Matador', 'ElToxic', 'LaReina', 'ElRey', 'Vikingo',
  'Guerrero', 'ElFenomeno', 'Destructor', 'ElPoder', 'Leyenda',
  'Campeón', 'Invicto', 'ElVerde', 'ElRojo', 'ElAzul',
  'Diablo', 'Angel', 'Demonio', 'Santos', 'ElMalo',
  'ElBueno', 'Asesino', 'Sicario', 'ElJefe', 'Patron',
  'Caudillo', 'Capi', 'Soldado', 'Combatiente', 'Guerrillero',
  'ElFuerte', 'ElRapido', 'ElListo', 'ElVivo', 'Astuto',
  'Tramposo', 'HackerPro', 'ElHacker', 'Exploit', 'Deathrun',
  'FullPvP', 'GodPvP', 'Rush420', 'NoHit', 'Combo',
  // Nuevos — estilo inglés gamer
  'SweatyTryhard', 'TouchGrass', 'L_Plus_Ratio', 'SkillIssue', 'GetGood',
  'NoobSlayer', 'BotKiller', 'GrindMode', 'GlitchHunter', 'BugAbuser',
  'MetaPlayer', 'TierList', 'RankGrinder', 'EloHell', 'CarryMe',
  'OneShot', 'InstantKill', 'PopOff', 'FragOut', 'ChickenDinner',
  'AimBot', 'WallHack', 'SpeedHax', 'KillAura', 'AntiKB',
  'Velocity', 'Scaffold', 'AutoClicker', 'Triggerbot', 'Criticals',
  'Legit_Player', 'NoCheats', 'CleanPlayer', 'VerifiedAcc', 'RealHuman',
  'NotABot123', 'TotallyReal', 'Human_Being', 'DefNotBot', 'RealUser',
  'Omega_Z', 'Alpha_X', 'Beta_Y', 'Sigma_W', 'Delta_V',
  'GrandMaster', 'GrandKing', 'HighRoller', 'BigBrain', 'LargePlays',
  // Nuevos — nombres de personajes y referencias
  'xXNarutoXx', 'SasukeUchiha', 'Gokussj4', 'VegetaPro', 'LuffyKing',
  'ZoroSword', 'NamiPro', 'SanjiKick', 'ChopperDoc', 'RobinHist',
  'IchigoKurosaki', 'RukiaKuchiki', 'Byakuya', 'Kenpachi', 'Aizen',
  'EdwardElric', 'AlphonseEl', 'RoyMustang', 'WinryRock', 'ScarFMA',
  'LeviAckerman', 'ErenYeager', 'MikasaAck', 'ArminArl', 'HangeZoe',
  'DemonSlayer', 'TanjiroKam', 'NezukoKam', 'ZenitsuAg', 'InosukeH',
  'GiyuTomio', 'ShinjuFun', 'RengokuKyj', 'UpperMoon', 'LowerMoon',
  // Nuevos — aleatorios cortos tipo bedwars/skywars
  'iMelted', 'Clutchhhh', 'StrafeMaster', 'HotbedPro', 'RodPvP',
  'Jartex', 'Mineplex', 'Hypixelz', 'CubecraftPro', 'Lifeboat',
  'HiveMC', 'InPvP', 'MinecadeGG', 'CosmicPE', 'CorvanaPE',
  'LunarPE', 'CapePE', 'ImpulsePE', 'CubicPE', 'GomcPE',
  'FadesHQ', 'InvictusPE', 'ProxMC', 'HeatMC', 'ExtremeMC',
  'ZeusMC', 'AresMC', 'AtlasMC', 'TitanMC', 'OlympusMC',
  // Más variados
  'Dxxm', 'Wr4ith', 'Vx1d', 'Nxll', 'Zx0ne',
  'Ph4ntom', 'Gl1tch', 'Sk1d', 'Cr4ck', 'Bl4ze',
  'Fr0st', 'Sn0w', 'Sh4d3', 'Sp3cter', 'Gh0ul',
  'Cr1mson', 'Sc4rlet', 'Cob4lt', 'Verm1lion', 'Iv0ry',
  'W4rden', 'Sp1re', 'F0rtress', 'C1tadel', 'B4stion',
  'Ram_p4rt', 'Par4pet', 'M0at', 'Dung30n', 'Crypt_X',
];

let botsConectados  = 0;
let botsActivos     = [];
let tiempoTerminado = false;
let globalMsgIdx    = 0;
let activeConnections = 0;
let connectionQueue = [];
let failedBots = [];

// ─── Lógica de registro ───────────────────────────────────────────────────────
const REGISTER_IS_CMD   = REGISTER_RAW !== null && REGISTER_RAW.startsWith('/');
const REGISTER_CMD_BASE = REGISTER_IS_CMD ? REGISTER_RAW : null;

const MENSAJES = MENSAJES_RAW.split('|').filter(m=>m.trim()).map(m=>m.trim().replace(/-/g,' '));

// ─── Cargar skin desde PNG ────────────────────────────────────────────────────
// Soporta skin.png de 64x64 RGBA.
// Si no existe o Jimp no está instalado, usa la skin de Steve programática.

let STEVE_SKIN = null; // se rellena de forma sincrónica o asíncrona más abajo

function buildFallbackSkin() {
  const buf = Buffer.alloc(64 * 64 * 4, 0);
  const fill = (x0, y0, x1, y1, r, g, b, a = 255) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * 64 + x) * 4;
        buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
      }
    }
  };
  const SKIN_COLOR  = [141, 85,  49];
  const EYES_WHITE  = [236, 236, 236];
  const PUPIL       = [30,  30,  130];
  const HAIR        = [53,  26,  14];
  const SHIRT       = [53,  97,  145];
  const PANTS       = [44,  44,  88];
  const SHOES       = [68,  68,  68];
  // Cara
  fill(8,  8,  16, 16, ...SKIN_COLOR);
  fill(8,  0,  16,  8, ...HAIR);
  fill(9,  11, 11, 13, ...EYES_WHITE);
  fill(13, 11, 15, 13, ...EYES_WHITE);
  fill(9,  12, 11, 13, ...PUPIL);
  fill(13, 12, 15, 13, ...PUPIL);
  fill(11, 14, 13, 15, 120, 55, 40);
  // Capa exterior de la cabeza (helm)
  fill(0,  0,  8,  8,  ...HAIR);
  fill(8,  0,  16,  8, ...HAIR);
  fill(16, 0,  24,  8, ...HAIR);
  fill(0,  8,  8,  16, ...HAIR);
  fill(16, 8,  24, 16, ...HAIR);
  // Cabeza lateral/trasera
  fill(0,  16,  8, 24, ...HAIR);
  fill(8,  16, 16, 24, ...HAIR);
  fill(16, 16, 24, 24, ...HAIR);
  // Torso
  fill(20, 20, 28, 32, ...SHIRT);
  fill(22, 22, 26, 26, 63, 137, 190); // logo
  // Brazo derecho
  fill(44, 20, 48, 32, ...SHIRT);
  // Brazo izquierdo
  fill(36, 52, 40, 64, ...SHIRT);
  // Pierna derecha
  fill(4,  20,  8, 32, ...PANTS);
  // Pierna izquierda
  fill(20, 52, 24, 64, ...PANTS);
  // Zapatos
  fill(4,  28,  8, 32, ...SHOES);
  fill(20, 60, 24, 64, ...SHOES);
  return buf.toString('base64');
}

/**
 * Carga skin.png y devuelve base64 RGBA 64x64.
 * Devuelve null si no hay archivo o no hay Jimp.
 */
async function loadSkinFromPng(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    // Intentar cargar Jimp (npm install jimp)
    let Jimp;
    try { Jimp = require('jimp'); } catch(e) {
      console.warn('[Skin] Jimp no instalado. Ejecuta: npm install jimp');
      console.warn('[Skin] Usando skin de Steve por defecto.');
      return null;
    }

    const img = await Jimp.read(filePath);

    // Redimensionar a 64x64 si es necesario
    if (img.bitmap.width !== 64 || img.bitmap.height !== 64) {
      console.log(`[Skin] Redimensionando ${img.bitmap.width}x${img.bitmap.height} → 64x64`);
      img.resize(64, 64);
    }

    // Convertir a RGBA crudo
    const raw = Buffer.alloc(64 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const color = Jimp.intToRGBA(img.getPixelColor(x, y));
        const i = (y * 64 + x) * 4;
        raw[i]   = color.r;
        raw[i+1] = color.g;
        raw[i+2] = color.b;
        raw[i+3] = color.a;
      }
    }
    console.log(`[Skin] skin.png cargada correctamente (64x64 RGBA)`);
    return raw.toString('base64');
  } catch (e) {
    console.warn('[Skin] Error al leer skin.png:', e.message);
    return null;
  }
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`[Master] Servidor  : ${HOST}:${PORT}`);
console.log(`[Master] Bots      : ${BOTS}  Base: "${NOMBRE}"`);
console.log(`[Master] Tiempo    : ${TIEMPO > 0 ? TIEMPO+'s' : 'ilimitado'}`);
console.log(`[Master] AntiBot   : Activado (comportamiento humano simulado)`);
if (REGISTER_RAW === null)
  console.log(`[Master] Register  : desactivado`);
else if (REGISTER_IS_CMD)
  console.log(`[Master] Register  : ${REGISTER_CMD_BASE} <pass_random>`);
else if (REGISTER_RAW === '')
  console.log(`[Master] Register  : <pass_random>`);
else
  console.log(`[Master] Register  : "${REGISTER_RAW}" (contraseña fija)`);
if (MENSAJES.length > 0)
  console.log(`[Master] Mensajes  : ${MENSAJES.join(' | ')}  cada ${MSG_INTERVALO}s`);
console.log('');

// ─── RakNet ───────────────────────────────────────────────────────────────────
const MAGIC = Buffer.from([
  0x00,0xFF,0xFF,0x00,0xFE,0xFE,0xFE,0xFE,
  0xFD,0xFD,0xFD,0xFD,0x12,0x34,0x56,0x78,
]);

const MTU_LIST = [1447, 1492, 1464, 1400, 1200, 576];

const RAK = {
  PING_UNCONN:  0x01, PONG_UNCONN:  0x1C,
  OPEN_REQ_1:   0x05, OPEN_REPLY_1: 0x06,
  OPEN_REQ_2:   0x07, OPEN_REPLY_2: 0x08,
  CONN_REQ:     0x09, NEW_INC_CONN: 0x10,
  DISCONN:      0x15, CONN_PING:    0x00, CONN_PONG: 0x03,
  ACK:          0xC0, NACK:         0xA0,
};

const P70 = {
  LOGIN:0x8f, PLAY_STATUS:0x90, DISCONNECT:0x91, BATCH:0x92,
  TEXT:0x93,  SET_TIME:0x94,    START_GAME:0x95, MOVE_PLAYER:0x9d,
  CHUNK_RADIUS:0xc9,
};
const P84 = {
  LOGIN:0x01,      PLAY_STATUS:0x02,   SERVER_HS:0x03, CLIENT_HS:0x04,
  DISCONNECT:0x05, RSPACK_INFO:0x06,   RSPACK_STACK:0x07, RSPACK_RESP:0x08,
  TEXT:0x09,       SET_TIME:0x0a,      START_GAME:0x0b,   MOVE_PLAYER:0x13,
  RESPAWN:0x2d,    CHUNK_RADIUS:0x45,  CHUNK_RAD_UPD:0x46,
};

const SILENT = new Set([
  0x0c,0x0d,0x0e,0x0f,0x10,0x11,0x12,0x14,0x15,0x16,0x17,0x18,0x19,
  0x1a,0x1b,0x1c,0x1e,0x1f,0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,
  0x28,0x29,0x2a,0x2b,0x2c,0x2e,0x2f,0x30,0x31,0x32,0x33,0x34,0x35,
  0x36,0x37,0x38,0x39,0x3a,0x3b,0x3c,0x3d,0x3e,0x3f,0x40,0x41,0x42,
  0x43,0x44,0x47,0x48,0x49,0x4a,0x4b,0x4c,0x4d,0x4e,0x4f,0x50,0x51,
  0x52,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x5b,0x5c,0x5d,0x5e,
  0x5f,0x60,0x61,0x62,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x6b,
  0x6c,0x6d,0x6e,0x6f,0x70,0x71,0x72,0x73,0x74,0x75,0x76,0x77,0x78,
  0x79,0x7a,0x7b,0x7c,0x7d,0x7e,
  0x96,0x97,0x98,0x99,0x9a,0x9b,0x9c,0x9e,0x9f,0xa0,0xa1,0xa2,0xa3,
  0xa4,0xcf,0xca,
]);

// ─── Writer / Reader ──────────────────────────────────────────────────────────
class W {
  constructor(){ this.p=[]; }
  u8(v)   { const b=Buffer.alloc(1);b[0]=v&0xff;this.p.push(b);return this; }
  u16be(v){ const b=Buffer.alloc(2);b.writeUInt16BE(v>>>0);this.p.push(b);return this; }
  u32be(v){ const b=Buffer.alloc(4);b.writeUInt32BE(v>>>0);this.p.push(b);return this; }
  i32be(v){ const b=Buffer.alloc(4);b.writeInt32BE(v|0);this.p.push(b);return this; }
  i32le(v){ const b=Buffer.alloc(4);b.writeInt32LE(v|0);this.p.push(b);return this; }
  u64be(v){ const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(v));this.p.push(b);return this; }
  i64be(v){ const b=Buffer.alloc(8);b.writeBigInt64BE(BigInt(v));this.p.push(b);return this; }
  f32be(v){ const b=Buffer.alloc(4);b.writeFloatBE(v);this.p.push(b);return this; }
  tLE(v)  { const b=Buffer.alloc(3);b[0]=v&0xff;b[1]=(v>>8)&0xff;b[2]=(v>>16)&0xff;this.p.push(b);return this; }
  raw(b)  { this.p.push(Buffer.isBuffer(b)?b:Buffer.from(b));return this; }
  magic() { this.p.push(MAGIC);return this; }
  str(s)  { const b=Buffer.from(s,'utf8');this.u16be(b.length);this.p.push(b);return this; }
  strRaw(b){ this.u16be(b.length);this.p.push(b);return this; }
  varint(v){ v=v>>>0;const b=[];do{let x=v&0x7f;v>>>=7;if(v)x|=0x80;b.push(x);}while(v);this.p.push(Buffer.from(b));return this; }
  rakIP(ip,port){ this.u8(4);ip.split('.').forEach(o=>this.u8((~parseInt(o))&0xff));this.u16be(port);return this; }
  stdIP(ip,port){ this.u8(4);ip.split('.').forEach(o=>this.u8(parseInt(o)&0xff));this.u16be(port);return this; }
  nullIP(){ this.u8(4);this.u8(0x80).u8(0xFF).u8(0xFF).u8(0xFE).u16be(0);return this; }
  buf()   { return Buffer.concat(this.p); }
}
class R {
  constructor(b){ this.b=b;this.p=0; }
  left()  { return this.b.length-this.p; }
  u8()    { return this.b.readUInt8(this.p++); }
  u16be() { const v=this.b.readUInt16BE(this.p);this.p+=2;return v; }
  u32be() { const v=this.b.readUInt32BE(this.p);this.p+=4;return v; }
  i32be() { const v=this.b.readInt32BE(this.p);this.p+=4;return v; }
  i64be() { const v=this.b.readBigInt64BE(this.p);this.p+=8;return v; }
  u64be() { const v=this.b.readBigUInt64BE(this.p);this.p+=8;return v; }
  f32be() { const v=this.b.readFloatBE(this.p);this.p+=4;return v; }
  tLE()   { const v=this.b[this.p]|(this.b[this.p+1]<<8)|(this.b[this.p+2]<<16);this.p+=3;return v; }
  bytes(n){ const v=this.b.slice(this.p,this.p+n);this.p+=n;return v; }
  skip(n) { this.p=Math.min(this.p+n,this.b.length);return this; }
  str()   { const n=this.u16be();return this.bytes(n).toString('utf8'); }
  varint(){ let r=0,s=0,b;do{if(this.p>=this.b.length)return r;b=this.b[this.p++];r|=(b&0x7f)<<s;s+=7;}while(b&0x80);return r; }
}

// ─── EC Key / JWT ─────────────────────────────────────────────────────────────
let ecKey = null;
try { ecKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-384' }); } catch(e) {}

function pubKeyB64() {
  return ecKey ? ecKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') : 'AAAA';
}

function b64url(d) {
  const b = Buffer.isBuffer(d) ? d : Buffer.from(JSON.stringify(d));
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function derToRaw(der) {
  let o = 2;
  const rL = der[o+1]; o += 2;
  const rR = der.slice(o, o+rL); o += rL;
  const sL = der[o+1]; o += 2;
  const sR = der.slice(o, o+sL);
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
  } catch(e) {
    return data + '.AAAAAA';
  }
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function randomName(base) {
  if (base && base !== 'Bot' && base !== 'Steve') {
    const suffix = Math.floor(Math.random() * 999);
    return base + suffix;
  }
  return NOMBRES_REALES[Math.floor(Math.random() * NOMBRES_REALES.length)] +
         Math.floor(Math.random() * 999);
}

function randomPass() {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function randomXUID() {
  return '25' + Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
}

function randomUUID() {
  const h = crypto.randomBytes(16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${((parseInt(h[16],16)&3)|8).toString(16)}${h.slice(17,20)}-${h.slice(20,32)}`;
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// ─── Mensaje de register ──────────────────────────────────────────────────────
function buildRegisterMsg() {
  if (REGISTER_RAW === null) return null;
  if (REGISTER_IS_CMD)       return `${REGISTER_CMD_BASE} ${randomPass()}`;
  if (REGISTER_RAW === '')   return randomPass();
  return REGISTER_RAW;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function buildLogin84(bot) {
  const pub = pubKeyB64(), now = Math.floor(Date.now()/1000);
  const chain = makeJWT({
    extraData: {
      displayName: bot.nombre,
      identity: bot.uuid,
      XUID: bot.xuid
    },
    identityPublicKey: pub,
    nbf: now - 60,
    exp: now + 86400
  });

  const deviceOS    = [1, 2, 7, 11][Math.floor(Math.random() * 4)];
  const gameVersion = ['0.15.10', '0.16.0', '0.16.1', '0.16.2'][Math.floor(Math.random() * 4)];
  const deviceModel = ['SM-G950F', 'iPhone8,1', 'iPhone9,2', 'Windows 10', 'Linux x64'][Math.floor(Math.random() * 5)];

  const skin = makeJWT({
    ClientRandomId:    Number(bot.clientId & 0xFFFFFFFFn),
    ServerAddress:     `${HOST}:${PORT}`,
    SkinData:          STEVE_SKIN,
    SkinId:            'Standard_Custom',
    CapeData:          '',
    SkinGeometryName:  'geometry.humanoid.custom',
    SkinGeometry:      '',
    DeviceOS:          deviceOS,
    DeviceModel:       deviceModel,
    GameVersion:       gameVersion,
    CurrentInputMode:  Math.random() > 0.5 ? 1 : 2,
    DefaultInputMode:  Math.random() > 0.5 ? 1 : 2,
    UIProfile:         Math.random() > 0.5 ? 0 : 1,
    GuiScale:          Math.floor(Math.random() * 3),
    LanguageCode:      ['en_US', 'es_ES', 'pt_BR'][Math.floor(Math.random() * 3)]
  });

  const chainBuf = Buffer.from(JSON.stringify({ chain: [chain] }), 'utf8');
  const skinBuf  = Buffer.from(skin, 'utf8');
  const raw      = new W().i32le(chainBuf.length).raw(chainBuf).i32le(skinBuf.length).raw(skinBuf).buf();
  const comp     = zlib.deflateSync(raw, { level: 7 });
  return Buffer.concat([Buffer.from([0xfe, 0x01]), new W().i32be(84).i32be(comp.length).raw(comp).buf()]);
}

function buildLogin70(bot) {
  const skinBuf = Buffer.from(STEVE_SKIN, 'base64');
  return new W().u8(P70.LOGIN).str(bot.nombre).i32be(70).i32be(70)
    .u64be(bot.clientId).raw(crypto.randomBytes(16))
    .str(`${HOST}:${PORT}`).str('').str('Standard_Custom')
    .strRaw(skinBuf).u8(0).buf();
}

// ─── Batch ────────────────────────────────────────────────────────────────────
function buildBatch(pkts, bot) {
  const inner = Buffer.concat(pkts.map(p => {
    const lb = Buffer.alloc(4);
    lb.writeUInt32BE(p.length);
    return Buffer.concat([lb, p]);
  }));
  const comp = zlib.deflateSync(inner, { level: 7 });
  if (bot.proto >= 84) return Buffer.concat([Buffer.from([0xfe, 0x06]), new W().i32be(comp.length).raw(comp).buf()]);
  return new W().u8(P70.BATCH).i32be(comp.length).raw(comp).buf();
}

// ─── Frames RakNet ────────────────────────────────────────────────────────────
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
  bot.sock.send(buf, 0, buf.length, PORT, HOST, () => {});
}

function sendReliable(bot, payload) {
  if (!bot.sock || bot.isClosing || tiempoTerminado) return;
  const MAX = (bot.mtuSize || 1200) - 60;
  if (payload.length <= MAX) { _sendFrame(bot, payload, false, 0, 0, 0); return; }
  const sid = (bot.splitId++) & 0xFFFF, cnt = Math.ceil(payload.length / MAX);
  for (let i = 0; i < cnt; i++) _sendFrame(bot, payload.slice(i * MAX, (i + 1) * MAX), true, cnt, sid, i);
}

function sendGame(bot, pkt) { sendReliable(bot, buildBatch([pkt], bot)); }

// ─── ACK / NACK ───────────────────────────────────────────────────────────────
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
  bot.sock.send(w.buf(), 0, w.buf().length, PORT, HOST, () => {});
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
        if (f) bot.sock.send(f, 0, f.length, PORT, HOST, () => {});
      }
    }
  } catch(e) {}
}

// ─── Paquetes de juego ────────────────────────────────────────────────────────
function chunkRadiusPkt(bot) {
  if (bot.proto >= 84) {
    if (bot.variantA) return new W().u8(0x3d).i32be(Math.floor(Math.random() * 8) + 4).buf();
    return new W().u8(P84.CHUNK_RADIUS).varint(Math.floor(Math.random() * 8) + 4).buf();
  }
  return new W().u8(P70.CHUNK_RADIUS).i32be(Math.floor(Math.random() * 8) + 4).buf();
}

function movePkt(bot) {
  const p = bot.pos;

  if (Math.random() < 0.1) {
    bot.velocityY = 0.42;
    bot.onGround = false;
  }

  if (!bot.onGround) {
    bot.velocityY -= 0.08;
    p.y += bot.velocityY;
    if (p.y <= 64) {
      p.y = 64;
      bot.velocityY = 0;
      bot.onGround = true;
    }
  }

  if (bot.proto >= 84) {
    const id = bot.variantA ? 0x10 : P84.MOVE_PLAYER;
    return new W().u8(id).i64be(bot.entityId)
      .f32be(p.x).f32be(p.y).f32be(p.z)
      .f32be(p.yaw).f32be(p.headYaw).f32be(p.pitch)
      .u8(bot.onGround ? 1 : 0).u8(1).buf();
  }
  return new W().u8(P70.MOVE_PLAYER).i64be(bot.entityId)
    .f32be(p.x).f32be(p.y + 1.62).f32be(p.z)
    .f32be(p.yaw).f32be(p.headYaw).f32be(p.pitch)
    .u8(0).u8(bot.onGround ? 1 : 0).buf();
}

function chatPkt(bot, msg) {
  if (bot.proto >= 84) {
    const id = bot.variantA ? 0x07 : P84.TEXT;
    return new W().u8(id).u8(1).str(bot.nombre).str(msg).buf();
  }
  return new W().u8(P70.TEXT).u8(1).str(bot.nombre).str(msg).buf();
}

function rspackRespPkt(s) { return new W().u8(P84.RSPACK_RESP).u8(s).u16be(0).buf(); }

// ─── Manejar paquetes de juego ────────────────────────────────────────────────
function handleGamePkt(bot, data) {
  if (!data || !data.length || bot.isClosing) return;
  const pid = data[0], r = new R(data); r.skip(1);

  if (pid === P70.PLAY_STATUS || pid === P84.PLAY_STATUS) {
    const st = r.i32be();
    const N = { 0: 'LoginOK', 1: 'ClienteViejo', 2: 'ServidorLleno', 3: 'Spawneado', 4: 'MundoViejo', 5: 'ClienteNuevo' };
    console.log(`[${bot.nombre}] PLAY_STATUS=${st} (${N[st]||'?'})`);
    if (st === 0) sendGame(bot, chunkRadiusPkt(bot));
    else if (st === 1 || st === 2 || st === 4) cerrarBot(bot);
    else if (st === 3) onSpawn(bot);
    return;
  }
  if (pid === P70.DISCONNECT || pid === P84.DISCONNECT) {
    let msg = ''; try { msg = r.str(); } catch(e) {}
    console.log(`[${bot.nombre}] Kick: "${msg||'(sin mensaje)'}"`);
    cerrarBot(bot); return;
  }
  if (pid === P70.START_GAME || pid === 0x09 || pid === P84.START_GAME) {
    if (bot.proto >= 84) {
      const wasA = bot.variantA;
      bot.variantA = (pid === 0x09);
      if (bot.variantA !== wasA) console.log(`[${bot.nombre}] Proto 84 variante ${bot.variantA?'A':'B'} detectada`);
    }
    try {
      r.i32be(); r.u8(); r.i32be(); r.i32be();
      bot.entityId = r.i64be();
      r.i32be(); r.i32be(); r.i32be();
      bot.pos.x = r.f32be(); bot.pos.y = r.f32be(); bot.pos.z = r.f32be();
      try { bot.pos.yaw = r.f32be(); bot.pos.pitch = r.f32be(); } catch(e) {}
    } catch(e) {}
    console.log(`[${bot.nombre}] START_GAME eid=${bot.entityId} pos=(${bot.pos.x.toFixed(1)},${bot.pos.y.toFixed(1)},${bot.pos.z.toFixed(1)})`);
    sendGame(bot, chunkRadiusPkt(bot));
    if (!bot.spawnFallback) bot.spawnFallback = setTimeout(() => {
      if (!bot.spawned && !bot.isClosing && !tiempoTerminado) {
        console.log(`[${bot.nombre}] Fallback spawn`);
        onSpawn(bot);
      }
    }, randomDelay(5000, 8000));
    return;
  }
  if (pid === P84.RSPACK_INFO && bot.proto >= 84) {
    if (!bot.rpackRespSent) {
      console.log(`[${bot.nombre}] ResourcePackInfo → aceptando`);
      sendGame(bot, rspackRespPkt(3));
    }
    return;
  }
  if (pid === P84.RSPACK_STACK && bot.proto >= 84) {
    if (!bot.rpackDone) {
      bot.rpackDone = true;
      bot.rpackRespSent = true;
      console.log(`[${bot.nombre}] ResourcePackStack → completado`);
      sendGame(bot, rspackRespPkt(4));
    }
    return;
  }
  if (pid === P84.SERVER_HS && bot.proto >= 84) {
    console.log(`[${bot.nombre}] ServerHandshake → respondiendo`);
    sendGame(bot, new W().u8(P84.CLIENT_HS).buf());
    sendGame(bot, chunkRadiusPkt(bot));
    return;
  }
  if (pid === P84.RESPAWN && bot.proto >= 84) {
    try { bot.pos.x = r.f32be(); bot.pos.y = r.f32be(); bot.pos.z = r.f32be(); } catch(e) {}
    sendGame(bot, new W().u8(P84.RESPAWN).f32be(bot.pos.x).f32be(bot.pos.y).f32be(bot.pos.z).buf());
    return;
  }

  if ((pid === P70.TEXT || pid === P84.TEXT || pid === 0x07) && bot.spawned && Math.random() < 0.3) {
    try {
      const type = r.u8();
      if (type === 1 || type === 0) {
        if (Math.random() < 0.3 && MENSAJES.length > 0) {
          const msg = MENSAJES[Math.floor(Math.random() * MENSAJES.length)];
          setTimeout(() => {
            if (!bot.isClosing && bot.spawned) {
              sendGame(bot, chatPkt(bot, msg));
              console.log(`[${bot.nombre}] Respuesta → "${msg}"`);
            }
          }, randomDelay(1000, 4000));
        }
      }
    } catch(e) {}
    return;
  }

  if (pid === P70.SET_TIME || pid === P84.SET_TIME || pid === P84.CHUNK_RAD_UPD) return;
  if (SILENT.has(pid)) return;
  if (!bot._unk[pid]) {
    bot._unk[pid] = true;
    console.log(`[${bot.nombre}] Pkt 0x${pid.toString(16).padStart(2,'0')} [${data.slice(0,14).toString('hex')}] (ignorado)`);
  }
}

// ─── Batch ────────────────────────────────────────────────────────────────────
function handleBatch(bot, payload) {
  if (bot.isClosing) return;
  try {
    const r = new R(payload), compLen = r.i32be(), comp = r.bytes(Math.min(compLen, r.left()));
    let inner;
    try { inner = zlib.inflateSync(comp); } catch(e) { inner = zlib.inflateRawSync(comp); }
    const ir = new R(inner);
    while (ir.left() >= 4) {
      const len = ir.u32be();
      if (len === 0 || len > ir.left()) break;
      const pkt = ir.bytes(len);
      handleGamePkt(bot, pkt[0] === 0xfe && pkt.length > 1 ? pkt.slice(1) : pkt);
    }
  } catch(e) {}
}

// ─── Inner RakNet ─────────────────────────────────────────────────────────────
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
  if (pid === RAK.DISCONN) { console.log(`[${bot.nombre}] Disconn RakNet`); cerrarBot(bot); return; }
  if (pid === RAK.NEW_INC_CONN) { handleRakHandshake(bot, payload); return; }
  if (pid === 0xfe) {
    if (payload.length < 2) return;
    payload[1] === 0x06 ? handleBatch(bot, payload.slice(2)) : handleGamePkt(bot, payload.slice(1));
    return;
  }
  if (pid === P70.BATCH) { handleBatch(bot, payload.slice(1)); return; }
  if (pid === 0x06 && bot.proto >= 84) { handleBatch(bot, payload.slice(1)); return; }
  handleGamePkt(bot, payload);
}

// ─── Parsear data packet ──────────────────────────────────────────────────────
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
    } catch(e) { break; }
  }
}

// ─── Variantes de Request2 ────────────────────────────────────────────────────
function makeReq2A(bot) { return new W().u8(RAK.OPEN_REQ_2).magic().rakIP(HOST, PORT).u16be(bot.mtuSize).u64be(bot.clientId).buf(); }
function makeReq2B(bot) { return new W().u8(RAK.OPEN_REQ_2).magic().stdIP(HOST, PORT).u16be(bot.mtuSize).u64be(bot.clientId).buf(); }
function makeReq2C(bot) { return new W().u8(RAK.OPEN_REQ_2).magic().rakIP(HOST, PORT).u16be(bot.mtuSent || bot.mtuSize).u64be(bot.clientId).buf(); }
function makeReq2D(bot) { return new W().u8(RAK.OPEN_REQ_2).magic().rakIP(HOST, PORT).u16be(1492).u64be(bot.clientId).buf(); }
function makeReq2E(bot) { return new W().u8(RAK.OPEN_REQ_2).magic().stdIP(HOST, PORT).u16be(1492).u64be(bot.clientId).buf(); }
function makeReq2F(bot) { return new W().u8(RAK.OPEN_REQ_2).magic().rakIP(HOST, PORT).u16be(bot.mtuSize).u64be(bot.clientId).u64be(bot.serverGUID || 0n).buf(); }

// ─── Simular cliente oficial MCPE ─────────────────────────────────────────────
function simulateOfficialClient(bot) {
  if (!bot.sock || bot.isClosing) return;

  const officialPackets = [
    () => {
      const ping = new W().u8(0x01)
        .i64be(BigInt(0))
        .magic()
        .u64be(bot.clientId)
        .buf();
      bot.sock.send(ping, 0, ping.length, PORT, HOST, () => {});
    },
    () => {
      const req1 = new W().u8(0x05)
        .magic()
        .u8(7)
        .raw(Buffer.alloc(1447 - 28, 0))
        .buf();
      bot.sock.send(req1, 0, req1.length, PORT, HOST, () => {});
    }
  ];

  const packet = officialPackets[Math.floor(Math.random() * officialPackets.length)];
  packet();
}

// ─── Reconexión completa ──────────────────────────────────────────────────────
function fullReconnect(bot) {
  if (bot.isClosing || tiempoTerminado) return;

  console.log(`[${bot.nombre}] 🔄 Reconexión completa (nuevo socket)...`);

  if (bot.sock) {
    try { bot.sock.close(); } catch(e) {}
  }

  bot.phase       = 'UNCONNECTED';
  bot.mtuIdx      = 0;
  bot.mtuSize     = MTU_LIST[0];
  bot.mtuSent     = 0;
  bot.sendSeq     = 0;
  bot.msgIndex    = 0;
  bot.orderIndex  = 0;
  bot.ackQueue    = [];
  bot.splitMap.clear();
  bot.sentFrames.clear();
  bot.reconnecting = false;

  const sock = dgram.createSocket('udp4');
  bot.sock = sock;

  sock.on('error', () => {});
  sock.on('message', (msg) => { handleSocketMessage(bot, msg, sock); });

  setTimeout(() => {
    sock.bind(0, () => {
      console.log(`[${bot.nombre}] Nuevo socket en puerto ${sock.address().port}`);
      iniciarConexion(bot, sock);
    });
  }, randomDelay(1000, 3000));
}

// ─── Handshake RakNet ─────────────────────────────────────────────────────────
function handleRakHandshake(bot, payload) {
  if (bot.isClosing) return;
  const r = new R(payload); r.skip(1);
  let pingTime = 0n;
  try {
    const ipv = r.u8(); r.skip(ipv === 4 ? 6 : 18); r.skip(2);
    for (let i = 0; i < 10; i++) { const v = r.u8(); r.skip(v === 4 ? 6 : 18); }
    pingTime = r.i64be();
  } catch(e) {}
  const hw = new W().u8(0x13);
  hw.rakIP(HOST, PORT);
  for (let i = 0; i < 10; i++) hw.nullIP();
  hw.i64be(pingTime).i64be(BigInt(Date.now()));
  _sendFrame(bot, hw.buf(), false, 0, 0, 0);
  if (bot.phase === 'HANDSHAKING') {
    bot.phase = 'LOGIN';
    console.log(`[${bot.nombre}] Handshake RakNet OK → login proto=${bot.proto}`);
    const loginDelay = randomDelay(100, 800);
    setTimeout(() => {
      if (tiempoTerminado || bot.isClosing) return;
      sendReliable(bot, bot.proto >= 84 ? buildLogin84(bot) : buildLogin70(bot));
    }, loginDelay);
  }
}

// ─── Request1 ─────────────────────────────────────────────────────────────────
function sendRequest1(bot) {
  if (!bot.sock || bot.isClosing || tiempoTerminado) return;
  const mtu = MTU_LIST[bot.mtuIdx % MTU_LIST.length];
  bot.mtuSent = mtu;
  const pad = Math.max(0, mtu - 28 - 1 - 16 - 1);
  bot.sock.send(new W().u8(RAK.OPEN_REQ_1).magic().u8(7).raw(Buffer.alloc(pad, 0)).buf(), 0, mtu - 28, PORT, HOST, () => {});
}

function scheduleMtuRetry(bot) {
  clearTimeout(bot.mtuRetryT);
  bot.mtuRetryT = setTimeout(() => {
    if (bot.phase !== 'CONNECTING_1' || bot.isClosing || tiempoTerminado) return;
    bot.mtuIdx = (bot.mtuIdx + 1) % MTU_LIST.length;
    console.log(`[${bot.nombre}] Sin Reply1 → MTU=${MTU_LIST[bot.mtuIdx % MTU_LIST.length]}`);
    sendRequest1(bot);
    scheduleMtuRetry(bot);
  }, 2500);
}

// ─── Request2 con múltiples variantes ─────────────────────────────────────────
function sendRequest2WithRetry(bot) {
  if (!bot.sock || bot.isClosing || tiempoTerminado) return;

  const variants = [
    { buf: makeReq2A(bot), label: 'A:inv/svr' },
    { buf: makeReq2B(bot), label: 'B:std/svr' },
    { buf: makeReq2C(bot), label: 'C:inv/cli' },
    { buf: makeReq2D(bot), label: 'D:mtu1492' },
    { buf: makeReq2E(bot), label: 'E:std1492' },
    { buf: makeReq2F(bot), label: 'F:c/guid'  }
  ];

  let attempt = 0;

  const doSend = () => {
    if (bot.phase !== 'CONNECTING_2' || bot.isClosing) return;

    if (attempt > 0 && attempt % 8 === 0) {
      console.log(`[${bot.nombre}] 🎭 Simulando cliente oficial MCPE...`);
      simulateOfficialClient(bot);
    }

    if (attempt > 30) {
      console.log(`[${bot.nombre}] ⚠️ ${attempt} intentos fallidos → reconexión completa`);
      fullReconnect(bot);
      return;
    }

    const variant = variants[attempt % variants.length];
    console.log(`[${bot.nombre}] Request2 #${attempt + 1} (${variant.label})`);

    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (bot.sock && !bot.isClosing && bot.phase === 'CONNECTING_2') {
          bot.sock.send(variant.buf, 0, variant.buf.length, PORT, HOST, () => {});
        }
      }, i * 50);
    }

    attempt++;

    const delay = Math.min(500 * Math.pow(1.3, Math.floor(attempt / 3)), 4000);
    bot.req2RetryT = setTimeout(doSend, delay + Math.random() * 500);
  };

  doSend();
}

// ─── Iniciar conexión ─────────────────────────────────────────────────────────
function iniciarConexion(bot, sock) {
  if (!sock || bot.isClosing || tiempoTerminado) return;

  const pings = [
    () => new W().u8(RAK.PING_UNCONN).i64be(BigInt(Date.now())).magic().u64be(bot.clientId).buf(),
    () => new W().u8(RAK.PING_UNCONN).i64be(BigInt(0)).magic().u64be(bot.clientId).buf(),
  ];

  let pingCount = 0;
  const maxPings = 4;

  const sendNextPing = () => {
    if (bot.phase !== 'UNCONNECTED' || bot.isClosing || tiempoTerminado) return;

    const pingFunc = pings[pingCount % pings.length];
    const ping = pingFunc();

    sock.send(ping, 0, ping.length, PORT, HOST, () => {});
    pingCount++;

    if (pingCount < maxPings) {
      setTimeout(sendNextPing, 300 + Math.random() * 400);
    } else {
      if (bot.phase === 'UNCONNECTED') {
        console.log(`[${bot.nombre}] Sin respuesta PONG → intentando conexión directa proto=${bot.proto}`);
        bot.phase = 'CONNECTING_1';
        sendRequest1(bot);
        scheduleMtuRetry(bot);
      }
    }
  };

  sendNextPing();
}

// ─── Manejar mensajes del socket ──────────────────────────────────────────────
function handleSocketMessage(bot, msg, sock) {
  if (tiempoTerminado || bot.isClosing || !msg.length) return;
  const pid = msg[0];

  if (bot.phase === 'CONNECTING_2') {
    if (pid === 0x08) {
      clearTimeout(bot.req2RetryT);
      try {
        if (msg.length >= 2) {
          const mtu = msg.readUInt16BE(msg.length - 2);
          if (mtu >= 400 && mtu <= 1500) bot.mtuSize = mtu;
        }
      } catch(e) {}
      bot.phase = 'HANDSHAKING';
      console.log(`[${bot.nombre}] ✅ Reply2 OK MTU=${bot.mtuSize} → Connection Request`);
      _sendFrame(bot, new W().u8(RAK.CONN_REQ).u64be(bot.clientId).i64be(BigInt(Date.now())).u8(0).buf(), false, 0, 0, 0);
      return;
    }
    return;
  }

  if (pid >= 0x80 && pid <= 0x8F) {
    parseDataPkt(bot, msg);
    if (bot.ackQueue.length && !bot.isClosing) { sendACK(bot, bot.ackQueue); bot.ackQueue = []; }
    return;
  }
  if (pid === RAK.ACK) return;
  if (pid === RAK.NACK) { handleNACK(bot, msg); return; }

  if (pid === 0x08) {
    console.log(`[${bot.nombre}] Reply2 tardío (phase=${bot.phase}) — ignorado`);
    return;
  }

  if (pid === 0x06 && bot.phase === 'CONNECTING_1') {
    try {
      if (msg.length >= 2) {
        const m = msg.readUInt16BE(msg.length - 2);
        bot.mtuSize = (m >= 400 && m <= 1500) ? m : bot.mtuSize;
      }
    } catch(e) {}
    try {
      if (msg.length >= 25) bot.serverGUID = msg.readBigUInt64BE(17);
    } catch(e) {}
    clearTimeout(bot.mtuRetryT);
    bot.phase = 'CONNECTING_2';
    console.log(`[${bot.nombre}] Reply1 MTU=${bot.mtuSize} → Request2`);
    sendRequest2WithRetry(bot);
    return;
  }

  if (pid === RAK.PONG_UNCONN && bot.phase === 'UNCONNECTED') {
    try {
      const r = new R(msg);
      r.skip(1 + 8 + 8 + 16);
      const motd = r.bytes(r.u16be()).toString('utf8'), parts = motd.split(';');
      if (parts.length >= 3) {
        const p = parseInt(parts[2]);
        if (!isNaN(p) && p > 0) bot.proto = p;
      }
      const name = (parts[1] || '?').replace(/\n/g, ' ').replace(/§./g, '').trim().substring(0, 40);
      console.log(`[${bot.nombre}] Servidor: "${name}" proto=${bot.proto}`);
    } catch(e) {}
    clearTimeout(bot.mtuRetryT);
    bot.phase = 'CONNECTING_1';
    console.log(`[${bot.nombre}] Iniciando handshake (MTU=${bot.mtuSize})...`);
    sendRequest1(bot);
    scheduleMtuRetry(bot);
    return;
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────
function sendRegister(bot) {
  if (bot.registerSent) return;
  const msg = buildRegisterMsg();
  if (msg === null) return;
  bot.registerSent = true;
  sendGame(bot, chatPkt(bot, msg));
  console.log(`[${bot.nombre}] Register → "${msg}"`);
}

// ─── Movimiento humano ────────────────────────────────────────────────────────
function startMovement(bot) {
  if (bot.moveTimer || bot.isClosing) return;
  const ox = bot.pos.x, oy = bot.pos.y, oz = bot.pos.z;
  let dir = Math.random() * Math.PI * 2;
  let moveState = 'walking';

  bot.moveTimer = setInterval(() => {
    if (!bot.spawned || bot.isClosing || tiempoTerminado) {
      clearInterval(bot.moveTimer);
      bot.moveTimer = null;
      return;
    }

    if (Math.random() < 0.15) {
      moveState = Math.random() < 0.4 ? 'standing' : (Math.random() < 0.3 ? 'jumping' : 'walking');
    }

    if (moveState === 'standing') {
      bot.pos.yaw     = (bot.pos.yaw + (Math.random() - 0.5) * 30 + 360) % 360;
      bot.pos.headYaw = bot.pos.yaw + (Math.random() - 0.5) * 45;
      bot.onGround    = true;
    } else {
      dir += (Math.random() - 0.5) * 0.7;
      const speed = 0.2 + Math.random() * 0.5;
      bot.pos.x += Math.cos(dir) * speed;
      bot.pos.z += Math.sin(dir) * speed;
      bot.pos.y  = oy;

      if (moveState === 'jumping') {
        bot.velocityY = 0.42;
        bot.onGround  = false;
        moveState     = 'walking';
      } else {
        bot.onGround = true;
      }

      const dx = bot.pos.x - ox, dz = bot.pos.z - oz;
      if (dx * dx + dz * dz > 12 * 12) {
        dir = Math.atan2(oz - bot.pos.z, ox - bot.pos.x);
      }

      bot.pos.yaw     = ((dir * 180 / Math.PI) + 90 + 360) % 360;
      bot.pos.headYaw = bot.pos.yaw + (Math.random() - 0.5) * 45;
      bot.pos.pitch   = (Math.random() - 0.5) * 15;
    }

    if (!bot.onGround) {
      bot.velocityY -= 0.08;
      bot.pos.y     += bot.velocityY;
      if (bot.pos.y <= oy) {
        bot.pos.y     = oy;
        bot.velocityY = 0;
        bot.onGround  = true;
      }
    }

    sendGame(bot, movePkt(bot));
  }, 1500 + randomDelay(0, 800));
}

// ─── Chat spam ────────────────────────────────────────────────────────────────
function startChat(bot) {
  if (bot.chatTimer || bot.isClosing || MENSAJES.length === 0) return;
  bot.chatTimer = setInterval(() => {
    if (!bot.spawned || bot.isClosing || tiempoTerminado) return;
    const msg = MENSAJES[globalMsgIdx++ % MENSAJES.length];
    sendGame(bot, chatPkt(bot, msg));
    console.log(`[${bot.nombre}] Chat → "${msg}"`);
  }, MSG_INTERVALO * 1000 + randomDelay(-2000, 3000));
}

// ─── Spawn ────────────────────────────────────────────────────────────────────
function onSpawn(bot) {
  if (bot.spawned) return;
  bot.spawned = true;
  botsConectados++;
  if (!botsActivos.includes(bot)) botsActivos.push(bot);

  if (bot._spawnTimeout) {
    clearTimeout(bot._spawnTimeout);
    bot._spawnTimeout = null;
  }
  activeConnections--;

  console.log(`[${bot.nombre}] ✓ En juego total=${botsConectados}/${BOTS} [Pool: ${activeConnections}]`);

  processQueue();

  setTimeout(() => {
    if (!bot.isClosing && !tiempoTerminado) sendRegister(bot);
  }, randomDelay(800, 2500));

  setTimeout(() => {
    if (!bot.isClosing && !tiempoTerminado) {
      startMovement(bot);
      startChat(bot);
    }
  }, randomDelay(1000, 3000));
}

// ─── Cerrar bot ───────────────────────────────────────────────────────────────
function cerrarBot(bot) {
  if (bot.isClosing) return;
  bot.isClosing  = true;
  bot.connected  = false;

  if (!bot.spawned && bot._spawnTimeout) {
    clearTimeout(bot._spawnTimeout);
    activeConnections--;
    processQueue();
  }

  if (bot.spawned) {
    bot.spawned = false;
    botsConectados--;
  }

  clearTimeout(bot.spawnFallback);
  clearTimeout(bot.mtuRetryT);
  clearTimeout(bot.req2RetryT);
  if (bot.moveTimer) { clearInterval(bot.moveTimer); bot.moveTimer = null; }
  if (bot.chatTimer) { clearInterval(bot.chatTimer); bot.chatTimer = null; }
  if (bot.keepalive) { clearInterval(bot.keepalive); bot.keepalive = null; }
  if (bot.sock) { try { bot.sock.close(); } catch(e) {} bot.sock = null; }
  console.log(`[${bot.nombre}] Desconectado [Total: ${botsConectados}/${BOTS}]`);
}

// ─── Iniciar bot ──────────────────────────────────────────────────────────────
function iniciarBot(numero) {
  const bot = {
    id: numero,
    nombre: randomName(NOMBRE),
    uuid: randomUUID(),
    xuid: randomXUID(),
    phase: 'UNCONNECTED',
    clientId: BigInt('0x' + crypto.randomBytes(8).toString('hex')),
    mtuSize: MTU_LIST[0],
    mtuIdx: 0,
    mtuSent: 0,
    serverGUID: 0n,
    sendSeq: 0,
    msgIndex: 0,
    orderIndex: 0,
    splitId: 0,
    ackQueue: [],
    splitMap: new Map(),
    sentFrames: new Map(),
    entityId: 0n,
    proto: 84,
    variantA: false,
    rpackDone: false,
    rpackRespSent: false,
    pos: { x: 0, y: 64, z: 0, yaw: 0, headYaw: 0, pitch: 0 },
    velocityY: 0,
    onGround: true,
    spawned: false,
    connected: false,
    moveTimer: null,
    chatTimer: null,
    keepalive: null,
    spawnFallback: null,
    mtuRetryT: null,
    req2RetryT: null,
    isClosing: false,
    registerSent: false,
    sock: null,
    reconnecting: false,
    _spawnTimeout: null,
    _unk: {},
  };

  const sock = dgram.createSocket('udp4');
  bot.sock = sock;

  sock.on('error', () => {});
  sock.on('message', (msg) => { handleSocketMessage(bot, msg, sock); });

  sock.bind(0, () => {
    console.log(`[${bot.nombre}] Iniciado (puerto ${sock.address().port})`);
    iniciarConexion(bot, sock);
  });

  bot.keepalive = setInterval(() => {
    if (tiempoTerminado || bot.isClosing) {
      clearInterval(bot.keepalive);
      return;
    }
    if (bot.phase === 'LOGIN' || bot.spawned)
      _sendFrame(bot, new W().u8(RAK.CONN_PING).i64be(BigInt(Date.now())).buf(), false, 0, 0, 0);
  }, 4000 + randomDelay(0, 2000));

  const timeoutId = setTimeout(() => {
    if (!bot.spawned && !bot.isClosing) {
      console.log(`[${bot.nombre}] ⏰ Timeout (${BOT_SPAWN_TIMEOUT/1000}s) - reintentando...`);
      cerrarBot(bot);
      failedBots.push(numero);
      activeConnections--;

      setTimeout(() => {
        if (!tiempoTerminado) {
          failedBots = failedBots.filter(b => b !== numero);
          connectionQueue.push(numero);
          console.log(`[Master] Reintentando bot #${numero}...`);
          processQueue();
        }
      }, randomDelay(5000, 15000));
    }
  }, BOT_SPAWN_TIMEOUT);

  bot._spawnTimeout = timeoutId;
  return bot;
}

// ─── Sistema de cola para conexiones masivas ──────────────────────────────────
function processQueue() {
  if (tiempoTerminado || connectionQueue.length === 0) return;
  while (activeConnections < MAX_CONCURRENT_CONNECTIONS && connectionQueue.length > 0) {
    const botNum = connectionQueue.shift();
    activeConnections++;
    iniciarBot(botNum);
  }
}

// ─── Tiempo límite ────────────────────────────────────────────────────────────
if (TIEMPO > 0) {
  setTimeout(() => {
    console.log(`\n[Master] ${TIEMPO}s → desconectando ${botsActivos.length} bots`);
    tiempoTerminado = true;
    botsActivos.forEach(bot => {
      try {
        if (bot.sock && !bot.isClosing) {
          _sendFrame(bot, new W().u8(RAK.DISCONN).buf(), false, 0, 0, 0);
          setTimeout(() => cerrarBot(bot), 200);
        } else cerrarBot(bot);
      } catch(e) { cerrarBot(bot); }
    });
    console.log(`[Master] Total conectados: ${botsConectados}`);
    setTimeout(() => process.exit(0), 1500);
  }, TIEMPO * 1000);
} else {
  console.log('[Master] Sin límite. Ctrl+C para parar.\n');
}

// ─── Lanzar bots ─────────────────────────────────────────────────────────────
console.log(`[Master] Lanzando ${BOTS} bots (máx ${MAX_CONCURRENT_CONNECTIONS} simultáneos, timeout ${BOT_SPAWN_TIMEOUT/1000}s)...\n`);

for (let i = 0; i < BOTS; i++) connectionQueue.push(i);

// ─── Cargar skin y arrancar ───────────────────────────────────────────────────
const SKIN_PATH = path.join(__dirname, 'skin.png');

loadSkinFromPng(SKIN_PATH).then(b64 => {
  if (b64) {
    STEVE_SKIN = b64;
    console.log('[Skin] ✅ Usando skin.png personalizada');
  } else {
    STEVE_SKIN = buildFallbackSkin();
    console.log('[Skin] ⚠️  Usando skin de Steve por defecto (pon skin.png para personalizar)');
  }

  processQueue();

  // Monitor de progreso
  setInterval(() => {
    if (!tiempoTerminado && (botsConectados < BOTS || connectionQueue.length > 0)) {
      console.log(`[Master] 📊 Progreso: ${botsConectados}/${BOTS} conectados | Cola: ${connectionQueue.length} | Pool: ${activeConnections} | Reintentos: ${failedBots.length}`);
    }
  }, 15000);
});

process.on('SIGINT', () => {
  console.log('\n[Master] Ctrl+C → cerrando...');
  tiempoTerminado = true;
  botsActivos.forEach(bot => cerrarBot(bot));
  setTimeout(() => process.exit(0), 500);
});
