/* Renders window.TOPOLOGY (topology-data.js) as two aligned panels. No dependencies, works from file://. */
(function () {
  "use strict";

  var T = window.TOPOLOGY;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var SIDES = ["left", "right"];
  var state = { sel: null, hoverItem: null, hoverFlow: null, showAll: false };

  var itemById = {};
  T.items.forEach(function (it) { itemById[it.id] = it; });

  var grid = document.getElementById("grid");
  var svg = document.getElementById("lines");
  var cardEls = { left: {}, right: {} };
  var detailEls = {};
  var flowEls = { left: {}, right: {} };

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function cell(side, extra) {
    var c = el("div", "cell " + side + (extra ? " " + extra : ""));
    c.dataset.side = side;
    return c;
  }
  function row(build) {          // build(side) returns a cell; appends left then right
    SIDES.forEach(function (s) { grid.appendChild(build(s)); });
  }
  function badge(text, cls) { return el("span", "badge " + cls, text); }

  function builtNets(it) { return (it.nets && it.nets.built) || []; }
  function targetNets(it) { return (it.nets && it.nets.target) || []; }
  function networkDiffers(it) {
    if (it.status !== "built" || !it.nets) return false;
    var b = builtNets(it), t = targetNets(it);
    return t.some(function (n) { return b.indexOf(n) < 0; }) && it.id !== "setup";
  }

  // ---------- summary strip ----------
  function renderSummary() {
    var svcs = T.items.filter(function (i) { return i.kind === "svc"; });
    var built = svcs.filter(function (i) { return i.status === "built"; }).length;
    var partial = svcs.filter(function (i) { return i.status === "partial"; }).length;
    var flowsBuilt = T.flows.filter(function (f) { return f.status === "built"; }).length;
    var nets = T.zones.filter(function (z) { return z.kind === "network"; });
    var netsBuilt = nets.filter(function (z) { return z.exists; }).length;     // front, app, model
    var netsTotal = netsBuilt + 2;                                            // plus transient zbxai_setup and zbxai_test
    var vols = T.items.filter(function (i) { return i.kind === "vol"; });

    var box = document.getElementById("summary");
    var facts = [
      ["Services", built + " built, " + partial + " partly, " + (svcs.length - built - partial) + " to build, of " + svcs.length],
      ["Networks", netsBuilt + " of " + netsTotal + " exist now (the 2 transient ones come and go)"],
      ["Volumes", vols.length + " of " + vols.length],
      ["Flows", flowsBuilt + " of " + T.flows.length + " built"]
    ];
    var dl = el("dl", "facts");
    facts.forEach(function (f) {
      var d = el("div");
      d.appendChild(el("dt", null, f[0]));
      d.appendChild(el("dd", null, f[1]));
      dl.appendChild(d);
    });
    box.appendChild(dl);
    document.getElementById("host").textContent = T.host;
    document.getElementById("asof").textContent = T.asOf;
  }

  // ---------- panels ----------
  function renderTitles() {
    row(function (side) {
      var c = cell(side, "title");
      if (side === "left") {
        c.appendChild(el("h2", null, "Built now"));
        c.appendChild(el("p", null, "As recorded in compose.yaml and topology.md. Dashed items are not built yet."));
      } else {
        c.appendChild(el("h2", null, "Target architecture"));
        c.appendChild(el("p", null, "The designed system from topology.md. A tick marks what is already built."));
      }
      return c;
    });
  }

  function chips(it, side) {
    var wrap = el("span", "chips");
    var target = targetNets(it), built = builtNets(it);
    target.forEach(function (n) {
      var missing = side === "left" && built.indexOf(n) < 0;
      var c = el("span", "chip" + (missing ? " missing" : ""), n);
      if (missing) c.title = "In the target, not attached yet";
      wrap.appendChild(c);
    });
    return wrap;
  }

  function statusBadges(it, side) {
    var wrap = el("span", "badges");
    if (it.kind === "ext") return wrap;
    if (side === "left") {
      if (it.status === "built") wrap.appendChild(badge(it.id === "setup" ? "script built" : "built", "built"));
      else if (it.status === "partial") wrap.appendChild(badge("partly built", "partial"));
      else wrap.appendChild(badge("not built", "planned"));
      if (networkDiffers(it)) wrap.appendChild(badge("network differs", "partial"));
      if (it.observed) wrap.appendChild(badge("observed", "observed"));
    } else {
      if (it.status === "built") wrap.appendChild(badge("✓ built", "built"));
      else if (it.status === "partial") wrap.appendChild(badge("✓ partly built", "partial"));
      else wrap.appendChild(badge("to build", "planned"));
    }
    return wrap;
  }

  function makeCard(it, side) {
    var ghost = side === "left" && (it.status === "planned");
    var b = el("button", "card" + (ghost ? " ghost" : "") + (side === "left" && it.status === "partial" ? " partial" : ""));
    b.type = "button";
    b.dataset.id = it.id;
    b.dataset.side = side;
    b.setAttribute("aria-pressed", "false");
    b.appendChild(el("span", "name", it.name));
    var sub = side === "right" && it.subTarget ? it.subTarget : it.sub;
    b.appendChild(el("span", "sub", sub));
    if (it.nets) b.appendChild(chips(it, side));
    b.appendChild(statusBadges(it, side));
    b.addEventListener("click", function () { select(state.sel === it.id ? null : it.id); });
    b.addEventListener("mouseenter", function () { state.hoverItem = it.id; refresh(); });
    b.addEventListener("mouseleave", function () { state.hoverItem = null; refresh(); });
    b.addEventListener("focus", function () { state.hoverItem = it.id; refresh(); });
    b.addEventListener("blur", function () { state.hoverItem = null; refresh(); });
    cardEls[side][it.id] = b;
    return b;
  }

  function renderZones() {
    T.zones.forEach(function (z) {
      row(function (side) {
        var c = cell(side, "zone zone-" + z.id + " " + z.kind);
        var head = el("div", "zone-head");
        head.appendChild(el("span", "zone-title", z.title));
        var meta = z.meta;
        if (side === "left" && z.leftMeta) meta = z.leftMeta;
        head.appendChild(el("span", "zone-meta", meta));
        if (z.kind === "network") {
          if (side === "left") head.appendChild(badge(z.exists ? "created" : "not present", z.exists ? "built" : "planned"));
          else head.appendChild(badge("target", "target"));
        }
        c.appendChild(head);
        var cards = el("div", "cards");
        T.items.filter(function (i) { return i.zone === z.id; }).forEach(function (it) {
          cards.appendChild(makeCard(it, side));
        });
        c.appendChild(cards);
        return c;
      });
    });
  }

  // ---------- detail row ----------
  function renderDetailRow() {
    row(function (side) {
      var c = cell(side, "detail");
      c.setAttribute("aria-live", "polite");
      detailEls[side] = c;
      return c;
    });
    fillDetails();
  }

  function fillDetails() {
    var it = state.sel ? itemById[state.sel] : null;
    SIDES.forEach(function (side) {
      var c = detailEls[side];
      c.textContent = "";
      if (!it) {
        c.appendChild(el("p", "hint", "Select a component to see its details here and trace its flows in both panels. Escape clears."));
        return;
      }
      c.appendChild(el("h3", null, it.name));
      var dl = el("dl", "kv");
      function add(k, v) { var d = el("div"); d.appendChild(el("dt", null, k)); d.appendChild(el("dd", null, v)); dl.appendChild(d); }
      var st;
      if (side === "left") st = it.status === "built" ? "Built" : it.status === "partial" ? "Partly built" : "Not built";
      else st = "Target" + (it.status === "built" ? ", already built" : it.status === "partial" ? ", partly built" : "");
      add("Status", st);
      if (it.nets) {
        var nets = side === "left" ? builtNets(it) : targetNets(it);
        add("Networks", nets.length ? nets.join(", ") : "none yet");
      }
      Object.keys(it.detail || {}).forEach(function (k) {
        if (side === "left" && it.status === "planned") return;     // nothing exists to describe
        add(k.replace(/_/g, " "), it.detail[k]);
      });
      if (side === "left" && it.status === "planned" && it.detail) {
        add("Planned", Object.keys(it.detail).map(function (k) { return k.replace(/_/g, " ") + ": " + it.detail[k]; }).join(" · "));
      }
      if (side === "left" && it.observed) add("Observed", it.observed);
      var note = side === "left" ? (it.leftNote || it.note) : it.note;
      if (note) add("Note", note);
      var fl = T.flows.filter(function (f) { return f.from.indexOf(it.id) >= 0 || f.to.indexOf(it.id) >= 0; });
      if (fl.length) {
        add("Flows", fl.map(function (f) {
          return f.id.toUpperCase() + " " + f.purpose + (side === "left" && f.status !== "built" ? " (not built)" : "");
        }).join("; "));
      }
      c.appendChild(dl);
    });
    fillSheet(it);
  }

  // Narrow screens: details live in a fixed bottom sheet so selecting never shifts the layout under the finger.
  function fillSheet(it) {
    var sheet = document.getElementById("sheet");
    var body = document.getElementById("sheet-body");
    body.textContent = "";
    sheet.hidden = !it;
    if (!it) return;
    SIDES.forEach(function (side) {
      var sec = el("section", "sheet-sec");
      sec.appendChild(el("h4", null, side === "left" ? "Built now" : "Target"));
      Array.prototype.forEach.call(detailEls[side].childNodes, function (n) {
        if (n.tagName !== "H3") sec.appendChild(n.cloneNode(true));
      });
      body.appendChild(sec);
    });
    var t = el("h3", null, it.name);
    body.insertBefore(t, body.firstChild);
  }

  // ---------- flows table ----------
  function renderFlows() {
    row(function (side) {
      var c = cell(side, "flows-head");
      c.appendChild(el("h3", null, side === "left" ? "Flows built" : "Flows in the target"));
      return c;
    });
    T.flows.forEach(function (f) {
      row(function (side) {
        var ghost = side === "left" && f.status !== "built";
        var c = cell(side, "flow" + (ghost ? " ghost" : ""));
        c.tabIndex = 0;
        var top = el("div", "flow-top");
        top.appendChild(el("span", "flow-id", f.id.toUpperCase()));
        var label = f.from.map(function (id) { return itemById[id].name; }).join(", ") +
          (f.to.length ? "  →  " + f.to.map(function (id) { return itemById[id].name; }).join(", ") : "  →  testbed host");
        top.appendChild(el("span", "flow-path", label));
        if (side === "left") {
          top.appendChild(badge(f.status === "built" ? "built" : "not built", f.status === "built" ? "built" : "planned"));
          if (f.observed) top.appendChild(badge("observed", "observed"));
        } else {
          top.appendChild(f.status === "built" ? badge("✓ built", "built") : badge("to build", "planned"));
        }
        c.appendChild(top);
        c.appendChild(el("div", "flow-sub", f.proto + " · " + f.net + " · " + f.purpose +
          (side === "left" && f.observed ? " · observed: " + f.observed : "")));
        c.addEventListener("mouseenter", function () { state.hoverFlow = f.id; refresh(); });
        c.addEventListener("mouseleave", function () { state.hoverFlow = null; refresh(); });
        c.addEventListener("focus", function () { state.hoverFlow = f.id; refresh(); });
        c.addEventListener("blur", function () { state.hoverFlow = null; refresh(); });
        flowEls[side][f.id] = c;
        return c;
      });
    });
  }

  // ---------- selection and lines ----------
  function select(id) {
    state.sel = id;
    fillDetails();
    refresh();
  }

  function activeFlows() {
    if (state.hoverFlow) return { list: T.flows.filter(function (f) { return f.id === state.hoverFlow; }), focus: null };
    var focus = state.hoverItem || state.sel;
    var list = T.flows.filter(function (f) {
      if (state.showAll) return true;
      return focus && (f.from.indexOf(focus) >= 0 || f.to.indexOf(focus) >= 0);
    });
    return { list: list, focus: focus };
  }

  function rel(node, base) {
    var r = node.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  }

  function path(a, b, shift) {
    var acx = a.x + a.w / 2, bcx = b.x + b.w / 2, acy = a.y + a.h / 2, bcy = b.y + b.h / 2;
    var sameRow = Math.abs(acy - bcy) < (a.h + b.h) / 2 - 4;
    var x1, y1, x2, y2, d;
    if (sameRow) {
      var dir = bcx >= acx ? 1 : -1;
      x1 = acx + dir * a.w / 2; y1 = acy + shift;
      x2 = bcx - dir * b.w / 2; y2 = bcy + shift;
      var k = Math.max(24, Math.abs(x2 - x1) / 2);
      d = "M" + x1 + " " + y1 + " C" + (x1 + dir * k) + " " + y1 + " " + (x2 - dir * k) + " " + y2 + " " + x2 + " " + y2;
    } else {
      var down = bcy > acy;
      x1 = acx + shift; y1 = down ? a.y + a.h : a.y;
      x2 = bcx + shift; y2 = down ? b.y : b.y + b.h;
      var kk = Math.max(24, Math.abs(y2 - y1) / 2);
      d = "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 + (down ? kk : -kk)) + " " + x2 + " " + (y2 - (down ? kk : -kk)) + " " + x2 + " " + y2;
    }
    return d;
  }

  function drawLines() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var base = grid.getBoundingClientRect();
    svg.setAttribute("width", grid.scrollWidth);
    svg.setAttribute("height", grid.scrollHeight);
    svg.setAttribute("viewBox", "0 0 " + grid.scrollWidth + " " + grid.scrollHeight);

    var defs = svgEl("defs");
    ["built", "planned"].forEach(function (k) {
      var m = svgEl("marker", { id: "arrow-" + k, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
      m.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 z", "class": "arrow " + k }));
      defs.appendChild(m);
    });
    svg.appendChild(defs);

    var act = activeFlows();
    var linked = {};
    act.list.forEach(function (f, fi) {
      var touches = !act.focus || f.from.indexOf(act.focus) >= 0 || f.to.indexOf(act.focus) >= 0;
      if (touches) f.from.concat(f.to).forEach(function (id) { linked[id] = true; });
      SIDES.forEach(function (side) {
        f.from.forEach(function (fid, i) {
          f.to.forEach(function (tid, j) {
            var a = cardEls[side][fid], b = cardEls[side][tid];
            if (!a || !b) return;
            var shift = (((fi + i + j) % 5) - 2) * 7;
            var cls = "line " + (f.status === "built" ? "built" : "planned") + (touches ? "" : " dim");
            var p = svgEl("path", { d: path(rel(a, base), rel(b, base), shift), "class": cls,
              "marker-end": "url(#arrow-" + (f.status === "built" ? "built" : "planned") + ")" });
            svg.appendChild(p);
          });
        });
      });
    });
    return linked;
  }

  function refresh() {
    var linked = drawLines();
    SIDES.forEach(function (side) {
      Object.keys(cardEls[side]).forEach(function (id) {
        var c = cardEls[side][id];
        c.classList.toggle("sel", state.sel === id);
        c.classList.toggle("linked", !!linked[id] && state.sel !== id);
        c.setAttribute("aria-pressed", state.sel === id ? "true" : "false");
      });
      Object.keys(flowEls[side]).forEach(function (id) {
        flowEls[side][id].classList.toggle("on", state.hoverFlow === id);
      });
    });
  }

  // ---------- init ----------
  renderSummary();
  renderTitles();
  renderZones();
  renderDetailRow();
  renderFlows();

  document.getElementById("sheet-close").addEventListener("click", function () { select(null); });
  var allBox = document.getElementById("show-all");
  allBox.addEventListener("change", function () { state.showAll = allBox.checked; refresh(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { select(null); } });

  var raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh); }
  window.addEventListener("resize", schedule);
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(grid);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  refresh();
})();
