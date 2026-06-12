// Mints a short-lived App Store Connect API JWT.
// Usage: KID=<keyId> ISS=<issuerId> KEYPATH=<p8 path> node asc-jwt.mjs
import crypto from 'crypto';
import fs from 'fs';
const KID = process.env.KID, ISS = process.env.ISS, KEYPATH = process.env.KEYPATH;
const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KID, typ: 'JWT' })).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const payload = Buffer.from(JSON.stringify({ iss: ISS, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url');
const key = fs.readFileSync(KEYPATH, 'utf8');
const sig = crypto.sign('sha256', Buffer.from(header + '.' + payload), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
console.log(header + '.' + payload + '.' + sig);
