# Project instructions

Skills in `.claude/skills/` are vendored from
[tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) at commit
`738451e`, trimmed to this stack (Express API, no UI): screen verification, the skill selftest
and non-Express security references were removed.

- Write code, commits, docs, ADRs and `.specs/` files in English.
- Run skill scripts with `python`, not `python3` (on this machine `python3` is the Microsoft Store stub).
- Commits are small and specific (one logical change each) and follow
  [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (`feat:`, `fix:`,
  `chore:`, `docs:`, `test:`, `ci:`, `build:`, `refactor:`, with an optional scope). Validate
  the message with `python .claude/skills/tlc-spec-lean/scripts/check_commit.py --message "<msg>"`.
- `mutate.py` does not run on native Windows (it uses `SIGHUP`/`os.killpg`). When mutations are
  needed, run it in a Linux container on Docker Desktop's WSL backend, for example:
  `docker run --rm -v "$PWD:/work" -w /work node:20-bookworm sh -c 'git config --global --add safe.directory /work && python3 .claude/skills/tlc-spec-lean/scripts/mutate.py --spec <mutations.json>'`
- `tlc-spec-lean`: an approved plan authorizes local edits and commits only; `git push`, publishing
  images and changes to a remote cluster need an explicit go-ahead each time.
- `create-adr`: only for the most important decisions. Every decision goes in `.specs/STATE.md`;
  it also gets an ADR in `docs/adr/` (MADR) only if it is hard to reverse, determines
  availability, security or data durability, or a reviewer is likely to ask "why not the
  alternative?". Link the ADR from its `AD-NNN` row.
