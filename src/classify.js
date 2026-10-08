import { Chess } from 'chess.js';

// Move classes, best to worst. `loss` thresholds are in win-percentage points.
export const CLASSES = {
  brilliant: { label: 'Thiên tài', en: 'Brilliant', glyph: '!!', color: '#1baca6' },
  great: { label: 'Tuyệt vời', en: 'Great', glyph: '!', color: '#5c8bb0' },
  best: { label: 'Tốt nhất', en: 'Best', glyph: '★', color: '#81b64c' },
  excellent: { label: 'Xuất sắc', en: 'Excellent', glyph: '👍', color: '#96bc4b' },
  good: { label: 'Tốt', en: 'Good', glyph: '✓', color: '#95b776' },
  forced: { label: 'Bắt buộc', en: 'Forced', glyph: '→', color: '#97af8b' },
  inaccuracy: { label: 'Thiếu chính xác', en: 'Inaccuracy', glyph: '?!', color: '#f7c631' },
  mistake: { label: 'Sai lầm', en: 'Mistake', glyph: '?', color: '#ffa459' },
  blunder: { label: 'Nước đi tệ', en: 'Blunder', glyph: '??', color: '#fa412d' },
};

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Lichess win-probability model: centipawns (side-to-move POV) -> 0..100. */
export function winPct(line) {
  if (line.mate !== undefined) return line.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, line.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Per-move accuracy from win% lost (Lichess formula). */
export function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1));
}

export function formatScore(line, whitePov = true, turn = 'w') {
  const flip = whitePov && turn === 'b' ? -1 : 1;
  if (line.mate !== undefined) {
    const m = line.mate * flip;
    return m > 0 ? `M${m}` : `-M${-m}`;
  }
  const cp = (line.cp * flip) / 100;
  return (cp > 0 ? '+' : '') + cp.toFixed(2);
}

export function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/**
 * Does playing `uci` leave material en prise that the opponent can win?
 * Returns the net material (pawns) given up, after subtracting what the move captured.
 */
export function sacrificedMaterial(fen, uci) {
  const chess = new Chess(fen);
  const mover = chess.turn();
  const opp = mover === 'w' ? 'b' : 'w';
  let move;
  try {
    move = chess.move(uciToMove(uci));
  } catch {
    return 0;
  }
  const captured = move.captured ? VALUE[move.captured] : 0;

  let worst = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== mover || sq.type === 'p' || sq.type === 'k') continue;
      const attackers = chess.attackers(sq.square, opp);
      if (attackers.length === 0) continue;
      const defended = chess.attackers(sq.square, mover).length > 0;
      const attackerValues = attackers
        .map((a) => chess.get(a).type)
        .filter((t) => !(defended && t === 'k'))
        .map((t) => VALUE[t]);
      if (attackerValues.length === 0) continue;
      const val = VALUE[sq.type];
      const loss = defended ? val - Math.min(...attackerValues) : val;
      worst = Math.max(worst, loss);
    }
  }
  return worst - captured;
}

function classFromLoss(loss) {
  if (loss <= 2) return 'excellent';
  if (loss <= 5) return 'good';
  if (loss <= 10) return 'inaccuracy';
  if (loss <= 20) return 'mistake';
  return 'blunder';
}

/**
 * Classify `uci` played from `fen`.
 * @param before engine analysis of `fen` (MultiPV, side-to-move POV)
 * @param after  engine analysis of the resulting position, or a terminal result
 *               ({ terminal: 'mate' | 'draw' }); unused when `uci` is one of
 *               `before`'s lines.
 */
export function classifyMove(fen, uci, before, after) {
  const lines = before.lines;
  const top = lines[0];
  const winBefore = winPct(top);

  let winAfter;
  const own = lines.find((l) => l.pv[0] === uci);
  if (own) winAfter = winPct(own);
  else if (after?.terminal === 'mate') winAfter = 100;
  else if (after?.terminal === 'draw') winAfter = 50;
  else winAfter = 100 - winPct(after.lines[0]);

  const loss = Math.max(0, winBefore - winAfter);
  const result = { loss, winBefore, winAfter, bestUci: top.pv[0] };

  if (new Chess(fen).moves().length === 1) return { ...result, cls: 'forced', loss: 0 };

  const isBest = uci === top.pv[0] || loss < 0.5;

  // A sacrifice that forces mate is brilliant even if the game was already won.
  const forcesMate = own?.mate > 0 || after?.lines?.[0]?.mate < 0;
  if (loss <= 2 && (winBefore < 97 || forcesMate) && winAfter >= 45 && sacrificedMaterial(fen, uci) >= 2) {
    return { ...result, cls: 'brilliant' };
  }
  if (isBest && lines.length > 1 && winAfter >= 25) {
    const gap = winBefore - winPct(lines[1]);
    if (gap >= 15) return { ...result, cls: 'great' };
  }
  if (isBest) return { ...result, cls: 'best' };
  return { ...result, cls: classFromLoss(loss) };
}

/** Label every candidate line of an analysis as if it were played. */
export function classifyCandidates(fen, analysis) {
  return analysis.lines.map((line) => ({
    line,
    uci: line.pv[0],
    ...classifyMove(fen, line.pv[0], analysis),
  }));
}
