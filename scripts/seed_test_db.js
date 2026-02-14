#!/usr/bin/env node
const { Client } = require('pg');
const crypto = require('crypto');

async function main(){
  const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const id = crypto.randomUUID();
  const email = `sys-${id}@example.com`;
  try{
    await client.query(`INSERT INTO users(id,email,name,created_at) VALUES($1,$2,$3,now()) ON CONFLICT (id) DO NOTHING`, [id, email, 'system']);
    console.log(id);
  }catch(e){
    console.error('Failed to seed user', e);
    process.exit(1);
  }finally{
    await client.end();
  }
}

main();
