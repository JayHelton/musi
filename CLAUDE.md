# CLAUDE.md

Read `AGENTS.md` first. It holds the product model, the visual design rules, the
communication style, and the test runners. Everything there applies here.

## Delivery: ask before you push to main

- Do the work, verify it, and commit it with a clear message.
- At the end of every session, ask the user whether they want the work pushed to
  `main`. Do not push to `main` on your own, and do not treat an earlier yes as a
  standing yes. Ask again for each later piece of work.
- When the user says yes, rebase onto `origin/main` and push with
  `git push origin main`, so the push is a fast-forward.
- A cloud-agent harness may force a feature branch and a pull request. If so, say so,
  deliver on the branch, and still ask the user whether to push to `main`.
