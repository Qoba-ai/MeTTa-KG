#!/bin/bash

# Run all migrations and seeding
diesel migration run

# Extract the generated admin token and save to admin-token.txt
PGPASSWORD=$POSTGRES_PASSWORD psql -h ${POSTGRES_HOST:-db} -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT code FROM tokens WHERE id = 0;" -t | xargs > admin-token.txt

echo "Admin token saved to ./admin-token.txt"
