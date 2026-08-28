const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export type GoogleSheetsEnvironment = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  tabName: string;
};

function base64Url(bytes: Uint8Array | string): string {
  const binary = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let source = "";
  for (const byte of binary) source += String.fromCharCode(byte);
  return btoa(source).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function pemBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/gu, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function accessToken(environment: GoogleSheetsEnvironment, fetcher: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: environment.clientEmail, scope: SHEETS_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claims}`;
  const privateKeyBytes = pemBytes(environment.privateKey);
  const privateKeyBuffer = privateKeyBytes.buffer.slice(
    privateKeyBytes.byteOffset,
    privateKeyBytes.byteOffset + privateKeyBytes.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBuffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetcher(TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error("GOOGLE_TOKEN_REJECTED");
  const payload = await response.json() as { access_token?: unknown };
  if (typeof payload.access_token !== "string") throw new Error("GOOGLE_TOKEN_MISSING");
  return payload.access_token;
}

function rangeUrl(environment: GoogleSheetsEnvironment, range: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(environment.spreadsheetId)}/values/${encodeURIComponent(`'${environment.tabName.replace(/'/gu, "''")}'!${range}`)}`;
}

async function sheetsRequest(token: string, path: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  const response = await fetcher(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`GOOGLE_SHEETS_HTTP_${response.status}`);
  return response;
}

export async function upsertGoogleSheetRow(input: {
  environment: GoogleSheetsEnvironment;
  headers: readonly string[];
  row: readonly unknown[];
  fetcher?: typeof fetch;
}): Promise<{ rowNumber: number; inserted: boolean }> {
  if (input.row.length !== input.headers.length) throw new Error("GOOGLE_SHEETS_ROW_WIDTH_MISMATCH");
  const fetcher = input.fetcher ?? fetch;
  const { environment } = input;
  const token = await accessToken(environment, fetcher);
  const headerResponse = await sheetsRequest(token, rangeUrl(environment, "A1:BM1"), { method: "GET" }, fetcher);
  const currentHeader = ((await headerResponse.json()) as { values?: unknown[][] }).values?.[0] ?? [];
  if (currentHeader.length === 0 || currentHeader.every((value) => value == null || value === "")) {
    await sheetsRequest(token, `${rangeUrl(environment, `A1:BM1`)}?valueInputOption=RAW`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [input.headers] }),
    }, fetcher);
  } else if (currentHeader.length !== input.headers.length || currentHeader.some((value, index) => value !== input.headers[index])) {
    throw new Error("GOOGLE_SHEETS_HEADER_MISMATCH");
  }
  const idsResponse = await sheetsRequest(token, rangeUrl(environment, "A2:A5001"), { method: "GET" }, fetcher);
  const ids = ((await idsResponse.json()) as { values?: unknown[][] }).values ?? [];
  const existingIndex = ids.findIndex((row) => row[0] === input.row[0]);
  if (existingIndex >= 0) {
    const rowNumber = existingIndex + 2;
    await sheetsRequest(token, `${rangeUrl(environment, `A${rowNumber}:BM${rowNumber}`)}?valueInputOption=RAW`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [input.row] }),
    }, fetcher);
    return { rowNumber, inserted: false };
  }
  const appendResponse = await sheetsRequest(token, `${rangeUrl(environment, `A:BM`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [input.row] }),
  }, fetcher);
  const appended = await appendResponse.json() as { updates?: { updatedRange?: string } };
  const rowNumber = Number(appended.updates?.updatedRange?.match(/!(?:[A-Z]+)(\d+):/u)?.[1] ?? ids.length + 2);
  return { rowNumber, inserted: true };
}
