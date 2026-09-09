# Brownian Fan Chart

An interactive fan chart of a branching random walk, pruned by what has already
happened. Every root→leaf path is one complete possible future; as the red
**present** line advances, reality takes one branch and everything on the other
side of it is ruled out — Bayes' rule, played out on a tree instead of a formula.

This is a browser port (`index.html` / `style.css` / `app.js`, no build step,
no dependencies) of the original raylib/C demo in `main.cpp`.

## Run locally

Any static file server works, e.g.:

```
npx serve .
```

or just open `index.html` directly in a browser.

## Deploy to Vercel

This is a plain static site (no framework, no build step), so Vercel needs no
configuration beyond pointing at the repo root:

1. Push this repo to GitHub (already done if you're reading this from there).
2. In the [Vercel dashboard](https://vercel.com/new), import the GitHub repo.
3. Framework preset: **Other**. Leave build command and output directory blank.
4. Deploy.

## Controls

- `Space` — pause / resume
- `←` / `→` — scrub back / forward
- `↑` / `↓` — speed up / slow down
- `R` — reseed with a new random tree

## Original C version

`main.cpp` + `CMakeLists.txt` build the original raylib desktop demo:

```
mkdir build && cd build
cmake ..
make
./main
```
