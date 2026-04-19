# Sales Docket Frontend

This folder is the GitHub-friendly static frontend for the Sales Docket POS UI.

## Architecture

- Frontend: static files in this folder
- Backend: Apps Script in `C:\Users\toral\my-apps-script\systems\SalesDocket\HtmlUi`

The frontend talks to the Apps Script web app JSON API.

## Configure

Copy `config.example.js` to `config.js` and set:

- `apiBaseUrl`: your deployed Apps Script web app URL

The frontend expects these API routes:

- `GET ?api=1&action=ping`
- `GET ?api=1&action=bootstrap`
- `GET ?api=1&action=context&sheetName=...`
- `GET ?api=1&action=searchProducts&query=...`
- `POST` with `{ action: "saveHeader", ... }`
- `POST` with `{ action: "insertProductLine", ... }`

## Current Scope

The current implementation covers:

- loading a docket
- viewing header fields
- saving header fields
- searching products
- inserting a product line into the docket

Not implemented yet:

- line editing
- quotation retrieval/save
- book sales
- operator roles/permissions

## Serve Locally

You can test the static frontend with any local static server, for example:

```powershell
python -m http.server 4173
```

Then open:

```text
http://localhost:4173/HtmlUi/
```
