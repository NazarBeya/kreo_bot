import pg from 'pg';

const username = process.argv[2]?.replace(/^@/, '');

if (!username) {
  console.error('Usage: DATABASE_URL=... node scripts/delete-user-creatives.mjs <username>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const userResult = await client.query(
    'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [username]
  );

  if (userResult.rows.length === 0) {
    console.error(`User not found: ${username}`);
    process.exit(1);
  }

  const user = userResult.rows[0];
  const deleteResult = await client.query(
    'DELETE FROM creatives WHERE author_id = $1 RETURNING short_id',
    [user.id]
  );

  console.log(`Deleted ${deleteResult.rows.length} creatives for @${user.username}`);
  deleteResult.rows.forEach((row) => console.log(`- ${row.short_id}`));
} finally {
  await client.end();
}
