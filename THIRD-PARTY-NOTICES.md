# Third-party notices

This project bundles third-party assets in addition to its npm dependencies (which carry their
own license files under `node_modules/`). This file covers assets whose license requires a
separate notice.

## Font Awesome Free (icons)

`evidence/components/icons.js` embeds SVG path data for 9 icons (`users`, `chalkboard-user`,
`school`, `toilet`, `file-circle-check`, `gauge-high`, `house`, `chevron-down`, `download`),
extracted from Font Awesome Free 6.4.2.

- **Source:** https://fontawesome.com
- **License:** https://fontawesome.com/license/free — Icons: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
  Fonts: SIL OFL 1.1, Code: MIT License.
- **Copyright:** 2023 Fonticons, Inc.
- **Changes made:** only the `d` (path) and `viewBox` data for the 9 icons listed above were
  extracted from the upstream SVG files into a plain JS data module; nothing else from the
  Font Awesome package (fonts, CSS, JS, other icons) is included or distributed.

CC BY 4.0 requires attribution for the Icons; this notice, plus the identical attribution
comment reproduced at the top of `evidence/components/icons.js`, serves that requirement.
