# 53ON Harness

**Your AI, with a memory that stays and hands, eyes and voice on your own PC. Works with Claude Code.**

[![Download for Windows](https://img.shields.io/badge/Download-Windows%2010%20%2F%2011-0078D6?style=for-the-badge)](https://github.com/enriqxxx/53on-harness/releases/latest) [![53on.com](https://img.shields.io/badge/53on.com-store-7C5CFF?style=for-the-badge)](https://53on.com)

[![Release](https://img.shields.io/github/v/release/enriqxxx/53on-harness)](https://github.com/enriqxxx/53on-harness/releases/latest) [![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![Installer: signed](https://img.shields.io/badge/installer-signed-2ea44f)](#code-signing-policy)

The open desktop shell of [53ON](https://53on.com): an Electron app that gives your AI hands, eyes and voice on your own PC. You stay the only guardian.

![53ON Harness: the home, the chat with its model and live metrics, the AI load with its complements, and the chat menu with its effort and Ultracode](assets/screenshots.png)

This repository is the shell, and only the shell. What fills it stays private and is not here: the PC commands, the Harness Cable and the other complements are downloaded separately, each one signed (ed25519) and verified before it is installed. Your memories are files on your own PC: the memory engine is signed code that 53on.com serves and that runs inside the app. The store is 53on.com itself.

## A whole business behind your AI

53ON is one app instead of five, and the harness puts its AI to work on your PC. At [53on.com](https://53on.com) the same AI, with the same memory, runs your business:

- **Your WhatsApp, answered by your AI.** Connect your number in minutes, with one button.
- **Calendar and bookings** for your services and appointments.
- **Your store:** products, cart and checkout. Payments go straight to you, through Stripe or PayPal.
- **A sales dashboard** to see what sells.
- **Your own page and domain,** built with a drag-and-drop designer.
- **Chat, voice notes and calls** with your clients, and a map that brings you the ones nearby.
- **AI on your terms:** a model on your own PC, or your key from the big providers.

[See the plans at 53on.com](https://53on.com)

## Two ways to use it

It is one AI with one memory, whether it works inside 53ON or outside it.

- **On its own, with an API.** The AI runs in 53ON's own chat. Bring your key from Anthropic, OpenAI, Google, DeepSeek, Groq, Moonshot, Alibaba or OpenRouter, or use a model that runs on your own PC.
- **Together with Claude Code in VS Code or the terminal.** The Harness Cable installs itself and connects Claude Code with nothing to set up: a memory comes with each message, and the AI wakes up with its memory when a session starts or comes back from an automatic compact. Any other AI with a terminal can use the same commands.

**For maximum use you need the complements, and they come by themselves.** The installer brings only the shell. The first time 53ON starts, it downloads the Body, which brings the Harness Cable and Ear with it. If one is missing, add it from **≡ > Complements > Add more…**

- **Harness Cable:** connects Claude Code to the memory and gives the AI its memory commands. The second way above needs it.
- **Body:** the AI's hands, eyes and voice, its own browser and the PC commands.
- **Ear:** turns your voice into text on your own PC. The audio never goes to a server.

## What your AI gets

- A memory that stays between sessions, on your PC, and can hold photos, audio and video.
- A terminal and your files, each under the permission mode you choose.
- Eyes and voice: the page, the screen, the camera, the microphone and a voice of its own.
- Its own browser, which it sees and touches like a person.
- Messages from your phone, if you turn them on: to 53ON's chat or to your Claude Code chat.
- Scheduled prompts and work in the background.
- A panel to audit everything the AI asks of your PC.

It installs per user, without administrator rights, and updates itself. Windows Settings > Apps removes it.

## Permission modes

One button decides how much the AI may do, and nothing else can change it: neither the model nor a page.

| Mode | What it does |
|---|---|
| `manual` | Asks before anything that is not read-only. This is the default. |
| `plan` | The AI only reads and proposes. It cannot act. |
| `auto` | Runs what the guard considers safe and pauses on anything dangerous. |
| `bypass` | Never asks. Only the owner can choose it, by hand. |

## Download

Windows 10 and 11, 64-bit. Get the installer from [Releases](https://github.com/enriqxxx/53on-harness/releases/latest) or the store of [53on.com](https://53on.com).

- **Signed.** The installer and the app carry an Authenticode signature with a timestamp, so Windows can verify who published them and that nothing changed on the way.
- **Updates itself, safely.** Installed builds update from a signed catalog row: an update whose signature or hash does not match is refused.

## Build from source

Only needed if you want to build it yourself: the installer doesn't need Node.js. Building requires Node.js and Windows.

```
npm ci
npm start          # run it
npm run dist       # dist/53on-setup.exe
```

## Code signing policy

Every release is built from the code in this repository, signed with a timestamp, and approved by hand before it is published.

Team roles:

- Authors: [enriqxxx](https://github.com/enriqxxx)
- Reviewers: [enriqxxx](https://github.com/enriqxxx)
- Approvers: [enriqxxx](https://github.com/enriqxxx)

## Privacy

Read the [privacy policy](installer/privacy.en.txt), which the installer also shows. The program has no analytics or telemetry of its own. Your account on 53on.com follows the [53ON Privacy Notice](https://53on.com/privacy).

## Security

If you find a vulnerability, please report it privately through this repository's Security tab ("Report a vulnerability") instead of opening a public issue.

## License

The code is [MIT](LICENSE). The 53ON name and logo are trademarks of VCORPS LLC and are not covered by that license: see [NOTICE](NOTICE). Third-party licenses are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
