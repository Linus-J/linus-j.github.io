# My website

My website outlining projects I've worked on as well as a list of software and
hardware I use and recommend.

Minimal site made with HTML/CSS. No build step, no framework, no dependencies.

Live site here: [https://linus-j.com](https://linus-j.com).

## Previewing locally

```sh
./serve.py          # http://localhost:8000
```

Links are written `href="system"` rather than `href="system.html"`, because
GitHub Pages serves `system.html` for a request to `/system` — that's what keeps
the deployed URLs extensionless. Python's stock `http.server` doesn't do that
lookup, so `python3 -m http.server` makes every nav link 404 locally even though
the site is fine once deployed. `serve.py` adds exactly that one rule, so local
preview matches production without changing the pages themselves.
