#!/usr/bin/env python3
"""Assemble the consolidated grade-inflation site.

    python build_site.py

Reads src/ (shell, style, bodies, scripts) and writes, in the folder above:
    index.html     - the six-tab site (expects data_inflation.js beside it)
    methods.html   - the linked methods page

The shared payload data_inflation.js is produced by build_inflation_data.py
(its out/gi_data.js, copied up unchanged). This script never touches it.

Each tool keeps its logic intact; consolidation only
  - prefixes every element id with the tool name (changed_, doors_, margin_, bands_, bench_, card_)
  - wraps each tool script in an IIFE with a matching $ lookup
  - maps the old chrome grays onto the house design tokens
    (the campus color map in core.js is deliberately left untouched).
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
SITE = os.path.dirname(HERE)


def read(p):
    with open(os.path.join(SRC, p), encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print('  wrote %s  (%.2f MB)' % (path, os.path.getsize(path) / 1e6))


# tool name -> the shell section that hosts it
TAB_OF = {'changed': 'tab-changed', 'doors': 'tab-doors', 'margin': 'tab-crowded',
          'bands': 'tab-bands', 'bench': 'tab-bench', 'card': 'tab-school'}

# any remaining pre-Leal chrome colors -> the Leal design (black, gray #555555,
# and the circus primaries). Applied to bodies and tool scripts only; core.js
# (the campus color map) is exempt so campus hues never move.
COLOR_MAP = {
    '#16191d': '#000000', '#4b545e': '#000000', '#7a838d': '#555555',
    '#dfe3e8': '#000000', '#eef1f4': '#FFFFFF', '#f2f4f6': '#FFFFFF',
    '#c3c9d0': '#000000', '#9aa7b3': '#555555', '#cfd6dd': '#FFFFFF',
    '#1b4f72': '#0000FF', '#b03a2e': '#FB0207', '#1a5276': '#0000FF',
    '#c9a227': '#FF8C00', '#a0801a': '#000000',
}


def recolor(t):
    for a, b in COLOR_MAP.items():
        t = t.replace(a, b)
        t = t.replace(a.upper(), b)
    return t


def prefix_ids(html, pfx):
    return re.sub(r'\bid="([^"]+)"', lambda m: 'id="%s_%s"' % (pfx, m.group(1)), html)


DOLLAR_DEF = 'const $ = id => document.getElementById(id);\n'


def wrap_app(js, name):
    assert DOLLAR_DEF in js, name + ': $ definition not found'
    js = js.replace(DOLLAR_DEF, '')
    js = js.replace("document.querySelectorAll('.q')", "ROOT.querySelectorAll('.q')")
    js = recolor(js)
    return ("(function () {\n'use strict';\n"
            "const ROOT = document.getElementById('%s');\n"
            "const $ = id => document.getElementById('%s_' + id);\n"
            % (TAB_OF[name], name)
            + js + "\n})();")


def main():
    css = read('style.css')
    core = read('core.js')          # NOT recolored: campus map lives here
    shell = read('shell.html')

    shell = shell.replace('{{CSS}}', css)
    shell = shell.replace('{{CORE}}', core)
    for name in ['changed', 'doors', 'margin', 'bands', 'bench', 'card']:
        body = recolor(prefix_ids(read(name + '.body.html'), name))
        shell = shell.replace('{{BODY_%s}}' % name, body)
        shell = shell.replace('{{APP_%s}}' % name, wrap_app(read(name + '.js'), name))

    assert not re.search(r'\{\{[A-Z_a-z]+\}\}', shell), 'unfilled template slot in shell'
    write(os.path.join(SITE, 'index.html'), shell)

    methods = read('methods.src.html').replace('{{CSS}}', css)
    write(os.path.join(SITE, 'methods.html'), methods)

    for name, maker in [('data_inflation.js', 'build_inflation_data.py'),
                        ('data_bands.js', 'build_bands_data.py')]:
        data = os.path.join(SITE, name)
        print('  %s %s' % (name,
              'present (%.2f MB)' % (os.path.getsize(data) / 1e6) if os.path.exists(data)
              else 'MISSING - run ' + maker))


if __name__ == '__main__':
    main()
