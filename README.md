# 53ON Harness

The open desktop shell of [53ON](https://53on.com): an Electron app that gives your AI hands, eyes and voice on your own PC. You stay the only guardian.

This repository is the shell, and only the shell. What fills it stays private and is not here: the PC commands, the Harness Cable and the other complements are downloaded separately, each one signed (ed25519) and verified before it is installed. The memory engine and the store run as a service on 53on.com.

## What it does

- Shows your 53ON account in its own window, with a panel to audit what the AI asks of your PC.
- Gives the AI of your account a terminal, your files, screenshots, the camera, voice and its own browser, each under the permission mode you choose.
- Installs per user, without administrator rights, and updates itself. Windows Settings > Apps removes it.

## Permission modes

One button decides how much the AI may do, and nothing else can change it: neither the model nor a page.

| Mode | What it does |
|---|---|
| `manual` | Asks before anything that is not read-only. This is the default. |
| `plan` | The AI only reads and proposes. It cannot act. |
| `auto` | Runs what the guard considers safe and pauses on anything dangerous. |
| `bypass` | Never asks. Only the owner can choose it, by hand. |

## Download

Windows 10 and 11, 64-bit. The installer is built by this repository's [GitHub Actions](.github/workflows/build.yml) and published in [Releases](https://github.com/enriqxxx/53on-harness/releases) and in the store of [53on.com](https://53on.com). Installed builds update themselves from a signed catalog row: an update whose signature or hash does not match is refused.

## Build from source

Requires Node.js and Windows.

```
npm ci
npm start          # run it
npm run dist       # dist/53on-setup.exe
```

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

Team roles:

- Authors: [enriqxxx](https://github.com/enriqxxx)
- Reviewers: [enriqxxx](https://github.com/enriqxxx)
- Approvers: [enriqxxx](https://github.com/enriqxxx)

Status: the application to SignPath Foundation has been submitted and is waiting for approval, so the installers published so far are not signed yet.

Only binaries built by this repository's workflow are submitted for signing, and each release is approved by hand.

## Privacy

Read the [privacy policy](installer/privacy.en.txt), which the installer also shows. The program has no analytics or telemetry of its own. Your account on 53on.com follows the [53ON Privacy Notice](https://53on.com/privacy).

## Security

If you find a vulnerability, please report it privately through this repository's Security tab ("Report a vulnerability") instead of opening a public issue.

## License

The code is [MIT](LICENSE). The 53ON name and logo are trademarks of VCORPS LLC and are not covered by that license: see [NOTICE](NOTICE). Third-party licenses are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
