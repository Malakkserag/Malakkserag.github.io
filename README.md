# malakkserag.github.io

Personal portfolio of **Malak Serag Ibrahim**, computer engineering student at AAST, Cairo.
Live at <https://malakkserag.github.io/>.

Plain HTML, CSS and JavaScript. No build step and no dependencies: GitHub Pages serves the
files as they are, and opening `index.html` in a browser works too.

## Layout

| Path | What it is |
|------|------------|
| `index.html` | All of the content. Every section is marked with a comment. |
| `assets/css/style.css` | The whole design. Colours and fonts are variables at the top. |
| `assets/js/site.js` | Theme switch, navigation, scroll effects. |
| `assets/js/aes-core.js` | AES-128 written out by hand (JavaScript port of the Python simulator). |
| `assets/js/aes-demo.js` | The animated name in the hero and the AES stepper (Fig. 0 and 1). |
| `assets/js/rfid-demo.js` | The RFID access-control simulation (Fig. 2). |
| `assets/js/cyberclash-core.js` | CyberClash rules, Minimax and Alpha-Beta (port of the Python game). |
| `assets/js/cyberclash-demo.js` | The playable CyberClash board (Fig. 3). |
| `assets/js/mini-demos.js` | The news search and cinema seat picker. |
| `assets/img/` | Favicon and the social preview image. |
| `404.html` | Not-found page. |
| `Malak Serag CV.pdf` | The résumé the buttons link to. Replace the file to update it. |

## Common edits

- **Change the accent colour:** edit `--accent` in `assets/css/style.css`. It is set twice,
  once for the light theme and once under `:root[data-theme='dark']`.
- **Add a project:** copy one of the `<article class="plate">` or `<article class="card">`
  blocks in `index.html` and change the text and links.
- **Add a notebook:** copy an `<li>` inside `<ul class="ledger">`.
- **Update experience or education:** edit the matching section in `index.html`.
- **Change the name in the hero animation:** the text and key are in `assets/js/aes-demo.js`
  and must be exactly 16 characters each. Update the static letters in the
  `hero-aes-grid` block of `index.html` to match.
