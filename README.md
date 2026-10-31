# सिंह परिवार की वंशावली · The Singh Family Tree

An interactive, animated family tree of the Singh family — eight generations
from दुल्लह सिंह (Dullah Singh) of Bamaura — transcribed from the original
handwritten Hindi vanshavali.

**Live site:** https://kakashibo.github.io/singh-family-tree/

## What's here

| Path | Purpose |
| --- | --- |
| `data/family.json` | **The single source of truth.** Every person, branch, note and uncertainty flag. Edit this to change the tree. |
| `index.html`, `css/style.css`, `js/app.js` | The site. Plain HTML/CSS/JS, no build step. D3 (vendored) does the layout. |
| `assets/original-chart.jpg` / `.pdf` | The transcribed chart the data was read from. |

## Editing the tree

Each entry in `data/family.json → people` looks like:

```json
{ "id": "ajit", "hi": "अजीत सिंह", "en": "Ajit Singh", "gen": 7,
  "branch": "sahitgarhi", "parent": "rampukar" }
```

Optional flags: `uncertain` (name unclear in the original — drawn dashed with a `?`),
`uncertainLink` (the parent link is inferred — dashed line), `childless`,
`lineEnded`, `confirm` (possible identification, please verify),
`tag_hi`/`tag_en` (a place), `note_hi`/`note_en` (free text),
and for a box of several sons, `group: true` with a `members` array.

Commit and push — GitHub Pages republishes automatically.

## Running locally

```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Branch colours

| Branch | Colour |
| --- | --- |
| Root (Dullah Singh) | `#D2622A` |
| बोचहा · Bochaha | `#8B3A1E` |
| बमौरा (मुख्य) · Bamaura | `#1F5E4A` |
| तृतीय शाखा · Third branch | `#8A6A12` |
| साहिटगड़ही · Sahitgarhi | `#2C3A6B` |
