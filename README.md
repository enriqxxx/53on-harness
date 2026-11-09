# 53ON Harness

The open desktop shell of [53ON](https://53on.com): an Electron app that gives your AI hands, eyes and voice on your own PC. You stay the only guardian.

This repository is the shell, and only the shell. What fills it stays private and is not here: the PC commands, the Harness Cable and the other complements are downloaded separately, each one signed (ed25519) and verified before it is installed. The memory engine and the store run as a service on 53on.com.

## Permission modes

One button decides how much the AI may do, and nothing else can change it: neither the model nor a page.

| Mode | What it does |
|---|---|
| `manual` | Asks before anything that is not read-only. This is the default. |
| `plan` | The AI only reads and proposes. It cannot act. |
| `auto` | Runs what the guard considers safe and pauses on anything dangerous. |
| `bypass` | Never asks. Only the owner can choose it, by hand. |

## Run from source

```
npm install
npm start
```

Requires Node.js. Developed and tested on Windows. Installed builds update themselves from a signed catalog row: an update whose signature or hash does not match is refused.

## Security

If you find a vulnerability, please report it privately through this repository's Security tab ("Report a vulnerability") instead of opening a public issue.

## License

The code is [MIT](LICENSE). The 53ON name and logo are trademarks of VCORPS LLC and are not covered by that license: see [NOTICE](NOTICE). Third-party licenses are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
