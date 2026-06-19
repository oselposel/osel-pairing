# Osel Pairing

Webové GUI a malý Python server pro švýcarské párování přes oficiální `bbpPairings` engine.

## Engine

Install the `bbpPairings` executable for the target platform and point the server to it with `BBP_PAIRINGS_EXE` or `--bbp`.

## Spuštění

```powershell
$env:BBP_PAIRINGS_EXE="C:\path\to\bbpPairings.exe"
python server\local_server.py --port 3000
```

Open:

```text
http://127.0.0.1:3000/pairing.html
```

Veřejná stránka ukazuje průběžné pořadí, aktuální nasazení a výsledky odehraných kol.
Rozhodčí se přihlašuje přes menu vpravo nahoře. Testovací heslo je `11`.

Stav turnaje se ukládá serverově do `data/tournament-state.json`, takže všichni uživatelé na stejné URL vidí stejný turnaj.
Adresář `data/` není verzovaný v gitu.

## API

`POST /api/pairings`

Request:

```json
{
  "players": [
    { "id": "Alice", "name": "Alice", "ratingFinal": 1600 },
    { "id": "Bob", "name": "Bob", "ratingFinal": 1500 }
  ],
  "rounds": []
}
```

Response:

```json
{
  "success": true,
  "pairings": [
    { "whiteId": "Alice", "whiteName": "Alice", "blackId": "Bob", "blackName": "Bob", "result": null }
  ]
}
```

For Linux deployment, use the Linux `bbpPairings` binary and set `BBP_PAIRINGS_EXE` to that path.

## Import a export

Rozhodčí může exportovat:

- celý stav turnaje jako JSON pro pozdější import
- startovní listinu jako CSV
- pořadí jako CSV
- výsledky kol jako CSV
- tiskový PDF výstup přes tiskový dialog prohlížeče

JSON import obnoví startovní listinu, uložená kola i aktuálně vygenerované neuložené kolo.
Import startovní listiny z CSV úmyslně maže uložená kola, protože ID hráčů se odvozují ze jmen.

## Tests

The integration tests run simulated tournaments against the real `bbpPairings` engine.

```powershell
$env:BBP_PAIRINGS_EXE="C:\path\to\bbpPairings.exe"
python -m unittest discover -s tests -v
```

## Docker

The Docker image downloads the Linux `bbpPairings` release during build.

```bash
docker build -t osel-pairing .
docker run --rm -p 3000:3000 osel-pairing
```

Open:

```text
http://127.0.0.1:3000/pairing.html
```
