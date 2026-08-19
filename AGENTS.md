# Repository Agent Instructions

## Native desktop packaging

- Treat desktop installers as target-native artifacts. Build them on the operating system and architecture they will run on.
- Never distribute a Windows installer produced by invoking `electron-builder --win` from macOS or Linux. The `node` npm package and other native dependencies may otherwise contain host binaries, such as a Mach-O `node` file instead of `node.exe`.
- Build Windows x64 installers from a clean checkout on the repository's `windows-2022` GitHub Actions runner: run `npm ci`, then `npm run package:dev:win` for a test package or `npm run package:win` for a release package.
- Do not bypass `scripts/verify-target.mjs` or replace the package scripts with a direct cross-platform `electron-builder` command.
- Before handing off a Windows installer, verify that `resources/app/node_modules/node/bin/node.exe` exists in `win-unpacked` or the installer, and require the packaged Windows Harness smoke test to pass.
- A successful macOS build, typecheck, or unit-test run is not Windows package validation. Report a Windows artifact as validated only after the Windows runner completes successfully.
