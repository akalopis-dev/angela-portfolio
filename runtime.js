/* Small renderer for the interactive map page.
   Reads the page template, fills {{ holes }}, expands <sc-for> and <sc-if>,
   and morphs the live DOM on each state change so animations are not restarted. */
(function () {
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      var s = scopes[i];
      if (s && Object.prototype.hasOwnProperty.call(s, parts[0])) {
        var v = s[parts[0]];
        for (var k = 1; k < parts.length; k++) v = v == null ? undefined : v[parts[k]];
        return v;
      }
    }
    return undefined;
  }
  var HOLE = /\{\{([^}]*)\}\}/g;
  function only(str) { var m = /^\s*\{\{([^}]*)\}\}\s*$/.exec(str || ''); return m ? m[1] : null; }

  function DCLogic() { this.state = {}; }
  DCLogic.prototype.setState = function (u) {
    var next = typeof u === 'function' ? u(this.state) : u;
    if (next) this.state = Object.assign({}, this.state, next);
    this._schedule();
  };
  window.DCLogic = DCLogic;

  window.mountDC = function (Cls, root, templateHtml) {
    var tpl = document.createElement('template');
    tpl.innerHTML = templateHtml;
    var comp = new Cls();
    var handlers = [];
    var queued = false;

    function walk(node, scopes, out) {
      if (node.nodeType === 3) { out.push(esc(node.nodeValue.replace(HOLE, function (_, p) { var v = lookup(p, scopes); return v == null ? '' : v; }))); return; }
      if (node.nodeType !== 1) return;
      var tag = node.localName;
      if (tag === 'sc-for') {
        var list = lookup(only(node.getAttribute('list')), scopes) || [];
        var as = node.getAttribute('as');
        list.forEach(function (item) { var sc = {}; sc[as] = item; kids(node, scopes.concat([sc]), out); });
        return;
      }
      if (tag === 'sc-if') {
        if (lookup(only(node.getAttribute('value')), scopes)) kids(node, scopes, out);
        return;
      }
      var isSvg = node.namespaceURI === SVG_NS;
      var name = isSvg ? node.tagName : tag;
      out.push('<' + name);
      for (var i = 0; i < node.attributes.length; i++) {
        var a = node.attributes[i];
        if (a.name.indexOf('hint-') === 0) continue;
        if (a.name.toLowerCase() === 'onclick') {
          var fn = lookup(only(a.value), scopes);
          if (typeof fn === 'function') { handlers.push(fn); out.push(' data-click="' + (handlers.length - 1) + '"'); }
          continue;
        }
        var val = a.value.replace(HOLE, function (_, p) { var v = lookup(p, scopes); return v == null ? '' : v; });
        out.push(' ' + a.name + '="' + esc(val) + '"');
      }
      out.push('>');
      if (!isSvg && VOID[tag]) return;
      kids(node, scopes, out);
      out.push('</' + name + '>');
    }
    function kids(node, scopes, out) {
      var c = node.content || node;
      for (var n = c.firstChild; n; n = n.nextSibling) walk(n, scopes, out);
    }
    function render() {
      queued = false;
      handlers = [];
      var vals = comp.renderVals ? comp.renderVals() : {};
      var out = [];
      kids(tpl, [vals], out);
      var html = out.join('');
      if (!root.firstChild) root.innerHTML = html;
      else Idiomorph.morph(root, html, { morphStyle: 'innerHTML' });
    }
    comp._schedule = function () { if (!queued) { queued = true; requestAnimationFrame(render); } };
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-click]');
      if (!el || !root.contains(el)) return;
      var fn = handlers[+el.getAttribute('data-click')];
      if (fn) { if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').charAt(0) === '#') e.preventDefault(); fn(e); }
    });
    render();
    if (comp.componentDidMount) comp.componentDidMount();
  };
})();
