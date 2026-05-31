# momentkaph_be

## TypeScript Tooling

Node speaks JavaScript. `tsc` bridges the gap — it type-checks your `.ts` source and emits `.js` files to `dist/`.

```
.ts files  →  tsc  →  dist/*.js  →  node dist/index.js
```

```bash
npm run typecheck   # tsc --noEmit  — type-check only, no files written
npm run build       # tsc           — type-check + emit to dist/
npm run start       # node dist/index.js
npm run fire-up     # typecheck → build → start
```

## Diagrams

### Email

```mermaid
flowchart TD
    Client([Client / Frontend]) -->|"POST JSON"| ReadBody

    subgraph handler["api/email.ts · emailHandler"]
        ReadBody["readBody(req)<br/>collect chunks → JSON.parse"]
        Extract["normalize fields<br/>trim · lowercase email"]
        Build["build timestamp<br/>sk-SK / Europe-Bratislava"]
    end

    ReadBody -->|"parse error"| Res404a["writeHead(404) · end"]
    ReadBody -->|"ok"| Validate

    subgraph validate["lib/validate.ts · validateEmailForm"]
        Validate{"validate body<br/>honeypot · name · email<br/>phone · message"}
    end

    Validate -->|"errors > 0"| Res404b["writeHead(404) · end"]
    Validate -->|"valid (errors = 0)"| Extract
    Extract --> Build

    subgraph template["templates/email.ts · emailFormTemplate"]
        Tmpl["esc() each field → HTML string"]
    end
    Build --> Tmpl --> SendEmail

    subgraph resend["lib/resend.ts · sendEmail"]
        SendEmail["https.request POST"]
    end
    SendEmail --> API([api.resend.com /emails])

    API -->|"200"| Res200["writeHead(200) · end"]
    API -->|"non-200 / network error"| Res400["writeHead(400) · end"]
```