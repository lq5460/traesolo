#!/bin/sh
set -e
echo "host    replication    repl    0.0.0.0/0    md5" >> "$PGDATA/pg_hba.conf"
