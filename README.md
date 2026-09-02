# Hosanna Print — web

One-page web pre **Hosanna Print** (Gerlachov / Poprad). Statická stránka, bez build kroku.

## Štruktúra

```
index.html        — obsah a štruktúra
css/style.css     — téma (Brand Guidelines v1.0) + komponenty + responzivita
js/main.js        — sticky nav, scroll reveal (IntersectionObserver), progres krokov
assets/logo.svg   — ikona loga (palmová ratolesť, Sage #798C7D)
CNAME             — vlastná doména pre GitHub Pages (print.hosanna.sk)
```

## Fonty

- **Bespoke Serif** (nadpisy) — [Fontshare](https://www.fontshare.com/fonts/bespoke-serif), váhy 400 / 500 / 700
- **DM Sans** (text) — [Google Fonts](https://fonts.google.com/specimen/DM+Sans), váhy 400 / 500 / 700

Načítavajú sa cez `<link>` v `index.html` s `display=swap`.

## Lokálny náhľad

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## Nasadenie

GitHub Pages z branchu `main` (root). Doména `print.hosanna.sk` cez súbor `CNAME`
+ DNS `CNAME` záznam `print` → `hosannaprint.github.io`.
