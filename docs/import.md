# Declaration import

`POST /api/v1/declarations/import` assesses a batch of declarations from a flat file, so that a team can try Madoun on an export from its own system without writing an adapter first. Nothing is stored: the answer is one assessment per declaration, as `POST /api/v1/assessments` would give. A sample file is in [data/samples/declarations.csv](../data/samples/declarations.csv).

```bash
curl -X POST http://localhost:3000/api/v1/declarations/import \
  -H "Content-Type: text/csv" -H "Authorization: Bearer $MADOUN_KEY" \
  --data-binary @data/samples/declarations.csv
```

Leave out the `Authorization` header when the server runs with `MADOUN_AUTH=off`.

## File format

UTF-8 CSV (RFC 4180: quoted cells, doubled quotes, line breaks inside quotes, CRLF or LF, optional byte order mark). One row per declared item. The first row names the columns. Rows with the same `declarationRef` form one declaration, and rows of one declaration with the same `transportDocRef` form one consignment.

| Column | Required | Notes |
|---|---|---|
| declarationRef | yes | Groups rows into a declaration |
| mode | yes | `sea`, `air` or `land` |
| carrier, conveyance, entryPoint | yes | |
| eta, filedAt | eta yes, filedAt no | ISO 8601 with a time zone. filedAt defaults to the snapshot time |
| traderId, forwarderId | yes | Must be ids Madoun knows (the adapter maps the filer to them) |
| invoiceRef, incoterm | yes | |
| currency | yes | `AED` |
| submitted | no | Evidence types already submitted, separated by semicolons |
| transportDocRef | yes | Groups items into a consignment |
| containerIds | no | ISO 6346 ids separated by semicolons |
| hsCode | yes | 6 to 12 digits, no dots |
| description | yes | |
| category | yes | One of the goods categories in the OpenAPI document |
| origin | yes | ISO 3166-1 alpha-2, capitals |
| value, quantity, packages | yes | Numbers. Value is in AED |
| flags | no | Handling flags separated by semicolons, for example `cold-chain` |

The declaration columns (everything above `transportDocRef`) must read the same on every row of one declaration; a row that disagrees is reported with its row number. `totalValue` is not a column: Madoun sums the item values.

Limits: 1,000,000 bytes, 2000 rows, 50 declarations per request. A JSON array of the `POST /assessments` payload is accepted as well.

## What this is not

The column names follow the data elements of the WCO Data Model, but this is a convenience mapping. It is not a conformant WCO or ATLP message, it does not read a real declaration system, and it cannot yet map a filer's own identifier to a trader id. Those belong to the adapter described in [integration.md](integration.md).
