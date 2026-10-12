// 3점 휨 시험대: 단순지지보 중앙 집중하중의 처짐 δ = PL³ / 48EI 를 보여주는 그림.
// node build.mjs [--light]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

// ── 모델 (mm, N, MPa) ─────────────────────────────────────────────
const M = {
  L: 1000, // 지점 간 거리
  OVER: 50, // 지점 밖 내민 길이
  B: 40, // 보 폭
  E: 200000, // 강재 탄성계수 200 GPa
  DEPTHS: [20, 30, 40], // 보 춤
  PMAX: 2000, // 최대 하중 2 kN
  LIMIT: 360, // 사용성 기준 L/360
  U: 0.25, // 그림 단위 / mm
  EXAG: 8, // 처짐 과장 배율 (그림에서만)
};

// 모델과 보 형상: 빌드와 페이지가 같은 소스를 쓴다.
const SHARED = `
function deflect(xmm, load, hmm, M) {
  const I = M.B * hmm * hmm * hmm / 12;
  const EI = M.E * I;
  const a = M.L / 2 - Math.abs(xmm);
  if (a >= 0) return load * a * (3 * M.L * M.L - 4 * a * a) / (48 * EI);
  return -(load * M.L * M.L / (16 * EI)) * -a;
}
function beamPaths(load, hmm, M, ZB, P) {
  const X = (M.L / 2 + M.OVER) * M.U, F = M.B * M.U / 2, K = -F, H = hmm * M.U, N = 44;
  const bot = (x) => ZB - deflect(x / M.U, load, hmm, M) * M.U * M.EXAG;
  const xs = Array.from({ length: N + 1 }, (_, i) => -X + (2 * X * i) / N);
  const at = (p) => iso(p, P);
  const fTop = xs.map((x) => at([x, F, bot(x) + H]));
  const fBot = xs.map((x) => at([x, F, bot(x)]));
  const kTop = xs.map((x) => at([x, K, bot(x) + H]));
  const zr = bot(X);
  const end = [at([X, F, zr]), at([X, K, zr]), at([X, K, zr + H]), at([X, F, zr + H])];
  const { sinA, cosA } = cameraOf(P);
  const bucket = (nx, ny) => Math.min(3, Math.max(0, Math.floor(((nx * -sinA + ny * cosA + 1) / 2) * 4)));
  const shades = ["", "", "", ""];
  shades[bucket(0, 1)] += pathOf([...fTop, ...[...fBot].reverse()], true);
  shades[bucket(1, 0)] += pathOf(end, true);
  const outline = pathOf([...fBot, end[1], end[2], ...[...kTop].reverse(), fTop[0]], true);
  return {
    fill: outline,
    outline,
    crease: pathOf(fTop) + pathOf([end[0], end[3], end[2]]),
    top: pathOf([...fTop, ...[...kTop].reverse()], true),
    shades,
  };
}
`;
const { deflect, beamPaths } = new Function("iso", "pathOf", "cameraOf", `${SHARED}; return { deflect, beamPaths };`)(k.iso, k.pathOf, k.cameraOf);

// ── 배치 (그림 단위, z 위) ────────────────────────────────────────
const WIDTH = 640;
const HEIGHT = 430;
const PLATE = { x: -190, y: -44, w: 380, d: 126, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;
const BED = { x: -152, y: -18, w: 304, d: 36, r: 2 };
const BED_H = 3;
const SUP_X = (M.L / 2) * M.U; // 125
const PED_H = 16;
const ROLL_R = 4;
const ROLL_Z = BED_H + PED_H + 2 + ROLL_R; // 롤러 중심
const ZB = ROLL_Z + ROLL_R; // 지점 위 보 밑면
const H_REF = 30;
const TOP_REF = ZB + H_REF * M.U; // 기준 보 윗면
const COL_X = 168;
const COL_R = 6;
const CB = 90; // 크로스헤드 밑
const CT = 112; // 크로스헤드 위
const CROSS = { x: -COL_X - 12, y: -11, w: (COL_X + 12) * 2, d: 22, r: 4 };
const DIAL = [-32, 30];
const DIAL_R = 17;
const DIAL_Z = TOP_REF + 34;
const DIAL_H = 8;
const DIAL_TOP = DIAL_Z + DIAL_H;
const STEM_BOT = DIAL_Z - 20;
const POST = [-80, 30];
const MAG = { x: -96, y: 20, w: 32, d: 24, r: 3 };
const MAG_H = 18;
const ARM_Z = DIAL_Z + 1;
const TAB_Z = ZB - 1.4; // 탭 윗면: 보 밑면 바로 아래
const TAB = { x: -6, y: M.B * M.U / 2 + 1.6, w: 12, d: 22, r: 1.5 };
const TAB2 = { x: DIAL[0] - 7, y: TAB.y + TAB.d - 9, w: 13 - DIAL[0], d: 16, r: 1.5 };
const WHEEL_Z = CT + 16;
const WHEEL_R = 17;
const PITCH = 2; // 나사 한 바퀴 2 mm

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...k.boxCorners(CROSS, CB, CT), [0, 0, WHEEL_Z + 12], [DIAL[0] + DIAL_R, DIAL[1], DIAL_TOP]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 60 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const alongY = (x, z) => G.frameAlong([x, 0, z], [0, 1, 0]);

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // 이름판
  const label = { x: 100, y: 50, w: 56, d: 20, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  [[6, 40], [10, 30], [14, 36]].forEach(([dy, len]) => out.push(L(k.lineOnTop([label.x + 6, label.y + dy], [label.x + 6 + len, label.y + dy], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([label.x + 2.4, label.y + 2.4, 0.8]), at([label.x + label.w - 2.4, label.y + label.d - 2.4, 0.8])], { size: 0.45 }));
  return out.join("");
}

function bed() {
  const out = [];
  out.push(S(k.slabOf(BED, 0, BED_H, P, 3, 0.5), { tone: "mid" }));
  // T홈 두 줄
  for (const y of [-9, 3]) out.push(S(k.slabOf({ x: BED.x + 6, y, w: BED.w - 12, d: 3, r: 1.2 }, BED_H - 0.1, 0.1, P, 3), { tone: "lo", flat: true, crease: "none" }));
  // 눈금자: 25 단위 = 100 mm, 작은 눈금 20 mm
  const strip = { x: -SUP_X - 6, y: 11, w: SUP_X * 2 + 12, d: 5, r: 0.8 };
  out.push(S(k.slabOf(strip, BED_H, 0.5, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(-SUP_X, SUP_X, 5, 5, strip.y, BED_H + 0.5, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([0, strip.y], [0, strip.y + 4.6], BED_H + 0.5, P), { tone: "hi" }));
  out.push(D([BED.x + 3, BED.x + BED.w - 3].flatMap((x) => [at([x, -12, BED_H]), at([x, 12, BED_H])]), { size: 0.45 }));
  return out.join("");
}

function column(x) {
  const out = [];
  out.push(S(k.cylinder(x, 0, COL_R + 4, 0, 4, P, 32, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(x, 0, COL_R + 2, 4, 3, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(x, 0, COL_R, 7, CB - 7, P, 32), { tone: "mid", crease: "none", inner: L([30, 60, 90].map((z) => k.sideArc(x, 0, COL_R, z, P, 20)).join(""), { tone: "faint" }) }));
  out.push(D(k.circleRing(x, 0, COL_R + 2.6, 6).filter(([px, py]) => (px - x) * Math.cos(0.7) + py * Math.sin(0.7) > -2).map(([px, py]) => at([px, py, 4])), { size: 0.45 }));
  return out.join("");
}

function support(x, pinned) {
  const out = [];
  const ped = { x: x - 9, y: -12, w: 18, d: 24, r: 1.5 };
  out.push(S(k.slabOf(ped, BED_H, PED_H - 3, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(ped, 1.5), BED_H + PED_H - 3, 3, P, 3, 0.4), { tone: "mid" }));
  out.push(D(k.corners(ped, 3).map(([px, py]) => at([px, py, BED_H + PED_H - 3])), { size: 0.45 }));
  const seat = { x: x - 5.5, y: -11, w: 11, d: 22, r: 0.8 };
  out.push(S(k.slabOf(seat, BED_H + PED_H, 2, P, 2, 0.3), { tone: "lo" }));
  const F = alongY(x, ROLL_Z);
  const keeper = (y) => S(k.slabOf({ x: x - 4.5, y, w: 9, d: 2, r: 0.6 }, BED_H + PED_H, ROLL_R * 2 + 2, P, 2, 0.3), { tone: "mid" });
  if (pinned) out.push(keeper(-12.6));
  out.push(S(G.disc(-10.6, 10.6, ROLL_R, F, P), { tone: "hi", inner: L(G.arcOf(F, 0, ROLL_R, P), { tone: "faint" }) }));
  if (pinned) {
    out.push(keeper(10.6));
    out.push(D([at([x, 11.6, ROLL_Z])], { size: 0.6, tone: "hi" }));
  }
  return out.join("");
}

// 하중 장치(하중 롤러, 블록, 로드셀, 나사봉): 기준 보 춤에서 짓고 통째로 옮긴다.
function noseAssembly() {
  const out = [];
  const z0 = TOP_REF;
  const rod = { from: z0 + 33, to: CT - 3 };
  out.push(S(k.cylinder(0, 0, 3, rod.from, rod.to - rod.from, P, 24), { tone: "mid", crease: "none", inner: L(Array.from({ length: 16 }, (_, i) => k.sideArc(0, 0, 3, rod.from + 2 + i * 2.6, P, 12)).join(""), { tone: "faint" }) }));
  out.push(S(k.cylinder(0, 0, 4.4, z0 + 29, 4, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 9, z0 + 17, 12, P, 48, 0.6), { tone: "mid", inner: L(k.sideArc(0, 0, 9, z0 + 23, P, 32), { tone: "faint" }) }));
  // 로드셀 커넥터
  out.push(S(k.slabOf({ x: 7, y: -2.5, w: 5, d: 5, r: 1 }, z0 + 20.5, 5, P, 2, 0.3), { tone: "lo" }));
  out.push(D([at([12, 0, z0 + 23])], { size: 0.7, tone: "mid" }));
  out.push(S(k.slabOf({ x: -8, y: -11, w: 16, d: 22, r: 1.5 }, z0 + 7, 10, P, 3, 0.6), { tone: "mid" }));
  out.push(D([at([-5, 8, z0 + 17]), at([5, 8, z0 + 17]), at([5, -8, z0 + 17])], { size: 0.45 }));
  out.push(S(k.slabOf({ x: -4.5, y: -10.5, w: 9, d: 21, r: 0.6 }, z0 + 5, 2, P, 2), { tone: "lo" }));
  const F = alongY(0, z0 + ROLL_R);
  out.push(S(G.disc(-10, 10, ROLL_R, F, P), { tone: "hi", inner: L(G.arcOf(F, 0, ROLL_R, P), { tone: "faint" }) }));
  return out.join("");
}

function crosshead() {
  const out = [];
  out.push(S(k.slabOf(CROSS, CB, CT - CB, P, 4, 1), { tone: "mid", inner: L(k.sideSeam(CROSS, CB + 4, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(CROSS, 4), CT, P, 4), { tone: "faint" }));
  for (const x of [-COL_X, COL_X]) {
    out.push(S(k.cylinder(x, 0, COL_R + 3, CT, 4, P, 6), { tone: "mid" }));
    out.push(S(k.cylinder(x, 0, COL_R - 1, CT + 4, 2, P, 24), { tone: "mid" }));
  }
  out.push(D([-120, -60, 60, 120].map((x) => at([x, 7, CT])), { size: 0.45 }));
  out.push(S(k.cylinder(0, 0, 8, CT, 4, P, 6, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 3, CT + 4, WHEEL_Z - CT - 4, P, 24), { tone: "mid", crease: "none", inner: L([CT + 7, CT + 10, CT + 13].map((z) => k.sideArc(0, 0, 3, z, P, 12)).join(""), { tone: "faint" }) }));
  out.push(S(k.cylinder(0, 0, WHEEL_R, WHEEL_Z, 3, P, 72, 0.6), { tone: "mid", inner: L(k.sideArc(0, 0, WHEEL_R, WHEEL_Z + 1.5, P, 48), { tone: "faint" }) }));
  out.push(L(k.ring(0, 0, WHEEL_R - 3, WHEEL_Z + 3, P, 64), { tone: "lo" }));
  out.push(L(k.knurl(0, 0, WHEEL_R, WHEEL_Z, WHEEL_Z + 3, 90, P, 0.3), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, 5, WHEEL_Z + 3, 2.5, P, 24, 0.4), { tone: "mid" }));
  out.push(D([at([0, 0, WHEEL_Z + 5.5])], { size: 0.8, tone: "mid" }));
  return out.join("");
}

const handleOf = (turn) => {
  const a = turn * Math.PI * 2;
  const x = Math.cos(a) * (WHEEL_R - 3.5);
  const y = Math.sin(a) * (WHEEL_R - 3.5);
  return k.solidSvg(k.cylinder(x, y, 1.9, WHEEL_Z + 3, 9, P, 20), { tone: "mid" }) + k.solidSvg(k.cylinder(x, y, 2.3, WHEEL_Z + 12, 1, P, 20), { tone: "mid" });
};

// 처짐 측정 브래킷: 보 중앙 앞면에 붙어 보와 함께 내려간다.
function bracket() {
  const out = [];
  const yF = M.B * M.U / 2;
  const h = M.DEPTHS[0] * M.U - 1;
  out.push(S(k.slabOf({ x: -6, y: yF, w: 12, d: 1.6, r: 0.3 }, TAB_Z - 1.6, ZB + h - TAB_Z + 1.6, P, 2, 0.3), { tone: "mid" }));
  out.push(D([at([-3.5, yF + 1.6, ZB + h / 2]), at([3.5, yF + 1.6, ZB + h / 2])], { size: 0.45 }));
  out.push(S(k.slabOf(TAB2, TAB_Z - 1.6, 1.6, P, 2, 0.3), { tone: "mid" }));
  out.push(S(k.slabOf(TAB, TAB_Z - 1.6, 1.6, P, 2, 0.3), { tone: "mid" }));
  out.push(D([at([0, TAB.y + TAB.d - 5, TAB_Z]), at([-8, TAB.y + TAB.d - 5, TAB_Z])], { size: 0.45 }));
  out.push(L(k.ring(DIAL[0], DIAL[1], 2.6, TAB_Z, P, 16), { tone: "faint" }));
  return out.join("");
}

function plunger() {
  const out = [];
  out.push(S(k.cylinder(DIAL[0], DIAL[1], 1.8, TAB_Z, 1.6, P, 20), { tone: "hi", lit: true }));
  out.push(S(k.cylinder(DIAL[0], DIAL[1], 1.1, TAB_Z + 1.6, DIAL_Z - TAB_Z - 2, P, 16), { tone: "hi", crease: "none", lit: true }));
  return out.join("");
}

function stand() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(MAG, 0, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(MAG, 0, 10, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(MAG, 0.8), 10, MAG_H - 10, P, 6, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(MAG, 3), MAG_H, P), { tone: "faint" }));
  const knob = [MAG.x + 24, MAG.y + 17];
  out.push(S(k.cylinder(POST[0], POST[1], 5, MAG_H, 4, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(knob[0], knob[1], 5, MAG_H, 4, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1], 5, MAG_H, MAG_H + 4, 30, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([knob[0] - 2, knob[1]], [knob[0] + 5, knob[1]], MAG_H + 4, P), { tone: "hi" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3, MAG_H + 4, ARM_Z - 4 - MAG_H - 4, P, 24), { tone: "mid", crease: "none" }));
  const clamp = { x: POST[0] - 6.5, y: POST[1] - 6.5, w: 13, d: 13, r: 2.4 };
  out.push(S(k.slabOf(clamp, ARM_Z - 4, 11, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3, ARM_Z + 7, 14, P, 24), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.6, ARM_Z + 21, 2, P, 24), { tone: "mid" }));
  const thumb = [POST[0], clamp.y + clamp.d + 2.4];
  out.push(S(k.slabOf({ x: thumb[0] - 1.4, y: clamp.y + clamp.d, w: 2.8, d: 2.6, r: 0.8 }, ARM_Z, 4, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(thumb[0], thumb[1] + 1.2, 2.5, ARM_Z - 1, 6, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(thumb[0], thumb[1] + 1.2, 2.5, ARM_Z - 1, ARM_Z + 5, 18, P), { tone: "lo" }));
  return out.join("");
}

function dial() {
  const out = [];
  const [x, y] = DIAL;
  const arm = { x: POST[0] + 6.5, y: y - 3, w: x - DIAL_R - POST[0] - 6.5 + 1, d: 6, r: 2 };
  out.push(S(k.slabOf(arm, ARM_Z, 4, P, 4, 0.5), { tone: "mid" }));
  out.push(D([at([arm.x + 4, y, ARM_Z + 4]), at([arm.x + arm.w - 5, y, ARM_Z + 4])], { size: 0.45 }));
  out.push(S(k.cylinder(x, y, 3, STEM_BOT, DIAL_Z - STEM_BOT, P, 20), { tone: "mid", inner: L(k.sideArc(x, y, 3, STEM_BOT + 4, P, 12), { tone: "lo" }) }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3, DIAL_TOP, 80, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, DIAL_TOP - 3, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 2, 50, 5, DIAL_TOP, [1.1, 2.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // 회전수 계기 (1 mm 마다 한 칸, 10 칸)
  const sub = [x + 5.6, y - 3.2];
  out.push(L(k.ring(sub[0], sub[1], 3, DIAL_TOP, P, 32), { tone: "lo" }));
  const st = k.radialTicks(sub[0], sub[1], 3, 10, 5, DIAL_TOP, [0.7, 1.1], P);
  out.push(L(st.minor, { tone: "lo" }), L(st.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.4, DIAL_TOP, P, 16), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x - 4.5, y + 6], DIAL_TOP, P, "x"), "mm", { size: 2.2, tone: "lo", anchor: "middle" }));
  // 뒤쪽 러그
  out.push(S(k.slabOf({ x: x - DIAL_R - 3, y: y - 2.4, w: 4, d: 4.8, r: 1 }, DIAL_Z + 1.5, 5, P, 3), { tone: "mid" }));
  return out.join("");
}

const needleOf = (turn, cx, cy, r, tail, z) => {
  const a = turn * Math.PI * 2;
  return k.lineOnTop([cx - Math.sin(a) * tail, cy + Math.cos(a) * tail], [cx + Math.sin(a) * r, cy - Math.cos(a) * r], z, P);
};

const P0 = 1000;
const H0 = 30;
const beam0 = beamPaths(P0, H0, M, ZB, P);
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "3점 휨 시험대. 바닥판 위 베드에 두 지점(왼쪽 핀, 오른쪽 롤러)이 1000 mm 간격으로 놓이고, 그 위에 폭 40 mm 강재 보가 걸쳐 있다. 두 기둥이 받친 크로스헤드의 나사봉과 핸들이 로드셀과 하중 롤러를 보 중앙에 눌러 내리고, 보 중앙에 붙은 브래킷 위에 다이얼 게이지의 측정봉이 닿아 처짐을 읽는다.",
  body: [
    base(),
    bed(),
    column(-COL_X),
    column(COL_X),
    support(-SUP_X, true),
    support(SUP_X, false),
    `<g data-part="beam">${S(beam0, { tone: "hi", crease: "lo" })}</g>`,
    `<g data-part="nose">${noseAssembly()}</g>`,
    crosshead(),
    `<g data-part="handle">${handleOf(0)}</g>`,
    `<g data-part="bracket">${bracket()}</g>`,
    stand(),
    `<g data-part="plunger">${plunger()}</g>`,
    dial(),
    `<path data-part="counter" class="iso-line" data-tone="mid" data-free="start" d="${needleOf(0, DIAL[0] + 5.6, DIAL[1] - 3.2, 2.4, 0.6, DIAL_TOP + 0.1)}"/>`,
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleOf(0, DIAL[0], DIAL[1], DIAL_R - 3, 3, DIAL_TOP + 0.2)}" style="stroke-width:1.1"/>`,
  ],
});

const live = `
${SHARED}
const P = ${JSON.stringify(P)};
const M = ${JSON.stringify(M)};
const ZB = ${ZB}, TOP_REF = ${TOP_REF}, H_REF = ${H_REF}, PITCH = ${PITCH};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP};
const WHEEL_Z = ${WHEEL_Z}, WHEEL_R = ${WHEEL_R};
const needleOf = ${needleOf.toString().replace("k.lineOnTop", "lineOnTop")};
const handleOf = ${handleOf.toString().replaceAll("k.", "")};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const beam = part("beam"), nose = part("nose"), bracket = part("bracket"), plunger = part("plunger"), needle = part("needle"), counter = part("counter"), handle = part("handle");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let load = ${P0}, depth = ${H0}, wantLoad = load, pick = 1, frame = 0, last = 0, clock = 0, touring = true, visible = false, idle = 0;
const kn = (n) => (n / 1000).toFixed(2);
function draw() {
  const sagMm = deflect(0, load, depth, M);
  const shift = (depth - H_REF) * M.U - sagMm * M.U * M.EXAG;
  beam.innerHTML = solidSvg(beamPaths(load, depth, M, ZB, P), { tone: "hi", crease: "lo" });
  const move = translateAlong(P, [0, 0, shift]);
  const drop = translateAlong(P, [0, 0, -sagMm * M.U * M.EXAG]);
  nose.setAttribute("transform", move);
  bracket.setAttribute("transform", drop);
  plunger.setAttribute("transform", drop);
  needle.setAttribute("d", needleOf(sagMm, DIAL[0], DIAL[1], DIAL_R - 3, 3, DIAL_TOP + 0.2));
  counter.setAttribute("d", needleOf(sagMm / 10, DIAL[0] + 5.6, DIAL[1] - 3.2, 2.4, 0.6, DIAL_TOP + 0.1));
  handle.innerHTML = handleOf((sagMm + depth - H_REF) / PITCH);
  const ratio = sagMm > 1e-6 ? M.L / sagMm : Infinity;
  const ok = ratio >= M.LIMIT;
  const text = "P " + kn(load) + " kN · 춤 " + Math.round(depth) + " mm · δ " + sagMm.toFixed(2) + " mm · " + (isFinite(ratio) ? "L/" + Math.round(ratio) : "L/∞") + (ok ? " ✓" : " > L/360");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(load)));
  stage.setAttribute("aria-valuetext", text);
}
const tourLoad = (t) => M.PMAX * 0.5 * (1 - Math.cos((t / 7) * Math.PI * 2));
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) {
    const before = Math.floor(clock / 7);
    clock += dt;
    if (Math.floor(clock / 7) !== before) pick = (pick + 1) % M.DEPTHS.length;
    wantLoad = tourLoad(clock);
  }
  const wantDepth = M.DEPTHS[pick];
  const ease = calm ? 1 : 1 - Math.exp(-dt / 0.3);
  load += (wantLoad - load) * ease;
  depth += (wantDepth - depth) * ease;
  if (Math.abs(wantLoad - load) < 0.5) load = wantLoad;
  if (Math.abs(wantDepth - depth) < 0.01) depth = wantDepth;
  draw();
  const settled = !touring && load === wantLoad && depth === wantDepth;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (nextLoad, nextPick = pick) => {
  touring = false;
  wantLoad = clamp(nextLoad, 0, M.PMAX);
  pick = clamp(nextPick, 0, M.DEPTHS.length - 1);
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 4000);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  steer(clamp(((event.clientX - box.left) / box.width - 0.2) / 0.6, 0, 1) * M.PMAX);
});
stage.addEventListener("click", () => steer(wantLoad, (pick + 1) % M.DEPTHS.length));
stage.addEventListener("keydown", (event) => {
  const keys = { ArrowRight: [100, 0], ArrowLeft: [-100, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  if (event.key === "Home") { event.preventDefault(); steer(0); return; }
  if (event.key === "End") { event.preventDefault(); steer(M.PMAX); return; }
  const step = keys[event.key];
  if (!step) return;
  event.preventDefault();
  steer(wantLoad + step[0], pick + step[1]);
});
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "보의 처짐 · 3점 휨",
  hint: "좌우로 움직여 하중 · 클릭(↑↓)으로 보 춤",
  readout: `P ${(P0 / 1000).toFixed(2)} kN · 춤 ${H0} mm`,
  keys: [
    { mark: "lit", label: "다이얼 게이지 측정봉과 바늘: 보 중앙의 처짐 (한 바퀴 1 mm)" },
    { mark: "raised", label: "강재 보 40 mm 폭, 춤 20 · 30 · 40 mm" },
  ],
  caption:
    "단순지지보(지간 L = 1000 mm) 중앙에 집중하중 P를 주면 처짐은 δ = PL³ / 48EI, 직사각형 단면의 I = bh³ / 12 이다. 강재 E = 200 GPa로 계산했다. 하중이 같아도 춤을 두 배로 하면 I가 8배가 되어 처짐은 1/8로 준다. 판정 기준 L/360은 바닥 부재 활하중 처짐 한계의 흔한 예(IBC Table 1604.3)이며, 실제 적용 기준은 설계 기준과 부재에 따라 다르다. 그림의 처짐은 8배 과장했고, 다이얼과 수치는 실제 값이다.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="보의 처짐: 좌우 화살표로 하중, 위아래 화살표로 보 춤" aria-valuemin="0" aria-valuemax="${M.PMAX}" aria-valuenow="${P0}">${svg}</div>`,
});

const name = theme === "light" ? "beam-deflection-light.html" : "beam-deflection.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "보의 처짐", theme, body, script: kitScript() + live }));
console.log("wrote", name);
