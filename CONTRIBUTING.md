# Contributing

Thanks for helping make AI motion less generic.

- **Run the self-test** before and after a change: `node skills/rasanai/scripts/selftest.mjs` (needs Node ≥ 20 and Chrome via `npx hyperframes browser ensure`).
- **Adding a motion personality:** follow `skills/rasanai/references/personalities.md`. Its own tasting preview must pass `obey.mjs` against its own motion.md with zero errors and zero warnings.
- **Adding a banned pattern:** add its signature to `scripts/lib/signatures.mjs` and the table in `references/motion-md-contract.md`, plus a planted case in `selftest.mjs`.
- **Console changes:** keep it dependency-free, bound to 127.0.0.1, token-checked for POSTs, and serving files only from the allowed roots. Document payload fields in `references/console.md`.
- **Mac studio changes:** use the [Mac development guide](apps/macos/README.md). From the repository root, run `swift test --package-path apps/macos` and `node apps/macos/Tests/runtime-driver.test.mjs`; the guide also describes the disposable-console HTTP integration test and local app build. These checks do not call a provider or establish real-agent film generation.
- Keep the scripts zero-dependency and their docs in sync: every flag, output and rule a doc mentions must match the code.
