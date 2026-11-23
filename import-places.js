import 'dotenv/config'
import pg from 'pg'
import { readFile } from 'node:fs/promises'
const data = JSON.parse(await readFile(new URL('./data/places.json', import.meta.url),'utf8'))
const client = new pg.Client({ host:process.env.DB_HOST, database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,port:Number(process.env.DB_PORT || 5432),ssl:['127.0.0.1','localhost','::1'].includes(process.env.DB_HOST)?false:{rejectUnauthorized:true} })
await client.connect()
try {
  await client.query('BEGIN')
  for (const [table, field] of [['pois','category'],['foods','cuisine']]) {
    await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS osm_id bigint UNIQUE`)
    await client.query(`INSERT INTO ${table}(osm_id,name,lat,lng,${field}) SELECT osm_id,name,lat,lng,${field} FROM jsonb_to_recordset($1) AS x(osm_id bigint,name text,lat float8,lng float8,${field} text) ON CONFLICT(osm_id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,${field}=excluded.${field}`,[JSON.stringify(data[table])])
  }
  await client.query('COMMIT')
} finally { await client.end() }
