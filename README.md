# Osel Pairing

Web GUI and small Python API for Swiss pairings backed by the official `bbpPairings` engine.

## Engine

Install the `bbpPairings` executable for the target platform and point the server to it with `BBP_PAIRINGS_EXE` or `--bbp`.

## Start the GUI

```powershell
$env:BBP_PAIRINGS_EXE="C:\path\to\bbpPairings.exe"
python server\local_server.py --port 3000
```

Open:

```text
http://127.0.0.1:3000/pairing.html
```

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

## Import and export

The GUI can export:

- full tournament state as JSON, suitable for later import
- start list as CSV
- standings as CSV
- round results as CSV
- printable PDF output through the browser print dialog

The full JSON export restores the start list, saved rounds, and any currently generated unsaved round.
The start-list CSV import intentionally clears saved rounds because player IDs are derived from the imported names.

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
