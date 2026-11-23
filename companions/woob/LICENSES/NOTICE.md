# Third-party software in the GlassFolio bank worker

The GlassFolio desktop app and the optional `woob` Docker image include, unmodified:

## Woob — Web Outside Of Browsers

- Licence: GNU Lesser General Public License, version 3 or later (`woob-COPYING.LESSER`, copied from the source at build time).
- Source code of the exact version shipped: https://gitlab.com/woob/woob/-/tree/49f267fe1d3890d994ed511acac3d77dcd884e60
  (commit listed in `woob-source.json` next to this folder).
- GlassFolio uses Woob as a library from a separate process (`glassfolio_woob`) and does not modify it. You may replace it:
  the `woob` package and the `woob-modules` folder of the runtime are plain Python files.

## CPython

- The Python interpreter comes from python-build-standalone (https://github.com/astral-sh/python-build-standalone), built from CPython.
- Licence: Python Software Foundation License; the full text and the licences of the libraries it bundles are in the
  interpreter folder (`python/lib/python3.12/LICENSE.txt`, or `python/LICENSE.txt` on Windows).

## Python packages

The packages listed in `companions/woob/requirements.lock` (lxml, requests, Pillow, Babel, PyYAML, …) are installed with
their own licence files, inside each package's `*.dist-info` folder.
