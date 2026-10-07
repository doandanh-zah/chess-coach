// Thin UCI wrapper around the Stockfish WASM web worker.
// Jobs run one at a time; each resolves with the final MultiPV lines when the
// engine prints `bestmove`, or with null if the job was dropped before it ran.

export class Engine {
  constructor(url) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e) => this._onLine(String(e.data));
    this.queue = [];
    this.current = null;
    this.waiters = [];
    this.ready = this._init();
  }

  async _init() {
    this._send('uci');
    await this._waitFor('uciok');
    this._send('isready');
    await this._waitFor('readyok');
  }

  _send(cmd) {
    this.worker.postMessage(cmd);
  }

  _waitFor(prefix) {
    return new Promise((resolve) => this.waiters.push({ prefix, resolve }));
  }

  async setOption(name, value) {
    await this.ready;
    this._send(`setoption name ${name} value ${value}`);
  }

  /**
   * @param {string} fen
   * @param {{depth?: number, movetime?: number, multipv?: number, onInfo?: Function}} opts
   * @returns {Promise<null | {fen: string, bestmove: string, depth: number, lines: Array}>}
   */
  analyze(fen, opts = {}) {
    return new Promise((resolve) => {
      this.queue.push({ fen, opts, resolve, lines: [], depth: 0, cancelled: false });
      this._pump();
    });
  }

  /** Drop queued jobs (and stop the running one) whose FEN fails `keep`. */
  prune(keep) {
    this.queue = this.queue.filter((job) => {
      if (keep(job.fen)) return true;
      job.resolve(null);
      return false;
    });
    if (this.current && !this.current.cancelled && !keep(this.current.fen)) {
      this.current.cancelled = true;
      this._send('stop');
    }
  }

  stopAll() {
    this.prune(() => false);
  }

  async _pump() {
    if (this.current || this.queue.length === 0) return;
    const job = this.queue.shift();
    this.current = job;
    await this.ready;
    const { depth = 14, movetime, multipv = 1 } = job.opts;
    this._send(`setoption name MultiPV value ${multipv}`);
    this._send(`position fen ${job.fen}`);
    this._send(movetime ? `go movetime ${movetime}` : `go depth ${depth}`);
  }

  _onLine(line) {
    for (let i = 0; i < this.waiters.length; i++) {
      if (line.startsWith(this.waiters[i].prefix)) {
        this.waiters[i].resolve(line);
        this.waiters.splice(i, 1);
        i--;
      }
    }

    const job = this.current;
    if (!job) return;

    if (line.startsWith('info') && line.includes(' pv ')) {
      const info = parseInfo(line);
      if (!info || info.bound) return;
      job.lines[info.multipv - 1] = info;
      job.depth = Math.max(job.depth, info.depth);
      if (info.multipv === 1 && !job.cancelled) job.opts.onInfo?.(info, job.fen);
    } else if (line.startsWith('bestmove')) {
      const bestmove = line.split(/\s+/)[1];
      this.current = null;
      job.resolve(
        job.cancelled
          ? null
          : { fen: job.fen, bestmove, depth: job.depth, lines: job.lines.filter(Boolean) },
      );
      this._pump();
    }
  }
}

function parseInfo(line) {
  const t = line.split(/\s+/);
  const out = { depth: 0, multipv: 1, cp: undefined, mate: undefined, pv: [], bound: false };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        out.depth = +t[++i];
        break;
      case 'multipv':
        out.multipv = +t[++i];
        break;
      case 'score':
        if (t[i + 1] === 'cp') out.cp = +t[i + 2];
        else if (t[i + 1] === 'mate') out.mate = +t[i + 2];
        i += 2;
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') out.bound = true;
        break;
      case 'pv':
        out.pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  if (out.cp === undefined && out.mate === undefined) return null;
  return out;
}
