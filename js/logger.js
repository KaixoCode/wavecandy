
// ------------------------------------------------

class Logger {

  // ------------------------------------------------

  static enableLogging = true;
  static objectColors = {};

  // ------------------------------------------------

  constructor(name) {
    if (!(name in Logger.objectColors)) {
      let hue = 0;
      for (const c of name) hue += c.charCodeAt(0);
      hue %= 360;
      Logger.objectColors[name] = `hsl(${hue}, 80%, 60%)`;
    }

    this._color = Logger.objectColors[name];
    this._identifier = name;
  }

  // ------------------------------------------------

  set identifier(value) { this._identifier = value; }
  get identifier() { return this._identifier; }

  // ------------------------------------------------

  error = message => { if (Logger.enableLogging) console.error(`%c[${this._identifier}]`, `color:${this._color}`, message); }
  log = message => { if (Logger.enableLogging) console.log(`%c[${this._identifier}]`, `color:${this._color}`, message); }
  debug = message => { if (Logger.enableLogging) console.debug(`%c[${this._identifier}]`, `color:${this._color}`, message); }
  trace = message => { if (Logger.enableLogging) console.trace(`%c[${this._identifier}]`, `color:${this._color}`, message); }
  info = message => { if (Logger.enableLogging) console.info(`%c[${this._identifier}]`, `color:${this._color}`, message); }

  // ------------------------------------------------

};

// ------------------------------------------------