// Compatibility stub for
//   react-native/src/private/webapis/performance/Performance.js
//
// -----------------------------------------------------------------------------
// Background
// -----------------------------------------------------------------------------
// React Native 0.79.3 ships this file with Flow-typed, multi-line
// `import` statements that hermes-parser@0.25.1 (as pulled in by
// @expo/metro-config's transformSync) fails to parse:
//
//   SyntaxError: '{' expected in import specifier clause (19:7)
//   import
//          ^
//
// That aborts the iOS/Android bundle before it can even start.
//
// Nothing in this app uses the internal `Performance` class from RN's
// private webapis directly — it's only referenced by RN's own core
// setup for perf tracing/tracing tools we don't rely on. Metro's
// resolver in metro.config.js redirects any require of the real file
// to this stub, which exposes the same public API surface with pure
// JS (no Flow syntax) so the bundle succeeds and any code that
// happens to call these APIs at runtime gets a no-op equivalent.

'use strict';

const _timeOrigin = typeof Date !== 'undefined' ? Date.now() : 0;

function _now() {
  if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
    return performance.now();
  }
  if (typeof Date !== 'undefined') return Date.now() - _timeOrigin;
  return 0;
}

class PerformanceEntry {
  constructor(init) {
    init = init || {};
    this.name = init.name || '';
    this.entryType = init.entryType || 'mark';
    this.startTime = init.startTime != null ? init.startTime : _now();
    this.duration = init.duration != null ? init.duration : 0;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
    };
  }
}

class PerformanceMark extends PerformanceEntry {
  constructor(name, options) {
    super({
      name: name,
      entryType: 'mark',
      startTime:
        options && options.startTime != null ? options.startTime : _now(),
      duration: 0,
    });
    this.detail = (options && options.detail) || null;
  }
}

class PerformanceMeasure extends PerformanceEntry {
  constructor(name, options) {
    super({
      name: name,
      entryType: 'measure',
      startTime: (options && options.startTime) || 0,
      duration: (options && options.duration) || 0,
    });
    this.detail = (options && options.detail) || null;
  }
}

class Performance {
  constructor() {
    this.timeOrigin = _timeOrigin;
    this._marks = new Map();
    this._measures = [];
  }

  now() {
    return _now();
  }

  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._marks.set(name, entry);
    return entry;
  }

  clearMarks(name) {
    if (name == null) {
      this._marks.clear();
    } else {
      this._marks.delete(name);
    }
  }

  measure(name, startOrOptions, endMark) {
    let start = 0;
    let end = _now();
    if (typeof startOrOptions === 'string') {
      const s = this._marks.get(startOrOptions);
      if (s) start = s.startTime;
      if (endMark) {
        const e = this._marks.get(endMark);
        if (e) end = e.startTime;
      }
    } else if (startOrOptions && typeof startOrOptions === 'object') {
      if (startOrOptions.start != null) start = startOrOptions.start;
      if (startOrOptions.end != null) end = startOrOptions.end;
    }
    const entry = new PerformanceMeasure(name, {
      startTime: start,
      duration: Math.max(0, end - start),
    });
    this._measures.push(entry);
    return entry;
  }

  clearMeasures(name) {
    if (name == null) {
      this._measures = [];
    } else {
      this._measures = this._measures.filter((m) => m.name !== name);
    }
  }

  clearResourceTimings() {}
  setResourceTimingBufferSize() {}

  getEntries() {
    return [].concat(Array.from(this._marks.values()), this._measures);
  }

  getEntriesByName(name, type) {
    return this.getEntries().filter(
      (e) => e.name === name && (!type || e.entryType === type),
    );
  }

  getEntriesByType(type) {
    return this.getEntries().filter((e) => e.entryType === type);
  }

  toJSON() {
    return { timeOrigin: this.timeOrigin };
  }
}

// Match how RN's real Performance.js exposes itself: default export is
// the Performance class. Also expose as a named export for consumers
// that destructure.
module.exports = Performance;
module.exports.default = Performance;
module.exports.Performance = Performance;
module.exports.PerformanceEntry = PerformanceEntry;
module.exports.PerformanceMark = PerformanceMark;
module.exports.PerformanceMeasure = PerformanceMeasure;
